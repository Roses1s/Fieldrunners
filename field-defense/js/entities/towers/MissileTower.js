/* ==========================================================================
   MissileTower.js — ракетная башня ($20, апгрейд $15).
   Самонаводящаяся ракета: каждый шаг доворачивает угол к цели с ограничением
   угловой скорости (rotateTowards), оставляет дымный след, взрывается
   по площади. Бьёт и по наземным, и по воздушным целям.
   ========================================================================== */

import { Tower, registerTower } from '../Tower.js';
import { PROJ } from '../Projectile.js';
import { FX } from '../Effect.js';
import { PT } from '../../systems/ParticleSystem.js';
import { randRange } from '../../utils/MathUtil.js';

export class MissileTower extends Tower {
  get turretPivot() { return [18, 32]; }

  fire(target) {
    const g = this.game;
    const d = this.def;
    const a = this.angle - 0.42;              // пакет труб наклонён вверх
    const mx = this.x + Math.cos(this.angle) * 16;
    const my = this.y + Math.sin(this.angle) * 16 - 6;

    g.projectiles.spawn({
      type: PROJ.MISSILE,
      x: mx, y: my,
      target,
      angle: a,
      speed: d.projSpeed || 210,
      turn: d.projTurn || 4.2,
      damage: this.damage,
      splash: this.splash,
      damageType: d.damageType,
      owner: this,
      size: 0.9 + this.level * 0.1,
      life: 3.2,
      hitRadius: 5
    });

    // выхлоп при пуске
    g.particles.burst(mx, my, {
      count: 10, colors: ['#e8e8e8', '#b9b9b9', '#ffb46b'],
      speed: [15, 70], life: [0.3, 0.8], size: [2.5, 6],
      gravity: -10, drag: 2.2, type: PT.SMOKE, dir: a + Math.PI, spread: 0.9
    });
    g.effects.spawn(FX.MUZZLE, { x: mx, y: my, angle: a, size: 9, life: 0.1, color: '#ffd9a0' });
    g.camera?.shake(1.4, 0.1);
    g.audio?.play('missile');
    void randRange;
  }
}

registerTower('missile', MissileTower);
export default MissileTower;
