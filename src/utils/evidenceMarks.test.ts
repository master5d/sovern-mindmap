import { describe, it, expect } from 'vitest';
import {
  EVIDENCE_MARKS,
  MARK_IDS,
  THRESHOLD_MARK_IDS,
  DEFAULT_MARK_THRESHOLD,
  isKnownMark,
  markStrictness,
  markGlyph,
  markColorVar,
  isHiddenByMarkFilter,
} from './evidenceMarks';

describe('шкала — та же форма, что в NAUTILUS core/desops/dataviz/schema.js', () => {
  it('шесть ступеней, в порядке §1 канона', () => {
    expect(MARK_IDS).toEqual(['measured', 'reported', 'declared', 'inferred', 'open', 'refuted']);
  });

  it('строгость монотонна: измерено < вывод < отозвано', () => {
    expect(markStrictness('measured')!).toBeLessThan(markStrictness('reported')!);
    expect(markStrictness('reported')!).toBeLessThan(markStrictness('declared')!);
    expect(markStrictness('declared')!).toBeLessThan(markStrictness('inferred')!);
    expect(markStrictness('inferred')!).toBeLessThan(markStrictness('open')!);
    expect(markStrictness('open')!).toBeLessThan(markStrictness('refuted')!);
  });

  it('isKnownMark отличает известную марку от отсутствия/мусора', () => {
    for (const id of MARK_IDS) expect(isKnownMark(id)).toBe(true);
    expect(isKnownMark(undefined)).toBe(false);
    expect(isKnownMark(null)).toBe(false);
    expect(isKnownMark('measured ')).toBe(false);
    expect(isKnownMark(42)).toBe(false);
  });

  it('markGlyph/markColorVar знают все шесть id и ничего сверх схемы', () => {
    for (const m of EVIDENCE_MARKS) {
      expect(markGlyph(m.id)).toBe(m.glyph);
      expect(markColorVar(m.id)).toBe(`var(--mark-${m.id})`);
    }
  });

  it('порог — все ступени, КРОМЕ refuted; дефолт — самая слабая не-refuted', () => {
    expect(THRESHOLD_MARK_IDS).toEqual(['measured', 'reported', 'declared', 'inferred', 'open']);
    expect(DEFAULT_MARK_THRESHOLD).toBe('open');
  });
});

describe('isHiddenByMarkFilter — контракт видимости (мост NAUTILUS render/html.js)', () => {
  it('не размеченный элемент фильтр не трогает никогда', () => {
    expect(isHiddenByMarkFilter(undefined, 'measured', false)).toBe(false);
    expect(isHiddenByMarkFilter('вроде-измерено', 'measured', false)).toBe(false);
  });

  it('порог по умолчанию (open) не скрывает ничего, кроме refuted', () => {
    for (const id of THRESHOLD_MARK_IDS) {
      expect(isHiddenByMarkFilter(id, DEFAULT_MARK_THRESHOLD, false)).toBe(false);
    }
    expect(isHiddenByMarkFilter('refuted', DEFAULT_MARK_THRESHOLD, false)).toBe(true);
  });

  it('порог «≥declared» скрывает всё слабее declared', () => {
    expect(isHiddenByMarkFilter('measured', 'declared', false)).toBe(false);
    expect(isHiddenByMarkFilter('reported', 'declared', false)).toBe(false);
    expect(isHiddenByMarkFilter('declared', 'declared', false)).toBe(false);
    expect(isHiddenByMarkFilter('inferred', 'declared', false)).toBe(true);
    expect(isHiddenByMarkFilter('open', 'declared', false)).toBe(true);
  });

  it('refuted — свой переключатель, порог его не касается', () => {
    expect(isHiddenByMarkFilter('refuted', 'open', false)).toBe(true);
    expect(isHiddenByMarkFilter('refuted', 'open', true)).toBe(false);
    expect(isHiddenByMarkFilter('refuted', 'measured', true)).toBe(false);
  });
});
