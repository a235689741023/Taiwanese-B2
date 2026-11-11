import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { play, stop, onPlaying } from '../lib/audio';
import type { Seg } from '../lib/types';

export function AudioButton({ src, label, start, end, auto }: { src?: string | null; label?: string; start?: number; end?: number; auto?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState(false);
  useEffect(() => onPlaying((p) => setPlaying(p === src)), [src]);
  useEffect(() => {
    if (auto && src) play(src, { start, end }).catch(() => setErr(true));
  }, [src, auto]);
  if (!src) return <span class="pill warn small">無音檔</span>;
  return (
    <button
      class={'icon-btn' + (playing ? ' playing' : '')}
      aria-label={label ?? '播放'}
      title={err ? '無法播放（可能尚未下載離線音檔且目前離線）' : '播放'}
      onClick={(e) => {
        e.stopPropagation();
        if (playing) stop();
        else play(src, { start, end }).then(() => setErr(false)).catch(() => setErr(true));
      }}
    >
      {err ? '!' : playing ? '■' : '▶'}
    </button>
  );
}

export function Back({ to, label = '‹ 返回' }: { to: string; label?: string }) {
  return <button class="back" onClick={() => (location.hash = to)}>{label}</button>;
}

export function Header({ title, back, right }: { title: string; back?: string; right?: ComponentChildren }) {
  return (
    <div>
      {back && <Back to={back} />}
      <div class="spread"><h1>{title}</h1>{right}</div>
    </div>
  );
}

export function ListButton({ title, sub, right, onClick }: { title: ComponentChildren; sub?: ComponentChildren; right?: ComponentChildren; onClick: () => void }) {
  return (
    <button class="list-btn" onClick={onClick}>
      <span><span>{title}</span>{sub && <div class="sub">{sub}</div>}</span>
      <span class="muted">{right ?? '›'}</span>
    </button>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  return <div class="progress"><i style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} /></div>;
}

/** Article / passage text with Tâi-lô ruby annotations. */
export function RubyText({ segs }: { segs: Seg[] }) {
  return <>{segs.map((s) => (s.r ? <ruby>{s.t}<rt>{s.r}</rt></ruby> : s.t))}</>;
}

/** Countdown hook: returns remaining seconds; calls onDone at 0. */
export function useCountdown(seconds: number, running: boolean, onDone?: () => void, onTick?: (left: number) => void) {
  const [left, setLeft] = useState(seconds);
  const done = useRef(onDone);
  const tick = useRef(onTick);
  done.current = onDone;
  tick.current = onTick;
  useEffect(() => setLeft(seconds), [seconds]);
  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const start = left;
    const id = window.setInterval(() => {
      const l = Math.max(0, start - Math.floor((Date.now() - t0) / 1000));
      setLeft((prev) => {
        if (prev !== l) tick.current?.(l);
        return l;
      });
      if (l <= 0) {
        window.clearInterval(id);
        done.current?.();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [running, seconds]);
  return left;
}

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Elapsed-time stopwatch for exam sections. */
export function useStopwatch(running: boolean) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t0 = Date.now() - t * 1000;
    const id = window.setInterval(() => setT(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => window.clearInterval(id);
  }, [running]);
  return t;
}

export const NonOfficial = () => <span class="pill warn">非官方自編</span>;
