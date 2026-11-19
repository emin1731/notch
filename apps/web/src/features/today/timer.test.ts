import { describe, expect, it } from 'vitest';
import { decideStop, formatClock, type RunningTimer, TIMER_STORAGE_KEY, useTimer } from './timer';

const hour = 60 * 60 * 1000;
const timer = (date: string, startedAt: number): RunningTimer => ({
  habitId: 'h1',
  habitName: 'Meditate',
  date,
  startedAt,
});

describe('decideStop', () => {
  const now = Date.parse('2026-11-19T08:00:00Z');
  const earliest = '2026-11-13';

  it('logs the elapsed seconds to the day it started', () => {
    expect(decideStop(timer('2026-11-19', now - 1234_500), now, earliest)).toEqual({
      kind: 'log',
      date: '2026-11-19',
      seconds: 1234,
    });
  });

  it('credits the start day after midnight', () => {
    expect(decideStop(timer('2026-11-18', now - 2 * hour), now, earliest)).toMatchObject({
      kind: 'log',
      date: '2026-11-18',
    });
  });

  it('asks first over 6 hours', () => {
    expect(decideStop(timer('2026-11-19', now - 7 * hour), now, earliest)).toEqual({
      kind: 'too-long',
      date: '2026-11-19',
      seconds: 7 * 3600,
    });
  });

  it('asks where the time goes when the start day is outside the window', () => {
    expect(decideStop(timer('2026-11-11', now - 2 * hour), now, earliest)).toMatchObject({
      kind: 'outside-window',
    });
  });

  it('does nothing for less than a second', () => {
    expect(decideStop(timer('2026-11-19', now - 400), now, earliest)).toEqual({ kind: 'nothing' });
  });
});

describe('timer store', () => {
  it('survives a reload: it is kept in localStorage and read back', async () => {
    const running = timer('2026-11-19', 1_700_000_000_000);
    useTimer.getState().start(running);
    expect(JSON.parse(localStorage.getItem(TIMER_STORAGE_KEY)!).state.running).toEqual(running);

    useTimer.setState({ running: null }, false);
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify({ state: { running }, version: 0 }));
    await useTimer.persist.rehydrate();
    expect(useTimer.getState().running).toEqual(running);
  });

  it('formats the running time', () => {
    expect(formatClock(5)).toBe('0:05');
    expect(formatClock(754)).toBe('12:34');
    expect(formatClock(3723)).toBe('1:02:03');
  });
});
