// Tâi-lô utilities: numeric-tone → diacritic conversion, normalisation and syllable comparison.

const TONE_MARK: Record<number, string> = {
  2: '́', 3: '̀', 5: '̂', 6: '̌', 7: '̄', 8: '̍', 9: '̋',
};
const MARK_TONE: Record<string, number> = Object.fromEntries(
  Object.entries(TONE_MARK).map(([t, m]) => [m, Number(t)]),
);
const COMBINING = /[̀-ͯ]/g;

export const nfc = (s: string) => s.normalize('NFC');
export const nfd = (s: string) => s.normalize('NFD');
export const toneless = (s: string) => nfd(s).replace(COMBINING, '').toLowerCase();

/** Index (in the toneless syllable) of the letter that carries the tone mark, per Tâi-lô rules. */
export function markPosition(base: string): number {
  const s = base.toLowerCase();
  const a = s.indexOf('a');
  if (a >= 0) return a;
  const oo = s.indexOf('oo');
  if (oo >= 0) return oo;
  for (const v of ['e', 'o']) {
    const i = s.indexOf(v);
    if (i >= 0) return i;
  }
  const iu = s.indexOf('iu');
  if (iu >= 0) return iu + 1; // iu → mark u
  const ui = s.indexOf('ui');
  if (ui >= 0) return ui + 1; // ui → mark i
  for (const v of ['i', 'u']) {
    const i = s.indexOf(v);
    if (i >= 0) return i;
  }
  // syllabic nasals: m, ng (mark on m / n)
  const m = s.indexOf('m');
  if (m >= 0) return m;
  const n = s.indexOf('n');
  if (n >= 0) return n;
  return -1;
}

/** Apply a tone number (1–9) to one toneless syllable: ("bo", 5) → "bô". */
export function applyTone(base: string, tone: number): string {
  const mark = TONE_MARK[tone];
  if (!mark) return base;
  const pos = markPosition(base);
  if (pos < 0) return base;
  return nfc(base.slice(0, pos + 1) + mark + base.slice(pos + 1));
}

/** Convert numeric-tone input to diacritics: "Tai5-uan5 bo5 kiann2" → "Tâi-uân bô kiánn". */
export function numericToDiacritic(input: string): string {
  return input.replace(/([A-Za-z]+)([1-9])(?![0-9])/g, (_, base: string, t: string) => applyTone(base, Number(t)));
}

export interface Syl {
  base: string; // lowercase toneless letters
  tone: number; // 1–9
  neutral: boolean; // preceded by "--"
}

export function toneOf(syl: string): number {
  for (const ch of nfd(syl)) if (MARK_TONE[ch]) return MARK_TONE[ch];
  const b = toneless(syl);
  return /[ptkh]$/.test(b) ? 4 : 1;
}

/** Split romanisation into syllables (punctuation ignored, "--" neutral marker kept). */
export function splitSyllables(r: string): Syl[] {
  const s = nfc(numericToDiacritic(r)).replace(/[.,!?;:"'“”‘’（）()，。！？；：、…「」]/g, ' ');
  const out: Syl[] = [];
  const re = /(--)?([A-Za-zÀ-ɏḀ-ỿ̀-ͯ]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const raw = m[2];
    out.push({ base: toneless(raw), tone: toneOf(raw), neutral: !!m[1] });
  }
  return out;
}

export interface SylDiff {
  expected: string;
  given: string | null;
  baseOk: boolean;
  toneOk: boolean;
}

export interface CompareResult {
  correct: boolean;
  /** correct letters, only tone errors */
  tonesOnly: boolean;
  diffs: SylDiff[];
}

const display = (s: Syl) => (s.neutral ? '--' : '') + applyTone(s.base, s.tone);

/** Compare a learner's answer with the expected romanisation, syllable by syllable. */
export function compareTailo(given: string, expected: string): CompareResult {
  const g = splitSyllables(given);
  const e = splitSyllables(expected);
  const diffs: SylDiff[] = e.map((es, i) => {
    const gs = g[i];
    return {
      expected: display(es),
      given: gs ? display(gs) : null,
      baseOk: !!gs && gs.base === es.base,
      toneOk: !!gs && gs.base === es.base && gs.tone === es.tone,
    };
  });
  for (let i = e.length; i < g.length; i++) {
    diffs.push({ expected: '', given: display(g[i]), baseOk: false, toneOk: false });
  }
  const correct = diffs.every((d) => d.toneOk);
  const tonesOnly = !correct && diffs.every((d) => d.baseOk);
  return { correct, tonesOnly, diffs };
}

/** Tone sandhi (偏漳 default) for a non-final syllable, per 《學拼音有撇步》連續變調篇. */
export function sandhiTone(syl: string, quanzhou = false): number {
  const t = toneOf(syl);
  const b = toneless(syl);
  switch (t) {
    case 1: return 7;
    case 2: return 1;
    case 3: return 2;
    case 5: return quanzhou ? 3 : 7;
    case 7: return 3;
    case 4: return b.endsWith('h') ? 2 : 8;
    case 8: return b.endsWith('h') ? 3 : 4;
    default: return t;
  }
}

export const TONE_NAMES = ['', '第1聲', '第2聲', '第3聲', '第4聲', '第5聲', '第6聲', '第7聲', '第8聲', '第9聲'];
