import { useEffect, useState } from 'preact/hooks';
import { useStore, go } from '../store';
import { QuizSession } from '../components/QuizSession';
import { SpeakTask, RUBRICS } from '../components/SpeakTask';
import { WriteTask, WRITE_RUBRICS } from '../components/WriteTask';
import { Header, ListButton } from '../components/common';
import { audioUrl } from '../lib/audio';
import { compareTailo } from '../lib/tailo';
import { saveQuiz } from '../lib/study';
import type { MCQ } from '../lib/types';
import type { Question } from '../lib/quizgen';

/** Native <audio controls> player for long official recordings (seekable, cached offline when downloaded). */
function LongAudio({ path }: { path: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let url = '';
    (async () => {
      try {
        const c = await caches.open('taigi-audio');
        const hit = await c.match(audioUrl(path));
        const blob = hit ? await hit.blob() : await (await fetch(audioUrl(path))).blob();
        url = URL.createObjectURL(blob);
        setSrc(url);
      } catch { setSrc(audioUrl(path)); }
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [path]);
  return src ? <audio controls preload="metadata" src={src} style={{ width: '100%' }} /> : <p class="muted small">音檔載入中…</p>;
}

const toQ = (m: MCQ, key: string, passage?: string): Question => ({
  key, kind: 'official', prompt: m.q, options: m.options, answer: m.answer, passage, source: '官方範例',
});

export function MockOfficial({ part, onExit }: { part?: string; onExit: () => void }) {
  const { c } = useStore();
  const ex = c.exam;
  const [sub, setSub] = useState<string | null>(null);

  if (part === 'reading') {
    const qs: Question[] = [
      ...ex.reading.vocab.map((m, i) => toQ(m, `off-r-v${i}`)),
      ...ex.reading.cloze.flatMap((p, pi) => p.items.map((m, i) => toQ(m, `off-r-c${pi}-${i}`, p.passage))),
      ...ex.reading.comprehension.flatMap((p, pi) => p.items.map((m, i) => toQ(m, `off-r-p${pi}-${i}`, p.passage))),
    ];
    return <QuizSession title="官方範例・閱讀" section="模擬考" kind="official-reading" questions={qs} onExit={onExit} examMode timeLimitSec={33 * 60}
      intro={<div class="card"><p>官方公布的範例題 {qs.length} 題（語詞語法 9、克漏字 8、文章理解 9；其餘官方略去）。正式考試 40 題 50 分鐘，遮按比例限時 33 分鐘。</p></div>} />;
  }

  if (part === 'listening') return <OfficialListening onExit={onExit} />;
  if (part === 'writing') {
    if (sub !== null) {
      const p = ex.writing.parts[Number(sub)];
      const kind = p.title.startsWith('文章') ? '文章寫作' : p.title.includes('第2條') ? '短文' : '語句書寫';
      return <WriteTask spec={{
        kind, promptId: `official-w${sub}`, title: p.title, prompt: <p>{p.prompt}</p>, ref: p.ref,
        required: kind === '語句書寫' ? ['拍無去', '皮包', '手機仔', '證件', '佳哉'] : undefined,
        minChars: kind === '文章寫作' ? 150 : kind === '短文' ? 25 : undefined, maxChars: kind === '文章寫作' ? 200 : kind === '短文' ? 40 : undefined,
        timeSec: kind === '文章寫作' ? 25 * 60 : undefined, rubric: WRITE_RUBRICS[kind],
      }} onExit={() => setSub(null)} />;
    }
    return <OfficialDictation onPart={(i) => setSub(String(i))} onExit={onExit} />;
  }
  if (part === 'speaking') {
    if (sub !== null) {
      const p = ex.speaking.parts[Number(sub)];
      const kind = p.title.startsWith('口語表達') ? '口語表達' : p.title;
      const long = p.speakSec >= 90;
      return <SpeakTask spec={{
        kind, promptId: `official-s${sub}`, title: p.title, prepSec: p.prepSec, speakSec: p.speakSec,
        warnAt: long ? 20 : 10, warnBeeps: long ? 2 : 1, prompt: <><p class="small muted">{p.timing}</p><div class="passage">{p.prompt}</div></>,
        reference: p.ref, rubric: RUBRICS[kind] ?? RUBRICS['口語表達'],
      }} onExit={() => setSub(null)} />;
    }
    return (
      <div>
        <Header title="官方範例・口語" back="#/quiz/official" />
        <div class="card stack"><p class="small">官方題目音檔（含參考答案示範）：</p><LongAudio path={ex.speaking.audio} /></div>
        {ex.speaking.parts.map((p, i) => <ListButton title={p.title} sub={p.timing} onClick={() => setSub(String(i))} />)}
      </div>
    );
  }

  return (
    <div>
      <Header title="官方範例卷（B 卷）" back="#/quiz" />
      <p class="small muted">教育部公布之 B 卷範例（公布 106/03/24，修改 112/02/22）。題目、答案、音檔照原卷。</p>
      <ListButton title="閱讀測驗" sub="26 題・交卷才對答案" onClick={() => go('/quiz/official/reading')} />
      <ListButton title="聽力測驗" sub="原卷音檔＋16 題" onClick={() => go('/quiz/official/listening')} />
      <ListButton title="書寫測驗" sub="聽寫 10 題＋語句書寫 2 題＋文章寫作" onClick={() => go('/quiz/official/writing')} />
      <ListButton title="口語測驗" sub="情境對話、看圖講話、文章朗讀、口語表達" onClick={() => go('/quiz/official/speaking')} />
      <button class="btn ghost" onClick={onExit}>返回測驗區</button>
    </div>
  );
}

function OfficialListening({ onExit }: { onExit: () => void }) {
  const { c, bump } = useStore();
  const L = c.exam.listening;
  const all = [...L.dialogue.map((q) => ({ ...q, part: '對話理解' })), ...L.speech.map((q) => ({ ...q, part: '演說理解' }))];
  const [ans, setAns] = useState<(number | null)[]>(all.map(() => null));
  const [done, setDone] = useState(false);
  const score = all.filter((q, i) => ans[i] === q.answer).length;
  return (
    <div>
      <Header title="官方範例・聽力" back="#/quiz/official" />
      <p class="small muted">{L.note}</p>
      <div class="card" style={{ position: 'sticky', top: 0, zIndex: 5 }}><LongAudio path={L.audio} /></div>
      {all.map((q, i) => (
        <div class="card">
          <p class="small muted">{q.part} {i < L.dialogue.length ? i + 1 : i - L.dialogue.length + 1}</p>
          <p>{q.q}</p>
          <div class="options">
            {q.options.map((o, k) => {
              let cls = 'option';
              if (done) { if (k === q.answer) cls += ' correct'; else if (ans[i] === k) cls += ' wrong'; }
              else if (ans[i] === k) cls += ' correct';
              return <button class={cls} disabled={done} onClick={() => setAns(ans.map((x, j) => (j === i ? k : x)))}>({'ABCD'[k]}) {o}</button>;
            })}
          </div>
        </div>
      ))}
      {!done ? (
        <button class="btn primary block" onClick={async () => { setDone(true); await saveQuiz('模擬考', 'official-listening', all.length, score, 0); bump(); }}>交卷</button>
      ) : (
        <div class="card stat"><b>{score} / {all.length}</b><span>答對（每題 3 分 → {score * 3} 分）</span></div>
      )}
      <button class="btn ghost" onClick={onExit}>返回</button>
    </div>
  );
}

function OfficialDictation({ onPart, onExit }: { onPart: (i: number) => void; onExit: () => void }) {
  const { c } = useStore();
  const W = c.exam.writing;
  const [tl, setTl] = useState<string[]>(W.dictation.tailo.map(() => ''));
  const [hz, setHz] = useState<string[]>(W.dictation.han.map(() => ''));
  const [checked, setChecked] = useState(false);
  const tlOk = W.dictation.tailo.map((a, i) => compareTailo(tl[i], a).correct);
  const hzOk = W.dictation.han.map((a, i) => hz[i].trim() === a);
  return (
    <div>
      <Header title="官方範例・書寫" back="#/quiz/official" />
      <div class="card stack">
        <b>第一部分 聽寫測驗</b>
        <p class="small muted">每題先唸題目，閣唸一句包含該詞的句；只要寫出題目的詞。前 5 題寫臺羅（會使用數字調），後 5 題寫漢字。</p>
        <LongAudio path={W.audio} />
        {W.dictation.tailo.map((a, i) => (
          <label class="field"><span>拼音 {i + 1}</span>
            <input class="roman-input" type="text" autocapitalize="off" value={tl[i]} disabled={checked} onInput={(e) => setTl(tl.map((x, j) => (j === i ? (e.target as HTMLInputElement).value : x)))} />
            {checked && <span class={tlOk[i] ? 'pill good' : 'pill bad'}>{tlOk[i] ? '著' : `答案：${a}`}</span>}
          </label>
        ))}
        {W.dictation.han.map((a, i) => (
          <label class="field"><span>漢字 {i + 1}</span>
            <input type="text" value={hz[i]} disabled={checked} onInput={(e) => setHz(hz.map((x, j) => (j === i ? (e.target as HTMLInputElement).value : x)))} />
            {checked && <span class={hzOk[i] ? 'pill good' : 'pill bad'}>{hzOk[i] ? '著' : `答案：${a}`}</span>}
          </label>
        ))}
        {!checked ? <button class="btn primary block" onClick={() => setChecked(true)}>對答案</button> :
          <p><b>{[...tlOk, ...hzOk].filter(Boolean).length} / 10</b>（每題 2 分）</p>}
      </div>
      <h2>第二、三部分</h2>
      {W.parts.map((p, i) => <ListButton title={p.title} sub={p.prompt.slice(0, 40) + '…'} onClick={() => onPart(i)} />)}
      <button class="btn ghost" onClick={onExit}>返回</button>
    </div>
  );
}
