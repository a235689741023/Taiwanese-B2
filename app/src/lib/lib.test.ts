import { describe, it, expect } from 'vitest';
import { numericToDiacritic, compareTailo, applyTone, splitSyllables, sandhiTone, toneOf } from './tailo';
import {
  rate, newCard, addDays, dayStart, recordWrong, recordCorrect, newQuota, inUnknownPool, inAgainPool,
  isLeech, STAGE_DAYS, type Rating, type CardState,
} from './scheduler';

describe('tailo', () => {
  it('converts numeric tones with Tâi-lô mark placement', () => {
    expect(numericToDiacritic('bo5')).toBe('bô');
    expect(numericToDiacritic('boo2-kiann2')).toBe('bóo-kiánn');
    expect(numericToDiacritic('tsit8')).toBe('tsi̍t'.normalize('NFC'));
    expect(numericToDiacritic('m7-bat4')).toBe('m̄-bat'.normalize('NFC'));
    expect(numericToDiacritic('ng7')).toBe('n̄g'.normalize('NFC'));
    expect(numericToDiacritic('kiu2 hui3')).toBe('kiú huì');
    expect(numericToDiacritic('Tai5-uan5')).toBe('Tâi-uân');
    expect(applyTone('oo', 2)).toBe('óo');
  });

  it('compares syllables and isolates tone errors', () => {
    expect(compareTailo('bóo-kiánn', 'bóo-kiánn').correct).toBe(true);
    expect(compareTailo('boo2-kiann2', 'bóo-kiánn').correct).toBe(true);
    expect(compareTailo('Bóo kiánn', 'bóo-kiánn').correct).toBe(true); // separators & case ignored
    const r = compareTailo('boo-kiann', 'bóo-kiánn');
    expect(r.correct).toBe(false);
    expect(r.tonesOnly).toBe(true);
    const s = compareTailo('ng-jin5', 'n̄g-jîn');
    expect(s.diffs[0].baseOk).toBe(true);
    expect(s.diffs[0].toneOk).toBe(false);
    expect(s.diffs[1].toneOk).toBe(true);
    expect(compareTailo('tsi̍t', 'tsit').correct).toBe(false);
  });

  it('keeps neutral-tone markers', () => {
    const s = splitSyllables('āu--ji̍t');
    expect(s).toHaveLength(2);
    expect(s[1].neutral).toBe(true);
    expect(s[1].tone).toBe(8);
  });

  it('applies tone sandhi rules', () => {
    expect(sandhiTone('tinn')).toBe(7);
    expect(sandhiTone('tsiánn')).toBe(1);
    expect(sandhiTone('tshè')).toBe(2);
    expect(sandhiTone('kiâm')).toBe(7);
    expect(sandhiTone('kiâm', true)).toBe(3);
    expect(sandhiTone('khiū')).toBe(3);
    expect(sandhiTone('siap')).toBe(8);
    expect(sandhiTone('phoh')).toBe(2);
    expect(sandhiTone('kut'.replace('u', 'u̍'))).toBe(4);
    expect(sandhiTone('pe̍h')).toBe(3);
    expect(toneOf('pe̍h')).toBe(8);
  });
});

describe('scheduler', () => {
  const cfg = { examDate: new Date(2027, 2, 7) };
  const now = new Date(2026, 10, 20, 9).getTime();

  it('known on a new card jumps to 4 days', () => {
    const c = rate(newCard('a'), 'known', now, cfg);
    expect(c.stage).toBe(3);
    expect(c.due).toBe(addDays(now, 4));
  });

  it('known advances one stage along the expanding intervals', () => {
    let c = rate(newCard('a'), 'unknown', now, cfg);
    expect(c.stage).toBe(0);
    expect(c.due - now).toBe(10 * 60 * 1000);
    c = rate(c, 'known', now, cfg);
    expect(c.stage).toBe(1);
    expect(c.due).toBe(addDays(now, 1));
    c = rate(c, 'known', c.due, cfg);
    expect(c.stage).toBe(2);
    expect(c.due).toBe(addDays(addDays(now, 1), STAGE_DAYS[2]));
  });

  it('again keeps the stage and halves the interval (min 1 day)', () => {
    let c: CardState = { ...newCard('a'), stage: 5, due: now, last: 'known' as Rating };
    c = rate(c, 'again', now, cfg);
    expect(c.stage).toBe(5);
    expect(c.due).toBe(addDays(now, 7));
    expect(inAgainPool(c)).toBe(true);
  });

  it('unknown resets, counts a lapse, and enters the 不熟 pool', () => {
    let c: CardState = { ...newCard('a'), stage: 4, due: now, last: 'known' as Rating };
    c = rate(c, 'unknown', now, cfg);
    expect(c.stage).toBe(0);
    expect(c.lapses).toBe(1);
    expect(inUnknownPool(c)).toBe(true);
    c = rate(c, 'known', now, cfg);
    expect(inUnknownPool(c)).toBe(false);
  });

  it('leech after 4 lapses stays in 不熟 pool', () => {
    const c = { ...newCard('a'), stage: 2, lapses: 4, last: 'known' as Rating, due: now };
    expect(isLeech(c)).toBe(true);
    expect(inUnknownPool(c)).toBe(true);
  });

  it('never schedules after the exam eve', () => {
    const late = new Date(2027, 1, 20, 9).getTime();
    const c = rate({ ...newCard('a'), stage: 6, due: late, last: 'known' }, 'known', late, cfg);
    expect(c.due).toBe(dayStart(new Date(2027, 2, 6, 9).getTime()));
  });

  it('wrong items resolve after correct answers on two distinct days', () => {
    let w = recordWrong(undefined, { key: 'q1', itemId: 'a', kind: 'meaning' }, now);
    w = recordCorrect(w, now);
    w = recordCorrect(w, now + 3600_000);
    expect(w.resolved).toBe(false);
    w = recordCorrect(w, addDays(now, 1) + 3600_000);
    expect(w.resolved).toBe(true);
  });

  it('computes the daily new quota with backlog throttling', () => {
    const base = { remainingNew: 1000, daysLeft: 50, dueToday: 50, maxNew: 30, reviewSoftCap: 150, introducedToday: 0, weekend: false };
    expect(newQuota(base)).toBe(20);
    expect(newQuota({ ...base, dueToday: 200 })).toBe(10);
    expect(newQuota({ ...base, dueToday: 400 })).toBe(0);
    expect(newQuota({ ...base, introducedToday: 15 })).toBe(5);
    expect(newQuota({ ...base, weekend: true })).toBe(12);
  });
});
