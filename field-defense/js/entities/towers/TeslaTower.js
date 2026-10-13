/* ==========================================================================
   TeslaTower.js — электрическая башня ($70, апгрейд $50).
   Мгновенный разряд без снаряда: 2 разряда/с × 350/700/1050 урона
   → 700/1400/2100 DPS по одной цели. Молния перескакивает на 2/3/4 цели,
   каждая следующая получает 75% урона предыдущей. Пробивает 60% брони.
   ========================================================================== */

import { Tower, registerTower } from '../Tower.js';
import { FX } from '../Effect.js';
import { PT } from '../../systems/ParticleSystem.js';
import { dist } from '../../utils/MathUtil.js';

export class TeslaTower extends Tower {
  get turretPivot() { return [24, 29]; }

  fire(target) {
    const g = this.game;
    const d = this.def;
    const maxChain = this.chain || 1;
    const falloff = d.chainFalloff ?? 0.75;
    const chainRange = d.chainRange ?? 70;

    const hit = [];
    let cur = target;
    let dmg = this.damage;
    let fromX = this.x + Math.cos(this.angle) * 6;
    let fromY = this.y - 16;      // разрядный шар над катушкой

    for (let k = 0; k < maxChain && cur; k++) {
      hit.push(cur);

      g.effects.spawn(FX.LIGHTNING, {
        x: fromX, y: fromY, x2: cur.x, y2: cur.y,
        life: 0.16 + k * 0.02, width: 2.4 - k * 0.3,
        color: '#eaf9ff', color2: '#5aa8ff', jitter: 7 - k
      });

      g.damageEnemy(cur, dmg, d.damageType, { pierceArmor: d.pierceArmor || 0, source: this });

      g.particles.burst(cur.x, cur.y, {
        count: 6, colors: ['#ffffff', '#9fe8ff', '#5aa8ff'],
        speed: [40, 150], life: [0.12, 0.3], size: [0.8, 2], type: PT.SPARK, drag: 4
      });

      // следующая цель цепи — ближайшая ещё не поражённая
      fromX = cur.x; fromY = cur.y;
      dmg *= falloff;
      const near = g.collision.queryCircle(fromX, fromY, chainRange, false);
      let next = null, bestD = Infinity;
      for (let i = 0; i < near.length; i++) {
        const e = near[i];
        if (!this.canTarget(e) || hit.indexOf(e) !== -1) continue;
        const dd = dist(fromX, fromY, e.x, e.y);
        if (dd < bestD) { bestD = dd; next = e; }
      }
      cur = next;
    }

    g.effects.spawn(FX.MUZZLE, { x: this.x, y: this.y - 18, size: 8 + this.level * 2, life: 0.12, color: '#dff6ff' });
    g.camera?.shake(0.9, 0.08);
    g.audio?.play('zap');
  }
}

registerTower('tesla', TeslaTower);
export default TeslaTower;
