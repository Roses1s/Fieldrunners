/* ==========================================================================
   map_grasslands.js — карта 1 «Зелёная долина» (обучающая).

   Сетка 20×12, один вход слева, один выход справа, фиксированная дорога
   с несколькими поворотами и много места под застройку. Первые волны —
   только наземные враги, вертолёты появляются с 5-й волны.

   Формат путевых точек: [[cx, cy], ...] — разворачиваются в плотный список
   клеток без диагоналей (см. GridSystem._expandPath).
   ========================================================================== */

export const map_grasslands = {
  id: 'grasslands',
  name: 'Зелёная долина',
  en: 'Green Valley',
  biome: 'grass',
  mode: 'fixed',           // фиксированная дорога
  maze: false,
  cols: 20,
  rows: 12,
  seed: 20250101,

  startMoney: 100,
  lives: 20,
  waves: 20,
  firstBreak: 25,          // время на первую застройку
  difficulty: 1,

  entries: [[0, 6]],
  exits: [[19, 4]],

  // Дорога: вход слева → вверх → вправо → вниз → вправо → вверх → выход
  path: [
    [0, 6], [3, 6], [3, 2], [8, 2], [8, 9], [14, 9], [14, 4], [19, 4]
  ],

  // Зоны, где строить нельзя (пруда/камни рисуются отдельной текстурой)
  zones: [
    { x: 16, y: 7, w: 3, h: 3, kind: 'water' },
    { x: 1, y: 9, w: 2, h: 2, kind: 'rock' }
  ],

  // Декор (занимает клетку, строить нельзя)
  decor: [
    { cx: 1, cy: 1, type: 'tree' },
    { cx: 6, cy: 0, type: 'pine' },
    { cx: 11, cy: 1, type: 'tree' },
    { cx: 17, cy: 1, type: 'pine' },
    { cx: 12, cy: 6, type: 'tree' },
    { cx: 5, cy: 5, type: 'bush' },
    { cx: 6, cy: 7, type: 'bush' },
    { cx: 10, cy: 4, type: 'bush' },
    { cx: 16, cy: 2, type: 'bush' },
    { cx: 2, cy: 3, type: 'flower', solid: false },
    { cx: 4, cy: 8, type: 'flower', solid: false },
    { cx: 7, cy: 4, type: 'flower', solid: false },
    { cx: 11, cy: 7, type: 'flower', solid: false },
    { cx: 13, cy: 2, type: 'flower', solid: false },
    { cx: 18, cy: 9, type: 'flower', solid: false },
    { cx: 9, cy: 11, type: 'tree' },
    { cx: 19, cy: 10, type: 'pine' },
    { cx: 3, cy: 11, type: 'bush' },
    { cx: 15, cy: 11, type: 'rock' }
  ],

  // Ручной сценарий первых волн (дальше работает генератор WaveSystem)
  waveOverrides: {
    1: [
      { type: 'soldier', count: 6, interval: 0.9, delay: 0, entry: 0 }
    ],
    2: [
      { type: 'soldier', count: 9, interval: 0.7, delay: 0, entry: 0 }
    ],
    3: [
      { type: 'soldier', count: 8, interval: 0.6, delay: 0, entry: 0 },
      { type: 'runner', count: 4, interval: 0.5, delay: 4, entry: 0 }
    ],
    4: [
      { type: 'soldier', count: 10, interval: 0.5, delay: 0, entry: 0 },
      { type: 'runner', count: 6, interval: 0.45, delay: 3, entry: 0 }
    ],
    5: [
      { type: 'soldier', count: 8, interval: 0.55, delay: 0, entry: 0 },
      { type: 'copter', count: 3, interval: 1.6, delay: 2, entry: 0 }
    ],
    6: [
      { type: 'runner', count: 10, interval: 0.4, delay: 0, entry: 0 },
      { type: 'biker', count: 3, interval: 1.1, delay: 5, entry: 0 }
    ],
    7: [
      { type: 'soldier', count: 12, interval: 0.45, delay: 0, entry: 0 },
      { type: 'tank', count: 1, interval: 1, delay: 6, entry: 0 }
    ],
    8: [
      { type: 'biker', count: 6, interval: 0.7, delay: 0, entry: 0 },
      { type: 'copter', count: 4, interval: 1.3, delay: 4, entry: 0 }
    ],
    9: [
      { type: 'soldier', count: 14, interval: 0.4, delay: 0, entry: 0 },
      { type: 'transport', count: 2, interval: 3, delay: 5, entry: 0 }
    ]
    // волна 10 — босс: генерируется WaveSystem автоматически
  },

  tips: 'Дорога фиксирована: ставьте башни на поворотах — там враги дольше всего под огнём.'
};

export default map_grasslands;
