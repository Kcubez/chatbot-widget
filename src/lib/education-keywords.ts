// Client-safe constants — no server-only imports (prisma/pg) allowed here.
// Both the dashboard Client Component and the server-side education flow
// import KEYWORD_DEFAULTS from this file.

// Default trigger keywords for typed-message matching. Editable per-bot via
// dashboard (stored as comma-separated strings in `educationFlowContent`
// under `keyword_<id>` keys). Empty/blank override falls back to these defaults.
export const KEYWORD_DEFAULTS: Record<string, string[]> = {
  course_types: ['သင်တန်းအမျိုးအစား', 'class type', 'courses', 'သင်တန်းတွေ'],
  age: ['အသက်', 'age', 'years old'],
  level_test: ['level test', 'leveltest', 'test', 'စာမေးပွဲ', 'ဘယ် level', 'အခြေခံရှိ'],
  differences: ['ကွာခြား', 'difference', 'golden package နဲ့', 'ai golden နဲ့'],
  rules: ['refund', 'စည်းကမ်း', 'ပြန်အမ်း', 'transfer'],
  registration: ['registration', 'register', 'ကျောင်းအပ်', 'အပ်ချင်'],
  spin_wheel: ['spin wheel', 'spinwheel', 'spin', 'ကံစမ်း', 'လှည့်'],
  payment: ['payment', 'ငွေလွှဲ', 'voucher', 'screenshot', 'transaction'],
  materials: ['uniform', 'စာအုပ်', 'delivery'],
  course_ai_golden: ['ai golden', 'ai package'],
  course_golden: ['golden package', 'golden class'],
  course_speaking: ['speaking class', 'speaking level'],
  course_hsk: ['hsk class', 'hanyu shuiping'],
  course_hsk_premium: ['hsk premium', 'hsk premium class', 'premium class'],
  fee: ['fee', 'price', 'သင်တန်းကြေး', 'fees', 'သင်တန်းအကြောင်း', 'class information', 'course information'],
  schedule: ['schedule', 'အတန်းချိန်', 'class time'],
};

/**
 * Hybrid keyword matcher.
 *
 * - ASCII-only keywords (e.g. 'test', 'spin', 'fee') match on word boundaries,
 *   so 'test' does not fire inside 'latest' and 'spin' does not fire inside
 *   'spinning'. A custom boundary check is used instead of `\b` because `\b`
 *   is ASCII-oriented and unreliable around other scripts.
 * - Keywords containing non-ASCII characters (e.g. Myanmar 'အသက်') fall back
 *   to substring matching, which is correct for scripts written without
 *   word-separating spaces.
 *
 * Both inputs are lowercased defensively; `getEducationKeywords` already
 * returns lowercase keywords and callers pass a lowercased message.
 */
export function keywordMatches(normalizedText: string, keyword: string): boolean {
  const text = normalizedText.toLowerCase();
  const kw = keyword.toLowerCase().trim();
  if (!kw) return false;
  if (/^[a-z0-9\s\-']+$/.test(kw)) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text);
  }
  return text.includes(kw);
}
