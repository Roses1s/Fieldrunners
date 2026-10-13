/* ==========================================================================
   Motorcycle.js — мотоциклист. HP 30, скорость 96 px/с (самый быстрый
   наземный юнит), броня 1, награда $3. Пылит из-под колёс, на замедлении
   дымит сильнее.
   ========================================================================== */

import { Enemy, registerEnemy } from '../Enemy.js';
import { PT } from '../../systems/ParticleSystem.js';
import { randRange } from '../../utils/MathUtil.js';

export class Motorcycle extends Enemy {
  updateVfx(dt) {
    this._dust = (this._dust || 0) - dt;
    if (this._dust <= 0) {
      this._dust = 0.07;
      const back = this.angle + Math.PI;
      this.game.particles.emit(
        this.x + Math.cos(back) * 9, this.y + 5,
        Math.cos(back) * randRange(14, 40) + randRange(-8, 8),
        randRange(-22, -6),
        randRange(0.35, 0.6), randRange(2, 4),
        'rgba(214,196,158,0.6)', PT.SMOKE, 7, -8
      );
    }
  }
}

registerEnemy('biker', Motorcycle);
export default Motorcycle;
