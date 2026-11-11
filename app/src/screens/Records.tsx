import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore, useAsync, go } from '../store';
import { db, exportBackup, importBackup, setKV, type Settings } from '../lib/db';
import { loadManifest } from '../lib/data';
import { cachedCount, downloadAll } from '../lib/audio';
import { playBlob } from '../lib/recorder';
import { Header, ListButton, Progress } from '../components/common';
import { STAGE_DAYS, dayKey } from '../lib/scheduler';

export function Records({ route }: { route: string }) {
  const sub = route.split('/')[2];
  if (sub === 'settings') return <SettingsPage />;
  if (sub === 'recs') return <RecordingsPage />;
  if (sub === 'writings') return <WritingsPage />;
  if (sub === 'offline') return <OfflinePage />;
  if (sub === 'about') return <AboutPage />;
  return <StatsPage />;
}

function StatsPage() {
  const { version, c } = useStore();
  const data = useAsync(async () => {
    const cards = await db.cards.toArray();
    const since = Date.now() - 14 * 86400000;
    const logs = await db.log.where('ts').above(since).toArray();
    // retention: among reviews of cards that had already reached stage >= 1 (excludes first exposure and same-day relearning),
    // the share rated 已熟記 or answered correctly
    const reviews = logs.filter((l) => (l.prevStage ?? -1) >= 1);
    const known = reviews.filter((l) => l.rating === 'known' || l.rating === 'quiz-ok').length;
    const quizzes = await db.quizzes.toArray();
    const byKind = new Map<string, { t: number; c: number }>();
    for (const q of quizzes) {
      const k = `${q.section}・${q.kind}`;
      const v = byKind.get(k) ?? { t: 0, c: 0 };
      v.t += q.total; v.c += q.correct;
      byKind.set(k, v);
    }
    const perDay = new Map<string, number>();
    for (const l of logs) perDay.set(dayKey(l.ts), (perDay.get(dayKey(l.ts)) ?? 0) + 1);
    const minutes = Math.round(logs.reduce((s, l) => s + Math.min(l.ms, 120000), 0) / 60000);
    return {
      stages: STAGE_DAYS.map((_, i) => cards.filter((x) => x.stage === i).length),
      total: cards.length,
      words: cards.filter((x) => x.deck === 'w').length,
      sents: cards.filter((x) => x.deck === 's').length,
      retention: reviews.length ? Math.round((known / reviews.length) * 100) : null,
      reviews14: reviews.length, minutes,
      byKind: [...byKind.entries()],
      perDay: [...perDay.entries()].sort(),
      recs: await db.recs.count(), writings: await db.writings.count(),
    };
  }, [version], null);

  if (!data) return <p class="muted">載入中…</p>;
  const maxDay = Math.max(1, ...data.perDay.map(([, n]) => n));
  return (
    <div>
      <h1>紀錄</h1>
      <div class="card grid3">
        <div class="stat"><b>{data.words}</b><span>已學語詞 / {c.vocab.length}</span></div>
        <div class="stat"><b>{data.sents}</b><span>已學語句 / {c.sentences.length}</span></div>
        <div class="stat"><b>{data.retention ?? '—'}{data.retention !== null ? '%' : ''}</b><span>近 14 工記得率</span></div>
      </div>
      <div class="card">
        <b>卡片階段分布</b>
        <p class="small muted">階段越懸＝間隔越長、記了越穩。</p>
        {data.stages.map((n, i) => (
          <div class="row small" style={{ margin: '4px 0' }}>
            <span style={{ width: '6.5em' }}>第 {i} 階（{i === 0 ? '10分' : `${STAGE_DAYS[i]}工`}）</span>
            <div style={{ flex: 1 }}><Progress value={n} max={Math.max(1, data.total)} /></div>
            <span style={{ width: '3em', textAlign: 'right' }}>{n}</span>
          </div>
        ))}
      </div>
      <div class="card">
        <b>近 14 工學習量</b>
        <p class="small muted">評分／作答 {data.perDay.reduce((a, [, n]) => a + n, 0)} 次（其中複習 {data.reviews14} 次），閃卡思考時間約 {data.minutes} 分鐘（未含聽文章、寫作、口說）。</p>
        <div class="row" style={{ alignItems: 'flex-end', height: '80px', gap: '3px' }}>
          {data.perDay.map(([d, n]) => (
            <div title={`${d}: ${n}`} style={{ flex: 1, height: `${(n / maxDay) * 100}%`, background: 'var(--brand)', borderRadius: '3px 3px 0 0', minHeight: '2px' }} />
          ))}
        </div>
      </div>
      {data.byKind.length > 0 && (
        <div class="card">
          <b>各題型正確率</b>
          <table class="simple">
            {data.byKind.map(([k, v]) => <tr><td>{k}</td><td>{v.c}/{v.t}</td><td>{Math.round((v.c / v.t) * 100)}%</td></tr>)}
          </table>
          <p class="small muted">自編與自動出題的難度未經校準，正確率毋等於考試分數。</p>
        </div>
      )}
      <ListButton title="錄音作品" sub={`${data.recs} 筆`} onClick={() => go('/records/recs')} />
      <ListButton title="寫作紀錄" sub={`${data.writings} 筆`} onClick={() => go('/records/writings')} />
      <ListButton title="離線音檔" sub="下載音檔，無網路嘛會使聽" onClick={() => go('/records/offline')} />
      <ListButton title="設定與備份" onClick={() => go('/records/settings')} />
      <ListButton title="資料來源與授權" onClick={() => go('/records/about')} />
    </div>
  );
}

function SettingsPage() {
  const { settings, setSettings, bump } = useStore();
  const [s, setS] = useState<Settings>(settings);
  const [msg, setMsg] = useState('');
  const [withRecs, setWithRecs] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const upd = <K extends keyof Settings>(k: K, v: Settings[K]) => { const n = { ...s, [k]: v }; setS(n); setSettings(n); };

  const doExport = async () => {
    const blob = await exportBackup(withRecs);
    const name = `taigi-b2-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const f = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: name }); } catch { /* cancelled */ }
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; a.click();
    }
    await setKV('lastBackup', Date.now());
    setMsg('已匯出備份。建議存到「檔案」App 抑是 iCloud。');
    bump();
  };

  return (
    <div>
      <Header title="設定與備份" back="#/records" />
      <div class="card">
        <label class="field"><span>考試日期</span><input type="text" value={s.examDate} onChange={(e) => upd('examDate', (e.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>新卡加入到這工為止（了後只複習）</span><input type="text" value={s.lastNewDay} onChange={(e) => upd('lastNewDay', (e.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>每日新卡上限：{s.maxNew}</span><input type="range" min={5} max={60} value={s.maxNew} onInput={(e) => upd('maxNew', Number((e.target as HTMLInputElement).value))} style={{ width: '100%' }} /></label>
        <label class="field"><span>到期複習超過這个數量，新卡減半（超過兩倍就停）：{s.reviewSoftCap}</span><input type="range" min={60} max={300} step={10} value={s.reviewSoftCap} onInput={(e) => upd('reviewSoftCap', Number((e.target as HTMLInputElement).value))} style={{ width: '100%' }} /></label>
        <label class="field"><span>卡片正面</span>
          <select value={s.frontMode} onChange={(e) => upd('frontMode', (e.target as HTMLSelectElement).value as Settings['frontMode'])}>
            <option value="auto">自動（熟了後混入「先聽音」）</option>
            <option value="han">一律先看漢字</option>
            <option value="listen">一律先聽音</option>
          </select>
        </label>
        <label class="row field"><input type="checkbox" checked={s.autoplay} onChange={() => upd('autoplay', !s.autoplay)} /><span style={{ margin: 0 }}>掀答案時自動播音</span></label>
        <label class="row field"><input type="checkbox" checked={s.includeSentences} onChange={() => upd('includeSentences', !s.includeSentences)} /><span style={{ margin: 0 }}>每日新卡包含語句（840 句）</span></label>
        <label class="row field"><input type="checkbox" checked={s.quanzhou} onChange={() => upd('quanzhou', !s.quanzhou)} /><span style={{ margin: 0 }}>變調用偏泉腔（5 變 3）</span></label>
        <label class="field"><span>B2 目標總分（官方門檻請依當年度簡章確認；0 = 未設定）</span><input type="text" inputMode="numeric" value={String(s.targetScore)} onChange={(e) => upd('targetScore', Number((e.target as HTMLInputElement).value) || 0)} /></label>
      </div>
      <div class="card stack">
        <b>備份</b>
        <p class="small muted">學習紀錄干焦存佇這支手機的瀏覽器資料內。iOS 有可能清除網頁資料，請定期匯出。</p>
        <label class="row"><input type="checkbox" checked={withRecs} onChange={() => setWithRecs(!withRecs)} /><span>包含錄音（檔案會較大）</span></label>
        <button class="btn primary block" onClick={doExport}>匯出備份</button>
        <button class="btn block" onClick={() => file.current?.click()}>匯入備份（會取代目前紀錄）</button>
        <input ref={file} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={async (e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (!f) return;
          if (!confirm('匯入會取代這支手機目前所有的學習紀錄，確定欲繼續？')) return;
          try { await importBackup(f); setMsg('匯入完成。'); bump(); location.reload(); } catch (err) { setMsg(`匯入失敗：${err}`); }
        }} />
        {msg && <p class="small">{msg}</p>}
      </div>
    </div>
  );
}

function OfflinePage() {
  const [man, setMan] = useState<{ p: string; s: number; g: string }[]>([]);
  const [have, setHave] = useState<Record<string, { n: number; bytes: number }>>({});
  const [prog, setProg] = useState<{ g: string; done: number; total: number } | null>(null);
  const [usage, setUsage] = useState('');
  const refresh = async (m = man) => {
    const out: Record<string, { n: number; bytes: number }> = {};
    for (const g of ['core', 'articles', 'exam']) out[g] = await cachedCount(m.filter((x) => x.g === g));
    setHave(out);
    const est = await navigator.storage?.estimate?.();
    if (est) setUsage(`已使用 ${(Number(est.usage) / 1e6).toFixed(0)} MB／可用約 ${(Number(est.quota) / 1e6).toFixed(0)} MB`);
  };
  useEffect(() => { loadManifest().then((m) => { setMan(m); refresh(m); }); }, []);
  const groups = [
    { g: 'core', name: '核心音檔', desc: '語詞（辭典）、辭典例句、課本語句與語詞' },
    { g: 'articles', name: '文章朗讀', desc: '59 篇課文全文朗讀＋詞彙' },
    { g: 'exam', name: '官方範例卷', desc: '聽力、口語、書寫原卷音檔' },
  ];
  return (
    <div>
      <Header title="離線音檔" back="#/records" />
      <p class="small muted">音檔第一擺播放時會自動保存。想欲完全離線使用，請佇 Wi-Fi 下共整包下載。{usage}</p>
      {groups.map(({ g, name, desc }) => {
        const list = man.filter((x) => x.g === g);
        const total = list.reduce((s, x) => s + x.s, 0);
        const h = have[g] ?? { n: 0, bytes: 0 };
        const running = prog?.g === g;
        return (
          <div class="card stack">
            <div class="spread"><b>{name}</b><span class="small muted">{(total / 1e6).toFixed(0)} MB・{list.length} 檔</span></div>
            <p class="small muted">{desc}</p>
            <Progress value={running ? prog!.done : h.n} max={list.length} />
            <div class="spread small"><span>{running ? `${prog!.done}/${prog!.total}` : `已下載 ${h.n}/${list.length}`}</span>
              <button class="btn small primary" disabled={!!prog || h.n >= list.length} onClick={async () => {
                setProg({ g, done: 0, total: list.length });
                await downloadAll(list, (done, tot) => setProg({ g, done, total: tot }));
                setProg(null);
                refresh();
              }}>{h.n >= list.length ? '已完成' : '下載'}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecordingsPage() {
  const { version, bump } = useStore();
  const recs = useAsync(() => db.recs.orderBy('ts').reverse().toArray(), [version], []);
  return (
    <div>
      <Header title="錄音作品" back="#/records" />
      {!recs.length && <p class="muted">猶無錄音。佇「測驗 › 口語」練習了後會使保存。</p>}
      {recs.map((r) => (
        <div class="card tight spread">
          <div>
            <span class="pill">{r.kind}</span> <span class="small">{r.title}</span>
            <div class="small muted">{new Date(r.ts).toLocaleString('zh-TW')}・{Math.round(r.durMs / 1000)} 秒{r.self !== undefined ? `・自評 ${r.self}` : ''}</div>
          </div>
          <div class="row">
            <button class="icon-btn" onClick={() => playBlob(r.blob)}>▶</button>
            <button class="icon-btn" onClick={async () => { if (confirm('欲刪除這筆錄音？')) { await db.recs.delete(r.id!); bump(); } }}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function WritingsPage() {
  const { version } = useStore();
  const ws = useAsync(() => db.writings.orderBy('ts').reverse().toArray(), [version], []);
  return (
    <div>
      <Header title="寫作紀錄" back="#/records" />
      {!ws.length && <p class="muted">猶無寫作紀錄。</p>}
      {ws.map((w) => (
        <details class="card tight">
          <summary><span class="pill">{w.kind}</span> {w.title} <span class="small muted">{new Date(w.ts).toLocaleDateString('zh-TW')}</span></summary>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{w.text}</p>
          <p class="small muted">用時 {Math.round(w.secs / 60)} 分・自評 {w.self ?? '—'}</p>
        </details>
      ))}
    </div>
  );
}

function AboutPage() {
  return (
    <div>
      <Header title="資料來源與授權" back="#/records" />
      <div class="card stack small">
        <p><b>教育部《臺灣台語常用詞辭典》</b>：詞目、釋義、例句、詞條音檔、例句音檔。授權：創用 CC 姓名標示－禁止改作 3.0 臺灣（CC BY-ND 3.0 TW）。本 App 只擷取部分檔案，未改作內容。出處：sutian.moe.edu.tw。</p>
        <p><b>教育部《咱來學臺灣閩南語》網路學習版</b>（國立臺灣師範大學規劃研編）：《學語詞真輕鬆》01–02、《讀語句上簡單》01–02、《讀文章蓋趣味》01–02 之文字與音檔；文章作者依各篇標示。再散布授權未查證，本 App 供個人學習使用。</p>
        <p><b>教育部臺灣台語語言能力認證 B 卷範例</b>：題目、參考答案、音檔照原卷。</p>
        <p><b>非官方自編內容</b>：文章理解題、語法專項題、口說與寫作題目及參考答案由 AI（Claude）依課文與辭典編寫，未經專家審訂，可能有用字或語感的問題，僅供練習參考。</p>
        <p><b>臺羅校正</b>：課本 PDF 抽出的拼音有缺調號的情形，已依辭典自動校正；無法比對的語句保留課本原文並加註。</p>
        <p><b>複習排程</b>：採擴展間隔（10 分、1、2、4、7、15、30、60 工），參考艾賓浩斯遺忘曲線的概念設定，屬經驗參數，毋是經過實證最佳化的模型。</p>
      </div>
    </div>
  );
}
