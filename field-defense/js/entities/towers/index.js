/* ==========================================================================
   towers/index.js — импорт всех подклассов (регистрируют себя в фабрике)
   и единая точка создания башен. Добавляете новую башню — добавьте сюда
   одну строку import и одну строку в список.
   ========================================================================== */

import { createTowerHere, towerSupported, registerTower } from '../Tower.js';

import './GatlingTower.js';
import './GlueTower.js';
import './MissileTower.js';
import './TeslaTower.js';
import './FlameTower.js';
import './LaserTower.js';
import './HiveTower.js';
import './NukeTower.js';

/** Создать башню по определению из TOWER_DEFS */
export function createTower(game, def, cx, cy) {
  return createTowerHere(game, def, cx, cy);
}

export { towerSupported, registerTower };
export default createTower;
