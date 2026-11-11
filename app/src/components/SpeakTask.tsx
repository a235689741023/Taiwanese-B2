import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useStore } from '../store';
import { db } from '../lib/db';
import { Recorder, playBlob, stopBlob } from '../lib/recorder';
import { beep, stop } from '../lib/audio';
import { useCountdown, fmt, AudioButton } from './common';

export interface SpeakSpec {
  kind: string; // 情境對話 / 看圖講話 / 文章朗讀 / 口語表達 / 跟讀
  promptId: string;
  title: string;
  prepSec: number;
  speakSec: number;
  warnAt: number; // seconds left when "tng" sounds
  warnBeeps: number;
  prompt: ComponentChildren;
  reference?: ComponentChildren;
  refAudio?: string | null;
  rubric: string[];
}

export const RUBRICS: Record<string, string[]> = {
  情境對話: ['有回應著情境的要求', '語氣合適、有禮貌', '用詞自然（毋是華語直翻）', '發音、聲調清楚'],
  看圖講話: ['四格攏有講著、順序正確', '有連接詞串起來（紲落來、毋過、所以…）', '詞彙豐富、描寫具體', '發音、聲調、變調自然'],
  文章朗讀: ['無漏字、無添字', '聲調佮變調正確', '輕聲（--）有處理', '斷句、速度合適，時間內唸了'],
  口語表達: ['有明確觀點', '有理由、例證', '有開頭佮結論，組織清楚', '詞彙、句型多樣，發音自然'],
  跟讀: ['音節完整', '聲調正確', '變調正確', '速度、節奏接近示範'],
};

/** Timed speaking task modelled on the 口語測驗 timing, with "tng" beeps, recording and self-assessment. */
export function SpeakTask({ spec, onExit }: { spec: SpeakSpec; onExit: () => void }) {
  const { bump } = useStore();
  const [phase, setPhase] = useState<'ready' | 'prep' | 'rec' | 'review'>('ready');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [self, setSelf] = useState<boolean[]>(spec.rubric.map(() => false));
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const rec = useRef<Recorder | null>(null);
  const meta = useRef<{ mime: string; durMs: number }>({ mime: '', durMs: 0 });

  const startRec = async () => {
    try {
      rec.current = new Recorder();
      await rec.current.start();
      setPhase('rec');
    } catch {
      setErr('無法使用麥克風。請佇 iPhone「設定 › Safari › 麥克風」允許，抑是先無錄音練習。');
      setPhase('rec');
    }
  };
  const stopRec = async () => {
    if (rec.current?.recording) {
      const r = await rec.current.stop();
      setBlob(r.blob);
      meta.current = { mime: r.mime, durMs: r.durMs };
    }
    beep(1);
    setPhase('review');
  };

  const prepLeft = useCountdown(spec.prepSec, phase === 'prep', () => { beep(1); startRec(); });
  const recLeft = useCountdown(spec.speakSec, phase === 'rec', stopRec, (l) => { if (l === spec.warnAt) beep(spec.warnBeeps); });

  useEffect(() => () => { stop(); stopBlob(); if (rec.current?.recording) rec.current.stop(); }, []);

  const save = async () => {
    if (!blob) return;
    await db.recs.add({
      ts: Date.now(), kind: spec.kind, promptId: spec.promptId, title: spec.title, blob,
      mime: meta.current.mime, durMs: meta.current.durMs, self: self.filter(Boolean).length,
    });
    setSaved(true);
    bump();
  };

  return (
    <div>
      <button class="back" onClick={onExit}>‹ 返回</button>
      <h1>{spec.kind}</h1>
      <p class="muted small">準備 {spec.prepSec} 秒、作答 {fmt(spec.speakSec)}；賰 {spec.warnAt} 秒的時會「tng」{spec.warnBeeps} 聲提醒。</p>
      <div class="card">{spec.prompt}</div>

      {phase === 'ready' && (
        <button class="btn primary block" onClick={() => (spec.prepSec > 0 ? setPhase('prep') : startRec())}>開始（{spec.prepSec > 0 ? '先準備' : '直接作答'}）</button>
      )}
      {phase === 'prep' && (
        <div class="card">
          <p class="center muted">準備時間</p>
          <div class="timer prep">{fmt(prepLeft)}</div>
          <button class="btn block" onClick={() => { beep(1); startRec(); }}>準備好矣，開始講</button>
        </div>
      )}
      {phase === 'rec' && (
        <div class="card">
          <p class="center"><span class="rec-dot" />{err ? '計時中（無錄音）' : '錄音中…'}</p>
          <div class="timer rec">{fmt(recLeft)}</div>
          {err && <p class="small error">{err}</p>}
          <button class="btn bad block" onClick={stopRec}>講煞矣，停止</button>
        </div>
      )}
      {phase === 'review' && (
        <div class="stack">
          {blob && (
            <div class="row">
              <button class="btn" onClick={() => playBlob(blob)}>▶ 聽家己的錄音</button>
              <button class="btn ghost" onClick={stopBlob}>■</button>
            </div>
          )}
          {spec.reference && (
            <details class="card" open>
              <summary><b>參考答案</b> {spec.refAudio && <AudioButton src={spec.refAudio} />}</summary>
              <div style={{ lineHeight: 1.9 }}>{spec.reference}</div>
            </details>
          )}
          <div class="card">
            <b>自我評分（勾選有做著的項目）</b>
            {spec.rubric.map((r, k) => (
              <label class="row" style={{ margin: '8px 0' }}>
                <input type="checkbox" checked={self[k]} onChange={() => setSelf(self.map((x, j) => (j === k ? !x : x)))} />
                <span>{r}</span>
              </label>
            ))}
            <p class="small muted">單機版無法自動評分口說；請對照參考答案、聽錄音自評。錄音只存佇這支手機。</p>
          </div>
          <div class="row">
            <button class="btn" onClick={() => { setBlob(null); setSaved(false); setPhase('ready'); }}>重來一擺</button>
            <button class="btn primary" style={{ flex: 1 }} disabled={!blob || saved} onClick={save}>{saved ? '已保存' : '保存錄音佮自評'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
