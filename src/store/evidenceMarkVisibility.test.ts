import { describe, it, expect } from 'vitest';
import { applyMarkVisibility } from './useWorkflowStore';

type Item = { id: string; data: any; hidden?: boolean };

describe('applyMarkVisibility (мост NAUTILUS core/desops/dataviz — фильтр порога)', () => {
  it('не размеченный элемент никогда не скрывается фильтром', () => {
    const items: Item[] = [{ id: 'a', data: {} }];
    expect(applyMarkVisibility(items, 'measured', false)[0].hidden).toBeUndefined();
  });

  it('элемент слабее порога получает hidden:true', () => {
    const items: Item[] = [{ id: 'a', data: { mark: 'inferred' } }];
    expect(applyMarkVisibility(items, 'declared', false)[0].hidden).toBe(true);
  });

  it('элемент на пороге или строже остаётся видимым', () => {
    const items: Item[] = [{ id: 'a', data: { mark: 'declared' } }, { id: 'b', data: { mark: 'measured' } }];
    const out = applyMarkVisibility(items, 'declared', false);
    expect(out[0].hidden).toBeUndefined();
    expect(out[1].hidden).toBeUndefined();
  });

  it('refuted скрыт по умолчанию независимо от порога, показывается своим переключателем', () => {
    const items: Item[] = [{ id: 'a', data: { mark: 'refuted' } }];
    expect(applyMarkVisibility(items, 'refuted' as any, false)[0].hidden).toBe(true);
    expect(applyMarkVisibility(items, 'measured', true)[0].hidden).toBeUndefined();
  });

  it('уже скрытое ДРУГОЙ причиной (fold) остаётся скрытым и не трогается', () => {
    const items: Item[] = [{ id: 'a', data: { mark: 'measured' }, hidden: true }];
    const out = applyMarkVisibility(items, 'measured', false);
    expect(out[0].hidden).toBe(true);
    expect(out[0]).toBe(items[0]); // не пересоздан — функция не потрогала чужую причину
  });

  it('ребро прячется по СВОЕЙ марке — функция не знает о концах, только про data.mark входного элемента', () => {
    // Ключевой инвариант NAUTILUS render/html.js: ребро наследует видимость от
    // своего mark, а не от узлов. Здесь это тривиально верно по конструкции —
    // функция принимает произвольные {data,hidden} и не смотрит на узлы вовсе.
    const edgeLikeItems: Item[] = [{ id: 'e', data: { mark: 'open' } }];
    expect(applyMarkVisibility(edgeLikeItems, 'inferred', false)[0].hidden).toBe(true);
  });

  it('без единого маркированного элемента массив возвращается тем же ссылочно (не пересоздан зря)', () => {
    const items: Item[] = [{ id: 'a', data: {} }, { id: 'b', data: { mark: undefined } }];
    expect(applyMarkVisibility(items, 'measured', false)).toBe(items);
  });
});
