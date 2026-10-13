/* ==========================================================================
   Effect.js — пул короткоживущих визуальных эффектов.
   Объекты создаются один раз при старте и переиспользуются (без GC-пауз).

   Типы:
     LIGHTNING — цепная молния (ломаная с свечением)
     EXPLOSION — огненный шар + кольцо
     MUZZLE    — вспышка выстрела
     BUILD     — материализация башни (снизу вверх)
     SPLAT     — лужа клея на земле
     SCORCH    — подпалина
     SHOCKWAVE — тонкое быстро расширяющееся кольцо
     MUSHROOM  — ядерный гриб (вспышка → ножка → шляпка → волна)
     FLASH     — белая вспышка-экран
   ========================================================================== */

import { CONFIG } from '../utils/Constants.js';
import { clamp, randRange } from '../utils/MathUtil.js';

export const FX = {
  LIGHTNING: 0,
  EXPLOSION: 1,
  MUZZLE: 2,
  BUILD: 3,
  SPLAT: 4,
  SCORCH: 5,
  SHOCKWAVE: 6,
  MUSHROOM: 7,
  FLASH: 8
};

const FX_MAX = CONFIG.EFFECT_POOL;
const PTS = 24;   // максимум точек ломаной молнии

class Effect {
  constructor() {
    this.active = false;
    this.type = 0;
    this.x = 0; this.y = 0;
    this.x2 = 0; this.y2 = 0;
    this.t = 0; this.life = 1;
    this.size = 10; this.size2 = 0;
    this.width = 2;
    this.angle = 0; this.arc = 1;
    this.color = '#fff'; this.color2 = '#000';
    this.pts = new Float32Array(PTS * 2);
    this.npts = 0;
    this.seed = 0;
  }
}

export class EffectPool {
  constructor() {
    this.pool = new Array(FX_MAX);
    for (let i = 0; i < FX_MAX; i++) this.pool[i] = new Effect();
    this.cursor = 0;
    this.count = 0;
  }

  _alloc() {
    for (let k = 0; k < FX_MAX; k++) {
      const i = (this.cursor + k) % FX_MAX;
      if (!this.pool[i].active) { this.cursor = (i + 1) % FX_MAX; return this.pool[i]; }
    }
    const e = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % FX_MAX;
    return e;
  }

  spawn(type, o = {}) {
    const e = this._alloc();
    e.active = true;
    e.type = type;
    e.x = o.x || 0; e.y = o.y || 0;
    e.x2 = o.x2 || 0; e.y2 = o.y2 || 0;
    e.t = 0;
    e.life = o.life || 0.4;
    e.size = o.size || 12;
    e.size2 = o.size2 || 0;
    e.width = o.width || 2;
    e.angle = o.angle || 0;
    e.arc = o.arc || 1;
    e.color = o.color || '#ffffff';
    e.color2 = o.color2 || '#ff7a3c';
    e.seed = Math.random() * 1000;
    e.npts = 0;

    if (type === FX.LIGHTNING) this._buildLightning(e, o.jitter ?? 6, o.segments ?? 7);
    return e;
  }

  /** Ломаная между (x,y) и (x2,y2) с случайным смещением */
  _buildLightning(e, jitter, segments) {
    const n = clamp(segments, 2, PTS - 1);
    const dx = e.x2 - e.x, dy = e.y2 - e.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    e.npts = n + 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const off = (i === 0 || i === n) ? 0 : randRange(-jitter, jitter) * (1 - Math.abs(t - 0.5) * 0.6);
      e.pts[i * 2] = e.x + dx * t + nx * off;
      e.pts[i * 2 + 1] = e.y + dy * t + ny * off;
    }
  }

  update(dt) {
    let n = 0;
    for (let i = 0; i < FX_MAX; i++) {
      const e = this.pool[i];
      if (!e.active) continue;
      e.t += dt;
      if (e.t >= e.life) { e.active = false; continue; }
      n++;
    }
    this.count = n;
  }

  render(g) {
    for (let i = 0; i < FX_MAX; i++) {
      const e = this.pool[i];
      if (!e.active) continue;
      const p = e.t / e.life;             // 0..1
      switch (e.type) {
        case FX.LIGHTNING: this._lightning(g, e, p); break;
        case FX.EXPLOSION: this._explosion(g, e, p); break;
        case FX.MUZZLE: this._muzzle(g, e, p); break;
        case FX.BUILD: this._build(g, e, p); break;
        case FX.SPLAT: this._splat(g, e, p); break;
        case FX.SCORCH: this._scorch(g, e, p); break;
        case FX.SHOCKWAVE: this._shockwave(g, e, p); break;
        case FX.MUSHROOM: this._mushroom(g, e, p); break;
        case FX.FLASH: this._flash(g, e, p); break;
      }
    }
  }

  /* ------------------------------ рендеры ------------------------------ */

  _lightning(g, e, p) {
    if (e.npts < 2) return;
    const a = (1 - p) * (0.7 + 0.3 * Math.sin(e.seed + p * 60));
    g.save();
    g.globalCompositeOperation = 'lighter';
    // внешнее свечение
    g.strokeStyle = e.color2;
    g.globalAlpha = a * 0.35;
    g.lineWidth = e.width * 4.5;
    this._stroke(g, e);
    // среднее
    g.strokeStyle = e.color;
    g.globalAlpha = a * 0.75;
    g.lineWidth = e.width * 2;
    this._stroke(g, e);
    // ядро
    g.strokeStyle = '#ffffff';
    g.globalAlpha = a;
    g.lineWidth = e.width;
    this._stroke(g, e);
    g.restore();
  }

  _stroke(g, e) {
    g.beginPath();
    g.moveTo(e.pts[0], e.pts[1]);
    for (let i = 1; i < e.npts; i++) g.lineTo(e.pts[i * 2], e.pts[i * 2 + 1]);
    g.stroke();
  }

  _explosion(g, e, p) {
    const r = e.size * (0.35 + p * 0.95);
    const a = 1 - p;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const lg = g.createRadialGradient(e.x, e.y, r * 0.1, e.x, e.y, r);
    lg.addColorStop(0, `rgba(255,255,240,${0.95 * a})`);
    lg.addColorStop(0.35, `rgba(255,190,80,${0.75 * a})`);
    lg.addColorStop(0.7, `rgba(255,90,30,${0.4 * a})`);
    lg.addColorStop(1, 'rgba(120,30,10,0)');
    g.fillStyle = lg;
    g.beginPath(); g.arc(e.x, e.y, r, 0, Math.PI * 2); g.fill();
    g.restore();

    // ударное кольцо
    g.save();
    g.globalAlpha = a * 0.8;
    g.strokeStyle = e.color;
    g.lineWidth = Math.max(1, e.width * (1 - p));
    g.beginPath();
    g.arc(e.x, e.y, r * 1.25, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  _muzzle(g, e, p) {
    const a = 1 - p;
    const r = e.size * (1 + p * 1.4);
    g.save();
    g.translate(e.x, e.y);
    g.rotate(e.angle);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a;
    const lg = g.createRadialGradient(0, 0, 0.5, 0, 0, r);
    lg.addColorStop(0, 'rgba(255,255,235,0.95)');
    lg.addColorStop(0.45, 'rgba(255,200,90,0.55)');
    lg.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = lg;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    // «звезда» вспышки
    g.fillStyle = `rgba(255,240,200,${0.85 * a})`;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(r * 1.5, -r * 0.28);
    g.lineTo(r * 1.9, 0);
    g.lineTo(r * 1.5, r * 0.28);
    g.closePath();
    g.fill();
    g.restore();
  }

  _build(g, e, p) {
    // столб света снизу вверх + кольцо у основания
    const h = e.size2 || 60;
    const a = Math.sin(clamp(p, 0, 1) * Math.PI);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const lg = g.createLinearGradient(e.x, e.y + 8, e.x, e.y + 8 - h);
    lg.addColorStop(0, `rgba(140,220,255,${0.5 * a})`);
    lg.addColorStop(1, 'rgba(140,220,255,0)');
    g.fillStyle = lg;
    const w = e.size * (1 - p * 0.55);
    g.fillRect(e.x - w / 2, e.y + 8 - h, w, h);
    g.strokeStyle = `rgba(190,240,255,${0.8 * a})`;
    g.lineWidth = 2.4;
    g.beginPath();
    g.ellipse(e.x, e.y + 8, e.size * (0.5 + p * 1.1), e.size * (0.22 + p * 0.45), 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  _splat(g, e, p) {
    const a = clamp(1 - p * p, 0, 1) * 0.75;
    g.save();
    g.globalAlpha = a;
    g.fillStyle = e.color;
    g.beginPath();
    g.ellipse(e.x, e.y, e.size * (0.6 + p * 0.5), e.size * (0.3 + p * 0.25), e.angle, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = a * 0.5;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(e.x - e.size * 0.2, e.y - e.size * 0.1, e.size * 0.18, e.size * 0.09, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  _scorch(g, e, p) {
    const a = clamp(1 - p, 0, 1) * 0.55;
    g.save();
    g.globalAlpha = a;
    g.fillStyle = '#1b1512';
    g.beginPath();
    g.ellipse(e.x, e.y, e.size, e.size * 0.55, e.angle, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  _shockwave(g, e, p) {
    const a = (1 - p) * 0.85;
    const r = e.size + (e.size2 - e.size) * p;
    g.save();
    g.globalAlpha = a;
    g.strokeStyle = e.color;
    g.lineWidth = Math.max(1, e.width * (1 - p * 0.8));
    g.beginPath();
    g.arc(e.x, e.y, r, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  _mushroom(g, e, p) {
    const R = e.size;
    g.save();
    // 1) ослепляющая вспышка
    if (p < 0.22) {
      const a = 1 - p / 0.22;
      g.globalCompositeOperation = 'lighter';
      const lg = g.createRadialGradient(e.x, e.y, 1, e.x, e.y, R * (0.4 + p * 3));
      lg.addColorStop(0, `rgba(255,255,240,${a})`);
      lg.addColorStop(0.5, `rgba(255,190,90,${a * 0.55})`);
      lg.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = lg;
      g.beginPath(); g.arc(e.x, e.y, R * (0.4 + p * 3), 0, Math.PI * 2); g.fill();
    }
    // 2) ножка
    const stemH = R * 1.5 * clamp(p * 1.6, 0, 1);
    const stemW = R * 0.32 * (1 - p * 0.35);
    const lg2 = g.createLinearGradient(e.x - stemW, 0, e.x + stemW, 0);
    lg2.addColorStop(0, 'rgba(120,60,30,0.75)');
    lg2.addColorStop(0.4, 'rgba(255,200,120,0.9)');
    lg2.addColorStop(1, 'rgba(110,50,25,0.7)');
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = clamp(1.25 - p, 0, 1);
    g.fillStyle = lg2;
    g.beginPath();
    g.moveTo(e.x - stemW, e.y);
    g.quadraticCurveTo(e.x - stemW * 0.5, e.y - stemH * 0.6, e.x - stemW * 1.1, e.y - stemH);
    g.lineTo(e.x + stemW * 1.1, e.y - stemH);
    g.quadraticCurveTo(e.x + stemW * 0.5, e.y - stemH * 0.6, e.x + stemW, e.y);
    g.closePath();
    g.fill();
    // 3) шляпка
    if (p > 0.14) {
      const capP = clamp((p - 0.14) / 0.5, 0, 1);
      const capR = R * (0.5 + capP * 0.85);
      const cy = e.y - stemH;
      const lg3 = g.createRadialGradient(e.x - capR * 0.25, cy - capR * 0.3, capR * 0.1, e.x, cy, capR);
      lg3.addColorStop(0, 'rgba(255,240,190,0.95)');
      lg3.addColorStop(0.45, 'rgba(255,150,60,0.9)');
      lg3.addColorStop(1, 'rgba(120,50,25,0.55)');
      g.fillStyle = lg3;
      g.beginPath();
      g.ellipse(e.x, cy, capR, capR * 0.72, 0, 0, Math.PI * 2);
      g.fill();
      // клубы
      g.globalAlpha = clamp(1.25 - p, 0, 1) * 0.6;
      g.fillStyle = 'rgba(90,60,50,0.7)';
      for (let i = 0; i < 5; i++) {
        const a = e.seed + i * 1.7 + p * 2;
        g.beginPath();
        g.arc(e.x + Math.cos(a) * capR * 0.7, cy + Math.sin(a) * capR * 0.4, capR * 0.28, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  _flash(g, e, p) {
    g.save();
    g.globalAlpha = (1 - p) * 0.6;
    g.fillStyle = e.color;
    g.fillRect(e.x - e.size, e.y - e.size, e.size * 2, e.size * 2);
    g.restore();
  }

  clear() {
    for (let i = 0; i < FX_MAX; i++) this.pool[i].active = false;
    this.count = 0;
  }
}

export default EffectPool;
