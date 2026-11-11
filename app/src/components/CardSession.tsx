import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStore } from '../store';
import { db } from '../lib/db';
import { rateCard } from '../lib/study';
import { STAGE_DAYS, type Rating } from '../lib/scheduler';
import { play, stop } from '../lib/audio';
import { AudioButton, Progress } from './common';
import { ShadowRecorder } from './ShadowRecorder';
import type { CardItem } from '../lib/types';

interface Props {
  ids: string[];
  title: string;
  onExit: () => void;
}

const RELEARN_GAP = 5;

function intervalLabel(stage: number, rating: Rating): string {
  if (rating === 'unknown') return '10 分鐘';
  if (rating === 'known') {
    const next = stage < 0 ? 3 : Math.min(stage + 1, STAGE_DAYS.length - 1);
    return `${STAGE_DAYS[Math.max(1, next)]} 天`;
  }
  const st = Math.max(stage, 1);
  return `${Math.max(1, Math.floor(STAGE_DAYS[st] / 2))} 天`;
}

export function CardSession({ ids, title, onExit }: Props) {
  const { idx, settings, bump } = useStore();
  const [queue, setQueue] = useState<string[]>(ids);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stage, setStage] = useState(-1);
  const [counts, setCounts] = useState({ known: 0, again: 0, unknown: 0 });
  const relearn = useRef(new Map<string, number>());
  const shownAt = useRef(Date.now());

  const id = queue[pos];
  const card = useMemo(() => (id ? idx.card(id) : null), [id]);

  useEffect(() => {
    setFlipped(false);
    shownAt.current = Date.now();
    if (!id) return;
    db.cards.get(id).then((c) => setStage(c?.stage ?? -1));
  }, [id, pos]);

  const listenFirst = useMemo(() => {
    if (!card || !card.item.audio) return false;
    if (settings.frontMode === 'listen') return true;
    if (settings.frontMode === 'han') return false;
    return stage >= 2 && Math.random() < 0.5; // auto: mix in listen-first once the card is established
  }, [card, stage, settings.frontMode]);

  useEffect(() => {
    if (card && listenFirst && !flipped) play(card.item.audio).catch(() => {});
  }, [card, listenFirst]);

  useEffect(() => {
    if (flipped && card && settings.autoplay && !listenFirst) play(card.item.audio).catch(() => {});
  }, [flipped]);

  useEffect(() => () => stop(), []);

  if (!card) {
    const total = counts.known + counts.again + counts.unknown;
    return (
      <div>
        <h1>{title}：完成</h1>
        <div class="card grid3">
          <div class="stat"><b>{counts.known}</b><span>已熟記</span></div>
          <div class="stat"><b>{counts.again}</b><span>再複習</span></div>
          <div class="stat"><b>{counts.unknown}</b><span>不熟</span></div>
        </div>
        <p class="muted small">本輪共評分 {total} 次。「不熟」的卡片已排入 10 分鐘後再出現，並進入「不熟區」。</p>
        <button class="btn primary block" onClick={onExit}>返回</button>
      </div>
    );
  }

  const doRate = async (r: Rating) => {
    stop();
    await rateCard(card.item.id, card.kind, r, settings, Date.now() - shownAt.current);
    setCounts((c) => ({ ...c, [r]: c[r] + 1 }));
    if (r === 'unknown') {
      const n = relearn.current.get(card.item.id) ?? 0;
      if (n < 3) {
        relearn.current.set(card.item.id, n + 1);
        setQueue((q) => {
          const nq = [...q];
          nq.splice(Math.min(pos + 1 + RELEARN_GAP, nq.length), 0, card.item.id);
          return nq;
        });
      }
    }
    setPos((p) => p + 1);
    bump();
  };

  return (
    <div>
      <div class="spread">
        <button class="back" onClick={() => { stop(); onExit(); }}>‹ 結束</button>
        <span class="muted small">{pos + 1} / {queue.length}　{stage < 0 ? <span class="pill">新卡</span> : <span class="pill good">第 {stage} 階</span>}</span>
      </div>
      <Progress value={pos} max={queue.length} />
      <div class="card flash">
        {!flipped ? <Front card={card} listenFirst={listenFirst} /> : <BackFace card={card} />}
      </div>
      {!flipped ? (
        <>
          <button class="btn primary block" onClick={() => setFlipped(true)}>掀答案</button>
          <p class="hint">先家己唸看覓（抑是想看覓按怎寫），才掀答案對看覓。</p>
        </>
      ) : (
        <>
          <div class="rate">
            <button class="btn bad" onClick={() => doRate('unknown')}>不熟<small>{intervalLabel(stage, 'unknown')}</small></button>
            <button class="btn warn" onClick={() => doRate('again')}>再複習<small>{intervalLabel(stage, 'again')}</small></button>
            <button class="btn good" onClick={() => doRate('known')}>已熟記<small>{intervalLabel(stage, 'known')}</small></button>
          </div>
          <p class="hint">「已熟記」＝看有漢字、唸會出來，而且寫會出有聲調的臺羅。</p>
        </>
      )}
    </div>
  );
}

function Front({ card, listenFirst }: { card: CardItem; listenFirst: boolean }) {
  if (listenFirst) {
    return (
      <div class="face">
        <AudioButton src={card.item.audio} />
        <p class="muted">聽音檔：想看覓這是啥物{card.kind === 'w' ? '詞' : '句'}、漢字按怎寫、臺羅按怎拼？</p>
      </div>
    );
  }
  return (
    <div class="face">
      <div class={card.kind === 'w' ? 'han-big' : 'han-mid'}>{card.item.han}</div>
      <p class="muted small">{card.kind === 'w' ? '語詞' : `語句・${(card.item as { cat: string }).cat}`}</p>
    </div>
  );
}

function BackFace({ card }: { card: CardItem }) {
  if (card.kind === 's') {
    const s = card.item;
    return (
      <div class="face">
        <div class="han-mid">{s.han}</div>
        <div class="row"><span class="roman" style={{ fontSize: '1.1rem' }}>{s.roman}</span><AudioButton src={s.audio} /></div>
        <p>{s.zh}</p>
        {s.check && <span class="pill warn small">臺羅未能以辭典確認，依課本</span>}
        <ShadowRecorder />
      </div>
    );
  }
  const w = card.item;
  return (
    <div class="face">
      <div class="han-big">{w.han}</div>
      <div class="row"><span class="roman-big">{w.roman}</span><AudioButton src={w.audio} /></div>
      <div class="answer-block">
        <p><b>{w.zh}</b></p>
        {w.defs && w.defs.length > 0 && (
          <p class="small muted">{w.defs.map((d) => `${d.pos ? `〔${d.pos}〕` : ''}${d.df}`).join('；')}</p>
        )}
        {w.ex?.map((e) => (
          <div class="ex">
            <div class="row"><span>{e.han}</span><AudioButton src={e.audio} /></div>
            <div class="roman small">{e.roman}</div>
            <div class="small muted">{e.zh}</div>
          </div>
        ))}
        {w.ext.length > 0 && (
          <div class="ex small">
            <span class="muted">相關詞：</span>
            {w.ext.slice(0, 6).map((x) => (
              <span class="row wrap" style={{ display: 'inline-flex', marginRight: '10px' }}>
                {x.han}<span class="roman muted">({x.roman})</span>
              </span>
            ))}
          </div>
        )}
        {w.syn && <p class="small muted">近義：{w.syn.join('、')}</p>}
      </div>
    </div>
  );
}
