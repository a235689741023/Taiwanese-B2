import { useState } from 'preact/hooks';
import { useStore, useAsync, go } from '../store';
import { todayStats, daysUntil } from '../lib/study';
import { CardSession } from '../components/CardSession';
import { Progress } from '../components/common';
import { getKV } from '../lib/db';

const WEEKEND_TASKS = [
  { label: '文章閱讀＋理解題', path: '/quiz/comprehension' },
  { label: '口語表達（2 分鐘）', path: '/quiz/speak/speech' },
  { label: '文章寫作（150–200 字）', path: '/quiz/write/essay' },
  { label: '克漏字', path: '/quiz/cloze' },
];
const WEEKDAY_TASKS = [
  { label: '聽寫拼音 10 題', path: '/quiz/dict-tailo' },
  { label: '臺羅辨識＋詞義 10 題', path: '/quiz/vocab' },
  { label: '聲調辨識', path: '/quiz/tone' },
  { label: '聽句選義', path: '/quiz/listen-sentence' },
  { label: '語法專項', path: '/quiz/grammar' },
];

export function Today({ route }: { route: string }) {
  const { idx, settings, version } = useStore();
  const [session, setSession] = useState<string[] | null>(null);
  const st = useAsync(() => todayStats(idx, settings), [version, session], null);
  const lastBackup = useAsync(() => getKV<number>('lastBackup', 0), [version], 0);

  if (session) return <CardSession ids={session} title="今日學習" onExit={() => setSession(null)} />;
  if (route !== '/today' && route !== '/') go('/today');

  const left = daysUntil(settings.examDate);
  const dow = new Date().getDay();
  const weekend = dow === 0 || dow === 6;
  const tasks = weekend ? WEEKEND_TASKS : WEEKDAY_TASKS;
  const task = tasks[new Date().getDate() % tasks.length];
  const backupDue = Date.now() - lastBackup > 7 * 86400000;

  return (
    <div>
      <div class="spread">
        <h1>今日</h1>
        <span class="pill">{left > 0 ? `考試倒數 ${left} 工` : left === 0 ? '今仔日考試，加油！' : '考試已過'}</span>
      </div>
      {st?.phase && (
        <div class="card tight">
          <div class="spread"><b>{st.phase.name}</b><span class="small muted">{st.phase.start.slice(5)}–{st.phase.end.slice(5)}</span></div>
          <p class="small muted">{st.phase.focus}</p>
        </div>
      )}
      {!st ? <p class="muted">計算中…</p> : (
        <>
          <div class="card grid3">
            <div class="stat"><b>{st.due.length}</b><span>到期複習</span></div>
            <div class="stat"><b>{st.newIds.length}</b><span>今日新卡</span></div>
            <div class="stat"><b>{st.streak}</b><span>連續天數</span></div>
          </div>
          <button class="btn primary block" disabled={!st.due.length && !st.newIds.length}
            onClick={() => setSession([...st.due.map((c) => c.id), ...st.newIds])}>
            {st.due.length + st.newIds.length ? `開始今日學習（${st.due.length + st.newIds.length} 張）` : '今日卡片完成矣 ✓'}
          </button>
          <p class="hint">先複習到期的卡片，才學新卡。今日已評分 {st.reviewedToday} 次。</p>

          <h2>今日題型練習 {weekend ? '（週末）' : ''}</h2>
          <button class="list-btn" onClick={() => go(task.path)}><span>{task.label}</span><span class="muted">›</span></button>

          <h2>複習區</h2>
          <div class="grid3">
            <button class="card stat" onClick={() => go('/review/unknown')}><b>{st.unknown}</b><span>不熟區</span></button>
            <button class="card stat" onClick={() => go('/review/again')}><b>{st.again}</b><span>再複習區</span></button>
            <button class="card stat" onClick={() => go('/review/wrong')}><b>{st.wrong}</b><span>錯題區</span></button>
          </div>

          <h2>整體進度</h2>
          <div class="card">
            <div class="spread small"><span>已學卡片</span><span>{st.totalIntroduced} / {st.totalIntroduced + st.remainingNew}</span></div>
            <Progress value={st.totalIntroduced} max={st.totalIntroduced + st.remainingNew} />
            <p class="small muted" style={{ marginTop: '8px' }}>新卡會平均分配到 {settings.lastNewDay}；到期複習傷濟的時，系統會自動減少新卡。</p>
          </div>
          {backupDue && (
            <div class="notice" onClick={() => go('/records/settings')}>
              提醒：已經超過 7 工無備份學習紀錄。iPhone 有可能清除網頁資料，請到「紀錄 › 設定」匯出備份。
            </div>
          )}
        </>
      )}
    </div>
  );
}
