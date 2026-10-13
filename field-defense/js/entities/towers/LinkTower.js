/* ==========================================================================
   LinkTower.js — «Связка» ($45, апгрейд $35).

   Работает только в паре: ищет ближайшую вторую Связку в радиусе связи
   (3.0/3.4/3.8 тайла) и натягивает между ними энергетический луч.
   Луч бьёт непрерывно (10 тиков в секунду) по всем, кто оказался на линии —
   260/520/900 DPS на пару. В одиночку башня бесполезна, зато пара перекрывает
   коридор лучше любой турели. Достаёт и наземных, и воздушных.
   ========================================================================== */

import { Tower, registerTower } from '../Tower.js';
import { PT } from '../../systems/ParticleSystem.js';
import { dist, distToSegment } from '../../utils/MathUtil.js';

const TICK = 0.1;            // период тика луча, с
const BEAM_HALF = 7;         // половина толщины луча, px

export class LinkTower extends Tower {
  constructor(game, def, cx, cy) {
    super(game, def, cx, cy);
    this.partner = null;     // вторая башня пары
    this.linkActive = false; // луч натянут (пара взаимная)
    this.tickT = 0;
  }

  get turretPivot() { return [27, 27]; }

  /** Точка, откуда выходит луч (шар между рогами излучателя) */
  emitterOf(t) { return { x: t.x, y: t.y - 20 }; }

  /** Ближайшая другая Связка в радиусе связи */
  findPartner() {
    const towers = this.game.towers || [];
    let best = null, bestD = Infinity;
    for (let i = 0; i < towers.length; i++) {
      const t = towers[i];
      if (t === this || t.def.behavior !== 'link' || t.buildAnim > 0.55) continue;
      const d = dist(this.x, this.y, t.x, t.y);
      const maxD = Math.min(this.range, t.range);
      if (d <= maxD && d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  /** Эта башня — «ведущая» в паре (чтобы луч не бил дважды) */
  isPrimary() {
    if (!this.partner) return false;
    const cols = this.game.grid ? this.game.grid.cols : 100;
    return (this.cy * cols + this.cx) < (this.partner.cy * cols + this.partner.cx);
  }

  update(dt) {
    // собственный цикл вместо базового: у Связки нет «выстрела» по цели
    this.timeAlive += dt;
    this.pulse += dt;
    if (this.buildAnim > 0) this.buildAnim = Math.max(0, this.buildAnim - dt / 0.45);
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 14);
    if (this.firing > 0) this.firing = Math.max(0, this.firing - dt * 6);
    this.target = null;

    this.partner = this.findPartner();
    this.linkActive = !!this.partner &&
      this.partner.findPartner() === this &&
      this.buildAnim < 0.55;

    if (this.linkActive && this.isPrimary()) {
      this.tickT -= dt;
      while (this.tickT <= 0) {
        this.tickT += TICK;
        this.applyBeamDamage();
      }
      this.firing = 1;
    } else {
      this.tickT = 0;
    }
  }

  /** Урон всем, кто стоит на линии луча (тик 0.1 с) */
  applyBeamDamage() {
    const g = this.game;
    const a = this.emitterOf(this);
    const b = this.emitterOf(this.partner);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const radius = dist(a.x, a.y, b.x, b.y) / 2 + 30;
    const list = g.collision.queryCircle(mx, my, radius, !this.canTargetAir);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!this.canTarget(e)) continue;
      if (distToSegment(e.x, e.y, a.x, a.y, b.x, b.y) > BEAM_HALF + e.radius) continue;
      g.damageEnemy(e, this.damage, this.def.damageType, { pierceArmor: 0.25, source: this });
      if (Math.random() < 0.35) {
        g.particles.burst(e.x, e.y, {
          count: 2, colors: ['#ffffff', '#7ce0ff'],
          speed: [25, 80], life: [0.1, 0.22], size: [0.8, 1.8], type: PT.SPARK, drag: 4
        });
      }
    }
  }

  fire() { /* луч работает в update(), одиночных выстрелов нет */ }

  render(g, time) {
    super.render(g, time);

    // натянутый луч рисует только ведущая башня пары
    if (this.linkActive && this.partner && this.isPrimary()) {
      const a = this.emitterOf(this);
      const b = this.emitterOf(this.partner);
      const flick = 0.82 + 0.18 * Math.sin(time * 41 + this.cx);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      g.globalAlpha = 0.28 * flick;
      g.strokeStyle = '#39b6ff';
      g.lineWidth = 8;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      g.globalAlpha = 0.75 * flick;
      g.strokeStyle = '#aee6ff';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      g.globalAlpha = 0.95;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      g.restore();
    } else if (!this.linkActive) {
      // одиночная Связка: предупреждающий пунктир «нужна пара»
      g.save();
      g.globalAlpha = 0.35 + 0.15 * Math.sin(this.pulse * 3);
      g.strokeStyle = '#7ce0ff';
      g.lineWidth = 1.6;
      g.setLineDash([4, 5]);
      g.beginPath(); g.arc(this.x, this.y - 20, 7, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
      g.restore();
    }
  }

  renderRange(g, color, fill) {
    super.renderRange(g, color || 'rgba(124,224,255,0.85)', fill || 'rgba(124,224,255,0.08)');
    // радиус связи: внутри него вторая Связка образует пару
    if (this.partner) {
      const a = this.emitterOf(this);
      const b = this.emitterOf(this.partner);
      g.save();
      g.setLineDash([6, 5]);
      g.strokeStyle = 'rgba(174,230,255,0.8)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      g.setLineDash([]);
      g.restore();
    }
  }
}

registerTower('link', LinkTower);
export default LinkTower;
