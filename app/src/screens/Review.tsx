import { useState } from 'preact/hooks';
import { useStore, useAsync, go } from '../store';
import { db } from '../lib/db';
import { poolCards } from '../lib/study';
import { CardSession } from '../components/CardSession';
import { QuizSession } from '../components/QuizSession';
import { Header, ListButton } from '../components/common';
import { meaningQ, listenHanQ, tailoChoiceQ, fillWordQ, listenSentenceQ, meaningSentenceQ, type Question, KIND_LABEL } from '../lib/quizgen';
import { shuffle } from '../lib/data';
import type { Content, CardItem } from '../lib/types';

const POOLS = {
  due: { title: '到期複習', desc: '依遺忘曲線排程，今日到期的卡片。' },
  unknown: { title: '不熟區', desc: '上次評「不熟」，抑是累計忘記 4 擺以上的頑固卡。' },
  again: { title: '再複習區', desc: '上次評「再複習」的卡片。' },
  wrong: { title: '錯題區', desc: '測驗答錯的題目；愛佇無仝工答對 2 擺才會離開。' },
} as const;
type PoolKey = keyof typeof POOLS;

/** One retrieval question per card, varied by type. */
export function questionsForCards(c: Content, cards: CardItem[]): Question[] {
  const out: Question[] = [];
  for (const card of cards) {
    if (card.kind === 'w') {
      const w = card.item;
      const gens = shuffle([() => meaningQ(w, c.vocab), () => (w.audio ? listenHanQ(w, c.vocab) : null), () => tailoChoiceQ(w), () => fillWordQ(w, c.vocab)]);
      for (const g of gens) { const q = g(); if (q) { out.push(q); break; } }
    } else {
      const s = card.item;
      out.push((s.audio && Math.random() < 0.6 ? listenSentenceQ(s, c.sentences) : null) ?? meaningSentenceQ(s, c.sentences));
    }
  }
  return out;
}

export function Review({ route }: { route: string }) {
  const { c, idx, version } = useStore();
  const [run, setRun] = useState<null | { mode: 'flash' | 'quiz'; ids?: string[]; qs?: Question[]; title: string }>(null);
  const parts = route.split('/').filter(Boolean);
  const pool = parts[1] as PoolKey | undefined;

  const counts = useAsync(async () => {
    const [d, u, a] = await Promise.all([poolCards('due'), poolCards('unknown'), poolCards('again')]);
    const w = await db.wrong.filter((x) => !x.resolved).count();
    return { due: d.length, unknown: u.length, again: a.length, wrong: w };
  }, [version, run], { due: 0, unknown: 0, again: 0, wrong: 0 });

  const wrongItems = useAsync(() => db.wrong.filter((x) => !x.resolved).toArray(), [version, run, pool], []);

  if (run?.mode === 'flash' && run.ids) return <CardSession ids={run.ids} title={run.title} onExit={() => setRun(null)} />;
  if (run?.mode === 'quiz' && run.qs) return <QuizSession title={run.title} section="複習" kind={run.title} questions={run.qs} onExit={() => setRun(null)} />;

  if (pool && POOLS[pool]) {
    const p = POOLS[pool];
    const startFlash = async (limit = 60) => {
      let ids: string[];
      if (pool === 'wrong') ids = Array.from(new Set(wrongItems.map((w) => w.itemId).filter((id) => id && idx.card(id))));
      else ids = (await poolCards(pool)).map((x) => x.id);
      setRun({ mode: 'flash', ids: ids.slice(0, limit), title: p.title });
    };
    const startQuiz = async (limit = 20) => {
      let qs: Question[];
      if (pool === 'wrong') {
        // dictation items are re-asked as fresh retrieval questions (their payload has no options)
        qs = shuffle(wrongItems).slice(0, limit).map((w) => {
          const p = w.payload as Question | undefined;
          if (p && p.options.length >= 2) return p;
          const card = w.itemId ? idx.card(w.itemId) : null;
          return card ? questionsForCards(c, [card])[0] : null;
        }).filter(Boolean) as Question[];
      } else {
        const cards = (await poolCards(pool)).slice(0, limit).map((x) => idx.card(x.id)).filter(Boolean) as CardItem[];
        qs = questionsForCards(c, cards);
      }
      setRun({ mode: 'quiz', qs, title: `${p.title}・測驗` });
    };
    const n = counts[pool];
    return (
      <div>
        <Header title={p.title} back="#/review" />
        <p class="muted small">{p.desc}</p>
        <div class="card stat"><b>{n}</b><span>{pool === 'wrong' ? '題' : '張'}</span></div>
        <div class="grid2">
          <button class="btn primary" disabled={!n} onClick={() => startFlash()}>閃卡模式</button>
          <button class="btn primary" disabled={!n} onClick={() => startQuiz()}>測驗模式</button>
        </div>
        <p class="hint">閃卡：家己評分。測驗：自動出題（詞義、聽音選字、臺羅辨識、選詞填空、聽句選義），答對當做「已熟記」、答錯當做「不熟」。一擺上濟 {pool === 'wrong' ? 20 : '60 張／20 題'}。</p>
        {pool === 'wrong' && wrongItems.length > 0 && (
          <>
            <h2>錯題清單</h2>
            {wrongItems.slice(0, 50).map((w) => {
              const q = w.payload as Question | undefined;
              return (
                <div class="card tight">
                  <div class="spread"><span class="pill">{KIND_LABEL[q?.kind ?? 'meaning'] ?? w.kind}</span><span class="small muted">錯 {w.wrong} 擺・已答對 {w.correctDays.length}/2 工</span></div>
                  <p class="small">{q?.prompt}</p>
                  {q && <p class="small"><b>{q.options[q.answer]}</b>{q.reveal && q.options.length < 2 ? `（${q.reveal.han}）` : ''}</p>}
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1>複習區</h1>
      {(Object.keys(POOLS) as PoolKey[]).map((k) => (
        <ListButton title={POOLS[k].title} sub={POOLS[k].desc} right={<b>{counts[k]}</b>} onClick={() => go(`/review/${k}`)} />
      ))}
      <p class="small muted">複習間隔：當次 10 分鐘 → 1 → 2 → 4 → 7 → 15 → 30 → 60 工（依艾賓浩斯遺忘曲線的擴展間隔概念設定；考試前一工以後袂閣排）。</p>
    </div>
  );
}
