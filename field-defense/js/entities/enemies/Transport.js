/* ==========================================================================
   Transport.js — бронетранспортёр. HP 210, скорость 34 px/с, броня 4,
   иммунитет к замедлению. Главная особенность: при уничтожении высаживает
   4 пехотинцев (def.onDeath) — поэтому его нужно выбивать как можно раньше,
   иначе десант оказывается уже у выхода.
   ========================================================================== */

import { Enemy, registerEnemy } from '../Enemy.js';
import { PT } from '../../systems/ParticleSystem.js';
import { randRange } from '../../utils/MathUtil.js';

export class Transport extends Enemy {
  updateVfx(dt) {
    this._dust = (this._dust || 0) - dt;
    if (this._dust <= 0) {
      this._dust = 0.12;
      const back = this.angle + Math.PI;
      this.game.particles.emit(
        this.x + Math.cos(back) * 14, this.y + 6,
        Math.cos(back) * randRange(8, 22), randRange(-20, -5),
        randRange(0.4, 0.75), randRange(2.6, 5),
        'rgba(210,192,156,0.55)', PT.SMOKE, 7, -6
      );
    }
    if (this.hp < this.maxHp * 0.45 && Math.random() < dt * 20) {
      this.game.particles.emit(
        this.x + randRange(-8, 8), this.y - 12,
        randRange(-6, 6), randRange(-32, -16),
        randRange(0.5, 1), randRange(2.4, 4.6),
        'rgba(55,55,55,0.5)', PT.SMOKE, 7, -12
      );
    }
  }

  /** Мигающий предупреждающий знак «десант» над кузовом */
  renderExtra(g, frame, flip, s, drawY) {
    void frame; void flip;
    const a = 0.35 + 0.35 * Math.sin(this.animT * 6);
    g.save();
    g.globalAlpha = a;
    g.fillStyle = '#ffd23f';
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 1.2;
    const x = this.x, y = drawY - 18 * s;
    g.beginPath();
    g.moveTo(x, y - 5);
    g.lineTo(x + 5, y + 4);
    g.lineTo(x - 5, y + 4);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#2b2b33';
    g.fillRect(x - 0.7, y - 2, 1.4, 4);
    g.fillRect(x - 0.7, y + 2.4, 1.4, 1.4);
    g.restore();
  }
}

registerEnemy('transport', Transport);
export default Transport;
