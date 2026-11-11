import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStore } from '../store';
import { compareTailo, numericToDiacritic } from '../lib/tailo';
import { recordAnswer, saveQuiz } from '../lib/study';
import { play, stop } from '../lib/audio';
import { shuffle, sample } from '../lib/data';
import { AudioButton, Progress } from './common';
import type { Word } from '../lib/types';
import type { Question } from '../lib/quizgen';

/** 聽寫拼音 / 聽寫漢字 practice on words with audio (like 書寫測驗 第一部分). */
export function Dictation({ words, mode, onExit }: { words: Word[]; mode: 'tailo' | 'han'; onExit: () => void }) {
  const { c, settings, bump } = useStore();
  const [i, setI] = useState(0);
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [checked, setChecked] = useState<null | { ok: boolean; tonesOnly?: boolean }>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const w = words[i];

  const tiles = useMemo(() => {
    if (!w || mode !== 'han') return [] as string[];
    const chars = [...w.han];
    const pool = sample(c.vocab.filter((x) => x.id !== w.id), 12).flatMap((x) => [...x.han]);
    const extra = shuffle(Array.from(new Set(pool.filter((ch) => !chars.includes(ch))))).slice(0, Math.max(4, 8 - chars.length));
    return shuffle([...chars, ...extra]);
  }, [w, mode]);

  useEffect(() => {
    setInput(''); setPicked([]); setChecked(null);
    if (w) play(w.audio).catch(() => {});
  }, [i]);
  useEffect(() => () => stop(), []);

  if (done || !w) {
    return (
      <div>
        <h1>聽寫{mode === 'tailo' ? '拼音' : '漢字'}：結果</h1>
        <div class="card stat"><b>{score} / {words.length}</b><span>答對</span></div>
        <p class="small muted">考試每題 2 分；拼音須用臺羅正式版、聲調符號愛標正確才算對。</p>
        <button class="btn primary block" onClick={onExit}>返回</button>
      </div>
    );
  }

  const question: Question = {
    key: `dict-${mode}:${w.id}`, kind: mode === 'tailo' ? 'dict-tailo' : 'dict-han', itemId: w.id,
    prompt: `聽寫${mode === 'tailo' ? '拼音' : '漢字'}`, audio: w.audio, options: [mode === 'tailo' ? w.roman : w.han], answer: 0,
    reveal: { han: w.han, roman: w.roman, zh: w.zh },
  };

  const check = async () => {
    let ok: boolean, tonesOnly = false;
    if (mode === 'tailo') {
      const r = compareTailo(input, w.roman);
      ok = r.correct; tonesOnly = r.tonesOnly;
    } else {
      const ans = mode === 'han' && picked.length ? picked.map((k) => tiles[k]).join('') : input.trim();
      ok = ans === w.han;
    }
    setChecked({ ok, tonesOnly });
    if (ok) setScore((s) => s + 1);
    await recordAnswer(question, ok, settings, '書寫');
  };
  const next = async () => {
    if (i + 1 >= words.length) {
      await saveQuiz('書寫', mode === 'tailo' ? '聽寫拼音' : '聽寫漢字', words.length, score, 0);
      bump();
      setDone(true);
    } else setI(i + 1);
  };
  const cmp = mode === 'tailo' && checked ? compareTailo(input, w.roman) : null;

  return (
    <div>
      <div class="spread">
        <button class="back" onClick={() => { stop(); onExit(); }}>‹ 結束</button>
        <span class="muted small">{i + 1} / {words.length}</span>
      </div>
      <Progress value={i} max={words.length} />
      <div class="card stack">
        <div class="row"><AudioButton src={w.audio} /><span class="muted">聽音檔，寫出這个語詞的{mode === 'tailo' ? '臺羅拼音（會使用數字調，例：boo2-kiann2）' : '漢字（教育部常用詞辭典用字）'}</span></div>
        {mode === 'tailo' ? (
          <>
            <input class="roman-input" type="text" autocapitalize="off" autocorrect="off" spellcheck={false}
              value={input} placeholder="例：tai5-uan5 → Tâi-uân" disabled={!!checked}
              onInput={(e) => setInput((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => e.key === 'Enter' && !checked && input && check()} />
            {input && <p class="roman" style={{ fontSize: '1.2rem' }}>預覽：{numericToDiacritic(input)}</p>}
          </>
        ) : (
          <>
            <div class="han-mid" style={{ minHeight: '2em' }}>{picked.map((k) => tiles[k]).join('') || <span class="muted small">點下面的字塊組詞，抑是直接輸入</span>}</div>
            <div class="tiles">
              {tiles.map((t, k) => (
                <button class={'tile' + (picked.includes(k) ? ' used' : '')} disabled={!!checked || picked.includes(k)} onClick={() => setPicked([...picked, k])}>{t}</button>
              ))}
              <button class="tile" disabled={!!checked} onClick={() => setPicked(picked.slice(0, -1))}>⌫</button>
            </div>
            <input type="text" value={input} placeholder="或用輸入法打字" disabled={!!checked} onInput={(e) => { setInput((e.target as HTMLInputElement).value); setPicked([]); }} />
          </>
        )}
        {!checked ? (
          <button class="btn primary block" disabled={mode === 'tailo' ? !input : !(input || picked.length)} onClick={check}>對答案</button>
        ) : (
          <div class={'feedback ' + (checked.ok ? 'good' : 'bad')}>
            <b>{checked.ok ? '著！' : checked.tonesOnly ? '字母著，聲調有毋著' : '毋著'}</b>
            {cmp && (
              <div>
                {cmp.diffs.map((d) => (
                  <span class={'syl ' + (d.toneOk ? 'ok' : d.baseOk ? 'tone' : 'bad')}>
                    {d.expected}<small>{d.given ?? '—'}</small>
                  </span>
                ))}
              </div>
            )}
            <p><span class="han-mid" style={{ fontSize: '1.2rem' }}>{w.han}</span>　<span class="roman">{w.roman}</span>　{w.zh}</p>
            <button class="btn primary block" onClick={next}>下一題</button>
          </div>
        )}
      </div>
    </div>
  );
}
