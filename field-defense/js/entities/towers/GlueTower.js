/* ==========================================================================
   GlueTower.js — клеевая башня ($10, апгрейд $5).
   Замедление 40% / 60% / 75% на 2 / 3 / 4 с. Замедление НЕ стакается —
   у врага берётся максимальное активное (см. Enemy.applySlow).
   На 2-м уровне липкая волна накрывает 3 врагов, на 3-м — 5.
   ========================================================================== */

import { Tower, registerTower } from '../Tower.js';
import { PROJ } from '../Projectile.js';
import { PT } from '../../systems/ParticleSystem.js';

export class GlueTower extends Tower {
  get turretPivot() { return [18, 26]; }

  fire(target) {
    const g = this.game;
    const d = this.def;
    const i = this.level - 1;
    const m = this.muzzle({ x: 0, y: 0 });

    g.projectiles.spawn({
      type: PROJ.GLUE,
      x: m.x, y: m.y,
      target,
      speed: 300,
      damage: this.damage,
      damageType: d.damageType,
      slow: this.slow,
      slowTime: this.slowTime,
      slowTargets: d.splashTargets ? d.splashTargets[i] : 1,
      splash: d.splashRadius ? d.splashRadius[i] : 0,
      owner: this,
      size: 0.85 + i * 0.18,
      life: 1.6,
      hitRadius: 5
    });

    g.audio?.play('glue');
    g.particles.burst(m.x, m.y, {
      count: 4, colors: ['#bff0ff', '#63cdf2'], speed: [10, 40],
      life: [0.2, 0.4], size: [1.4, 2.6], gravity: 60, drag: 2
    });
  }
}

registerTower('glue', GlueTower);
export default GlueTower;
