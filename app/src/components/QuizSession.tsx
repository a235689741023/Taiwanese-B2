import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '../store';
import { recordAnswer, saveQuiz } from '../lib/study';
import { play, stop } from '../lib/audio';
import { AudioButton, Progress, fmt, useStopwatch } from './common';
import type { Question } from '../lib/quizgen';

interface Props {
  title: string;
  section: string; // 閱讀 / 聽力 / 書寫 / 口語 / 錯題 …
  kind: string;
  questions: Question[];
  onExit: () => void;
  examMode?: boolean; // no feedback until the end
  timeLimitSec?: number;
  intro?: preact.ComponentChildren;
}

export function QuizSession({ title, section, kind, questions, onExit, examMode, timeLimitSec, intro }: Props) {
  const { settings, bump } = useStore();
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [finished, setFinished] = useState(false);
  const [started, setStarted] = useState(!intro);
  const elapsed = useStopwatch(started && !finished);
  const playedOnce = useRef(new Set<number>());
  const q = questions[i];

  useEffect(() => () => stop(), []);
  useEffect(() => {
    setChosen(answers[i]);
  }, [i]);
  useEffect(() => {
    if (timeLimitSec && elapsed >= timeLimitSec && !finished) finish();
  }, [elapsed]);

  const finish = async () => {
    stop();
    const correct = answers.filter((a, k) => a === questions[k].answer).length;
    if (examMode) {
      for (let k = 0; k < questions.length; k++) {
        if (answers[k] !== null) await recordAnswer(questions[k], answers[k] === questions[k].answer, settings, section);
      }
    }
    await saveQuiz(section, kind, questions.length, correct, elapsed);
    setFinished(true);
    bump();
  };

  if (!questions.length) {
    return (
      <div>
        <button class="back" onClick={onExit}>‹ 返回</button>
        <h1>{title}</h1>
        <p class="muted">目前無題目可出（可能需要先學過一寡卡片，抑是這類題目尚未準備）。</p>
      </div>
    );
  }

  if (!started) {
    return (
      <div>
        <button class="back" onClick={onExit}>‹ 返回</button>
        <h1>{title}</h1>
        {intro}
        <button class="btn primary block" onClick={() => setStarted(true)}>開始</button>
      </div>
    );
  }

  if (finished) {
    const correct = answers.filter((a, k) => a === questions[k].answer).length;
    return (
      <div>
        <h1>{title}：結果</h1>
        <div class="card grid3">
          <div class="stat"><b>{correct}/{questions.length}</b><span>答對</span></div>
          <div class="stat"><b>{Math.round((correct / questions.length) * 100)}%</b><span>正確率</span></div>
          <div class="stat"><b>{fmt(elapsed)}</b><span>用時</span></div>
        </div>
        {examMode && <p class="small muted">若依官方配分每題 3 分計，得分約 {correct * 3} / {questions.length * 3}。</p>}
        <h2>題目檢討</h2>
        {questions.map((qq, k) => {
          const ok = answers[k] === qq.answer;
          return (
            <details class="card tight">
              <summary><span class={ok ? 'pill good' : 'pill bad'}>{ok ? '對' : '錯'}</span> {k + 1}. {qq.prompt.slice(0, 40)}{qq.prompt.length > 40 ? '…' : ''}</summary>
              <p>正確答案：<b>{qq.options[qq.answer]}</b>{answers[k] !== null && !ok && <>；你選：{qq.options[answers[k]!]}</>}</p>
              {qq.reveal && <p class="small"><b>{qq.reveal.han}</b> <span class="roman">{qq.reveal.roman}</span> {qq.reveal.zh}</p>}
              {qq.explain && <p class="small muted">{qq.explain}</p>}
            </details>
          );
        })}
        <p class="small muted">答錯的題目已記入「錯題區」；相關卡片已依結果重新排程。</p>
        <button class="btn primary block" onClick={onExit}>返回</button>
      </div>
    );
  }

  const answered = chosen !== null && !examMode;
  const choose = async (k: number) => {
    if (answered) return;
    if (examMode) {
      setChosen(k);
      setAnswers((a) => a.map((x, j) => (j === i ? k : x)));
      return;
    }
    setChosen(k);
    setAnswers((a) => a.map((x, j) => (j === i ? k : x)));
    await recordAnswer(q, k === q.answer, settings, section);
    if (q.reveal && q.audio === null && q.itemId) {
      // nothing
    }
  };
  const next = () => {
    stop();
    if (i + 1 >= questions.length) finish();
    else setI(i + 1);
  };
  const canPlay = !(examMode && q.audioOnce && playedOnce.current.has(i));

  return (
    <div>
      <div class="spread">
        <button class="back" onClick={() => { stop(); onExit(); }}>‹ 結束</button>
        <span class="muted small">
          {i + 1} / {questions.length}　{timeLimitSec ? `剩 ${fmt(Math.max(0, timeLimitSec - elapsed))}` : fmt(elapsed)}
        </span>
      </div>
      <Progress value={i} max={questions.length} />
      {q.passage && (
        <details class="card" open>
          <summary class="small muted">文章／短文（點一下收起來）</summary>
          <div class="passage">{q.passage}</div>
        </details>
      )}
      <div class="card">
        <div class="spread">
          <span class="pill">{title}</span>
          {q.source && <span class={q.source.includes('非官方') ? 'pill warn' : 'pill good'}>{q.source}</span>}
        </div>
        <p style={{ fontSize: '1.08rem', marginTop: '10px' }}>{q.prompt}</p>
        {q.audio && (
          <div class="row">
            {canPlay ? (
              <button class="btn small" onClick={() => { playedOnce.current.add(i); play(q.audio).catch(() => {}); }}>▶ 播放音檔</button>
            ) : (
              <span class="pill warn">考試模式：音檔只播一次</span>
            )}
          </div>
        )}
        <div class="options">
          {q.options.map((o, k) => {
            let cls = 'option';
            if (answered) {
              if (k === q.answer) cls += ' correct';
              else if (k === chosen) cls += ' wrong';
            } else if (examMode && chosen === k) cls += ' correct';
            return (
              <button class={cls} onClick={() => choose(k)}>
                <span class="muted">({'ABCDEFGH'[k]})</span> <span class={/^[a-zA-ZÀ-ɏ]/.test(o) ? 'roman' : ''}>{o}</span>
              </button>
            );
          })}
        </div>
        {answered && (
          <div class={'feedback ' + (chosen === q.answer ? 'good' : 'bad')}>
            <b>{chosen === q.answer ? '答對矣！' : `正確答案：(${'ABCDEFGH'[q.answer]}) ${q.options[q.answer]}`}</b>
            {q.reveal && (
              <div class="row wrap" style={{ marginTop: '6px' }}>
                <span class="han-mid" style={{ fontSize: '1.1rem' }}>{q.reveal.han}</span>
                <span class="roman">{q.reveal.roman}</span>
                {q.audio !== undefined && q.audio && <AudioButton src={q.audio} />}
                <span class="small">{q.reveal.zh}</span>
              </div>
            )}
            {q.explain && <p class="small">{q.explain}</p>}
          </div>
        )}
      </div>
      {(answered || examMode) && (
        <div class="row">
          {examMode && i > 0 && <button class="btn" onClick={() => setI(i - 1)}>上一題</button>}
          <button class="btn primary block" style={{ flex: 1 }} onClick={next}>{i + 1 >= questions.length ? (examMode ? '交卷' : '看結果') : '下一題'}</button>
        </div>
      )}
    </div>
  );
}
