// Client-safe course catalog — no server-only imports (prisma/pg) allowed here.
// Both the dashboard Client Component and the server-side education flow import
// from this file. Business owners manage this list from the dashboard; the bot
// runtime reads it DB-first with a code fallback (see education-registration.ts).

export interface EducationCourse {
  /** Stable id used in EDU_* payloads (lowercase letters, digits, underscores). */
  id: string;
  /** Full display name, e.g. 'HSK Premium Class'. */
  name: string;
  /** Short picker-button label (Facebook limit: 20 chars). Defaults to name. */
  buttonLabel?: string;
  /** Part 1 detail text (max 2000 chars). */
  detail?: string;
  /** Optional Part 2 continuation (max 2000 chars). */
  detailPart2?: string;
  /** Typed-message trigger keywords. */
  keywords?: string[];
  /** Inactive courses are hidden from lists and keyword matching. */
  isActive?: boolean;
}

/** Picker shows courses + Home button; Facebook allows max 11 quick replies. */
export const MAX_ACTIVE_COURSES = 10;

export const COURSE_ID_PATTERN = /^[a-z0-9_]{1,32}$/;

export function slugifyCourseId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return COURSE_ID_PATTERN.test(slug) ? slug : `course_${Date.now().toString(36)}`;
}

// Seed mirrors the original 5 hardcoded courses. Array order = display order AND
// keyword-match priority (longer/more-specific courses must come before the
// shorter names they contain, e.g. ai_golden before golden).
export const DEFAULT_COURSE_SEED: EducationCourse[] = [
  {
    id: 'ai_golden',
    name: 'AI Golden Package Class',
    buttonLabel: 'AI Golden Package',
    keywords: ['ai golden', 'ai package'],
    isActive: true,
  },
  {
    id: 'golden',
    name: 'Golden Package Class',
    buttonLabel: 'Golden Package Class',
    keywords: ['golden package', 'golden class'],
    isActive: true,
  },
  {
    id: 'speaking',
    name: 'Speaking Class',
    buttonLabel: 'Speaking Class',
    keywords: ['speaking class', 'speaking level'],
    isActive: true,
  },
  {
    id: 'hsk',
    name: 'HSK Class',
    buttonLabel: 'HSK Class',
    keywords: ['hsk class', 'hanyu shuiping'],
    isActive: true,
  },
  {
    id: 'hsk_premium',
    name: 'HSK Premium Class',
    buttonLabel: 'HSK Premium Class',
    keywords: ['hsk premium', 'hsk premium class', 'premium class'],
    isActive: true,
  },
];

/**
 * Validate/normalize a raw DB value into a course list.
 * Returns null when there is no usable custom list (caller falls back to code defaults).
 */
export function sanitizeCourses(raw: unknown): EducationCourse[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const seen = new Set<string>();
  const out: EducationCourse[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim().toLowerCase() : '';
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!COURSE_ID_PATTERN.test(id) || !name || seen.has(id)) continue;
    seen.add(id);
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const keywords = Array.isArray(rec.keywords)
      ? rec.keywords.filter((k): k is string => typeof k === 'string').map(k => k.trim().toLowerCase()).filter(Boolean)
      : undefined;
    out.push({
      id,
      name: name.slice(0, 80),
      buttonLabel: str(rec.buttonLabel).trim().slice(0, 20) || undefined,
      detail: str(rec.detail).slice(0, 2000) || undefined,
      detailPart2: str(rec.detailPart2).slice(0, 2000) || undefined,
      keywords,
      isActive: rec.isActive === false ? false : true,
    });
  }
  return out.length ? out : null;
}

/** Find exact-duplicate keywords shared between two or more courses (case-insensitive). */
export function findDuplicateKeywords(courses: EducationCourse[]): string[] {
  const owner = new Map<string, string>();
  const dupes = new Set<string>();
  for (const course of courses) {
    for (const kw of course.keywords ?? []) {
      const key = kw.trim().toLowerCase();
      if (!key) continue;
      const first = owner.get(key);
      if (first === undefined) owner.set(key, course.id);
      else if (first !== course.id) dupes.add(key);
    }
  }
  return [...dupes];
}
