/* ==========================================================================
   enemies/index.js — импорт всех подклассов врагов (они саморегистрируются)
   и единая фабрика создания.
   ========================================================================== */

import { createEnemyHere, enemySupported, registerEnemy } from '../Enemy.js';

import './Soldier.js';
import './FastRunner.js';
import './Motorcycle.js';
import './Helicopter.js';
import './HeavyArmor.js';
import './Transport.js';
import './Boss.js';

/**
 * Создать врага.
 * @param {GameScene} game
 * @param {object} def — запись из ENEMY_DEFS
 * @param {number} entryIdx — индекс точки входа
 * @param {number} wave — номер волны (для масштабирования HP/брони)
 * @param {object} mods — { hpMul, armorMul, speedMul, isBoss }
 */
export function createEnemy(game, def, entryIdx, wave, mods) {
  return createEnemyHere(game, def, entryIdx, wave, mods || {});
}

export { enemySupported, registerEnemy };
export default createEnemy;
