/* ==========================================================================
   FlameTower.js — огнемёт «Пиро» ($90, апгрейд $70).

   Конус огня вместо снаряда: за один «плевок» (2 раза в секунду) урон
   получают ВСЕ наземные цели внутри конуса 45/55/65° на дистанции 1.8–2 тайла.
   Дополнительно поджигает: burnDps 12/24/40 в течение 3 с (тик раз в 0.5 с).
   Воздух не достаёт — это башня для входа и узких коридоров.
   ========================================================================== */

import { Tower, registerTower } from '../Tower.js';
import { FX } from '../Effect.js';
import { PT } from '../../systems/ParticleSystem.js';
import { clamp, dist, normAngle, randRange } from '../../utils/MathUtil.js';

export class FlameTower extends Tower {
  constructor(game, def, cx, cy) {
    super(game, def, cx, cy);
    this.flameT = 0;          // сколько ещё рисуется конус огня
    this.flameAng = 0;        // направление последнего плевка
    this.burnDps = def.burnDps ? def.burnDps[0] : 12;
    this.burnTime = def.burnTime || 3;
  }

  get turretPivot() { return [26, 27]; }

  applyLevel() {
    super.applyLevel();
    const i = this.level - 1;
    if (this.def.burnDps) this.burnDps = this.def.burnDps[i];
    if (this.def.burnTime) this.burnTime = this.def.burnTime;
  }

  /**
   * Огненный конус: бьём сразу по всем, кто попал в сектор.
   * Снарядов нет — урон мгновенный, поэтому хорошо работает в толпе.
   */
  fire(target) {
    const g = this.game;
    const d = this.def;
    const half = (this.cone || Math.PI / 4) / 2;
    this.flameT = 0.22;
    this.flameAng = this.angle;

    const list = g.collision.queryCircle(this.x, this.y, this.range, true); // только наземные
    let hit = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!this.canTarget(e)) continue;
      const dd = dist(this.x, this.y, e.x, e.y);
      if (dd > this.range + e.radius) continue;
      // угол до цели с учётом радиуса самого врага (чтобы конус «цеплял» крайних)
      const a = Math.atan2(e.y - this.y, e.x - this.x);
      const spread = Math.atan2(e.radius, Math.max(8, dd));
      if (Math.abs(normAngle(a - this.angle)) > half + spread) continue;

      g.damageEnemy(e, this.damage, d.damageType, { source: this });
      e.applyBurn(this.burnDps, this.burnTime);
      hit++;

      // искры и дым на самой цели
      g.particles.burst(e.x, e.y, {
        count: 4, colors: ['#fff0b0', '#ff9b3d', '#ff5a1f'],
        speed: [25, 90], life: [0.14, 0.34], size: [1.2, 2.8],
        gravity: -30, drag: 2.4, type: PT.FLAME
      });
    }

    // сам конус: поток частиц вдоль направления
    const mx = this.x + Math.cos(this.angle) * 14;
    const my = this.y + Math.sin(this.angle) * 14 - 14;
    const reach = this.range * (hit > 0 ? 1 : 0.72);
    const n = 10 + this.level * 3;
    for (let k = 0; k < n; k++) {
      const a = this.angle + randRange(-half, half) * (0.4 + 0.6 * (k / n));
      const sp = randRange(reach * 1.6, reach * 3.1);
      g.particles.emit(
        mx, my,
        Math.cos(a) * sp, Math.sin(a) * sp - randRange(6, 26),
        randRange(0.22, 0.5), randRange(2.4, 5.6),
        k % 3 === 0 ? '#fff0b0' : (k % 3 === 1 ? '#ff9b3d' : '#ff5a1f'),
        PT.FLAME, randRange(30, 80), -18
      );
    }
    if (hit > 0) {
      g.effects.spawn(FX.SCORCH, {
        x: this.x + Math.cos(this.angle) * reach * 0.6,
        y: this.y + Math.sin(this.angle) * reach * 0.6 + 4,
        size: reach * 0.42, life: 1.6, angle: this.angle
      });
    }
    g.effects.spawn(FX.MUZZLE, {
      x: mx + Math.cos(this.angle) * 8, y: my + Math.sin(this.angle) * 8,
      angle: this.angle, size: 10 + this.level * 2, life: 0.14, color: '#ffb46b'
    });
    g.audio?.play('flame', { priority: hit > 2 ? 2 : 1 });
    if (hit > 3) g.camera?.shake(0.7, 0.07);
  }

  update(dt) {
    super.update(dt);
    if (this.flameT > 0) this.flameT = Math.max(0, this.flameT - dt);
  }

  /** Рисуем турель + сам конус огня поверх */
  render(g, time) {
    super.render(g, time);
    if (this.flameT <= 0) return;

    const k = this.flameT / 0.22;                 // 1 → 0
    const half = (this.cone || Math.PI / 4) / 2;
    const len = this.range * (0.55 + 0.45 * (1 - k));
    const ox = this.x;
    const oy = this.y - 14;

    g.save();
    g.translate(ox, oy);
    g.rotate(this.flameAng);
    g.globalCompositeOperation = 'lighter';

    // три слоя конуса: горячее ядро, середина, внешняя кромка
    const layers = [
      { a: 0.30 * k, w: half * 0.45, l: len * 0.92, c: 'rgba(255,240,176,0.95)' },
      { a: 0.24 * k, w: half * 0.75, l: len, c: 'rgba(255,155,61,0.85)' },
      { a: 0.16 * k, w: half, l: len * 1.06, c: 'rgba(255,90,31,0.7)' }
    ];
    for (const L of layers) {
      const grad = g.createLinearGradient(0, 0, L.l, 0);
      grad.addColorStop(0, L.c);
      grad.addColorStop(0.55, L.c.replace(/[\d.]+\)$/, `${clamp(L.a * 1.6, 0, 1).toFixed(2)})`));
      grad.addColorStop(1, 'rgba(255,60,20,0)');
      g.globalAlpha = 1;
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, L.l, -L.w, L.w);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
}

registerTower('flame', FlameTower);
export default FlameTower;
