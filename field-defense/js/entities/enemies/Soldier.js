/* ==========================================================================
   Soldier.js — пехотинец (Grunt). HP 20, скорость 42 px/с, награда $2.
   Базовое поведение, лёгкая пыльца из-под ботинок при ходьбе.
   ========================================================================== */

import { Enemy, registerEnemy } from '../Enemy.js';
import { PT } from '../../systems/ParticleSystem.js';

export class Soldier extends Enemy {
  updateVfx(dt) {
    // пыль при ходьбе (только на земле и на скорости)
    if (this.flying || this.slowPct > 0.5) return;
    this._dust = (this._dust || 0) - dt;
    if (this._dust <= 0) {
      this._dust = 0.26;
      this.game.particles.emit(
        this.x - Math.cos(this.angle) * 4, this.y + this.radius * 0.45,
        -Math.cos(this.angle) * 8, -6,
        0.4, 1.6, 'rgba(210,190,150,0.55)', PT.SMOKE, 3, -4
      );
    }
  }
}

registerEnemy('soldier', Soldier);
export default Soldier;
