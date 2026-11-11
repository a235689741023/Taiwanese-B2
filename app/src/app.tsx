import { useEffect, useState } from 'preact/hooks';
import { StoreCtx, useRoute, go, type Store } from './store';
import { loadContent, Index } from './lib/data';
import { loadSettings, saveSettings, type Settings } from './lib/db';
import type { Content } from './lib/types';
import { Today } from './screens/Today';
import { Learn } from './screens/Learn';
import { Review } from './screens/Review';
import { QuizHub } from './screens/QuizHub';
import { Records } from './screens/Records';

const TABS = [
  { path: '/today', label: '今日', icon: '◎' },
  { path: '/learn', label: '學習', icon: '✎' },
  { path: '/review', label: '複習', icon: '↻' },
  { path: '/quiz', label: '測驗', icon: '✓' },
  { path: '/records', label: '紀錄', icon: '▤' },
];

export function App() {
  const [c, setC] = useState<Content | null>(null);
  const [settings, setS] = useState<Settings | null>(null);
  const [version, setVersion] = useState(0);
  const [err, setErr] = useState('');
  const route = useRoute();

  useEffect(() => {
    Promise.all([loadContent(), loadSettings()])
      .then(([cc, ss]) => { setC(cc); setS(ss); })
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div class="page"><p class="error">載入失敗：{err}</p></div>;
  if (!c || !settings) return <div class="page center"><p class="muted">載入中…</p></div>;

  const store: Store = {
    c, idx: new Index(c), settings,
    setSettings: (s) => { setS(s); saveSettings(s); },
    version, bump: () => setVersion((v) => v + 1),
  };
  const top = '/' + (route.split('/')[1] || 'today');

  let screen;
  switch (top) {
    case '/learn': screen = <Learn route={route} />; break;
    case '/review': screen = <Review route={route} />; break;
    case '/quiz': screen = <QuizHub route={route} />; break;
    case '/records': screen = <Records route={route} />; break;
    default: screen = <Today route={route} />;
  }

  return (
    <StoreCtx.Provider value={store}>
      <main class="page">{screen}</main>
      <nav class="tabbar">
        {TABS.map((t) => (
          <button class={top === t.path ? 'tab active' : 'tab'} onClick={() => go(t.path)} aria-label={t.label}>
            <span class="tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </StoreCtx.Provider>
  );
}
