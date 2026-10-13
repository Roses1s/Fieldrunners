/* ==========================================================================
   map_magma.js — карта 3 «Расколотый кратер».

   Сетка 22×13, вулканический биом. Фиксированная дорога, но ДВА входа:
   основной слева сверху и запасной снизу — враги выходят на маршрут
   с середины, поэтому оборону приходится тянуть вдоль всей дороги.
   Лавовые зоны не просто декор: они пульсируют и сужают место под застройку.

   Путевые точки идут строго по строкам/столбцам (без диагоналей) —
   их разворачивает GridSystem._expandPath.
   ========================================================================== */

export const map_magma = {
  id: 'magma',
  name: 'Расколотый кратер',
  en: 'Fractured Crater',
  biome: 'lava',
  mode: 'fixed',
  maze: false,
  cols: 22,
  rows: 13,
  seed: 410872,

  startMoney: 140,
  lives: 20,
  waves: 20,
  firstBreak: 28,
  difficulty: 1.12,

  // Основной вход слева сверху; второй — снизу, прямо на дороге
  entries: [[0, 2], [8, 12]],
  exits: [[21, 6]],

  // Дорога: влево-вниз-вправо-вверх-вправо. Точка [8,12] — второй вход.
  path: [
    [0, 2], [8, 2], [8, 12], [16, 12], [16, 6], [21, 6]
  ],

  // Лавовые озёра и каменные гряды: строить нельзя, враги не проходят
  zones: [
    { x: 2, y: 5, w: 3, h: 3, kind: 'lava' },
    { x: 11, y: 3, w: 3, h: 2, kind: 'lava' },
    { x: 18, y: 9, w: 3, h: 3, kind: 'lava' },
    { x: 12, y: 8, w: 3, h: 3, kind: 'rock' },
    { x: 3, y: 9, w: 2, h: 2, kind: 'rock' },
    { x: 19, y: 2, w: 2, h: 2, kind: 'rock' }
  ],

  decor: [
    { cx: 5, cy: 0, type: 'rock' },
    { cx: 12, cy: 1, type: 'rock' },
    { cx: 16, cy: 3, type: 'rock' },
    { cx: 20, cy: 5, type: 'rock' },
    { cx: 6, cy: 8, type: 'rock' },
    { cx: 10, cy: 6, type: 'rock' },
    { cx: 2, cy: 11, type: 'rock' },
    { cx: 11, cy: 7, type: 'barrel' },
    { cx: 18, cy: 7, type: 'barrel' },
    { cx: 6, cy: 4, type: 'barrel' },
    { cx: 14, cy: 6, type: 'rock' },
    { cx: 1, cy: 6, type: 'rock' }
  ],

  // Первые волны — ручной сценарий: знакомим со вторым входом
  waveOverrides: {
    1: [
      { type: 'soldier', count: 7, interval: 0.85, delay: 0, entry: 0 }
    ],
    2: [
      { type: 'soldier', count: 8, interval: 0.7, delay: 0, entry: 0 },
      { type: 'runner', count: 4, interval: 0.5, delay: 4, entry: 1 }
    ],
    3: [
      { type: 'biker', count: 4, interval: 1.0, delay: 0, entry: 0 },
      { type: 'soldier', count: 8, interval: 0.6, delay: 2, entry: 1 }
    ],
    4: [
      { type: 'soldier', count: 12, interval: 0.5, delay: 0, entry: 0 },
      { type: 'copter', count: 3, interval: 1.5, delay: 5, entry: 1 }
    ]
  },

  tips: 'Два входа: второй открывается на 2-й волне снизу. Держите под огнём оба участка дороги.'
};

export default map_magma;
