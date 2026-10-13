/* ==========================================================================
   map_desert.js — карта 2 «Песчаный карьер» (maze-building).

   Сетка 24×14, пустыня. Фиксированной дороги НЕТ: враги идут кратчайшим
   маршрутом, который пересчитывается после каждой построенной башни.
   Игрок сам строит лабиринт — классический barrage-геймплей.
   Скальные зоны задают «каркас», вокруг которого удобно вить maze.
   ========================================================================== */

export const map_desert = {
  id: 'desert',
  name: 'Песчаный карьер',
  en: 'Sand Quarry',
  biome: 'desert',
  mode: 'maze',
  maze: true,
  cols: 24,
  rows: 14,
  seed: 771203,

  startMoney: 160,
  lives: 20,
  waves: 20,
  firstBreak: 35,          // на постройку лабиринта нужно больше времени
  difficulty: 1.05,

  entries: [[0, 7]],
  exits: [[23, 6]],

  // Скальные массивы: строить нельзя, враги обходят
  zones: [
    { x: 5, y: 2, w: 2, h: 4, kind: 'rock' },
    { x: 5, y: 9, w: 2, h: 4, kind: 'rock' },
    { x: 11, y: 5, w: 2, h: 5, kind: 'rock' },
    { x: 17, y: 1, w: 2, h: 4, kind: 'rock' },
    { x: 17, y: 10, w: 2, h: 3, kind: 'rock' }
  ],

  decor: [
    { cx: 2, cy: 2, type: 'cactus' },
    { cx: 3, cy: 11, type: 'cactus' },
    { cx: 9, cy: 1, type: 'cactus' },
    { cx: 14, cy: 12, type: 'cactus' },
    { cx: 20, cy: 6, type: 'cactus' },
    { cx: 21, cy: 2, type: 'rock' },
    { cx: 8, cy: 12, type: 'rock' },
    { cx: 15, cy: 1, type: 'rock' },
    { cx: 1, cy: 5, type: 'bush' },
    { cx: 22, cy: 11, type: 'bush' },
    { cx: 12, cy: 1, type: 'barrel' },
    { cx: 13, cy: 12, type: 'barrel' }
  ],

  tips: 'Дороги нет: стройте лабиринт башнями. Нельзя полностью перекрыть путь — игра не даст.'
};

export default map_desert;
