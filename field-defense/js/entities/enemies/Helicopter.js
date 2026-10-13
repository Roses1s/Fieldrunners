/* ==========================================================================
   Helicopter.js — вертолёт. ВОЗДУШНАЯ цель: игнорирует лабиринт и летит
   по прямой от входа к выходу, башни без ПВО (targets: 'ground') его не
   видят. HP 55, скорость 62 px/с, награда $4.

   Визуал: тень на земле, вращающийся несущий винт (рисуется в рантайме —
   так получается плавное вращение без кадров), хвостовой винт, дым при
   падении на низком HP.
   ========================================================================== */

import { Enemy, registerEnemy } from '../Enemy.js';
import { PT } from '../../systems/ParticleSystem.js';
import { randRange } from '../../utils/MathUtil.js';

export class Helicopter extends Enemy {
  constructor(...args) {
    super(...args);
    this.rotor = Math.random() * Math.PI * 2;
    this.tail = 0;
  }

  updateVfx(dt) {
    this.rotor += dt * 34;
    this.tail += dt * 48;

    // завихрение под вертолётом
    this._wash = (this._wash || 0) - dt;
    if (this._wash <= 0) {
      this._wash = 0.12;
      this.game.particles.emit(
        this.x + randRange(-8, 8), this.y + randRange(-2, 4),
        randRange(-24, 24), randRange(6, 22),
        0.35, randRange(1.5, 3), 'rgba(200,210,220,0.28)', PT.SMOKE, 5, 4
      );
    }
    // дым на низком HP
    if (this.hp < this.maxHp * 0.35 && Math.random() < dt * 22) {
      this.game.particles.emit(
        this.x - 6, this.y - this.altitude + 2,
        randRange(-10, 4), randRange(-26, -10),
        randRange(0.5, 0.9), randRange(2, 4),
        'rgba(60,60,60,0.55)', PT.SMOKE, 6, -10
      );
    }
  }

  renderExtra(g, frame, flip, s, drawY) {
    void frame; void flip;
    const cx = this.x, cy = drawY;
    // несущий винт: размытая «восьмёрка» + лопасти
    g.save();
    g.translate(cx - 1 * s, cy - 11 * s);
    g.globalAlpha = 0.22;
    g.strokeStyle = '#20242c';
    g.lineWidth = 5 * s;
    g.beginPath();
    g.ellipse(0, 0, 17 * s, 3.4 * s, 0, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 0.85;
    g.rotate(this.rotor);
    g.strokeStyle = '#3a4150';
    g.lineWidth = 2.2 * s;
    g.beginPath();
    g.moveTo(-16 * s, 0); g.lineTo(16 * s, 0);
    g.moveTo(0, -2.4 * s); g.lineTo(0, 2.4 * s);
    g.stroke();
    g.restore();

    // хвостовой винт
    g.save();
    g.translate(cx - 17 * s, cy - 4 * s);
    g.rotate(this.tail);
    g.globalAlpha = 0.6;
    g.strokeStyle = '#2b3040';
    g.lineWidth = 1.6 * s;
    g.beginPath();
    g.moveTo(-4.5 * s, 0); g.lineTo(4.5 * s, 0);
    g.moveTo(0, -4.5 * s); g.lineTo(0, 4.5 * s);
    g.stroke();
    g.restore();
    g.globalAlpha = 1;
  }
}

registerEnemy('copter', Helicopter);
export default Helicopter;
