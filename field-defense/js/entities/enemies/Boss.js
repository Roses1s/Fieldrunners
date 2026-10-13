/* ==========================================================================
   Boss.js — «Осадный мех». Появляется каждые 10 волн, занимает визуально
   2×2 клетки, HP = 600 × 1.15^(wave-1) × номер босса, броня 10,
   регенерация 1% HP/с, стоит 5 жизней, награда $60.

   Особенности отрисовки: тяжёлая поступь (тряска камеры на каждом шаге),
   аура регенерации, увеличенная полоса HP с именем.
   ========================================================================== */

import { Enemy, registerEnemy } from '../Enemy.js';
import { PT } from '../../systems/ParticleSystem.js';
import { randRange, clamp } from '../../utils/MathUtil.js';
import { Draw } from '../../utils/Draw.js';

export class Boss extends Enemy {
  constructor(...args) {
    super(...args);
    this.stepPhase = 0;
    this.invuln = 0.35;      // короткая неуязвимость при появлении
  }

  updateVfx(dt) {
    // поступь: на каждом «шаге» — пыль и лёгкая тряска
    this.stepPhase += dt * (this.speed / 26);
    if (this.stepPhase >= 1) {
      this.stepPhase -= 1;
      this.game.camera?.shake(2.4, 0.16);
      this.game.particles.burst(this.x + randRange(-14, 14), this.y + 16, {
        count: 10, colors: ['rgba(190,175,145,0.6)', 'rgba(140,130,110,0.5)'],
        speed: [10, 45], life: [0.4, 0.8], size: [2.5, 5.5],
        gravity: -6, drag: 2, type: PT.SMOKE
      });
    }

    // аура регенерации
    if (this.hp < this.maxHp && Math.random() < dt * 10) {
      const a = randRange(0, Math.PI * 2);
      const r = randRange(16, 26);
      this.game.particles.emit(
        this.x + Math.cos(a) * r, this.y + Math.sin(a) * r * 0.5 - 6,
        0, -22, 0.6, 2.2, 'rgba(120,255,160,0.7)', PT.DOT, -1, 0
      );
    }
  }

  renderExtra(g, frame, flip, s, drawY) {
    void frame; void flip;
    // пульсирующее кольцо под боссом
    const p = 0.5 + 0.5 * Math.sin(this.animT * 3);
    g.save();
    g.globalAlpha = 0.18 + p * 0.16;
    g.strokeStyle = '#ff5a5a';
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(this.x, this.y + 12, 30 + p * 4, 12 + p * 2, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();

    // полоса регенерации (тонкая, зелёная, под основной)
    if (this.hp < this.maxHp) {
      const w = 58, x = this.x - w / 2, y = drawY - this.radius * s - 30;
      g.save();
      g.globalAlpha = 0.85;
      Draw.bar(g, x, y, w, 3.5, clamp(this.hp / this.maxHp, 0, 1), {
        fill: '#6ee36e', border: false, bg: 'rgba(0,0,0,0.45)'
      });
      g.restore();
    }
    void s;
  }
}

registerEnemy('boss', Boss);
export default Boss;
