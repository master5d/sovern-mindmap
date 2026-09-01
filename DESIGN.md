---
desops: contract/v1
status: ok
descriptor: unified dark diagramming canvas, deep navy surfaces + electric blue accent,
  single React Flow surface
dials: {variance: 3, motion: 4, density: 6}
palette:
  dark: {bg: '#020617', accent: '#2563eb', surface: '#0f172a'}
  light: {bg: '#f8fafc', accent: '#2563eb'}
tokens: inherit
rationale: 'Канвас: умеренная плотность (диаграммы должны дышать), интеракции живые
  (drag/fold/step-through) но не постановочные. Канон значений — src/theme/tokens.css.'
---
# MindMapping — DESIGN.md

## Что это за интерфейс

unified dark diagramming canvas, deep navy surfaces + electric blue accent, single React Flow surface

## Решения

- 2026-08-27: контракт заведён миграцией (спек 2026-08-27-design-consolidation); dials выставлены из design/identity.json
- 2026-09-01: заведён семантический токен отказа `--danger` (`text-danger`, `bg-danger`).
  Значение взято из уже существующего красного проекта (`--status-blocked`, `--q-dofirst`):
  #ef4444 в тёмной теме, #dc2626 в светлой. До него сообщения об ошибке писались сырым
  `text-red-500`, а гейт обходился общепроектным `design/lint-allowlist.json` — файл удалён,
  послабление больше не нужно. Раньше цвет отказа существовал в трёх видах (статус, квадрант,
  сырой класс) и был неотличим от них по смыслу.

## Не делать

- TODO(owner): перенести сюда проектные антипаттерны из legacy — `design/notes/legacy-DESIGN.md`
- (общелабораторное, не про этот проект) hex в разметке мимо токенов (`lint-design.ps1`)

## Доктрина

- `C:\telo\Efforts\Ongoing\NAUTILUS\core\desops\doctrine\INDEX.md`

## Legacy

Прежний DESIGN.md целиком: `design/notes/legacy-DESIGN.md` (ничего не потеряно).
