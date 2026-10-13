/* ==========================================================================
   TowerData.js — таблица баланса башен.
   Числа выверены по публичным гайдам/вики жанра-первоисточника:
   цены в «долларах» маленькие ( Gatling $5, апгрейд $4 ), DPS растёт
   кратно к поздним башням ( Tesla 700/1400/2100 ), радиусы меряются
   в клетках сетки (2.5 клетки = 100 px при CELL = 40).
   ========================================================================== */

import { CELL, DAMAGE_TYPE, TARGET_MODE } from '../utils/Constants.js';

const R = (cells) => Math.round(cells * CELL);

/**
 * Поля:
 *  cost       — цена постройки
 *  upCost     — цена апгрейда до 2-го и 3-го уровня
 *  dmg        — урон за выстрел по уровням
 *  rate       — выстрелов в секунду по уровням
 *  range      — радиус в мировых px по уровням
 *  dps        — справочный DPS (для HUD)
 *  targets    — 'ground' | 'both'
 *  behavior   — класс поведения (регистрируется в TowerFactory)
 */
export const TOWER_DEFS = {
  gatling: {
    id: 'gatling',
    name: 'Гатлинг',
    en: 'Gatling',
    desc: 'Дешёвая пулемётная башня. Идеальна для стен-лабиринтов.',
    unlock: 0,
    cost: 5,
    upCost: [4, 4],
    dmg: [4.4, 7, 8.8],
    rate: [8, 10, 12],
    range: [R(2.5), R(2.6), R(2.7)],
    dps: [35, 70, 105],
    damageType: DAMAGE_TYPE.PHYSICAL,
    targets: 'ground',
    behavior: 'gatling',
    color: '#6f7a8c',
    accent: '#ffcf4d',
    arc: Math.PI * 2,      // круговой обстрел
    turnSpeed: 9,          // рад/с поворота турели
    spread: 0.06,          // разброс, рад
    recoil: 2.5,
    sfx: 'shot'
  },

  glue: {
    id: 'glue',
    name: 'Клеевая',
    en: 'Glue',
    desc: 'Замедляет одного врага. Дёшево и очень эффективно на поворотах.',
    unlock: 0,
    cost: 10,
    upCost: [5, 5],
    dmg: [0.5, 1, 2],
    rate: [1.1, 1.2, 1.3],
    range: [R(2.5), R(2.6), R(2.7)],
    dps: [1, 2, 3],
    slow: [0.4, 0.6, 0.75],
    slowTime: [2, 3, 4],
    splashTargets: [1, 3, 5],   // сколько врагов накрывает липкая волна
    splashRadius: [0, R(0.9), R(1.2)],
    damageType: DAMAGE_TYPE.CHEMICAL,
    targets: 'ground',
    behavior: 'glue',
    color: '#3fa9d8',
    accent: '#bff0ff',
    arc: Math.PI * 2,
    turnSpeed: 7,
    sfx: 'glue'
  },

  missile: {
    id: 'missile',
    name: 'Ракетная',
    en: 'Missile',
    desc: 'Самонаводящаяся ракета с уроном по площади. Бьёт и по воздуху.',
    unlock: 0,
    cost: 20,
    upCost: [15, 15],
    dmg: [60, 130, 220],
    rate: [0.85, 0.95, 1.05],
    range: [R(3.0), R(3.2), R(3.4)],
    dps: [51, 124, 231],
    splash: [R(0.8), R(1.0), R(1.25)],
    damageType: DAMAGE_TYPE.EXPLOSIVE,
    targets: 'both',
    behavior: 'missile',
    color: '#8a6f4f',
    accent: '#ff7a3c',
    arc: Math.PI * 2,
    turnSpeed: 5,
    projSpeed: 210,
    projTurn: 4.2,          // рад/с — поворот ракеты
    sfx: 'missile'
  },

  tesla: {
    id: 'tesla',
    name: 'Тесла',
    en: 'Tesla',
    desc: 'Цепная молния. Огромный урон по одной цели, пробивает броню.',
    unlock: 3,                 // открывается после 3 звёзд суммарно
    cost: 70,
    upCost: [50, 50],
    dmg: [350, 700, 1050],     // 2 разряда/с → 700/1400/2100 DPS
    rate: [2, 2, 2],
    range: [R(2.5), R(2.6), R(2.75)],
    dps: [700, 1400, 2100],
    chain: [2, 3, 4],          // сколько целей цепляет
    chainFalloff: 0.75,        // каждая следующая цель получает 75% урона
    chainRange: R(1.8),
    damageType: DAMAGE_TYPE.ELECTRIC,
    targets: 'both',
    behavior: 'tesla',
    color: '#5a6ea8',
    accent: '#9fe8ff',
    arc: Math.PI * 2,
    turnSpeed: 14,
    pierceArmor: 0.6,          // игнорирует 60% брони
    sfx: 'zap'
  },

  // ---- Заготовки под следующие шаги (данные уже выверены) ----
  flame: {
    id: 'flame', name: 'Пиро', en: 'Pyro',
    desc: 'Конус огня, накрывает всех вокруг. Отлично у входа.',
    unlock: 6, cost: 90, upCost: [70, 70],
    dmg: [183, 366, 550], rate: [2, 2, 2],
    range: [R(1.8), R(1.9), R(2.0)],
    dps: [366, 733, 1100],
    cone: [45, 55, 65], burnTime: 3, burnDps: [12, 24, 40],
    damageType: DAMAGE_TYPE.FIRE, targets: 'ground', behavior: 'flame',
    color: '#b3542f', accent: '#ff9b3d', arc: Math.PI * 2, turnSpeed: 6, sfx: 'flame'
  },
  laser: {
    id: 'laser', name: 'Лазер', en: 'Laser',
    desc: 'Непрерывный луч, пробивает всех на линии. Урон нарастает.',
    unlock: 9, cost: 40, upCost: [30, 30],
    dmg: [25, 50, 90], rate: [5, 5, 5],
    range: [R(3.2), R(3.4), R(3.6)],
    dps: [125, 250, 450],
    rampPerSec: 0.05, rampMax: 2,
    damageType: DAMAGE_TYPE.ENERGY, targets: 'both', behavior: 'laser',
    color: '#7a4fa8', accent: '#ff5ad1', arc: Math.PI * 2, turnSpeed: 8, sfx: 'laser'
  },
  hive: {
    id: 'hive', name: 'Улей', en: 'Hive',
    desc: 'Рой пчёл: групповой урон по площади, достает воздушные цели.',
    unlock: 12, cost: 30, upCost: [20, 20],
    dmg: [53, 64, 60], rate: [1, 1, 1],
    range: [R(3.0), R(3.2), R(3.4)],
    dps: [160, 320, 480],
    bees: [3, 5, 8],
    damageType: DAMAGE_TYPE.PHYSICAL, targets: 'both', behavior: 'hive',
    color: '#c9a227', accent: '#ffe66d', arc: Math.PI * 2, turnSpeed: 5, sfx: 'bee'
  },
  nuke: {
    id: 'nuke', name: 'Ядерная', en: 'Nuke',
    desc: 'Огромный взрыв с «пустым» центром. Перезаряжается очень долго.',
    unlock: 16, cost: 120, upCost: [90, 90],
    dmg: [280, 560, 840], rate: [0.2, 0.25, 0.3],
    range: [R(3.5), R(3.6), R(3.75)],
    splash: [R(2.0), R(2.5), R(3.25)],
    innerGap: [R(0.6), R(0.7), R(0.8)],
    damageType: DAMAGE_TYPE.EXPLOSIVE, targets: 'both', behavior: 'nuke',
    color: '#4d5a3a', accent: '#c6ff4f', arc: Math.PI * 2, turnSpeed: 3,
    shake: 8, sfx: 'nuke'
  }
};

/** Порядок башен в радиальном меню (только доступные на карте) */
export const BUILD_ORDER = ['gatling', 'glue', 'missile', 'tesla', 'flame', 'laser', 'hive', 'nuke'];

/** Башни, доступные в прототипе (Шаги 1–7) */
export const PROTOTYPE_TOWERS = ['gatling', 'glue', 'missile', 'tesla'];

export function towerDef(id) {
  return TOWER_DEFS[id];
}

/** Суммарная стоимость башни уровня lvl (1..3) */
export function towerTotalCost(id, lvl) {
  const d = TOWER_DEFS[id];
  let sum = d.cost;
  for (let i = 0; i < lvl - 1; i++) sum += d.upCost[i];
  return sum;
}

export default { TOWER_DEFS, BUILD_ORDER, PROTOTYPE_TOWERS, towerDef, towerTotalCost };
