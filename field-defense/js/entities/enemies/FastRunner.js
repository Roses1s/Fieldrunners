/* ==========================================================================
   FastRunner.js — быстрый бегун. HP 12, скорость 84 px/с (вдвое быстрее
   пехоты), награда $2. Оставляет «след скорости», из-за чего визуально
   читается как угроза на длинных прямых.
   ========================================================================== */

import { Enemy, registerEnemy } from '../Enemy.js';
import { PT } from '../../systems/ParticleSystem.js';

export class FastRunner extends Enemy {
  updateVfx(dt) {
    this._trail = (this._trail || 0) - dt;
    if (this._trail <= 0) {
      this._trail = 0.045;
      const g = this.game;
      g.particles.emit(
        this.x - Math.cos(this.angle) * 6, this.y - 4 - this.altitude,
        -Math.cos(this.angle) * 26, -Math.sin(this.angle) * 12,
        0.26, 2.2, 'rgba(255,140,110,0.5)', PT.SMOKE, 4, 0
      );
      g.particles.emit(
        this.x - Math.cos(this.angle) * 4, this.y + this.radius * 0.4,
        -Math.cos(this.angle) * 16, -4,
        0.3, 1.5, 'rgba(220,200,160,0.5)', PT.SMOKE, 4, -4
      );
      void PT;
    }
  }
}

registerEnemy('runner', FastRunner);
export default FastRunner;
