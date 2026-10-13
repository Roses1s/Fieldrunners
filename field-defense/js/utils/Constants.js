/* ==========================================================================
   Constants.js — глобальные константы и настройки игры
   Все числовые значения баланса вынесены сюда / в data/*.js, чтобы их можно
   было править в одном месте.
   ========================================================================== */

// Размер одной ячейки сетки в мировых пикселях (масштабируется камерой)
export const CELL = 40;

// Типы ячеек сетки
export const TILE = {
  EMPTY: 0,    // можно строить
  PATH: 1,     // дорога врагов (строить нельзя на картах с фикс. путём)
  BLOCKED: 2,  // декорации / непроходимое (строить нельзя)
  TOWER: 3,    // занято башней
  ENTRY: 4,    // точка входа врагов
  EXIT: 5      // точка выхода (что защищаем)
};

// Слои отрисовки (порядок важен)
export const LAYER = {
  TERRAIN: 0,
  SHADOW: 1,
  GROUND: 2,
  UNIT: 3,
  AIR: 4,
  FX: 5,
  HUD: 6
};

// Режимы выбора цели башней
export const TARGET_MODE = {
  FIRST: 'first',          // дальше всех продвинулся к выходу
  LAST: 'last',            // ближе всех к входу
  STRONGEST: 'strongest',  // максимум текущего HP
  WEAKEST: 'weakest',      // минимум текущего HP
  CLOSEST: 'closest'       // ближайший к башне
};

export const TARGET_MODES = [
  TARGET_MODE.FIRST,
  TARGET_MODE.LAST,
  TARGET_MODE.STRONGEST,
  TARGET_MODE.WEAKEST,
  TARGET_MODE.CLOSEST
];

// Типы урона (используются для сопротивлений и подсветки в UI)
export const DAMAGE_TYPE = {
  PHYSICAL: 'physical',
  EXPLOSIVE: 'explosive',
  ELECTRIC: 'electric',
  FIRE: 'fire',
  CHEMICAL: 'chemical',
  ENERGY: 'energy'
};

// Технические настройки
export const CONFIG = {
  // Фиксированный шаг симуляции (1/60 с) — логика не зависит от FPS рендера
  FIXED_DT: 1 / 60,
  MAX_STEPS_PER_FRAME: 5,

  // Максимальный devicePixelRatio (A56 имеет DPR ~2.6 — ограничиваем ради FPS)
  MAX_DPR: 2,

  // Зум камеры относительно «вписывания карты в экран»
  MIN_ZOOM: 0.6,
  MAX_ZOOM: 2.6,

  // Экономика
  START_MONEY: 100,
  START_LIVES: 20,
  SELL_RATIO: 0.75,           // 75% от вложенного
  EARLY_SEND_RATIO: 0.5,      // монет за каждую оставшуюся секунду
  WAVE_BREAK_TIME: 15,        // пауза между волнами, с
  TOTAL_WAVES: 20,

  // Прогрессия сложности
  HP_SCALE_PER_WAVE: 1.15,    // HP врага *= 1.15^(wave-1)
  COUNT_SCALE_PER_WAVE: 1.1,  // количество *= 1.1^(wave-1) (для бесконечного режима)
  ARMOR_SCALE_PER_WAVE: 1.06,

  // Жизни
  BOSS_LIVES_COST: 5,
  DEFAULT_LIVES_COST: 1,

  // Звёзды за прохождение
  STAR_PERFECT_MAX_LEAKS: 0,
  STAR_GOOD_MAX_LEAKS: 5,

  // Производительность
  PARTICLE_POOL: 900,
  PROJECTILE_POOL: 400,
  EFFECT_POOL: 220,
  TEXT_POOL: 140,
  SPATIAL_CELL: 64,

  // «Батарейный» режим: при неактивности режем FPS до 30
  IDLE_DELAY: 25,             // секунд без ввода
  IDLE_FPS: 30,

  // Скорости игры
  SPEEDS: [1, 2, 3],

  // Биомы → палитры тайлов
  PALETTES: {
    grass: {
      ground: ['#83d154', '#74c945', '#8ed95e', '#7ac94c'],
      groundDark: '#4f9536',
      path: '#e0aa5e',
      pathEdge: '#a97c42',
      pathSpeck: '#c1914f',
      fog: 'rgba(255,255,255,0.04)'
    },
    desert: {
      ground: ['#f0d795', '#e6cc82', '#f5e0a4', '#ecd08a'],
      groundDark: '#b99f5f',
      path: '#d9ad67',
      pathEdge: '#a3803f',
      pathSpeck: '#b9954f',
      fog: 'rgba(255,220,160,0.05)'
    },
    lava: {
      ground: ['#4a4550', '#423d49', '#524c58', '#3b3742'],
      groundDark: '#2a2730',
      path: '#6b6470',
      pathEdge: '#3a3540',
      pathSpeck: '#7d7585',
      fog: 'rgba(255,90,40,0.05)'
    },
    city: {
      ground: ['#8e9aa6', '#86929e', '#96a2ae', '#7f8b97'],
      groundDark: '#5d6773',
      path: '#585f6b',
      pathEdge: '#3c424c',
      pathSpeck: '#6a7280',
      fog: 'rgba(255,255,255,0.03)'
    }
  },

  // Общая палитра UI
  UI: {
    panel: 'rgba(26, 21, 16, 0.93)',
    panelStroke: 'rgba(255, 205, 120, 0.55)',
    accent: '#ffd23f',
    accent2: '#7fe0ff',
    text: '#fdf6e3',
    dim: 'rgba(253, 246, 227, 0.55)',
    danger: '#ff5a5a',
    ok: '#6ee36e',
    button: '#4c3a22',
    buttonHi: '#6b532f',
    buttonDisabled: '#2c2620'
  }
};

// Ключ localStorage
export const SAVE_KEY = 'field-defense-save-v1';

/** Сложности карты: HP врагов и награды (очки растут вместе с наградой за убийства) */
export const DIFFICULTIES = {
  casual: { id: 'casual', name: 'Лёгкая', hpMul: 0.85, rewardMul: 0.85 },
  tough: { id: 'tough', name: 'Тяжёлая', hpMul: 1.0, rewardMul: 1.0 },
  heroic: { id: 'heroic', name: 'Героическая', hpMul: 1.30, rewardMul: 1.30 }
};
export const DIFFICULTY_ORDER = ['casual', 'tough', 'heroic'];

export default { CELL, TILE, CONFIG, TARGET_MODE, TARGET_MODES, DAMAGE_TYPE, SAVE_KEY, DIFFICULTIES, DIFFICULTY_ORDER };
