import { describe, expect, it } from 'vitest';
import { MAX_BACKOFF_MS, POLL_MS, nextDelay } from './pollBackoff';

describe('nextDelay', () => {
  it('после успеха возвращается к базовому интервалу', () => {
    expect(nextDelay(POLL_MS * 8, true)).toBe(POLL_MS);
  });

  it('после ошибки удваивает задержку', () => {
    expect(nextDelay(POLL_MS, false)).toBe(POLL_MS * 2);
    expect(nextDelay(POLL_MS * 2, false)).toBe(POLL_MS * 4);
  });

  it('упирается в потолок и не растёт дальше', () => {
    expect(nextDelay(MAX_BACKOFF_MS, false)).toBe(MAX_BACKOFF_MS);
    expect(nextDelay(MAX_BACKOFF_MS * 4, false)).toBe(MAX_BACKOFF_MS);
  });

  it('серия ошибок не уходит в бесконечность — за 20 шагов упирается в потолок', () => {
    let d = POLL_MS;
    for (let i = 0; i < 20; i++) d = nextDelay(d, false);
    expect(d).toBe(MAX_BACKOFF_MS);
  });

  it('один успех после долгой серии ошибок сбрасывает отступ целиком', () => {
    let d = POLL_MS;
    for (let i = 0; i < 10; i++) d = nextDelay(d, false);
    expect(d).toBe(MAX_BACKOFF_MS);
    expect(nextDelay(d, true)).toBe(POLL_MS);
  });

  it('потолок разумен: не чаще базового и не реже минуты', () => {
    expect(MAX_BACKOFF_MS).toBeGreaterThan(POLL_MS);
    expect(MAX_BACKOFF_MS).toBeLessThanOrEqual(60_000);
  });
});
