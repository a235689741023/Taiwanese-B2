import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useStore } from '../store';
import { db } from '../lib/db';
import { numericToDiacritic } from '../lib/tailo';
import { useStopwatch, fmt } from './common';

export interface WriteSpec {
  kind: string; // 語句書寫 / 短文 / 文章寫作
  promptId: string;
  title: string;
  prompt: ComponentChildren;
  ref?: string;
  required?: string[]; // words that must appear
  minChars?: number;
  maxChars?: number;
  timeSec?: number;
  rubric: string[];
}

export const WRITE_RUBRICS: Record<string, string[]> = {
  語句書寫: ['指定的語詞攏有用著', '句意通順、合邏輯', '用字合教育部推薦用字', '無華語直翻的句法'],
  短文: ['有回應題目要求', '字數佇範圍內', '用字正確', '語氣合適'],
  文章寫作: ['切題、有中心思想', '段落組織清楚（開頭、內容、結尾）', '詞彙豐富、有台語特色的講法（俗語、熟語）', '用字正確，字數 150–200'],
};

/** Count characters the way the exam does roughly: Han characters + romanised syllables, punctuation excluded. */
export const countChars = (t: string) => {
  const han = (t.match(/[㐀-鿿豈-﫿\u{20000}-\u{3ffff}]/gu) ?? []).length;
  const rom = (t.match(/[A-Za-zÀ-ɏ̀-ͯ]+/g) ?? []).length;
  return han + rom;
};

export function WriteTask({ spec, onExit }: { spec: WriteSpec; onExit: () => void }) {
  const { bump } = useStore();
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [self, setSelf] = useState<boolean[]>(spec.rubric.map(() => false));
  const [saved, setSaved] = useState(false);
  const secs = useStopwatch(!submitted);
  const n = countChars(text);
  const missing = (spec.required ?? []).filter((w) => !text.includes(w));
  const over = spec.timeSec && secs > spec.timeSec;

  const save = async () => {
    await db.writings.add({ ts: Date.now(), kind: spec.kind, promptId: spec.promptId, title: spec.title, text, self: self.filter(Boolean).length, secs });
    setSaved(true);
    bump();
  };

  return (
    <div>
      <button class="back" onClick={onExit}>‹ 返回</button>
      <h1>{spec.kind}</h1>
      <div class="card">{spec.prompt}</div>
      <div class="spread small muted">
        <span>字數：<b class={(spec.minChars && n < spec.minChars) || (spec.maxChars && n > spec.maxChars) ? 'error' : ''}>{n}</b>{spec.minChars ? `（${spec.minChars}–${spec.maxChars}）` : ''}</span>
        <span class={over ? 'error' : ''}>{fmt(secs)}{spec.timeSec ? ` / ${fmt(spec.timeSec)}` : ''}</span>
      </div>
      <textarea value={text} disabled={submitted} placeholder="用台語漢字寫；需要拼音的所在會使打數字調，例：bo5 → bô"
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      {!submitted && (
        <div class="row">
          <button class="btn small" onClick={() => setText(numericToDiacritic(text))}>數字調轉調號</button>
          <button class="btn primary" style={{ flex: 1 }} disabled={!text.trim()} onClick={() => setSubmitted(true)}>寫好矣，對參考答案</button>
        </div>
      )}
      {submitted && (
        <div class="stack">
          {spec.required && (
            <div class={'feedback ' + (missing.length ? 'bad' : 'good')}>
              {missing.length ? <>猶未用著：{missing.join('、')}</> : '指定語詞攏有用著。'}
            </div>
          )}
          {spec.ref && <div class="card"><b>參考答案</b><p style={{ lineHeight: 1.9 }}>{spec.ref}</p></div>}
          <div class="card">
            <b>自我評分</b>
            {spec.rubric.map((r, k) => (
              <label class="row" style={{ margin: '8px 0' }}>
                <input type="checkbox" checked={self[k]} onChange={() => setSelf(self.map((x, j) => (j === k ? !x : x)))} />
                <span>{r}</span>
              </label>
            ))}
            <p class="small muted">建議用「學習區」的辭典資料核對用字；寫作紀錄存佇手機，會使佇「紀錄」重看。</p>
          </div>
          <div class="row">
            <button class="btn" onClick={() => { setSubmitted(false); setSaved(false); }}>繼續修改</button>
            <button class="btn primary" style={{ flex: 1 }} disabled={saved} onClick={save}>{saved ? '已保存' : '保存'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
