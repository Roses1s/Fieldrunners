/* ==========================================================================
   HeavyArmor.js — тяжёлый танк. HP 165, скорость 26 px/с, броня 6,
   награда $8, стоит 2 жизни. Иммунитет к замедлению (slowImmune) —
   клеевая башня по нему бесполезна, нужен чистый урон.
   ========================================================================== */

import { Enemy, registerEnemy } from '../Enemy.js';
import { PT } from '../../systems/ParticleSystem.js';
import { randRange } from '../../utils/MathUtil.js';

export class HeavyArmor extends Enemy {
  updateVfx(dt) {
    // выхлоп и пыль из-под гусениц
    this._dust = (this._dust || 0) - dt;
    if (this._dust <= 0) {
      this._dust = 0.14;
      const back = this.angle + Math.PI;
      this.game.particles.emit(
        this.x + Math.cos(back) * 12, this.y + 6,
        Math.cos(back) * randRange(6, 18), randRange(-18, -4),
        randRange(0.4, 0.7), randRange(2.4, 4.6),
        'rgba(206,188,152,0.55)', PT.SMOKE, 6, -6
      );
      if (Math.random() < 0.4) {
        this.game.particles.emit(
          this.x + Math.cos(back) * 8, this.y - 8,
          Math.cos(back) * 8, -14,
          0.5, 2.2, 'rgba(70,70,70,0.45)', PT.SMOKE, 5, -12
        );
      }
    }
    // дым при критических повреждениях
    if (this.hp < this.maxHp * 0.4 && Math.random() < dt * 16) {
      this.game.particles.emit(
        this.x + randRange(-6, 6), this.y - 14,
        randRange(-6, 6), randRange(-30, -14),
        randRange(0.6, 1.1), randRange(2.5, 5),
        'rgba(50,50,50,0.5)', PT.SMOKE, 7, -12
      );
    }
  }
}

registerEnemy('tank', HeavyArmor);
export default HeavyArmor;
