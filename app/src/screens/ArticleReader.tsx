import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore, go } from '../store';
import { AudioButton, Header, RubyText } from '../components/common';
import { element, play, stop, onPlaying } from '../lib/audio';
import type { Article } from '../lib/types';
import { setKV, getKV } from '../lib/db';

export function ArticleReader({ article: a }: { article: Article }) {
  const { c } = useStore();
  const [showRt, setShowRt] = useState(true);
  const [hideText, setHideText] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);
  const loaded = useRef(false);
  const qs = c.questions.find((q) => q.articleId === a.id)?.questions.length ?? 0;

  useEffect(() => {
    const el = element();
    const upd = () => { setT(el.currentTime); setDur(el.duration || 0); };
    el.addEventListener('timeupdate', upd);
    const off = onPlaying((p) => setPlaying(p === a.audio));
    getKV<string[]>('articlesRead', []).then((r) => { if (!r.includes(a.id)) setKV('articlesRead', [...r, a.id]); });
    return () => { el.removeEventListener('timeupdate', upd); off(); stop(); };
  }, [a.id]);

  const toggle = () => {
    if (playing) stop();
    else {
      const el = element();
      if (loaded.current && !el.ended && el.currentTime > 0) { el.playbackRate = rate; el.play(); setPlaying(true); }
      else { loaded.current = true; play(a.audio, { rate }).catch(() => {}); }
    }
  };

  return (
    <div>
      <Header title={a.title} back="#/learn/a" />
      <p class="small muted">第 {a.book} 冊・{a.section}　作者：{a.author || '—'}</p>
      <div class="card stack">
        <div class="row">
          <button class={'icon-btn' + (playing ? ' playing' : '')} onClick={toggle} disabled={!a.audio}>{playing ? '■' : '▶'}</button>
          <input type="range" min={0} max={dur || 1} step={0.5} value={t} style={{ flex: 1 }}
            onInput={(e) => { element().currentTime = Number((e.target as HTMLInputElement).value); }} />
          <span class="small muted">{Math.floor(t / 60)}:{String(Math.floor(t % 60)).padStart(2, '0')}</span>
        </div>
        <div class="row wrap">
          {[0.8, 1, 1.2].map((r) => (
            <button class={'btn small' + (rate === r ? ' primary' : '')} onClick={() => { setRate(r); element().playbackRate = r; }}>{r}×</button>
          ))}
          <button class="btn small" onClick={() => setShowRt(!showRt)}>{showRt ? '藏臺羅注音' : '顯示臺羅注音'}</button>
          <button class="btn small" onClick={() => setHideText(!hideText)}>{hideText ? '顯示全文' : '聽力模式（藏全文）'}</button>
        </div>
      </div>
      {!hideText && (
        <div class={'card article' + (showRt ? '' : ' hide-rt')}>
          {a.paras.map((p) => <p><RubyText segs={p} /></p>)}
          {a.note && <p class="small muted" style={{ textIndent: 0 }}>{a.note}</p>}
        </div>
      )}
      {a.vocab.length > 0 && (
        <div class="card">
          <h3 style={{ marginTop: 0 }}>詞彙學習</h3>
          {a.vocab.map((v) => (
            <div class="spread" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
              <div><b>{v.han}</b> <span class="roman">{v.roman}</span><div class="small muted">{v.zh}</div></div>
              <AudioButton src={v.audio} />
            </div>
          ))}
        </div>
      )}
      {a.grammar && (
        <div class="card">
          <div class="spread"><h3 style={{ marginTop: 0 }}>文法學習</h3>{a.grammarAudio && <AudioButton src={a.grammarAudio} />}</div>
          <p class="small" style={{ lineHeight: 1.8 }}>{a.grammar}</p>
        </div>
      )}
      <p class="small muted">出處：{a.source}</p>
      <div class="row">
        <button class="btn primary" style={{ flex: 1 }} disabled={!qs} onClick={() => go(`/quiz/comprehension/${a.id}`)}>文章理解題（{qs}）</button>
        <button class="btn" style={{ flex: 1 }} onClick={() => go(`/quiz/listen-article/${a.id}`)}>聽解模式</button>
      </div>
      <button class="btn block" style={{ marginTop: '8px' }} onClick={() => go(`/quiz/speak/read/${a.id}`)}>朗讀這篇的一段（錄音）</button>
    </div>
  );
}
