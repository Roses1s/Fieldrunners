/* ==========================================================================
   EnemyData.js — таблица баланса врагов.
   HP масштабируется по волнам: maxHP = baseHP * 1.15^(wave-1)
   Урон по броне: actual = max(1, dmg - armor)  (Тесла пробивает 60% брони)
   ========================================================================== */

export const ENEMY_DEFS = {
  soldier: {
    id: 'soldier',
    name: 'Пехотинец',
    en: 'Grunt',
    hp: 20,
    speed: 42,          // px/с
    armor: 0,
    reward: 2,
    livesCost: 1,
    radius: 9,
    flying: false,
    frames: 6,
    scale: 1,
    tint: '#4f8f3a',
    behavior: 'soldier',
    desc: 'Базовая пехота. Идёт толпами, дёшево стоит.'
  },

  runner: {
    id: 'runner',
    name: 'Бегун',
    en: 'Runner',
    hp: 12,
    speed: 84,
    armor: 0,
    reward: 2,
    livesCost: 1,
    radius: 8,
    flying: false,
    frames: 6,
    scale: 0.92,
    tint: '#d84a3a',
    behavior: 'runner',
    desc: 'Очень быстрый, но хрупкий. Опасен на длинных прямых.'
  },

  biker: {
    id: 'biker',
    name: 'Байкер',
    en: 'Biker',
    hp: 30,
    speed: 96,
    armor: 1,
    reward: 3,
    livesCost: 1,
    radius: 10,
    flying: false,
    frames: 4,
    scale: 1.02,
    tint: '#c8862a',
    behavior: 'biker',
    desc: 'Мотоцикл: максимальная скорость, пылит на поворотах.'
  },

  copter: {
    id: 'copter',
    name: 'Вертолёт',
    en: 'Copter',
    hp: 55,
    speed: 62,
    armor: 0,
    reward: 4,
    livesCost: 1,
    radius: 12,
    flying: true,
    frames: 1,
    scale: 1.1,
    tint: '#4a6fa5',
    behavior: 'copter',
    desc: 'Летит по прямой, игнорируя лабиринт. Нужны башни ПВО.'
  },

  tank: {
    id: 'tank',
    name: 'Танк',
    en: 'Tank',
    hp: 165,
    speed: 26,
    armor: 6,
    reward: 8,
    livesCost: 2,
    radius: 14,
    flying: false,
    frames: 4,
    scale: 1.28,
    tint: '#5c6b45',
    behavior: 'tank',
    slowImmune: true,
    desc: 'Тяжёлая броня и иммунитет к замедлению. Гатлинг его почти не берёт.'
  },

  transport: {
    id: 'transport',
    name: 'Транспорт',
    en: 'Transport',
    hp: 210,
    speed: 34,
    armor: 4,
    reward: 6,
    livesCost: 2,
    radius: 14,
    flying: false,
    frames: 4,
    scale: 1.32,
    tint: '#7a6a4a',
    behavior: 'transport',
    slowImmune: true,
    // После уничтожения высаживает десант (аутентичная механика жанра)
    onDeath: { spawn: 'soldier', count: 4, spread: 8 },
    desc: 'Броневик: при уничтожении высаживает 4 пехотинцев.'
  },

  boss: {
    id: 'boss',
    name: 'Осадный мех',
    en: 'Siege Mech',
    hp: 600,
    speed: 21,
    armor: 10,
    reward: 60,
    livesCost: 5,
    radius: 26,
    flying: false,
    frames: 6,
    scale: 2.0,
    sizeCells: 2,
    tint: '#6b3f52',
    behavior: 'boss',
    slowImmune: true,
    regen: 0.01,           // 1% HP в секунду
    isBoss: true,
    desc: 'Босс каждые 10 волн: огромный, регенерирует, стоит 5 жизней.'
  }
};

/** Композиции волн: какие типы и в каком весе появляются по диапазонам волн.
 *  Формат: [тип, вес, минВолна, максВолна] */
export const WAVE_MIX = [
  ['soldier', 1.00, 1, 99],
  ['runner', 0.45, 2, 99],
  ['biker', 0.35, 4, 99],
  ['copter', 0.30, 5, 99],
  ['tank', 0.26, 7, 99],
  ['transport', 0.22, 9, 99]
];

export function enemyDef(id) {
  return ENEMY_DEFS[id];
}

/** HP врага на конкретной волне */
export function hpForWave(baseHp, wave, scale = 1.15) {
  return baseHp * Math.pow(scale, wave - 1);
}

export default { ENEMY_DEFS, WAVE_MIX, enemyDef, hpForWave };
