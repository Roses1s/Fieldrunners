/* ==========================================================================
   map_city.js — карта 4 «Мёртвый город» (maze-building, максимальная сложность).

   Сетка 26×15, городской биом. Фиксированной дороги нет: враги идут
   кратчайшим маршрутом, который пересчитывается после каждой башни.
   Кварталы-руины задают каркас, между ними — коридоры шириной в одну-две
   клетки, из которых и собирается лабиринт.

   Два входа (слева и сверху) при одном выходе: давить приходится два
   направления сразу, зато длинный общий коридор у выхода кормит DPS-башни.
   ========================================================================== */

export const map_city = {
  id: 'city',
  name: 'Мёртвый город',
  en: 'Dead City',
  biome: 'city',
  mode: 'maze',
  maze: true,
  cols: 26,
  rows: 15,
  seed: 903417,

  startMoney: 190,
  lives: 20,
  waves: 20,
  firstBreak: 40,          // лабиринт на 26×15 требует времени на застройку
  difficulty: 1.2,

  entries: [[0, 7], [13, 0]],
  exits: [[25, 7]],

  // Кварталы-руины: непроходимые и незастраиваемые прямоугольники
  zones: [
    { x: 3, y: 2, w: 3, h: 3, kind: 'rock' },
    { x: 3, y: 10, w: 3, h: 3, kind: 'rock' },
    { x: 9, y: 2, w: 3, h: 4, kind: 'rock' },
    { x: 9, y: 10, w: 3, h: 3, kind: 'rock' },
    { x: 15, y: 3, w: 4, h: 3, kind: 'rock' },
    { x: 15, y: 9, w: 4, h: 3, kind: 'rock' },
    { x: 21, y: 2, w: 2, h: 4, kind: 'rock' },
    { x: 21, y: 10, w: 2, h: 3, kind: 'rock' }
  ],

  decor: [
    // уцелевшие здания по краям карты
    { cx: 1, cy: 1, type: 'building.0' },
    { cx: 6, cy: 13, type: 'building.1' },
    { cx: 24, cy: 1, type: 'building.2' },
    { cx: 24, cy: 13, type: 'building.0' },
    { cx: 13, cy: 13, type: 'building.1' },
    // обломки и бочки в коридорах
    { cx: 7, cy: 7, type: 'rock' },
    { cx: 13, cy: 7, type: 'barrel' },
    { cx: 19, cy: 7, type: 'barrel' },
    { cx: 2, cy: 12, type: 'rock' },
    { cx: 12, cy: 2, type: 'rock' },
    { cx: 20, cy: 12, type: 'rock' },
    { cx: 17, cy: 1, type: 'barrel' },
    { cx: 8, cy: 12, type: 'barrel' }
  ],

  // Первые волны — только левый вход, чтобы игрок успел заложить каркас
  waveOverrides: {
    1: [
      { type: 'soldier', count: 8, interval: 0.8, delay: 0, entry: 0 }
    ],
    2: [
      { type: 'soldier', count: 8, interval: 0.65, delay: 0, entry: 0 },
      { type: 'runner', count: 5, interval: 0.45, delay: 4, entry: 1 }
    ],
    3: [
      { type: 'biker', count: 5, interval: 0.9, delay: 0, entry: 1 },
      { type: 'soldier', count: 10, interval: 0.55, delay: 2, entry: 0 }
    ]
  },

  tips: 'Два входа и один выход. Стройте лабиринт так, чтобы оба потока сливались в общий длинный коридор — там и ставьте ударные башни.'
};

export default map_city;
