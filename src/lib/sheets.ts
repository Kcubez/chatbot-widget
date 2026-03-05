/**
 * Google Sheets sync for orders
 * Uses a Service Account to append order rows to a Google Sheet
 *
 * Setup:
 * 1. Create a Google Cloud Service Account
 * 2. Download JSON key and set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_KEY in .env
 * 3. Share the Google Sheet with the service account email
 */

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

    // Check if header row exists, if not create it
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

    // Format items
    const items = Array.isArray(order.items)
      ? order.items.map((i: any) => `${i.name} x${i.qty}`).join(', ')
      : String(order.items);

    // Append order row
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
