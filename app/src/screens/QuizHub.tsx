import { useMemo, useState } from 'preact/hooks';
import { useStore, useAsync, go } from '../store';
import { db } from '../lib/db';
import { QuizSession } from '../components/QuizSession';
import { Dictation } from '../components/Dictation';
import { SpeakTask, RUBRICS, type SpeakSpec } from '../components/SpeakTask';
import { WriteTask, WRITE_RUBRICS } from '../components/WriteTask';
import { Header, ListButton, NonOfficial, AudioButton } from '../components/common';
import { shuffle, sample, pick } from '../lib/data';
import {
  vocabMix, grammarQ, clozeFromArticle, comprehensionSet, toneQ, sandhiQ, tailoChoiceQ, listenSentenceQ,
  listenHanQ, articleText, type Question,
} from '../lib/quizgen';
import type { Content, MCQ, Word } from '../lib/types';
import { MockOfficial } from './MockOfficial';

const N = 10;

function useWordPool(): Word[] {
  const { c, version } = useStore();
  const ids = useAsync(async () => (await db.cards.where('deck').equals('w').primaryKeys()) as string[], [version], [] as string[]);
  return useMemo(() => {
    const set = new Set(ids);
    const learned = c.vocab.filter((w) => set.has(w.id));
    return learned.length >= 20 ? learned : c.vocab.filter((w) => w.book === 1).slice(0, Math.max(60, learned.length));
  }, [ids, c]);
}

const officialQ = (m: MCQ, key: string, passage?: string, audio?: string): Question => ({
  key, kind: 'official', prompt: m.q, options: m.options, answer: m.answer, passage, audio, source: '官方範例',
});

export function buildMockReading(c: Content, words: Word[]): Question[] {
  const vocab = vocabMix(c, words, 12);
  const gram = sample(c.prompts.grammar, 8).map(grammarQ);
  const cloze: Question[] = [];
  for (const a of shuffle(c.articles)) {
    const set = clozeFromArticle(a, 4);
    if (set) cloze.push(...set.items.map((q) => ({ ...q, passage: set.passage })));
    if (cloze.length >= 8) break;
  }
  const comp: Question[] = [];
  for (const a of shuffle(c.articles.filter((x) => c.questions.some((q) => q.articleId === x.id)))) {
    const text = `〈${a.title}〉\n${articleText(a)}`;
    comp.push(...comprehensionSet(c, a).slice(0, 4).map((q) => ({ ...q, passage: text })));
    if (comp.length >= 12) break;
  }
  return [...shuffle([...vocab, ...gram]).slice(0, 20), ...cloze.slice(0, 8), ...comp.slice(0, 12)];
}

export function QuizHub({ route }: { route: string }) {
  const { c, settings } = useStore();
  const words = useWordPool();
  const parts = route.split('/').filter(Boolean);
  const [seed, setSeed] = useState(0);
  const back = () => { go('/quiz'); setSeed((s) => s + 1); };
  const kind = parts[1];

  const questions = useMemo((): { title: string; section: string; qs: Question[]; exam?: boolean; limit?: number; intro?: preact.ComponentChildren } | null => {
    switch (kind) {
      case 'vocab': return { title: '語詞語法（自動）', section: '閱讀', qs: vocabMix(c, words, N) };
      case 'tailo': return { title: '臺羅辨識', section: '閱讀', qs: sample(words, 30).map(tailoChoiceQ).filter(Boolean).slice(0, N) as Question[] };
      case 'grammar': return { title: '語法專項', section: '閱讀', qs: sample(c.prompts.grammar, N).map(grammarQ) };
      case 'cloze': {
        const qs: Question[] = [];
        for (const a of shuffle(c.articles)) {
          const set = clozeFromArticle(a, 4);
          if (set) qs.push(...set.items.map((q) => ({ ...q, passage: set.passage })));
          if (qs.length >= 8) break;
        }
        return { title: '克漏字', section: '閱讀', qs };
      }
      case 'comprehension': {
        const a = parts[2] ? c.articles.find((x) => x.id === parts[2]) : pick(c.articles.filter((x) => c.questions.some((q) => q.articleId === x.id)));
        if (!a) return null;
        const text = `〈${a.title}〉\n${articleText(a)}`;
        return { title: `文章理解・${a.title}`, section: '閱讀', qs: comprehensionSet(c, a).map((q) => ({ ...q, passage: text })) };
      }
      case 'listen-article': {
        const a = parts[2] ? c.articles.find((x) => x.id === parts[2]) : pick(c.articles.filter((x) => x.audio && c.questions.some((q) => q.articleId === x.id)));
        if (!a) return null;
        const qs = comprehensionSet(c, a).map((q) => ({ ...q, key: q.key.replace('comp:', 'listen:') }));
        return {
          title: `演說聽解・${a.title}`, section: '聽力', qs,
          intro: (
            <div class="card stack">
              <p>先聽全文（像考試的「演說理解」，毋看文字），才回答問題。聽了會使閣聽一擺，但考試干焦播一擺。</p>
              <div class="row"><AudioButton src={a.audio} /><span class="muted small">全文朗讀（約 3–5 分鐘）</span></div>
              <NonOfficial />
            </div>
          ),
        };
      }
      case 'listen-sentence': {
        const pool = c.sentences.filter((s) => s.audio);
        return { title: '聽句選義', section: '聽力', qs: sample(pool, 20).map((s) => listenSentenceQ(s, c.sentences)).filter(Boolean).slice(0, N) as Question[] };
      }
      case 'listen-word': return { title: '聽詞選字', section: '聽力', qs: sample(words.filter((w) => w.audio), N).map((w) => listenHanQ(w, c.vocab)) };
      case 'tone': return { title: '聲調辨識', section: '臺羅', qs: sample(c.tones, N).map(toneQ) };
      case 'sandhi': return { title: '變調判斷', section: '臺羅', qs: sample(c.vocab, 60).map((w) => sandhiQ(w, settings.quanzhou)).filter(Boolean).slice(0, N) as Question[] };
      case 'mock': {
        if (parts[2] !== 'reading') return null;
        return {
          title: '閱讀模擬考', section: '模擬考', qs: buildMockReading(c, words), exam: true, limit: 50 * 60,
          intro: (
            <div class="card">
              <p>仿 B 卷閱讀測驗：語詞語法 20 題、克漏字 8 題、文章理解 12 題，總共 40 題、50 分鐘，交卷才看答案。</p>
              <p class="small muted">題目由詞庫自動出題、AI 自編語法題佮文章理解題組成（非官方），難度僅供參考。</p>
            </div>
          ),
        };
      }
      default: return null;
    }
  }, [kind, parts[2], seed, words.length]);

  // ---------- dictation ----------
  if (kind === 'dict-tailo' || kind === 'dict-han') {
    const pool = sample(words.filter((w) => w.audio), N);
    return <Dictation key={seed} words={pool} mode={kind === 'dict-tailo' ? 'tailo' : 'han'} onExit={back} />;
  }
  // ---------- writing ----------
  if (kind === 'write') return <WriteHub sub={parts[2]} id={parts[3]} onExit={back} />;
  // ---------- speaking ----------
  if (kind === 'speak') return <SpeakHub sub={parts[2]} id={parts[3]} onExit={back} />;
  // ---------- official sample ----------
  if (kind === 'official') return <MockOfficial part={parts[2]} onExit={back} />;

  if (questions) {
    return (
      <QuizSession key={`${kind}-${seed}`} title={questions.title} section={questions.section} kind={kind}
        questions={questions.qs} onExit={back} examMode={questions.exam} timeLimitSec={questions.limit} intro={questions.intro} />
    );
  }

  return (
    <div>
      <h1>測驗區</h1>
      <p class="small muted">依 B 卷四科題型分類。自動出題會優先用你已經學過的語詞。標「非官方自編」的題目由 AI 依課文編寫，僅供練習。</p>
      <h2>閱讀（120 分）</h2>
      <ListButton title="語詞語法（自動出題）" sub="詞義、聽音選字、臺羅辨識、選詞填空" onClick={() => go('/quiz/vocab')} />
      <ListButton title={<>語法專項 <NonOfficial /></>} sub={`虛詞、比較句、重疊、熟語…（${c.prompts.grammar.length} 題）`} onClick={() => go('/quiz/grammar')} />
      <ListButton title="克漏字" sub="由課文自動挖空虛詞、副詞、連詞" onClick={() => go('/quiz/cloze')} />
      <ListButton title={<>文章理解 <NonOfficial /></>} sub="隨機一篇課文＋4 題；嘛會使佇學習區揀篇" onClick={() => go('/quiz/comprehension')} />
      <h2>聽力（90 分）</h2>
      <ListButton title="聽句選義" sub="課本語句真人音檔" onClick={() => go('/quiz/listen-sentence')} />
      <ListButton title="聽詞選字" onClick={() => go('/quiz/listen-word')} />
      <ListButton title={<>演說聽解 <NonOfficial /></>} sub="聽課文全文朗讀，才回答" onClick={() => go('/quiz/listen-article')} />
      <h2>書寫（60 分）</h2>
      <ListButton title="聽寫拼音" sub="輸入臺羅（支援數字調），逐音節比對" onClick={() => go('/quiz/dict-tailo')} />
      <ListButton title="聽寫漢字" sub="字塊組字抑是輸入法" onClick={() => go('/quiz/dict-han')} />
      <ListButton title={<>語句書寫 <NonOfficial /></>} sub="指定語詞造句、短文（25–40 字）" onClick={() => go('/quiz/write/sentence')} />
      <ListButton title={<>文章寫作 <NonOfficial /></>} sub="150–200 字，計時計字" onClick={() => go('/quiz/write/essay')} />
      <h2>口語（90 分）</h2>
      <ListButton title="跟讀（語句）" sub="聽示範 → 錄音 → 對比" onClick={() => go('/quiz/speak/shadow')} />
      <ListButton title={<>情境對話 <NonOfficial /></>} sub="30 秒" onClick={() => go('/quiz/speak/situational')} />
      <ListButton title={<>看圖講話 <NonOfficial /></>} sub="準備 30 秒、講 1 分鐘（文字描述四格）" onClick={() => go('/quiz/speak/picture')} />
      <ListButton title="文章朗讀" sub="準備 30 秒、朗讀 1 分 30 秒（課文段落＋示範音檔）" onClick={() => go('/quiz/speak/read')} />
      <ListButton title={<>口語表達 <NonOfficial /></>} sub="準備 1 分鐘、講 2 分鐘" onClick={() => go('/quiz/speak/speech')} />
      <h2>臺羅與變調</h2>
      <ListButton title="聲調辨識" onClick={() => go('/quiz/tone')} />
      <ListButton title="變調判斷" onClick={() => go('/quiz/sandhi')} />
      <ListButton title="臺羅辨識" onClick={() => go('/quiz/tailo')} />
      <h2>模擬考</h2>
      <ListButton title="官方範例卷（B 卷）" sub="閱讀、聽力（含音檔）、書寫、口語；附參考答案" onClick={() => go('/quiz/official')} />
      <ListButton title="閱讀模擬考（40 題・50 分鐘）" sub="自動組卷，交卷才對答案" onClick={() => go('/quiz/mock/reading')} />
    </div>
  );
}

// ---------------- writing hub ----------------
function WriteHub({ sub, id, onExit }: { sub?: string; id?: string; onExit: () => void }) {
  const { c } = useStore();
  const P = c.prompts;
  if (sub === 'sentence') {
    const items = [...P.sentence.map((s) => ({ t: 's' as const, s })), ...P.feedback.map((f) => ({ t: 'f' as const, f }))];
    if (!items.length) return <Empty onExit={onExit} />;
    const it = id ? items.find((x) => (x.t === 's' ? x.s.id : x.f.id) === id) ?? pick(items) : pick(items);
    if (it.t === 's') {
      return <WriteTask spec={{
        kind: '語句書寫', promptId: it.s.id, title: it.s.words.map((w) => w.han).join('、'),
        prompt: <><p>請用下面的語詞寫一段話（大約 2、3 句），會使加添語詞，毋過一定愛有遮的語詞：</p><p><b>{it.s.words.map((w) => `${w.han}(${w.roman})`).join('、')}</b></p><NonOfficial /></>,
        ref: it.s.ref, required: it.s.words.map((w) => w.han), rubric: WRITE_RUBRICS['語句書寫'],
      }} onExit={onExit} />;
    }
    return <WriteTask spec={{
      kind: '短文', promptId: it.f.id, title: it.f.prompt.slice(0, 20), prompt: <><p>{it.f.prompt}</p><NonOfficial /></>,
      ref: it.f.ref, minChars: 25, maxChars: 40, rubric: WRITE_RUBRICS['短文'],
    }} onExit={onExit} />;
  }
  const es = id ? P.essay.find((e) => e.id === id) : pick(P.essay);
  if (!es) return <Empty onExit={onExit} />;
  return <WriteTask spec={{
    kind: '文章寫作', promptId: es.id, title: es.title,
    prompt: <><p><b>題目：{es.title}</b></p><p>{es.prompt}</p><NonOfficial /></>,
    ref: es.ref, minChars: 150, maxChars: 200, timeSec: 25 * 60, rubric: WRITE_RUBRICS['文章寫作'],
  }} onExit={onExit} />;
}

// ---------------- speaking hub ----------------
function SpeakHub({ sub, id, onExit }: { sub?: string; id?: string; onExit: () => void }) {
  const { c } = useStore();
  const P = c.prompts;
  let spec: SpeakSpec | null = null;
  if (sub === 'shadow') {
    const s = id ? c.sentences.find((x) => x.id === id) : pick(c.sentences.filter((x) => x.audio));
    if (s) spec = {
      kind: '跟讀', promptId: s.id, title: s.han, prepSec: 5, speakSec: Math.max(10, Math.round(s.han.length * 0.6) + 6), warnAt: 5, warnBeeps: 1,
      prompt: <><p class="han-mid">{s.han}</p><p class="roman">{s.roman}</p><p class="small muted">{s.zh}</p><div class="row"><AudioButton src={s.audio} /><span class="small muted">先聽示範，才錄音</span></div></>,
      refAudio: s.audio, reference: <span class="roman">{s.roman}</span>, rubric: RUBRICS['跟讀'],
    };
  } else if (sub === 'situational') {
    const it = id ? P.situational.find((x) => x.id === id) : pick(P.situational);
    if (it) spec = {
      kind: '情境對話', promptId: it.id, title: it.prompt.slice(0, 20), prepSec: 0, speakSec: 30, warnAt: 10, warnBeeps: 1,
      prompt: <><p>{it.prompt}</p><NonOfficial /></>, reference: <>{it.ref}{it.tips && <p class="small muted">提示：{it.tips}</p>}</>, rubric: RUBRICS['情境對話'],
    };
  } else if (sub === 'picture') {
    const it = id ? P.picture.find((x) => x.id === id) : pick(P.picture);
    if (it) spec = {
      kind: '看圖講話', promptId: it.id, title: it.panels[0]?.slice(0, 20) ?? '', prepSec: 30, speakSec: 60, warnAt: 10, warnBeeps: 1,
      prompt: <><p>請照順序共四格的情境組成完整的描述（四格攏愛講著）：</p>{it.panels.map((p) => <p class="small">{p}</p>)}<NonOfficial /><p class="small muted">考試是看圖片；遮用文字描述代替。</p></>,
      reference: it.ref, rubric: RUBRICS['看圖講話'],
    };
  } else if (sub === 'read') {
    const a = id ? c.articles.find((x) => x.id === id) : pick(c.articles.filter((x) => x.audio));
    if (a) {
      const paras = a.paras.map((p) => p.map((s) => s.t).join(''));
      let text = '';
      for (const p of paras) { if (text.length > 160) break; text += (text ? '\n' : '') + p; }
      spec = {
        kind: '文章朗讀', promptId: a.id, title: a.title, prepSec: 30, speakSec: 90, warnAt: 20, warnBeeps: 2,
        prompt: <><p class="small muted">〈{a.title}〉（節錄）</p><div class="passage">{text}</div></>,
        refAudio: a.audio, reference: <p class="small muted">參考：上面▶是全文示範朗讀（對頭開始），請對照你唸的段落。</p>, rubric: RUBRICS['文章朗讀'],
      };
    }
  } else if (sub === 'speech') {
    const it = id ? P.speech.find((x) => x.id === id) : pick(P.speech);
    if (it) spec = {
      kind: '口語表達', promptId: it.id, title: it.prompt.slice(0, 20), prepSec: 60, speakSec: 120, warnAt: 20, warnBeeps: 2,
      prompt: <><p>{it.prompt}</p><details><summary class="small muted">想無路的時，看要點提示</summary><ul class="small">{it.outline.map((o) => <li>{o}</li>)}</ul></details><NonOfficial /></>,
      reference: it.ref, rubric: RUBRICS['口語表達'],
    };
  }
  if (!spec) return <Empty onExit={onExit} />;
  return <SpeakTask key={spec.promptId} spec={spec} onExit={onExit} />;
}

function Empty({ onExit }: { onExit: () => void }) {
  return (
    <div>
      <Header title="尚無題目" />
      <p class="muted">這類題目的題庫猶未準備好。</p>
      <button class="btn" onClick={onExit}>返回</button>
    </div>
  );
}
