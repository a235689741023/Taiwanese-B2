import { useState } from 'preact/hooks';
import { useStore, useAsync, go } from '../store';
import { db } from '../lib/db';
import { CardSession } from '../components/CardSession';
import { AudioButton, Header, ListButton, Progress, RubyText } from '../components/common';
import { ArticleReader } from './ArticleReader';
import { TONE_NAMES } from '../lib/tailo';

const UNIT = 50;

export function Learn({ route }: { route: string }) {
  const { c, version } = useStore();
  const [session, setSession] = useState<{ ids: string[]; title: string } | null>(null);
  const introduced = useAsync(async () => new Set(await db.cards.toCollection().primaryKeys()), [version, session], new Set<string>());
  const parts = route.split('/').filter(Boolean); // ['learn', ...]

  if (session) return <CardSession ids={session.ids} title={session.title} onExit={() => setSession(null)} />;

  // ---- 臺羅與變調 ----
  if (parts[1] === 'tailo') return <TailoGuide />;

  // ---- articles ----
  if (parts[1] === 'a') {
    if (parts[2]) {
      const a = c.articles.find((x) => x.id === parts[2]);
      if (a) return <ArticleReader article={a} />;
    }
    const sections = Array.from(new Set(c.articles.map((a) => `${a.book}|${a.section}`)));
    return (
      <div>
        <Header title="文章（讀文章蓋趣味）" back="#/learn" />
        <p class="small muted">59 篇文章攏有全文真人朗讀音檔。點入去會使看全文（臺羅注音可切換）、聽音檔、看詞彙佮文法。</p>
        {sections.map((s) => {
          const [b, name] = s.split('|');
          return (
            <div>
              <h2>第 {b} 冊・{name}</h2>
              {c.articles.filter((a) => `${a.book}|${a.section}` === s).map((a) => (
                <ListButton title={a.title} sub={`${a.author || ''}　詞彙 ${a.vocab.length}`} onClick={() => go(`/learn/a/${a.id}`)} />
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  // ---- words ----
  if (parts[1] === 'w') {
    const book = Number(parts[2]);
    const words = c.vocab.filter((w) => w.book === book);
    const units = Math.ceil(words.length / UNIT);
    if (parts[3] === 'u') {
      const u = Number(parts[4]);
      const list = words.slice(u * UNIT, (u + 1) * UNIT);
      const fresh = list.filter((w) => !introduced.has(w.id)).map((w) => w.id);
      return (
        <div>
          <Header title={`語詞 0${book}・第 ${u + 1} 單元`} back={`#/learn/w/${book}`} />
          <div class="row">
            <button class="btn primary" style={{ flex: 1 }} disabled={!fresh.length} onClick={() => setSession({ ids: fresh, title: `語詞 0${book}-${u + 1} 新卡` })}>學新卡（{fresh.length}）</button>
            <button class="btn" style={{ flex: 1 }} onClick={() => setSession({ ids: list.map((w) => w.id), title: `語詞 0${book}-${u + 1} 全部` })}>整單元閃卡</button>
          </div>
          <p class="hint">「學新卡」會共卡片加入複習排程；「整單元閃卡」嘛會依你的評分更新排程。</p>
          {list.map((w) => (
            <div class="card tight spread">
              <div>
                <b style={{ fontSize: '1.15rem' }}>{w.han}</b> <span class="roman">{w.roman}</span>
                <div class="small muted">{w.zh}</div>
              </div>
              <div class="row">{introduced.has(w.id) ? <span class="pill good">已學</span> : null}<AudioButton src={w.audio} /></div>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div>
        <Header title={`語詞 0${book}（學語詞真輕鬆）`} back="#/learn" />
        <p class="small muted">{book === 1 ? '504 個初級常用語詞' : '352 個常用語詞'}；臺羅已用教育部《臺灣台語常用詞辭典》校對，詞目音檔來自辭典。</p>
        {Array.from({ length: units }, (_, u) => {
          const list = words.slice(u * UNIT, (u + 1) * UNIT);
          const n = list.filter((w) => introduced.has(w.id)).length;
          return (
            <button class="list-btn" onClick={() => go(`/learn/w/${book}/u/${u}`)}>
              <span style={{ flex: 1 }}>
                <span>第 {u + 1} 單元　<span class="muted small">{list[0].han}…{list[list.length - 1].han}</span></span>
                <Progress value={n} max={list.length} />
              </span>
              <span class="muted small">{n}/{list.length}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // ---- sentences ----
  if (parts[1] === 's') {
    const book = Number(parts[2]);
    const sents = c.sentences.filter((s) => s.book === book);
    const cats = Array.from(new Set(sents.map((s) => s.cat)));
    if (parts[3] === 'c') {
      const cat = decodeURIComponent(parts[4]);
      const list = sents.filter((s) => s.cat === cat);
      const fresh = list.filter((s) => !introduced.has(s.id)).map((s) => s.id);
      return (
        <div>
          <Header title={`語句 0${book}・${cat}`} back={`#/learn/s/${book}`} />
          <div class="row">
            <button class="btn primary" style={{ flex: 1 }} disabled={!fresh.length} onClick={() => setSession({ ids: fresh.slice(0, 30), title: `語句・${cat}` })}>學新卡（{Math.min(30, fresh.length)}）</button>
            <button class="btn" style={{ flex: 1 }} onClick={() => setSession({ ids: list.map((s) => s.id), title: `語句・${cat} 全部` })}>整類閃卡</button>
          </div>
          {list.map((s) => (
            <div class="card tight">
              <div class="spread"><b>{s.han}</b><AudioButton src={s.audio} /></div>
              <div class="roman small">{s.roman}</div>
              <div class="small muted">{s.zh}</div>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div>
        <Header title={`語句 0${book}（讀語句上簡單）`} back="#/learn" />
        <p class="small muted">420 句，分 16 類，每句攏有課本真人音檔。</p>
        {cats.map((cat) => {
          const list = sents.filter((s) => s.cat === cat);
          const n = list.filter((s) => introduced.has(s.id)).length;
          return <ListButton title={cat} sub={<Progress value={n} max={list.length} />} right={`${n}/${list.length}`} onClick={() => go(`/learn/s/${book}/c/${encodeURIComponent(cat)}`)} />;
        })}
      </div>
    );
  }

  // ---- root ----
  const count = (pred: (id: string) => boolean) => [...introduced].filter(pred).length;
  return (
    <div>
      <h1>學習區</h1>
      <p class="small muted">建議順序：臺羅與變調 → 語詞 01 → 語詞 02 → 語句 → 文章。「今日」頁會自動依期程排新卡，嘛會使佇遮照單元家己學。</p>
      <ListButton title="臺羅與變調" sub="聲調、連續變調規則、數字調輸入" onClick={() => go('/learn/tailo')} />
      <ListButton title="語詞 01（初級 504 詞）" sub={`已學 ${count((id) => id.startsWith('w1-'))}`} onClick={() => go('/learn/w/1')} />
      <ListButton title="語詞 02（352 詞）" sub={`已學 ${count((id) => id.startsWith('w2-'))}`} onClick={() => go('/learn/w/2')} />
      <ListButton title="語句 01（420 句）" sub={`已學 ${count((id) => id.startsWith('s1-'))}`} onClick={() => go('/learn/s/1')} />
      <ListButton title="語句 02（420 句）" sub={`已學 ${count((id) => id.startsWith('s2-'))}`} onClick={() => go('/learn/s/2')} />
      <ListButton title="文章（59 篇，含朗讀音檔）" sub="讀文章蓋趣味 01、02" onClick={() => go('/learn/a')} />
    </div>
  );
}

function TailoGuide() {
  const { c, settings } = useStore();
  const examples: Record<number, string> = {};
  for (const t of c.tones) {
    const n = (() => { const m = t.roman.normalize('NFD').match(/[̀́̂̄̍]/); return m ? ({ '́': 2, '̀': 3, '̂': 5, '̄': 7, '̍': 8 } as Record<string, number>)[m[0]] : /[ptkh]$/.test(t.roman) ? 4 : 1; })();
    if (!examples[n]) examples[n] = t.id;
  }
  const byId = new Map(c.tones.map((t) => [t.id, t]));
  return (
    <div>
      <Header title="臺羅與變調" back="#/learn" />
      <div class="card">
        <h3 style={{ marginTop: 0 }}>八聲調（臺羅正式版）</h3>
        <table class="simple">
          <tr><th>聲調</th><th>標記</th><th>例</th><th></th></tr>
          {[1, 2, 3, 4, 5, 7, 8].map((n) => {
            const t = byId.get(examples[n]);
            const mark = ['', '無標', 'á', 'à', '無標（-p/-t/-k/-h）', 'â', '', 'ā', 'a̍（-p/-t/-k/-h）'][n];
            return <tr><td>{TONE_NAMES[n]}</td><td class="roman">{mark}</td><td>{t ? <>{t.han} <span class="roman">{t.roman}</span></> : ''}</td><td>{t && <AudioButton src={t.audio} />}</td></tr>;
          })}
        </table>
        <p class="small muted">第 6 聲佮第 9 聲佇通行腔真少用，考試以 7 个聲調為主。標調位置：a ＞ oo ＞ e、o ＞ i、u（iu 標 u、ui 標 i）＞ m、ng。</p>
      </div>
      <div class="card">
        <h3 style={{ marginTop: 0 }}>連續變調（《學拼音有撇步》）</h3>
        <p>兩字以上連讀，除了上尾一字，頭前的字攏愛變調：</p>
        <table class="simple">
          <tr><th>本調</th><th>變調</th><th>例（甜 → 甜甜）</th></tr>
          <tr><td>1</td><td>7</td><td class="roman">tinn → tinn-tinn</td></tr>
          <tr><td>2</td><td>1</td><td class="roman">tsiánn → tsiánn-tsiánn</td></tr>
          <tr><td>3</td><td>2</td><td class="roman">tshè → tshè-tshè</td></tr>
          <tr><td>5</td><td>7（偏漳）／3（偏泉）</td><td class="roman">kiâm → kiâm-kiâm</td></tr>
          <tr><td>7</td><td>3</td><td class="roman">khiū → khiū-khiū</td></tr>
          <tr><td>4（-p,-t,-k）</td><td>8</td><td class="roman">siap → siap-siap</td></tr>
          <tr><td>4（-h）</td><td>2</td><td class="roman">phoh → phoh-phoh</td></tr>
          <tr><td>8（-p,-t,-k）</td><td>4</td><td class="roman">ku̍t → ku̍t-ku̍t</td></tr>
          <tr><td>8（-h）</td><td>3</td><td class="roman">pe̍h → pe̍h-pe̍h</td></tr>
        </table>
        <p class="small muted">臺羅書寫一律標本調，唸的時才變調。目前設定：5 變 {settings.quanzhou ? '3（偏泉）' : '7（偏漳）'}，會使佇「紀錄 › 設定」改。</p>
      </div>
      <div class="card">
        <h3 style={{ marginTop: 0 }}>數字調輸入</h3>
        <p>本 App 所有臺羅輸入框攏會使打數字調，系統自動轉做調號：</p>
        <p class="roman">tai5-uan5 → Tâi-uân　boo2-kiann2 → bóo-kiánn　tsit8 → tsi̍t　m7 → m̄</p>
      </div>
      <h2>練習</h2>
      <ListButton title="聲調辨識（聽音選聲調）" onClick={() => go('/quiz/tone')} />
      <ListButton title="變調判斷" onClick={() => go('/quiz/sandhi')} />
      <ListButton title="聽寫拼音" onClick={() => go('/quiz/dict-tailo')} />
      <ListButton title="臺羅辨識（揀正確的拼音）" onClick={() => go('/quiz/tailo')} />
      <p class="small muted">示範：<RubyText segs={[{ t: '臺灣', r: 'Tâi-uân' }]} /></p>
    </div>
  );
}
