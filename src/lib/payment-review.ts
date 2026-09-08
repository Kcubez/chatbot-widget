import { put } from '@vercel/blob';
import { prisma } from '@/lib/prisma';

/**
 * Manual payment-review helpers (shared by agentic + classic Telegram sale bots).
 *
 * Flow: user photo → download → Vercel Blob upload → Order(status='pending')
 * → admin Accept/Reject → customer notified.
 */

export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024; // 8 MB

export type ReceiptResolution =
  | { url: string; source: 'blob' }
  | { url: string; source: 'telegram' }
  | { url: null; source: 'none' };

/** Download a Telegram file URL (one retry). Returns bytes + content type. */
async function downloadReceipt(
  fileUrl: string
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(fileUrl, { cache: 'no-store' });
      if (!res.ok) {
        console.warn(`[PaymentReview] receipt download status ${res.status}, attempt ${attempt + 1}`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      const bytes = await res.arrayBuffer();
      if (bytes.byteLength > MAX_RECEIPT_BYTES) {
        console.warn(`[PaymentReview] receipt too large: ${bytes.byteLength} bytes`);
        return null;
      }
      const contentType =
        res.headers.get('content-type')?.startsWith('image/')
          ? (res.headers.get('content-type') as string)
          : 'image/jpeg';
      return { bytes, contentType };
    } catch (err) {
      console.warn(`[PaymentReview] receipt download error, attempt ${attempt + 1}:`, err);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

/**
 * Level 1: upload receipt to Vercel Blob (permanent URL for admin + dashboard).
 * Level 2 fallback: return the Telegram file URL directly (may expire).
 * Level 3: null (caller sends text-only + asks customer to resend).
 */
export async function resolveReceiptPhoto(
  fileUrl: string,
  botId: string
): Promise<ReceiptResolution> {
  const downloaded = await downloadReceipt(fileUrl);
  if (!downloaded) return { url: null, source: 'none' };

  try {
    const ext = downloaded.contentType.includes('png') ? 'png' : 'jpg';
    const blob = await put(`receipts/${botId}-${Date.now()}.${ext}`, downloaded.bytes, {
      access: 'public',
      contentType: downloaded.contentType,
    });
    return { url: blob.url, source: 'blob' };
  } catch (err) {
    console.error('[PaymentReview] Blob upload failed, falling back to Telegram URL:', err);
    return { url: fileUrl, source: 'telegram' };
  }
}

/** Load the still-actionable review order referenced by a sale session, if any.
 * Both `pending` (awaiting review) and `rejected` (awaiting resend) accept
 * a replacement receipt. */
export async function getSessionPendingOrder(sessionPendingData: unknown) {
  const orderId = (sessionPendingData as { pendingOrderId?: unknown })?.pendingOrderId;
  if (!orderId) return null;
  const order = await prisma.order.findUnique({ where: { id: String(orderId) } });
  if (!order || (order.status !== 'pending' && order.status !== 'rejected')) return null;
  return order;
}

/** Mark a pending review order as cancelled (customer pressed cancel/menu). */
export async function cancelPendingReviewOrder(orderId: string) {
  try {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'cancelled' },
    });
    return true;
  } catch (err) {
    console.error('[PaymentReview] cancel pending order failed:', err);
    return false;
  }
}

// ─── Shared customer-facing messages ─────────────────────────────────────────

export const MSG_RECEIPT_RECEIVED = (orderId: string) =>
  `✅ *ငွေလွှဲပြေစာ လက်ခံရရှိပါပြီရှင်!*\n\n` +
  `Admin မှ စစ်ဆေးပေးနေပါတယ် — အတည်ပြုပြီးရင် ဒီ chat ထဲမှာ အကြောင်းပြန်ပေးပါမယ်ရှင် 🙏\n\n` +
  `🧾 Order: \`#${orderId.slice(-6).toUpperCase()}\``;

export const MSG_RECEIPT_UPDATED =
  `✅ *ပြေစာအသစ် လက်ခံရရှိပါပြီ!*\n\nAdmin ဆီကို ထပ်ပို့ပေးလိုက်ပါပြီ — စစ်ဆေးပြီးရင် အကြောင်းပြန်ပေးပါမယ်ရှင် 🙏`;

export const MSG_DOWNLOAD_FAILED =
  `⚠️ ဓာတ်ပုံ download လုပ်လို့ မရပါ။ Screenshot ကို ပြန်ပို့ပေးပါ 🙏`;

export const MSG_PENDING_BLOCK =
  `⏳ လူကြီးမင်းရဲ့ အရင် order ကို Admin စစ်ဆေးနေတုန်းပါရှင် 🙏\n\n` +
  `အတည်ပြုပြီးမှ order အသစ် ထပ်မှာလို့ရပါမယ်။ ပြေစာမှားပို့မိရင် ဓာတ်ပုံအသစ် ထပ်ပို့ပြီး အစားထိုးနိုင်ပါတယ် 📸`;

export const MSG_PAYMENT_ACCEPTED = (email?: string | null) =>
  `✅ *ငွေပေးချေမှု အတည်ပြုပြီးပါပြီရှင်!*\n\n` +
  `ဝယ်ယူအားပေးတဲ့အတွက် အထူးကျေးဇူးတင်ပါတယ်ရှင် 😊🙏\n\n` +
  (email
    ? `📧 လူကြီးမင်းဝယ်ယူထားတဲ့ Ebook များကို email: *${email}* သို့ ပို့ပေးပါမယ်ရှင်။ ခဏစောင့်ပေးပါဦးနော် 🙏`
    : `📧 လူကြီးမင်းဝယ်ယူထားတဲ့ Ebook များကို email သို့ ပို့ပေးပါမယ်ရှင်။ ခဏစောင့်ပေးပါဦးနော် 🙏`);

export const MSG_PAYMENT_REJECTED =
  `❌ *ငွေလွှဲပြေစာ အဆင်မပြေပါဘူးရှင်*\n\n` +
  `သေချာစစ်ပြီး Screenshot အမှန်ကို ပြန်ပို့ပေးပါ 🙏\n(ငွေပမာဏ / ရက်စွဲ / transaction success ဖြစ်ကြောင်း ပေါ်လွင်အောင် ရိုက်ပေးပါ)`;

export const MSG_PENDING_CANCELLED =
  `❌ စောင့်ဆိုင်းနေတဲ့ order ကို ပယ်ဖျက်လိုက်ပါပြီ။ Menu ကို /start ဖြင့် ပြန်ကြည့်နိုင်ပါတယ်`;
