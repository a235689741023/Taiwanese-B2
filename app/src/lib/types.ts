export interface Example { han: string; roman: string; zh: string; audio?: string | null }
export interface ExtWord { han: string; roman: string; audio?: string | null; zh?: string | null }

export interface Word {
  id: string; book: number; num: number; han: string; roman: string; zh: string;
  check?: string; dictId?: string; defs?: { pos: string; df: string }[]; ex?: Example[];
  audio?: string | null; audioTb?: string | null; syn?: string[]; ext: ExtWord[];
}

export interface Sentence {
  id: string; book: number; cat: string; num: number; han: string; roman: string; zh: string;
  audio?: string | null; check?: string;
}

export interface Seg { t: string; r?: string }
export interface Article {
  id: string; book: number; section: string; title: string; author: string;
  paras: Seg[][]; vocab: { han: string; roman: string; zh: string; audio?: string | null }[];
  grammar: string; grammarAudio?: string; note: string; source: string; audio?: string | null;
}

export interface MCQ {
  type?: string; q: string; options: string[]; answer: number; explain?: string;
}
export interface ArticleQuestions { articleId: string; questions: MCQ[] }

export interface Prompts {
  situational: { id: string; prompt: string; ref: string; tips?: string }[];
  picture: { id: string; panels: string[]; ref: string }[];
  speech: { id: string; prompt: string; outline: string[]; ref: string }[];
  sentence: { id: string; words: { han: string; roman: string }[]; ref: string }[];
  feedback: { id: string; prompt: string; ref: string }[];
  essay: { id: string; title: string; prompt: string; ref: string }[];
  grammar: (MCQ & { id: string; topic: string })[];
}

export interface ToneItem { id: string; han: string; roman: string; audio: string }

export interface ExamSample {
  reading: { vocab: MCQ[]; cloze: { passage: string; items: MCQ[] }[]; comprehension: { passage: string; items: MCQ[] }[] };
  listening: { audio: string; dialogue: MCQ[]; speech: MCQ[]; note: string };
  speaking: { audio: string; parts: { title: string; timing: string; prompt: string; ref: string; prepSec: number; speakSec: number }[] };
  writing: { audio: string; dictation: { tailo: string[]; han: string[] }; parts: { title: string; prompt: string; ref: string }[] };
}

export interface Content {
  vocab: Word[];
  sentences: Sentence[];
  articles: Article[];
  tones: ToneItem[];
  questions: ArticleQuestions[];
  prompts: Prompts;
  exam: ExamSample;
}

/** A learnable card: word or sentence. */
export type CardItem = { kind: 'w'; item: Word } | { kind: 's'; item: Sentence };
