import { google } from 'googleapis';

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n');

  if (!email || !key) {
    console.warn('Google Sheets: Service account not configured');
    return null;
  }

  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export async function syncOrderToSheet(
  sheetId: string,
  sheetName: string,
  order: {
    id: string;
    customerName?: string | null;
    customerPhone?: string | null;
    customerAddress?: string | null;
    customerTownship?: string | null;
    items: any;
    subtotal: number;
    deliveryFee: number;
    total: number;
    status: string;
    createdAt: Date;
  }
) {
  const auth = getAuth();
  if (!auth) return false;

  try {
    const sheets = google.sheets({ version: 'v4', auth });

    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:L1`,
    });

    if (!existing.data.values || existing.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${sheetName}!A1:L1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            [
              'Order ID',
              'Date',
              'Customer Name',
              'Phone',
              'Address',
              'Township',
              'Items',
              'Subtotal (Ks)',
              'Delivery (Ks)',
              'Total (Ks)',
              'Status',
              'Notes',
            ],
          ],
        },
      });
    }

    const items = Array.isArray(order.items)
      ? (order.items as any[]).map((i: any) => `${i.name} x${i.qty}`).join(', ')
      : String(order.items);

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:L`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [
          [
            order.id.slice(-6).toUpperCase(),
            new Date(order.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Yangon' }),
            order.customerName || '-',
            order.customerPhone || '-',
            order.customerAddress || '-',
            order.customerTownship || '-',
            items,
            order.subtotal,
            order.deliveryFee,
            order.total,
            order.status,
            '',
          ],
        ],
      },
    });

    return true;
  } catch (error) {
    console.error('Google Sheets sync error:', error);
    return false;
  }
}

// ─── Read Products from Google Sheet ──────────────────────────────────────────
// Expected columns (auto-detected by header): name, price, category, stock, image, description
// Column order doesn't matter — headers are matched case-insensitively.

export type SheetProduct = {
  id: string;
  name: string;
  price: number;
  category: string;
  stockCount: number;
  image: string | null;
  description: string | null;
  isActive: boolean;
  productType: string;
};

export async function readProductsFromSheet(
  sheetId: string,
  tabName: string = 'Products'
): Promise<SheetProduct[]> {
  const auth = getAuth();
  if (!auth) return [];

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A:F`,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return []; // need header + at least 1 data row

    // Auto-detect columns by header name
    const headers = rows[0].map((h: string) => h.toLowerCase().trim());
    const nameIdx = headers.findIndex((h: string) => h.includes('name'));
    const priceIdx = headers.findIndex((h: string) => h.includes('price'));
    const catIdx = headers.findIndex((h: string) => h.includes('category') || h.includes('cat'));
    const stockIdx = headers.findIndex((h: string) => h.includes('stock') || h.includes('qty'));
    const imgIdx = headers.findIndex((h: string) => h.includes('image'));
    const descIdx = headers.findIndex((h: string) => h.includes('desc'));

    if (nameIdx === -1) {
      console.warn('Google Sheet Products tab: no "name" column found');
      return [];
    }

    return rows
      .slice(1)
      .map((row: string[], index: number) => ({
        id: `sheet_${index}`,
        name: (row[nameIdx] || '').trim(),
        price: parseFloat(row[priceIdx] || '0') || 0,
        category: ((catIdx >= 0 ? row[catIdx] : 'General') || 'General').trim(),
        stockCount: parseInt(stockIdx >= 0 ? row[stockIdx] || '0' : '999') || 999,
        image: imgIdx >= 0 ? (row[imgIdx] || '').trim() || null : null,
        description: descIdx >= 0 ? (row[descIdx] || '').trim() || null : null,
        isActive: true,
        productType: 'product',
      }))
      .filter((p: SheetProduct) => p.name !== '');
  } catch (error) {
    console.error('Google Sheets readProducts error:', error);
    return [];
  }
}

// ─── Read Delivery Zones from Google Sheet ───────────────────────────────────
// Expected columns: township, city, fee

export type SheetDeliveryZone = {
  id: string;
  township: string;
  city: string;
  fee: number;
  isActive: boolean;
};

export async function readDeliveryZonesFromSheet(
  sheetId: string,
  tabName: string = 'DeliveryZones'
): Promise<SheetDeliveryZone[]> {
  const auth = getAuth();
  if (!auth) return [];

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A:C`,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return [];

    const headers = rows[0].map((h: string) => h.toLowerCase().trim());
    const townshipIdx = headers.findIndex((h: string) => h.includes('township'));
    const cityIdx = headers.findIndex((h: string) => h.includes('city'));
    const feeIdx = headers.findIndex(
      (h: string) => h.includes('fee') || h.includes('delivery') || h.includes('price')
    );

    if (townshipIdx === -1) {
      console.warn('Google Sheet DeliveryZones tab: no "township" column found');
      return [];
    }

    return rows
      .slice(1)
      .map((row: string[], index: number) => ({
        id: `zone_${index}`,
        township: (row[townshipIdx] || '').trim(),
        city: cityIdx >= 0 ? (row[cityIdx] || '').trim() : '',
        fee: parseFloat(feeIdx >= 0 ? row[feeIdx] || '0' : '0') || 0,
        isActive: true,
      }))
      .filter((z: SheetDeliveryZone) => z.township !== '');
  } catch (error) {
    console.error('Google Sheets readDeliveryZones error:', error);
    return [];
  }
}
