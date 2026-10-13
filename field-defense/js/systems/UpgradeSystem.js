/* ==========================================================================
   UpgradeSystem.js — улучшение и продажа башен, смена режима прицеливания.
   Все проверки экономики и пути — здесь, чтобы GameScene не толстел.
   ========================================================================== */

import { CONFIG, TARGET_MODES } from '../utils/Constants.js';
import { TOWER_DEFS } from '../data/TowerData.js';

export class UpgradeSystem {
  constructor(game) {
    this.game = game;
  }

  canUpgrade(tower) {
    if (!tower || tower.level >= 3) return false;
    return this.game.economy.money >= this.upgradeCost(tower);
  }

  upgradeCost(tower) {
    if (!tower || tower.level >= 3) return Infinity;
    return tower.def.upCost[tower.level - 1];
  }

  /** Улучшить башню. Возвращает true при успехе. */
  upgrade(tower) {
    if (!this.canUpgrade(tower)) return false;
    const cost = this.upgradeCost(tower);
    if (!this.game.economy.spend(cost)) return false;

    tower.level++;
    tower.invested += cost;
    tower.applyLevel();
    tower.buildAnim = 1;              // короткая вспышка «прокачки»

    this.game.audio?.play('upgrade');
    this.game.particles?.burst(tower.x, tower.y - 6, {
      count: 16, color: '#ffd23f', speed: [30, 90], life: [0.35, 0.7], size: [1.5, 3.2], gravity: -20
    });
    this.game.texts?.spawn(tower.x, tower.y - 26, 'УРОВЕНЬ ' + tower.level, '#ffd23f');
    return true;
  }

  /** Продать башню: 75% от вложенного, клетка освобождается, путь пересчитывается */
  sell(tower) {
    if (!tower) return 0;
    const price = Math.floor(tower.invested * CONFIG.SELL_RATIO);
    this.game.removeTower(tower);
    this.game.economy.add(price);
    this.game.audio?.play('sell');
    this.game.texts?.spawn(tower.x, tower.y - 22, '+$' + price, '#6ee36e');
    this.game.particles?.burst(tower.x, tower.y, {
      count: 18, color: '#c3ccd8', speed: [20, 80], life: [0.3, 0.6], size: [1.5, 3], gravity: 120
    });
    return price;
  }

  /** Переключить режим выбора цели по кругу */
  cycleTargetMode(tower) {
    if (!tower) return;
    const i = TARGET_MODES.indexOf(tower.targetMode);
    tower.targetMode = TARGET_MODES[(i + 1) % TARGET_MODES.length];
    this.game.audio?.play('ui');
  }

  /** Суммарная стоимость башни (для UI) */
  static totalInvested(id, level) {
    const d = TOWER_DEFS[id];
    let sum = d.cost;
    for (let i = 0; i < level - 1; i++) sum += d.upCost[i];
    return sum;
  }
}

export default UpgradeSystem;
