/* ==========================================================================
   GatlingTower.js — пулемётная башня.
   Самая дешёвая ($5, апгрейд $4), DPS 35/70/105, радиус 2.5 клетки.
   Механика: быстрые трассирующие пули (почти hitscan), вращающийся блок
   стволов, вспышка выстрела, вылет гильз, отдача корпуса.
   ========================================================================== */

import { Tower, registerTower } from '../Tower.js';
import { PROJ } from '../Projectile.js';
import { FX } from '../Effect.js';
import { PT } from '../../systems/ParticleSystem.js';
import { randRange } from '../../utils/MathUtil.js';

export class GatlingTower extends Tower {
  get turretPivot() { return [21, 26]; }

  fire(target) {
    const g = this.game;
    const m = this.muzzle({ x: 0, y: 0 });
    const spread = this.def.spread || 0.05;
    const a = this.angle + (Math.random() - 0.5) * spread;

    g.projectiles.spawn({
      type: PROJ.BULLET,
      x: m.x, y: m.y,
      target,
      angle: a,
      speed: 680,
      damage: this.damage * randRange(0.92, 1.08),
      damageType: this.def.damageType,
      owner: this,
      life: 0.9,
      size: 0.9 + this.level * 0.12
    });

    g.effects.spawn(FX.MUZZLE, {
      x: m.x, y: m.y, angle: a, size: 5 + this.level, life: 0.07, color: '#fff2c0'
    });

    // гильза вылетает вбок-назад
    g.particles.emit(
      this.x - Math.cos(this.angle) * 6 + randRange(-4, 4),
      this.y - Math.sin(this.angle) * 6,
      randRange(-45, -12), randRange(-75, -22),
      0.5, 1.4, '#d8b45a', PT.SHARD, 0, 240
    );

    g.audio?.play('shot');
  }
}

registerTower('gatling', GatlingTower);
export default GatlingTower;
