/* ==========================================================================
   EconomySystem.js — деньги, награды, бонусы, продажа.
   Валюта боя — «доллары» ($). Отдельная мета-валюта (монеты/звёзды)
   живёт в SaveSystem и тратится на открытие башен и карт.
   ========================================================================== */

import { CONFIG } from '../utils/Constants.js';
import { towerTotalCost } from '../data/TowerData.js';

export class EconomySystem {
  constructor(game, mapDef) {
    this.game = game;
    this.mapDef = mapDef;
    this.money = mapDef.startMoney ?? CONFIG.START_MONEY;
    this.lives = mapDef.lives ?? CONFIG.START_LIVES;
    this.maxLives = this.lives;
    this.leaks = 0;          // сколько врагов дошло до выхода (для звёзд)
    this.kills = 0;
    this.earned = 0;         // всего заработано за бой
    this.spent = 0;          // всего потрачено
    this.score = 0;
    this.combo = 0;          // серия убийств без протечек
    this.comboTimer = 0;
    this.pulse = 0;          // анимация изменения баланса (для HUD)
    this.pulseDir = 1;
    this.floaters = [];      // всплывающие тексты +N
  }

  get gameOver() { return this.lives <= 0; }

  canAfford(v) { return this.money >= v; }

  add(amount, opts) {
    if (!amount) return;
    this.money += amount;
    if (amount > 0) this.earned += amount;
    this.pulse = 1;
    this.pulseDir = amount > 0 ? 1 : -1;
    if (opts?.float && opts.x !== undefined) {
      this.spawnFloater(opts.x, opts.y, (amount > 0 ? '+' : '') + Math.round(amount), amount > 0 ? '#ffd23f' : '#ff8a8a');
    }
  }

  spend(amount) {
    if (amount > this.money) return false;
    this.money -= amount;
    this.spent += amount;
    this.pulse = 1;
    this.pulseDir = -1;
    return true;
  }

  /** Награда за убийство: базовая награда + бонус за волну + комбо */
  killReward(def, wave, x, y) {
    const base = def.reward || 1;
    const waveBonus = 1 + Math.max(0, (wave - 1)) * 0.04;
    this.combo++;
    this.comboTimer = 3;
    const comboBonus = 1 + Math.min(this.combo, 50) * 0.01;
    const total = Math.max(1, Math.round(base * waveBonus * comboBonus));
    this.add(total, { float: true, x, y });
    this.score += total * 10 + (def.isBoss ? 500 : 0);
    return total;
  }

  /** Бонус за зачистку волны */
  waveBonus(wave) {
    const b = 8 + wave * 3;
    this.add(b);
    return b;
  }

  /** Бонус за досрочный вызов волны */
  earlyBonus(seconds) {
    const b = Math.max(0, Math.floor(seconds * CONFIG.EARLY_SEND_RATIO));
    if (b > 0) this.add(b);
    return b;
  }

  /** Потеря жизни */
  leak(cost, x, y) {
    this.lives = Math.max(0, this.lives - cost);
    this.leaks += 1;
    this.combo = 0;
    this.pulse = 1;
    this.pulseDir = -1;
    this.spawnFloater(x, y, '-' + cost + ' ♥', '#ff6b6b');
    return this.lives;
  }

  /** Цена продажи: 75% от вложенного */
  sellPrice(tower) {
    return Math.floor(tower.invested * CONFIG.SELL_RATIO);
  }

  /** Цена постройки/апгрейда */
  buildCost(id) { return towerTotalCost(id, 1); }
  upgradeCost(tower) {
    const d = tower.def;
    return tower.level >= 3 ? Infinity : d.upCost[tower.level - 1];
  }

  spawnFloater(x, y, text, color) {
    this.game?.texts?.spawn(x, y, text, color || '#ffd23f');
  }

  update(dt) {
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 3);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
  }
}

export default EconomySystem;
