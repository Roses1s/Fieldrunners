/* ==========================================================================
   LaserTower.js — лазер ($40, апгрейд $30).

   Непрерывный луч: бьёт мгновенно и ПРОШИВАЕТ всех врагов на линии
   (в отличие от пули гатлинга, которая летит в одну цель). 5 импульсов/с
   × 25/50/90 → 125/250/450 DPS, и урон нарастает, пока луч держит цель:
   множитель растёт на rampPerSec в секунду вплоть до rampMax (×2).
   Достаёт и воздух. Пробивает 25% брони (энергетический урон).
   ========================================================================== */

import { Tower, registerTower } from '../Tower.js';
import { FX } from '../Effect.js';
import { PT } from '../../systems/ParticleSystem.js';
import { clamp, dist, distToSegment, randRange } from '../../utils/MathUtil.js';

const BEAM_HALF_WIDTH = 7;   // половина толщины луча в пикселях

export class LaserTower extends Tower {
  constructor(game, def, cx, cy) {
    super(game, def, cx, cy);
    this.ramp = 1;            // текущий множитель урона (1 … rampMax)
    this.holdTime = 0;        // сколько секунд непрерывно держим цель
    this.beamT = 0;           // время отрисовки луча
    this.beamX2 = 0;
    this.beamY2 = 0;
    this.beamHits = 0;
    this.lastTarget = null;   // цель, которую луч держал на предыдущем импульсе
  }

  get turretPivot() { return [26, 27]; }

  /** Точка, откуда выходит луч (срез кристалла) */
  emitter() {
    const ex = this.x + Math.cos(this.angle) * 20;
    const ey = this.y - 15 + Math.sin(this.angle) * 20;
    return { x: ex, y: ey };
  }

  fire(target) {
    const g = this.game;
    const d = this.def;
    const e0 = this.emitter();
    // конец луча — на максимальной дистанции по направлению ствола
    const ex = e0.x + Math.cos(this.angle) * this.range;
    const ey = e0.y + Math.sin(this.angle) * this.range;

    // ВАЖНО: попадания считаем в ПЛОСКОСТИ ЗЕМЛИ (от центра башни), а не от
    // среза кристалла. Иначе луч, выпущенный на 15 px выше земли, проходил бы
    // над мелкими наземными врагами (радиус 8 px) и не наносил урона.
    const gx1 = this.x, gy1 = this.y;
    const gx2 = this.x + Math.cos(this.angle) * this.range;
    const gy2 = this.y + Math.sin(this.angle) * this.range;

    // Множитель нарастает, пока держим одну и ту же цель. Нельзя сравнивать
    // с this.target: базовый update() присваивает его ДО вызова fire(), поэтому
    // ведём отдельную ссылку на цель предыдущего импульса.
    if (this.lastTarget === target) {
      this.holdTime += this.interval;
    } else {
      this.holdTime = 0;
      this.lastTarget = target;
    }
    this.ramp = clamp(1 + this.holdTime * (d.rampPerSec || 0.05), 1, d.rampMax || 2);
    const dmg = this.damage * this.ramp;

    this.beamT = Math.max(this.beamT, 0.13);
    this.beamX2 = ex; this.beamY2 = ey;

    // прошиваем всех на линии луча
    const list = g.collision.queryCircle(this.x, this.y, this.range, !this.canTargetAir);
    let hits = 0;
    for (let i = 0; i < list.length; i++) {
      const en = list[i];
      if (!this.canTarget(en)) continue;
      const dd = dist(gx1, gy1, en.x, en.y);
      if (dd > this.range + en.radius) continue;
      // расстояние от врага до отрезка луча (в плоскости земли)
      if (distToSegment(en.x, en.y, gx1, gy1, gx2, gy2) > BEAM_HALF_WIDTH + en.radius) continue;

      g.damageEnemy(en, dmg, d.damageType, { pierceArmor: d.pierceArmor || 0.25, source: this });
      hits++;
      g.particles.burst(en.x, en.y, {
        count: 3, colors: ['#ffffff', '#ff5ad1', '#c77dff'],
        speed: [30, 110], life: [0.1, 0.24], size: [0.8, 2], type: PT.SPARK, drag: 4
      });
    }
    this.beamHits = hits;

    // сноп искр в конце луча
    g.effects.spawn(FX.MUZZLE, {
      x: e0.x, y: e0.y, angle: this.angle, size: 7 + this.level * 1.6,
      life: 0.1, color: '#ff9ae6'
    });
    if (hits > 0) {
      g.particles.emit(ex, ey, randRange(-20, 20), randRange(-20, 20),
        0.2, 2.2, '#ff5ad1', PT.SPARK, 4, 0);
    }
    g.audio?.play('laser', { priority: hits > 2 ? 2 : 1 });
  }

  update(dt) {
    super.update(dt);
    if (this.beamT > 0) this.beamT = Math.max(0, this.beamT - dt);
    // Цель потеряна — нарастание сбрасывается, свечение плавно затухает.
    if (!this.target) {
      this.holdTime = 0;
      this.lastTarget = null;
      this.ramp = Math.max(1, this.ramp - dt * 0.8);
    }
  }

  render(g, time) {
    super.render(g, time);

    // свечение кристалла — тем сильнее, чем выше накопленный множитель
    const e0 = this.emitter();
    const glow = 0.25 + 0.35 * ((this.ramp - 1) / Math.max(0.001, (this.def.rampMax || 2) - 1));
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = glow + 0.1 * Math.sin(this.pulse * 3);
    const rg = g.createRadialGradient(e0.x, e0.y, 0.5, e0.x, e0.y, 9 + this.level);
    rg.addColorStop(0, 'rgba(255,255,255,0.9)');
    rg.addColorStop(0.4, 'rgba(255,90,209,0.6)');
    rg.addColorStop(1, 'rgba(255,90,209,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(e0.x, e0.y, 9 + this.level, 0, Math.PI * 2); g.fill();
    g.restore();

    // сам луч
    if (this.beamT <= 0) return;
    const k = clamp(this.beamT / 0.13, 0, 1);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';

    // внешнее гало
    g.globalAlpha = 0.30 * k;
    g.strokeStyle = '#ff5ad1';
    g.lineWidth = 8 + this.level * 1.5;
    g.beginPath(); g.moveTo(e0.x, e0.y); g.lineTo(this.beamX2, this.beamY2); g.stroke();

    // середина
    g.globalAlpha = 0.65 * k;
    g.strokeStyle = '#ffa6ec';
    g.lineWidth = 3.4;
    g.beginPath(); g.moveTo(e0.x, e0.y); g.lineTo(this.beamX2, this.beamY2); g.stroke();

    // горячее ядро
    g.globalAlpha = 0.95 * k;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(e0.x, e0.y); g.lineTo(this.beamX2, this.beamY2); g.stroke();

    // отметки попаданий вдоль луча
    if (this.beamHits > 0) {
      g.globalAlpha = 0.5 * k;
      g.fillStyle = '#ffffff';
      for (let i = 0; i < Math.min(6, this.beamHits); i++) {
        const t = (i + 1) / (Math.min(6, this.beamHits) + 1);
        const px = e0.x + (this.beamX2 - e0.x) * t;
        const py = e0.y + (this.beamY2 - e0.y) * t;
        g.beginPath(); g.arc(px, py, 3.2, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
    void time;
  }

  /** Индикатор накопленного урона под башней (видно, что луч «разогревается») */
  renderRange(g, color, fill) {
    super.renderRange(g, color, fill);
    const r = (this.ramp - 1) / Math.max(0.001, (this.def.rampMax || 2) - 1);
    if (r <= 0.02) return;
    g.save();
    g.strokeStyle = 'rgba(255,90,209,0.9)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(this.x, this.y + 10, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(r, 0, 1));
    g.stroke();
    g.restore();
  }
}

registerTower('laser', LaserTower);
export default LaserTower;
