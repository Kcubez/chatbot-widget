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

// ─── Deduct Stock in Google Sheet Products Tab ───────────────────────────────
// Finds each item by name (case-insensitive) and subtracts qty from the stock cell.

export async function deductStockInSheet(
  sheetId: string,
  tabName: string = 'Products',
  items: { name: string; qty: number }[]
): Promise<boolean> {
  const auth = getAuth();
  if (!auth) return false;

  try {
    const sheets = google.sheets({ version: 'v4', auth });

    // Read all product rows
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A:F`,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return false;

    const headers = rows[0].map((h: string) => h.toLowerCase().trim());
    const nameIdx  = headers.findIndex((h: string) => h.includes('name'));
    const stockIdx = headers.findIndex((h: string) => h.includes('stock') || h.includes('qty'));

    if (nameIdx === -1 || stockIdx === -1) {
      console.warn('deductStockInSheet: "name" or "stock" column not found in Products tab');
      return false;
    }

    const updatePromises: Promise<any>[] = [];

    for (const item of items) {
      for (let i = 1; i < rows.length; i++) {
        const rowName = (rows[i][nameIdx] || '').trim().toLowerCase();
        if (rowName === item.name.toLowerCase().trim()) {
          const currentStock = parseInt(rows[i][stockIdx] || '0') || 0;
          const newStock = Math.max(0, currentStock - item.qty);
          // Convert column index to letter (0→A, 1→B, …)
          const colLetter = String.fromCharCode(65 + stockIdx);
          const cellRange  = `${tabName}!${colLetter}${i + 1}`;

          updatePromises.push(
            sheets.spreadsheets.values.update({
              spreadsheetId: sheetId,
              range: cellRange,
              valueInputOption: 'RAW',
              requestBody: { values: [[newStock]] },
            })
          );
          break; // matched — move to next ordered item
        }
      }
    }

    if (updatePromises.length > 0) await Promise.all(updatePromises);
    return true;
  } catch (error) {
    console.error('deductStockInSheet error:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN BOT — Sheet CRUD Functions
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Products: Append ─────────────────────────────────────────────────────────

export async function appendProductToSheet(
  sheetId: string,
  product: {
    name: string;
    price: number;
    category: string;
    stock: number;
    image?: string | null;
    description?: string | null;
  },
  tabName: string = 'Products'
): Promise<boolean> {
  const auth = getAuth();
  if (!auth) return false;

  try {
    const sheets = google.sheets({ version: 'v4', auth });

    // Ensure headers exist
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A1:F1`,
    });

    if (!existing.data.values || existing.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${tabName}!A1:F1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Name', 'Price', 'Category', 'Stock', 'Image', 'Description']],
        },
      });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${tabName}!A:F`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          product.name,
          product.price,
          product.category,
          product.stock,
          product.image || '',
          product.description || '',
        ]],
      },
    });

    return true;
  } catch (error) {
    console.error('appendProductToSheet error:', error);
    return false;
  }
}

// ─── Products: Update field by name ───────────────────────────────────────────

export async function updateProductInSheet(
  sheetId: string,
  productName: string,
  field: string,
  value: string | number,
  tabName: string = 'Products'
): Promise<boolean> {
  const auth = getAuth();
  if (!auth) return false;

  try {
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A:F`,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return false;

    const headers = rows[0].map((h: string) => h.toLowerCase().trim());
    const nameIdx = headers.findIndex((h: string) => h.includes('name'));

    // Map admin field names to sheet column header keywords
    const fieldMap: Record<string, string> = {
      name: 'name',
      price: 'price',
      category: 'category',
      stockCount: 'stock',
      image: 'image',
      description: 'desc',
    };

    const headerKeyword = fieldMap[field] || field.toLowerCase();
    const colIdx = headers.findIndex((h: string) => h.includes(headerKeyword));

    if (nameIdx === -1 || colIdx === -1) return false;

    // Find the row by product name
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][nameIdx] || '').trim().toLowerCase() === productName.toLowerCase().trim()) {
        const colLetter = String.fromCharCode(65 + colIdx);
        const cellRange = `${tabName}!${colLetter}${i + 1}`;

        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: cellRange,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[value]] },
        });
        return true;
      }
    }

    return false; // product not found
  } catch (error) {
    console.error('updateProductInSheet error:', error);
    return false;
  }
}

// ─── Products: Delete by name ─────────────────────────────────────────────────

export async function deleteProductFromSheet(
  sheetId: string,
  productName: string,
  tabName: string = 'Products'
): Promise<boolean> {
  const auth = getAuth();
  if (!auth) return false;

  try {
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A:F`,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return false;

    const headers = rows[0].map((h: string) => h.toLowerCase().trim());
    const nameIdx = headers.findIndex((h: string) => h.includes('name'));
    if (nameIdx === -1) return false;

    // Find the row index
    let targetRowIdx = -1;
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][nameIdx] || '').trim().toLowerCase() === productName.toLowerCase().trim()) {
        targetRowIdx = i;
        break;
      }
    }

    if (targetRowIdx === -1) return false;

    // Get sheet GID to use batchUpdate (deleteDimension)
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const tab = spreadsheet.data.sheets?.find(
      s => s.properties?.title?.toLowerCase() === tabName.toLowerCase()
    );
    if (!tab?.properties?.sheetId && tab?.properties?.sheetId !== 0) return false;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: tab.properties!.sheetId!,
              dimension: 'ROWS',
              startIndex: targetRowIdx,
              endIndex: targetRowIdx + 1,
            },
          },
        }],
      },
    });

    return true;
  } catch (error) {
    console.error('deleteProductFromSheet error:', error);
    return false;
  }
}

// ─── Products: Toggle active (via a column, or just set stock to 0) ──────────

export async function toggleProductInSheet(
  sheetId: string,
  productName: string,
  setActive: boolean,
  tabName: string = 'Products'
): Promise<boolean> {
  // Toggle by setting stock to 0 (inactive) or restoring (active)
  // If there's an "active" column we use that; otherwise we use stock as proxy
  return updateProductInSheet(sheetId, productName, 'stockCount', setActive ? 999 : 0, tabName);
}

// ─── Delivery Zones: Append ──────────────────────────────────────────────────

export async function appendZoneToSheet(
  sheetId: string,
  zone: { township: string; city: string; fee: number },
  tabName: string = 'DeliveryZones'
): Promise<boolean> {
  const auth = getAuth();
  if (!auth) return false;

  try {
    const sheets = google.sheets({ version: 'v4', auth });

    // Ensure headers
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A1:C1`,
    });

    if (!existing.data.values || existing.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${tabName}!A1:C1`,
        valueInputOption: 'RAW',
        requestBody: { values: [['Township', 'City', 'Fee']] },
      });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${tabName}!A:C`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[zone.township, zone.city || '', zone.fee]],
      },
    });

    return true;
  } catch (error) {
    console.error('appendZoneToSheet error:', error);
    return false;
  }
}

// ─── Delivery Zones: Update field by township name ───────────────────────────

export async function updateZoneInSheet(
  sheetId: string,
  townshipName: string,
  field: string,
  value: string | number,
  tabName: string = 'DeliveryZones'
): Promise<boolean> {
  const auth = getAuth();
  if (!auth) return false;

  try {
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A:C`,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return false;

    const headers = rows[0].map((h: string) => h.toLowerCase().trim());
    const townshipIdx = headers.findIndex((h: string) => h.includes('township'));

    const fieldMap: Record<string, string> = {
      township: 'township',
      city: 'city',
      fee: 'fee',
    };

    const headerKeyword = fieldMap[field] || field.toLowerCase();
    const colIdx = headers.findIndex((h: string) =>
      h.includes(headerKeyword) || (headerKeyword === 'fee' && (h.includes('delivery') || h.includes('price')))
    );

    if (townshipIdx === -1 || colIdx === -1) return false;

    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][townshipIdx] || '').trim().toLowerCase() === townshipName.toLowerCase().trim()) {
        const colLetter = String.fromCharCode(65 + colIdx);
        const cellRange = `${tabName}!${colLetter}${i + 1}`;

        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: cellRange,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[value]] },
        });
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('updateZoneInSheet error:', error);
    return false;
  }
}

// ─── Delivery Zones: Delete by township name ─────────────────────────────────

export async function deleteZoneFromSheet(
  sheetId: string,
  townshipName: string,
  tabName: string = 'DeliveryZones'
): Promise<boolean> {
  const auth = getAuth();
  if (!auth) return false;

  try {
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A:C`,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return false;

    const headers = rows[0].map((h: string) => h.toLowerCase().trim());
    const townshipIdx = headers.findIndex((h: string) => h.includes('township'));
    if (townshipIdx === -1) return false;

    let targetRowIdx = -1;
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][townshipIdx] || '').trim().toLowerCase() === townshipName.toLowerCase().trim()) {
        targetRowIdx = i;
        break;
      }
    }

    if (targetRowIdx === -1) return false;

    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const tab = spreadsheet.data.sheets?.find(
      s => s.properties?.title?.toLowerCase() === tabName.toLowerCase()
    );
    if (!tab?.properties?.sheetId && tab?.properties?.sheetId !== 0) return false;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: tab.properties!.sheetId!,
              dimension: 'ROWS',
              startIndex: targetRowIdx,
              endIndex: targetRowIdx + 1,
            },
          },
        }],
      },
    });

    return true;
  } catch (error) {
    console.error('deleteZoneFromSheet error:', error);
    return false;
  }
}
