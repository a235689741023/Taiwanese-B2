import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { Content } from './lib/types';
import type { Index } from './lib/data';
import type { Settings } from './lib/db';

export interface Store {
  c: Content;
  idx: Index;
  settings: Settings;
  setSettings: (s: Settings) => void;
  version: number; // bumped after DB writes so screens re-query
  bump: () => void;
}

export const StoreCtx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(StoreCtx);

// ---------- hash router ----------
export function useRoute(): string {
  const [r, setR] = useState(location.hash.slice(1) || '/today');
  useEffect(() => {
    const f = () => setR(location.hash.slice(1) || '/today');
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

export const go = (path: string) => {
  location.hash = path;
  window.scrollTo(0, 0);
};

/** Async query hook that re-runs when deps change. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], init: T): T {
  const [v, setV] = useState<T>(init);
  useEffect(() => {
    let alive = true;
    fn().then((x) => alive && setV(x));
    return () => { alive = false; };
  }, deps);
  return v;
}
