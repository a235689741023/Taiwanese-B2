import { useState, useRef, useEffect } from 'preact/hooks';
import { Recorder, playBlob, stopBlob } from '../lib/recorder';

/** Inline "跟讀" recorder: record yourself and play it back right after the model audio. */
export function ShadowRecorder({ onSaved }: { onSaved?: (b: Blob, mime: string, durMs: number) => void }) {
  const rec = useRef<Recorder | null>(null);
  const [state, setState] = useState<'idle' | 'rec' | 'done'>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => () => { stopBlob(); }, []);
  if (!Recorder.supported()) return null;
  return (
    <div class="row" style={{ marginTop: '6px' }}>
      {state !== 'rec' ? (
        <button class="btn small" onClick={async (e) => {
          e.stopPropagation();
          try {
            rec.current = new Recorder();
            await rec.current.start();
            setState('rec');
            setErr('');
          } catch {
            setErr('無法使用麥克風，請到設定允許。');
          }
        }}>● 跟讀錄音</button>
      ) : (
        <button class="btn small bad" onClick={async (e) => {
          e.stopPropagation();
          const r = await rec.current!.stop();
          setBlob(r.blob);
          setState('done');
          onSaved?.(r.blob, r.mime, r.durMs);
          playBlob(r.blob);
        }}><span class="rec-dot" />停止</button>
      )}
      {blob && state === 'done' && <button class="btn small" onClick={(e) => { e.stopPropagation(); playBlob(blob); }}>▶ 聽家己</button>}
      {err && <span class="small error">{err}</span>}
    </div>
  );
}
