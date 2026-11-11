// Automatic question generators mapped to the B卷 question types.
import type { Content, Word, Sentence, Article, MCQ } from './types';
import { shuffle, sample, pick } from './data';
import { splitSyllables, applyTone, toneOf, sandhiTone, TONE_NAMES } from './tailo';

export type QKind =
  | 'meaning' | 'listen-meaning' | 'listen-han' | 'tailo-choice' | 'fill-word' | 'grammar'
  | 'cloze' | 'comprehension' | 'tone' | 'sandhi' | 'listen-sentence' | 'official' | 'dict-tailo' | 'dict-han';

export interface Question {
  key: string; // stable key for the wrong-answer book
  kind: QKind;
  itemId?: string; // card id to reschedule
  prompt: string;
  passage?: string; // for cloze / comprehension
  audio?: string | null;
  audioOnce?: boolean;
  options: string[];
  answer: number;
  explain?: string;
  reveal?: { han?: string; roman?: string; zh?: string };
  source?: string; // '非官方自編' | '官方範例' | '自動出題'
}

export const KIND_LABEL: Record<QKind, string> = {
  meaning: '詞義選擇', 'listen-meaning': '聽音辨義', 'listen-han': '聽詞選字', 'tailo-choice': '臺羅辨識',
  'fill-word': '選詞填空', grammar: '語法專項', cloze: '克漏字', comprehension: '文章理解', tone: '聲調辨識',
  sandhi: '變調判斷', 'listen-sentence': '聽句選義', official: '官方範例', 'dict-tailo': '聽寫拼音', 'dict-han': '聽寫漢字',
};

const mcq = (correct: string, distractors: string[]): { options: string[]; answer: number } => {
  const uniq = Array.from(new Set(distractors.filter((d) => d && d !== correct))).slice(0, 3);
  const options = shuffle([correct, ...uniq]);
  return { options, answer: options.indexOf(correct) };
};

const gloss = (w: Word) => w.zh || w.defs?.[0]?.df || '';

function similarWords(w: Word, pool: Word[], n = 12): Word[] {
  const len = [...w.han].length;
  const same = pool.filter((x) => x.id !== w.id && [...x.han].length === len && x.han !== w.han);
  return sample(same.length >= 3 ? same : pool.filter((x) => x.id !== w.id), n);
}

export function meaningQ(w: Word, pool: Word[]): Question {
  const ds = similarWords(w, pool).map(gloss).filter((g) => g !== gloss(w));
  return {
    key: `meaning:${w.id}`, kind: 'meaning', itemId: w.id,
    prompt: `「${w.han}」是啥物意思？`, ...mcq(gloss(w), ds),
    reveal: { han: w.han, roman: w.roman, zh: gloss(w) }, audio: null, source: '自動出題',
  };
}

export function listenMeaningQ(w: Word, pool: Word[]): Question {
  const q = meaningQ(w, pool);
  return { ...q, key: `listen-meaning:${w.id}`, kind: 'listen-meaning', prompt: '聽音檔，選出意思', audio: w.audio };
}

export function listenHanQ(w: Word, pool: Word[]): Question {
  const ds = similarWords(w, pool).map((x) => x.han);
  return {
    key: `listen-han:${w.id}`, kind: 'listen-han', itemId: w.id, prompt: '聽音檔，選出正確的漢字',
    audio: w.audio, ...mcq(w.han, ds), reveal: { han: w.han, roman: w.roman, zh: gloss(w) }, source: '自動出題',
  };
}

/** Change the tone of one syllable to make a plausible wrong romanisation. */
function mutateTone(roman: string): string {
  const syls = splitSyllables(roman);
  if (!syls.length) return roman;
  const i = Math.floor(Math.random() * syls.length);
  const s = syls[i];
  const checked = /[ptkh]$/.test(s.base);
  const choices = (checked ? [4, 8] : [1, 2, 3, 5, 7]).filter((t) => t !== s.tone);
  const t = pick(choices);
  return syls.map((x, k) => (x.neutral ? '--' : (k ? '-' : '')) + applyTone(x.base, k === i ? t : x.tone)).join('').replace(/^-/, '');
}

const normRoman = (r: string) => {
  const s = splitSyllables(r);
  return s.map((x, k) => (x.neutral ? '--' : (k ? '-' : '')) + applyTone(x.base, x.tone)).join('').replace(/^-/, '');
};

export function tailoChoiceQ(w: Word): Question | null {
  const correct = normRoman(w.roman);
  const ds = new Set<string>();
  for (let i = 0; i < 20 && ds.size < 3; i++) {
    const m = mutateTone(correct);
    if (m !== correct) ds.add(m);
  }
  if (ds.size < 3) return null;
  return {
    key: `tailo:${w.id}`, kind: 'tailo-choice', itemId: w.id, prompt: `「${w.han}」的臺羅拼音是佗一个？`,
    ...mcq(correct, [...ds]), audio: null, reveal: { han: w.han, roman: w.roman, zh: gloss(w) }, source: '自動出題',
  };
}

export function fillWordQ(w: Word, pool: Word[]): Question | null {
  const ex = w.ex?.find((e) => e.han.includes(w.han) && e.han.length > w.han.length + 2);
  if (!ex) return null;
  const blanked = ex.han.replace(w.han, '＿＿');
  const ds = similarWords(w, pool, 20).filter((x) => !ex.han.includes(x.han)).map((x) => x.han);
  return {
    key: `fill:${w.id}`, kind: 'fill-word', itemId: w.id,
    prompt: `「${blanked}」請問空格仔內揀佗一个上適當？`, ...mcq(w.han, ds),
    explain: `${ex.han}（${ex.zh}）`, audio: null, reveal: { han: ex.han, roman: ex.roman, zh: ex.zh }, source: '自動出題（辭典例句）',
  };
}

export function listenSentenceQ(s: Sentence, pool: Sentence[]): Question | null {
  if (!s.audio) return null;
  const ds = sample(pool.filter((x) => x.id !== s.id && x.cat === s.cat), 6).map((x) => x.zh);
  const more = sample(pool.filter((x) => x.id !== s.id), 6).map((x) => x.zh);
  return {
    key: `listen-sent:${s.id}`, kind: 'listen-sentence', itemId: s.id, prompt: '聽句子，選出意思上接近的選項',
    audio: s.audio, ...mcq(s.zh, [...ds, ...more]), reveal: { han: s.han, roman: s.roman, zh: s.zh }, source: '自動出題',
  };
}

export const meaningSentenceQ = (s: Sentence, pool: Sentence[]): Question => {
  const ds = sample(pool.filter((x) => x.id !== s.id && x.cat === s.cat), 6).map((x) => x.zh);
  const more = sample(pool.filter((x) => x.id !== s.id), 6).map((x) => x.zh);
  return {
    key: `meaning-sent:${s.id}`, kind: 'meaning', itemId: s.id, prompt: `「${s.han}」這句話的意思是？`,
    ...mcq(s.zh, [...ds, ...more]), reveal: { han: s.han, roman: s.roman, zh: s.zh }, source: '自動出題',
  };
};

export const grammarQ = (g: MCQ & { id: string; topic: string }): Question => ({
  key: `grammar:${g.id}`, kind: 'grammar', prompt: g.q, options: g.options, answer: g.answer,
  explain: `【${g.topic}】${g.explain ?? ''}`, source: '非官方自編',
});

// ---------- cloze from articles ----------
const CLOZE_CLASSES: string[][] = [
  ['毋過', '所以', '因為', '雖然', '而且', '若無', '莫怪', '好佳哉', '無疑悟', '總是', '抑是', '毋但', '紲落來', '尤其是'],
  ['閣', '才', '嘛', '就', '攏', '猶', '煞', '都', '愈', '已經', '猶閣', '定定', '隨', '沓沓仔', '寬寬仔', '規氣'],
  ['佇', '共', '予', '對', '佮', '踮', '透', '照', '按', '和'],
  ['真', '誠', '足', '上', '較', '傷', '有夠', '上蓋'],
];

export function articleText(a: Article) {
  return a.paras.map((p) => p.map((s) => s.t).join('')).join('\n');
}

export function clozeFromArticle(a: Article, blanks = 4): { passage: string; items: Question[] } | null {
  const text = articleText(a);
  // choose a window of ~180 chars containing several function words
  const paras = text.split('\n').filter((p) => p.length > 60);
  if (!paras.length) return null;
  const para = pick(paras);
  const found: { w: string; idx: number; cls: number }[] = [];
  for (let ci = 0; ci < CLOZE_CLASSES.length; ci++) {
    for (const w of CLOZE_CLASSES[ci].sort((x, y) => y.length - x.length)) {
      let i = para.indexOf(w);
      while (i >= 0) {
        if (!found.some((f) => i < f.idx + f.w.length && f.idx < i + w.length)) found.push({ w, idx: i, cls: ci });
        i = para.indexOf(w, i + w.length);
      }
    }
  }
  if (found.length < 2) return null;
  const chosen = sample(found, Math.min(blanks, found.length)).sort((x, y) => x.idx - y.idx);
  let passage = '';
  let pos = 0;
  const items: Question[] = chosen.map((f, k) => {
    passage += para.slice(pos, f.idx) + ` (${k + 1}) `;
    pos = f.idx + f.w.length;
    const ds = sample(CLOZE_CLASSES[f.cls].filter((x) => x !== f.w), 3);
    return {
      key: `cloze:${a.id}:${f.idx}`, kind: 'cloze', prompt: `(${k + 1})`, ...mcq(f.w, ds),
      explain: `原文用「${f.w}」。（自動挖空：其他選項有時嘛通，請以文意判斷上適當的）`, source: '自動出題',
    };
  });
  passage += para.slice(pos);
  return { passage: `〈${a.title}〉\n${passage}`, items };
}

export function comprehensionSet(c: Content, a: Article): Question[] {
  const qs = c.questions.find((q) => q.articleId === a.id)?.questions ?? [];
  return qs.map((q, i) => ({
    key: `comp:${a.id}:${i}`, kind: 'comprehension', prompt: q.q, options: q.options, answer: q.answer,
    explain: q.explain, source: '非官方自編',
  }));
}

// ---------- tones ----------
export function toneQ(t: { id: string; han: string; roman: string; audio: string }): Question {
  const tone = toneOf(t.roman);
  const opts = [1, 2, 3, 4, 5, 7, 8].map((n) => TONE_NAMES[n]);
  return {
    key: `tone:${t.id}`, kind: 'tone', itemId: undefined, prompt: '聽音檔，這个字是第幾聲？', audio: t.audio,
    options: opts, answer: opts.indexOf(TONE_NAMES[tone]), reveal: { han: t.han, roman: t.roman }, source: '自動出題',
  };
}

export function sandhiQ(w: Word, quanzhou: boolean): Question | null {
  if (w.roman.includes('--') || w.han.includes('仔')) return null;
  const syls = splitSyllables(w.roman);
  if (syls.length < 2) return null;
  const first = applyTone(syls[0].base, syls[0].tone);
  const target = sandhiTone(first, quanzhou);
  const opts = [1, 2, 3, 4, 7, 8].map((n) => TONE_NAMES[n]);
  return {
    key: `sandhi:${w.id}`, kind: 'sandhi', prompt: `「${w.han}」(${w.roman}) 連讀的時，頭一字「${first}」（本調${TONE_NAMES[syls[0].tone]}）愛變做第幾聲？`,
    audio: w.audio, options: opts, answer: opts.indexOf(TONE_NAMES[target]),
    explain: '變調規則：1→7、2→1、3→2、5→7（偏泉 5→3）、7→3；入聲 4(-p,-t,-k)→8、4(-h)→2、8(-p,-t,-k)→4、8(-h)→3。', source: '自動出題',
  };
}

// ---------- mixed builders ----------
export function vocabMix(c: Content, words: Word[], n: number): Question[] {
  const out: Question[] = [];
  const pool = c.vocab;
  for (const w of shuffle(words)) {
    const gens = shuffle([
      () => meaningQ(w, pool),
      () => (w.audio ? listenHanQ(w, pool) : null),
      () => tailoChoiceQ(w),
      () => fillWordQ(w, pool),
    ]);
    for (const g of gens) {
      const q = g();
      if (q) { out.push(q); break; }
    }
    if (out.length >= n) break;
  }
  return out;
}
