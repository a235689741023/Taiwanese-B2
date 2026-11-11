// Audio playback via a single HTMLAudioElement (not Web Audio, so the iOS silent switch doesn't mute it).
// Files are read from Cache Storage when downloaded for offline use and played through blob: URLs,
// which avoids iOS Safari's Range-request problems with service-worker responses.

const CACHE = 'taigi-audio';
const el = typeof Audio !== 'undefined' ? new Audio() : (null as unknown as HTMLAudioElement);
if (el) el.preload = 'auto';
let currentUrl: string | null = null;
let stopTimer: number | undefined;
const listeners = new Set<(playing: string | null) => void>();
let playingPath: string | null = null;

const setPlaying = (p: string | null) => {
  playingPath = p;
  listeners.forEach((f) => f(p));
};
if (el) {
  el.addEventListener('ended', () => setPlaying(null));
  el.addEventListener('pause', () => setPlaying(null));
}

export const onPlaying = (f: (p: string | null) => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
export const nowPlaying = () => playingPath;

export const audioUrl = (path: string) => new URL(`audio/${path}`, document.baseURI).toString();

async function blobFor(path: string): Promise<Blob> {
  const url = audioUrl(path);
  if ('caches' in window) {
    const c = await caches.open(CACHE);
    const hit = await c.match(url);
    if (hit) return hit.blob();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`音檔讀取失敗：${path}`);
    // cache on first play so it is available offline afterwards
    c.put(url, res.clone()).catch(() => {});
    return res.blob();
  }
  const res = await fetch(url);
  return res.blob();
}

export function stop() {
  if (!el) return;
  window.clearTimeout(stopTimer);
  el.pause();
}

/** Play an audio file; optionally a segment [start, end) in seconds. Resolves when playback ends. */
export async function play(path: string | null | undefined, opts: { start?: number; end?: number; rate?: number } = {}): Promise<void> {
  if (!path || !el) return;
  stop();
  const blob = await blobFor(path);
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(blob);
  el.src = currentUrl;
  el.playbackRate = opts.rate ?? 1;
  if (opts.start) {
    await new Promise<void>((r) => {
      el.addEventListener('loadedmetadata', () => r(), { once: true });
      el.load();
    });
    el.currentTime = opts.start;
  }
  setPlaying(path);
  await el.play();
  if (opts.end !== undefined) {
    const dur = (opts.end - (opts.start ?? 0)) / (opts.rate ?? 1);
    stopTimer = window.setTimeout(() => el.pause(), dur * 1000);
  }
  return new Promise((res) => {
    const done = () => { el.removeEventListener('ended', done); el.removeEventListener('pause', done); res(); };
    el.addEventListener('ended', done);
    el.addEventListener('pause', done);
  });
}

export const element = () => el;

// ---------- offline download ----------
export interface ManifestEntry { p: string; s: number }

export async function cachedCount(entries: ManifestEntry[]): Promise<{ n: number; bytes: number }> {
  if (!('caches' in window)) return { n: 0, bytes: 0 };
  const c = await caches.open(CACHE);
  const keys = new Set((await c.keys()).map((r) => new URL(r.url).pathname));
  let n = 0, bytes = 0;
  for (const e of entries) {
    if (keys.has(new URL(e.p, document.baseURI).pathname)) { n++; bytes += e.s; }
  }
  return { n, bytes };
}

export async function downloadAll(entries: ManifestEntry[], onProgress: (done: number, total: number) => void, signal?: AbortSignal) {
  const c = await caches.open(CACHE);
  const have = new Set((await c.keys()).map((r) => new URL(r.url).pathname));
  const todo = entries.filter((e) => !have.has(new URL(e.p, document.baseURI).pathname));
  let done = entries.length - todo.length;
  onProgress(done, entries.length);
  const worker = async () => {
    while (todo.length) {
      if (signal?.aborted) return;
      const e = todo.shift()!;
      const url = new URL(e.p, document.baseURI).toString();
      for (let i = 0; i < 3; i++) {
        try {
          const res = await fetch(url);
          if (res.ok) { await c.put(url, res); break; }
        } catch { /* retry */ }
      }
      done++;
      onProgress(done, entries.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

// ---------- short beeps ("tng") for speaking timers ----------
let ctx: AudioContext | null = null;
export function beep(times = 1) {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.2;
      o.connect(g).connect(ctx.destination);
      const t = ctx.currentTime + i * 0.35;
      o.start(t);
      o.stop(t + 0.18);
    }
  } catch { /* ignore */ }
  if (navigator.vibrate) navigator.vibrate(times === 1 ? 150 : [150, 100, 150]);
}
