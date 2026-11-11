// Study-state operations on top of the scheduler + IndexedDB.
import { db, type CardRow, type Settings } from './db';
import {
  rate, rateFromQuiz, newCard, dayStart, dayKey, isDue, inUnknownPool, inAgainPool, newQuota, studyDaysLeft,
  recordWrong, recordCorrect, currentPhase, type Rating, type Config,
} from './scheduler';
import type { Index } from './data';
import type { Question } from './quizgen';

export const cfgOf = (s: Settings): Config => {
  const [y, m, d] = s.examDate.split('-').map(Number);
  return { examDate: new Date(y, m - 1, d) };
};

export async function rateCard(id: string, deck: 'w' | 's', rating: Rating, s: Settings, ms: number, mode = 'flash') {
  const now = Date.now();
  const prev = await db.cards.get(id);
  const base: CardRow = prev ?? { ...newCard(id), deck, introduced: now };
  const next = rate(base, rating, now, cfgOf(s));
  await db.cards.put({ ...base, ...next });
  await db.log.add({ ts: now, cardId: id, rating, mode, ms, prevStage: base.stage });
}

/** Apply a quiz answer: reschedules the linked card (if already introduced) and maintains the 錯題區. */
export async function recordAnswer(q: Question, correct: boolean, s: Settings, section: string) {
  const now = Date.now();
  if (q.itemId) {
    const prev = await db.cards.get(q.itemId);
    if (prev) {
      await db.cards.put({ ...prev, ...rateFromQuiz(prev, correct, now, cfgOf(s)) });
    }
    await db.log.add({ ts: now, cardId: q.itemId, rating: correct ? 'quiz-ok' : 'quiz-bad', mode: section, ms: 0, prevStage: prev?.stage ?? -1 });
  }
  const w = await db.wrong.get(q.key);
  if (!correct) {
    await db.wrong.put(recordWrong(w, { key: q.key, itemId: q.itemId ?? '', kind: q.kind, payload: q }, now));
  } else if (w && !w.resolved) {
    await db.wrong.put(recordCorrect(w, now));
  }
}

export async function saveQuiz(section: string, kind: string, total: number, correct: number, secs: number) {
  await db.quizzes.add({ ts: Date.now(), section, kind, total, correct, secs });
}

export interface TodayStats {
  due: CardRow[];
  newIds: string[];
  quota: number;
  introducedToday: number;
  unknown: number;
  again: number;
  wrong: number;
  totalIntroduced: number;
  remainingNew: number;
  reviewedToday: number;
  streak: number;
  phase: ReturnType<typeof currentPhase>;
}

export async function todayStats(idx: Index, s: Settings): Promise<TodayStats> {
  const now = Date.now();
  const cards = await db.cards.toArray();
  const ids = new Set(cards.map((c) => c.id));
  const seq = idx.newSequence(s.includeSentences).filter((id) => !ids.has(id));
  const t0 = dayStart(now);
  const introducedToday = cards.filter((c) => c.introduced >= t0).length;
  const due = cards.filter((c) => isDue(c, now)).sort((a, b) => a.due - b.due);
  const wk = new Date(now).getDay();
  const quota = newQuota({
    remainingNew: seq.length,
    daysLeft: studyDaysLeft(now, s.lastNewDay),
    dueToday: due.length,
    maxNew: s.maxNew,
    reviewSoftCap: s.reviewSoftCap,
    introducedToday,
    weekend: wk === 0 || wk === 6,
  });
  const logs = await db.log.where('ts').above(now - 400 * 86400000).toArray();
  const days = new Set(logs.map((l) => dayKey(l.ts)));
  let streak = 0;
  for (let t = now; days.has(dayKey(t)); t -= 86400000) streak++;
  if (!days.has(dayKey(now))) {
    for (let t = now - 86400000; days.has(dayKey(t)); t -= 86400000) streak++;
  }
  return {
    due, newIds: seq.slice(0, quota), quota, introducedToday,
    unknown: cards.filter(inUnknownPool).length,
    again: cards.filter(inAgainPool).length,
    wrong: await db.wrong.filter((w) => !w.resolved).count(),
    totalIntroduced: cards.length, remainingNew: seq.length,
    reviewedToday: logs.filter((l) => l.ts >= t0).length,
    streak, phase: currentPhase(now),
  };
}

export async function poolCards(pool: 'due' | 'unknown' | 'again'): Promise<CardRow[]> {
  const now = Date.now();
  const all = await db.cards.toArray();
  if (pool === 'due') return all.filter((c) => isDue(c, now)).sort((a, b) => a.due - b.due);
  if (pool === 'unknown') return all.filter(inUnknownPool).sort((a, b) => b.lapses - a.lapses);
  return all.filter(inAgainPool);
}

export function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const exam = new Date(y, m - 1, d).getTime();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((exam - today.getTime()) / 86400000);
}
