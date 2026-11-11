// Spaced-repetition scheduler based on Ebbinghaus-style expanding intervals.
// Stage intervals: 10 min (same session) → 1 → 2 → 4 → 7 → 15 → 30 → 60 days.
// NOTE: the intervals are an engineering heuristic, not an empirically optimised schedule;
// every review is logged so the parameters can be checked against observed retention later.

export type Rating = 'known' | 'again' | 'unknown'; // 已熟記 / 再複習 / 不熟

export const STAGE_DAYS = [0, 1, 2, 4, 7, 15, 30, 60];
export const MAX_STAGE = STAGE_DAYS.length - 1;
export const RELEARN_MS = 10 * 60 * 1000;
export const LEECH_LAPSES = 4;
export const DAY_ROLLOVER_HOUR = 4; // a "study day" starts at 04:00 local time

export interface CardState {
  id: string;
  stage: number; // -1 = new
  due: number; // epoch ms
  lapses: number;
  reps: number;
  last: Rating | null;
  lastReview: number | null;
}

export interface Config {
  examDate: Date; // exam day (local)
}

export const newCard = (id: string): CardState => ({
  id, stage: -1, due: 0, lapses: 0, reps: 0, last: null, lastReview: null,
});

/** Start (ms) of the study day containing `t`. */
export function dayStart(t: number): number {
  const d = new Date(t);
  if (d.getHours() < DAY_ROLLOVER_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(DAY_ROLLOVER_HOUR, 0, 0, 0);
  return d.getTime();
}

/** "YYYY-MM-DD" key of the study day containing t. */
export function dayKey(t: number): string {
  const d = new Date(dayStart(t));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(t: number, days: number): number {
  const d = new Date(dayStart(t));
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Last study day before the exam: reviews are never scheduled after it. */
function examCap(cfg: Config): number {
  const e = new Date(cfg.examDate);
  e.setHours(DAY_ROLLOVER_HOUR, 0, 0, 0);
  e.setDate(e.getDate() - 1);
  return e.getTime();
}

function capDue(due: number, now: number, cfg: Config): number {
  const cap = examCap(cfg);
  if (dayStart(now) >= cap) return due; // exam eve or later: leave as is
  return Math.min(due, cap);
}

export function rate(card: CardState, rating: Rating, now: number, cfg: Config): CardState {
  const c: CardState = { ...card, reps: card.reps + 1, last: rating, lastReview: now };
  const isNew = card.stage < 0;
  if (rating === 'known') {
    if (isNew) c.stage = 3; // first exposure already known → 4 days
    else c.stage = Math.min(Math.max(card.stage, 0) + 1, MAX_STAGE);
    c.due = addDays(now, STAGE_DAYS[c.stage]);
  } else if (rating === 'again') {
    c.stage = Math.max(card.stage, 1);
    const half = Math.max(1, Math.floor(STAGE_DAYS[c.stage] / 2));
    c.due = addDays(now, half);
  } else {
    if (!isNew && card.stage >= 1) c.lapses = card.lapses + 1;
    c.stage = 0;
    c.due = now + RELEARN_MS;
  }
  if (rating !== 'unknown') c.due = capDue(c.due, now, cfg);
  return c;
}

/** Quiz answers feed the same schedule: correct ≈ 已熟記, wrong ≈ 不熟. */
export const rateFromQuiz = (card: CardState, correct: boolean, now: number, cfg: Config) =>
  rate(card, correct ? 'known' : 'unknown', now, cfg);

export const isDue = (c: CardState, now: number) => c.stage >= 0 && c.due <= now;
export const isLeech = (c: CardState) => c.lapses >= LEECH_LAPSES;
/** 不熟區: last rated 不熟, or a leech. */
export const inUnknownPool = (c: CardState) => c.stage >= 0 && (c.last === 'unknown' || isLeech(c));
/** 再複習區: last rated 再複習. */
export const inAgainPool = (c: CardState) => c.stage >= 0 && c.last === 'again';

// ---------------- wrong-answer book (錯題區) ----------------
export interface WrongItem {
  key: string; // question key
  itemId: string; // related card id (may be '')
  kind: string; // quiz type
  wrong: number;
  correctDays: string[]; // distinct study days answered correctly since last wrong
  resolved: boolean;
  lastWrong: number;
  payload?: unknown; // serialised question for replay
}

export const WRONG_EXIT_DAYS = 2;

export function recordWrong(prev: WrongItem | undefined, base: Omit<WrongItem, 'wrong' | 'correctDays' | 'resolved' | 'lastWrong'>, now: number): WrongItem {
  return {
    ...base,
    wrong: (prev?.wrong ?? 0) + 1,
    correctDays: [],
    resolved: false,
    lastWrong: now,
  };
}

/** Correct answer on a wrong item: exits after correct answers on WRONG_EXIT_DAYS distinct days. */
export function recordCorrect(item: WrongItem, now: number): WrongItem {
  const k = dayKey(now);
  const days = item.correctDays.includes(k) ? item.correctDays : [...item.correctDays, k];
  return { ...item, correctDays: days, resolved: days.length >= WRONG_EXIT_DAYS };
}

// ---------------- daily new-card quota ----------------
export interface Phase {
  key: string;
  name: string;
  start: string; // YYYY-MM-DD inclusive
  end: string; // inclusive
  focus: string;
}

export const DEFAULT_PHASES: Phase[] = [
  { key: 'A', name: 'A 打底', start: '2026-11-11', end: '2026-12-31', focus: '臺羅與變調、語詞 01、語句 01 前半' },
  { key: 'B', name: 'B 擴充', start: '2027-01-01', end: '2027-02-07', focus: '語詞 02、語句、每週 2 篇文章、寫作與口說' },
  { key: 'C', name: 'C 題型強化', start: '2027-02-08', end: '2027-02-28', focus: '文章閱讀與聽解、克漏字、聽寫、模擬考' },
  { key: 'D', name: 'D 衝刺', start: '2027-03-01', end: '2027-03-06', focus: '不加新卡；清空錯題與不熟區；模擬考' },
];

export const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, DAY_ROLLOVER_HOUR).getTime();
};

export function currentPhase(now: number, phases = DEFAULT_PHASES): Phase | null {
  const k = dayKey(now);
  return phases.find((p) => p.start <= k && k <= p.end) ?? (k < phases[0].start ? phases[0] : null);
}

/** Days remaining (including today) until the end of the last card-introducing phase (B by default). */
export function studyDaysLeft(now: number, lastNewDay: string): number {
  const diff = Math.round((parseDay(lastNewDay) - dayStart(now)) / 86400000) + 1;
  return Math.max(0, diff);
}

/**
 * New cards for today = remaining new ÷ remaining days, capped by user limit and reduced when the
 * review backlog is heavy (> reviewSoftCap halves it, > 2×reviewSoftCap stops new cards).
 */
export function newQuota(opts: {
  remainingNew: number;
  daysLeft: number;
  dueToday: number;
  maxNew: number;
  reviewSoftCap: number;
  introducedToday: number;
  weekend: boolean;
}): number {
  if (opts.daysLeft <= 0 || opts.remainingNew <= 0) return 0;
  let q = Math.ceil(opts.remainingNew / opts.daysLeft);
  if (opts.weekend) q = Math.round(q * 0.6); // weekends favour articles / writing / speaking
  q = Math.min(q, opts.maxNew);
  if (opts.dueToday > opts.reviewSoftCap * 2) q = 0;
  else if (opts.dueToday > opts.reviewSoftCap) q = Math.floor(q / 2);
  return Math.max(0, q - opts.introducedToday);
}
