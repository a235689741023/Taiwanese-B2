import type { Content, CardItem, Word, Sentence } from './types';
import type { ManifestEntry } from './audio';

const get = async <T>(name: string): Promise<T> => {
  const r = await fetch(new URL(`data/${name}.json`, document.baseURI));
  if (!r.ok) throw new Error(`無法載入 ${name}.json`);
  return r.json();
};

export async function loadContent(): Promise<Content> {
  const [vocab, sentences, articles, tones, questions, prompts, exam] = await Promise.all([
    get<Content['vocab']>('vocab'),
    get<Content['sentences']>('sentences'),
    get<Content['articles']>('articles'),
    get<Content['tones']>('tones'),
    get<Content['questions']>('questions'),
    get<Content['prompts']>('prompts'),
    get<Content['exam']>('exam'),
  ]);
  return { vocab, sentences, articles, tones, questions, prompts, exam };
}

export const loadManifest = () => get<(ManifestEntry & { g: string })[]>('audio-manifest');

export class Index {
  words = new Map<string, Word>();
  sents = new Map<string, Sentence>();
  constructor(public c: Content) {
    c.vocab.forEach((w) => this.words.set(w.id, w));
    c.sentences.forEach((s) => this.sents.set(s.id, s));
  }
  card(id: string): CardItem | null {
    const w = this.words.get(id);
    if (w) return { kind: 'w', item: w };
    const s = this.sents.get(id);
    if (s) return { kind: 's', item: s };
    return null;
  }

  /** Global order of new items: book-1 words interleaved with book-1 sentences, then book 2. */
  newSequence(includeSentences: boolean): string[] {
    const out: string[] = [];
    for (const b of [1, 2]) {
      const ws = this.c.vocab.filter((w) => w.book === b).map((w) => w.id);
      const ss = includeSentences ? this.c.sentences.filter((s) => s.book === b).map((s) => s.id) : [];
      const total = ws.length + ss.length;
      let wi = 0, si = 0;
      for (let k = 0; k < total; k++) {
        // keep the word:sentence ratio constant across the book
        if (si >= ss.length || (wi < ws.length && wi / ws.length <= si / Math.max(1, ss.length))) out.push(ws[wi++]);
        else out.push(ss[si++]);
      }
    }
    return out;
  }
}

export function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export const sample = <T,>(a: T[], n: number) => shuffle(a).slice(0, n);
export const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
