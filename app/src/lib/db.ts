import Dexie, { type Table } from 'dexie';
import type { CardState, Rating, WrongItem } from './scheduler';

export interface CardRow extends CardState { deck: 'w' | 's'; introduced: number }
export interface LogRow { id?: number; ts: number; cardId: string; rating: Rating | 'quiz-ok' | 'quiz-bad'; mode: string; ms: number; prevStage?: number }
export interface RecRow { id?: number; ts: number; kind: string; promptId: string; title: string; blob: Blob; mime: string; durMs: number; self?: number }
export interface WritingRow { id?: number; ts: number; kind: string; promptId: string; title: string; text: string; self?: number; secs: number }
export interface QuizRow { id?: number; ts: number; section: string; kind: string; total: number; correct: number; secs: number }
export interface KV { k: string; v: unknown }

class TaigiDB extends Dexie {
  cards!: Table<CardRow, string>;
  log!: Table<LogRow, number>;
  wrong!: Table<WrongItem, string>;
  recs!: Table<RecRow, number>;
  writings!: Table<WritingRow, number>;
  quizzes!: Table<QuizRow, number>;
  kv!: Table<KV, string>;

  constructor() {
    super('taigi-b2');
    this.version(1).stores({
      cards: 'id, deck, due, stage, last, introduced',
      log: '++id, ts, cardId, mode',
      wrong: 'key, itemId, kind, resolved, lastWrong',
      recs: '++id, ts, kind, promptId',
      writings: '++id, ts, kind, promptId',
      quizzes: '++id, ts, section, kind',
      kv: 'k',
    });
  }
}

export const db = new TaigiDB();

export async function getKV<T>(k: string, dflt: T): Promise<T> {
  const r = await db.kv.get(k);
  return r ? (r.v as T) : dflt;
}
export const setKV = (k: string, v: unknown) => db.kv.put({ k, v });

export interface Settings {
  examDate: string; // YYYY-MM-DD
  maxNew: number;
  reviewSoftCap: number;
  lastNewDay: string; // last day new cards are introduced
  autoplay: boolean;
  frontMode: 'han' | 'listen' | 'auto'; // card front: show 漢字 / play audio first / auto by stage
  quanzhou: boolean; // 5→3 sandhi
  targetScore: number; // configurable B2 target (official threshold unverified)
  includeSentences: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  examDate: '2027-03-07',
  maxNew: 30,
  reviewSoftCap: 160,
  lastNewDay: '2027-02-07',
  autoplay: true,
  frontMode: 'auto',
  quanzhou: false,
  targetScore: 0,
  includeSentences: true,
};

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await getKV<Partial<Settings>>('settings', {})) };
}
export const saveSettings = (s: Settings) => setKV('settings', s);

// ---------- backup ----------
async function blobToDataURL(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(b);
  });
}

export async function exportBackup(includeRecordings: boolean): Promise<Blob> {
  const data: Record<string, unknown> = {
    app: 'taigi-b2', version: 1, exportedAt: new Date().toISOString(),
    cards: await db.cards.toArray(),
    log: await db.log.toArray(),
    wrong: await db.wrong.toArray(),
    writings: await db.writings.toArray(),
    quizzes: await db.quizzes.toArray(),
    kv: await db.kv.toArray(),
  };
  if (includeRecordings) {
    const recs = await db.recs.toArray();
    data.recs = await Promise.all(recs.map(async (r) => ({ ...r, blob: await blobToDataURL(r.blob) })));
  }
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export async function importBackup(file: File): Promise<void> {
  const data = JSON.parse(await file.text());
  if (data.app !== 'taigi-b2') throw new Error('不是本 App 的備份檔');
  await db.transaction('rw', [db.cards, db.log, db.wrong, db.writings, db.quizzes, db.kv, db.recs], async () => {
    await Promise.all([db.cards.clear(), db.log.clear(), db.wrong.clear(), db.writings.clear(), db.quizzes.clear(), db.kv.clear()]);
    await db.cards.bulkPut(data.cards ?? []);
    await db.log.bulkPut(data.log ?? []);
    await db.wrong.bulkPut(data.wrong ?? []);
    await db.writings.bulkPut(data.writings ?? []);
    await db.quizzes.bulkPut(data.quizzes ?? []);
    await db.kv.bulkPut(data.kv ?? []);
    if (data.recs) {
      await db.recs.clear();
      for (const r of data.recs) {
        const blob = await (await fetch(r.blob)).blob();
        await db.recs.put({ ...r, blob });
      }
    }
  });
}
