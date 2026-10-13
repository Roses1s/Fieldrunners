/* ==========================================================================
   ParticleSystem.js — пул частиц + пул всплывающих текстов урона/денег.
   Всё переиспользуется: за бой не создаётся ни одного нового объекта
   (важно для мобильного GC и стабильных 60 FPS).
   ========================================================================== */

import { CONFIG } from '../utils/Constants.js';
import { randRange, clamp } from '../utils/MathUtil.js';

const P_MAX = CONFIG.PARTICLE_POOL;
const T_MAX = CONFIG.TEXT_POOL;

// Типы частиц
export const PT = {
  DOT: 0,       // круг
  SPARK: 1,     // вытянутая искра по направлению движения
  SMOKE: 2,     // растущее полупрозрачное облако
  SHARD: 3,     // вращающийся осколок (квадрат)
  RING: 4,      // расширяющееся кольцо
  FLAME: 5      // огонёк (жёлтый → красный → дым)
};

export class ParticleSystem {
  constructor() {
    this.x = new Float32Array(P_MAX);
    this.y = new Float32Array(P_MAX);
    this.vx = new Float32Array(P_MAX);
    this.vy = new Float32Array(P_MAX);
    this.life = new Float32Array(P_MAX);
    this.maxLife = new Float32Array(P_MAX);
    this.size = new Float32Array(P_MAX);
    this.grow = new Float32Array(P_MAX);
    this.rot = new Float32Array(P_MAX);
    this.vr = new Float32Array(P_MAX);
    this.grav = new Float32Array(P_MAX);
    this.drag = new Float32Array(P_MAX);
    this.type = new Uint8Array(P_MAX);
    this.color = new Array(P_MAX).fill('#ffffff');
    this.alive = new Uint8Array(P_MAX);
    this.cursor = 0;
    this.count = 0;

    // Всплывающие тексты
    this.tx = new Float32Array(T_MAX);
    this.ty = new Float32Array(T_MAX);
    this.tvy = new Float32Array(T_MAX);
    this.tlife = new Float32Array(T_MAX);
    this.tmax = new Float32Array(T_MAX);
    this.tsize = new Float32Array(T_MAX);
    this.ttext = new Array(T_MAX).fill('');
    this.tcolor = new Array(T_MAX).fill('#fff');
    this.talive = new Uint8Array(T_MAX);
    this.tcursor = 0;
    this.tcount = 0;
  }

  /* ------------------------------ частицы ------------------------------ */

  _alloc() {
    // ищем свободный слот, иначе вытесняем самый старый (round-robin)
    for (let k = 0; k < P_MAX; k++) {
      const i = (this.cursor + k) % P_MAX;
      if (!this.alive[i]) {
        this.cursor = (i + 1) % P_MAX;
        this.alive[i] = 1;
        this.count++;
        return i;
      }
    }
    const i = this.cursor;
    this.cursor = (i + 1) % P_MAX;
    return i;
  }

  /**
   * o = { count, color | colors[], speed:[a,b], angle:[a,b] (рад), life:[a,b],
   *       size:[a,b], grow, gravity, drag, type, spin }
   */
  burst(x, y, o = {}) {
    const n = o.count ?? 8;
    const type = o.type ?? PT.DOT;
    const colors = o.colors || (o.color ? [o.color] : ['#ffffff']);
    for (let k = 0; k < n; k++) {
      const i = this._alloc();
      const a = o.angle
        ? randRange(o.angle[0], o.angle[1])
        : (o.dir !== undefined ? o.dir + randRange(-o.spread || -0.4, o.spread || 0.4) : randRange(0, Math.PI * 2));
      const sp = o.speed ? randRange(o.speed[0], o.speed[1]) : randRange(20, 80);
      this.x[i] = x + (o.jitter ? randRange(-o.jitter, o.jitter) : 0);
      this.y[i] = y + (o.jitter ? randRange(-o.jitter, o.jitter) : 0);
      this.vx[i] = Math.cos(a) * sp;
      this.vy[i] = Math.sin(a) * sp;
      this.maxLife[i] = this.life[i] = o.life ? randRange(o.life[0], o.life[1]) : randRange(0.3, 0.7);
      this.size[i] = o.size ? randRange(o.size[0], o.size[1]) : randRange(1.5, 3.5);
      this.grow[i] = o.grow ?? 0;
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 1.2;
      this.rot[i] = randRange(0, Math.PI * 2);
      this.vr[i] = o.spin ? randRange(-o.spin, o.spin) : 0;
      this.type[i] = type;
      this.color[i] = colors[(Math.random() * colors.length) | 0];
    }
  }

  /** Одиночная частица (для дымовых следов ракет, непрерывного огня) */
  emit(x, y, vx, vy, life, size, color, type = PT.SMOKE, grow = 6, gravity = -12) {
    const i = this._alloc();
    this.x[i] = x; this.y[i] = y;
    this.vx[i] = vx; this.vy[i] = vy;
    this.maxLife[i] = this.life[i] = life;
    this.size[i] = size;
    this.grow[i] = grow;
    this.grav[i] = gravity;
    this.drag[i] = 1.6;
    this.rot[i] = 0; this.vr[i] = 0;
    this.type[i] = type;
    this.color[i] = color;
  }

  /** Расширяющееся кольцо (взрыв, ударная волна) */
  ring(x, y, size, grow, life, color, width = 3) {
    const i = this._alloc();
    this.x[i] = x; this.y[i] = y;
    this.vx[i] = 0; this.vy[i] = 0;
    this.maxLife[i] = this.life[i] = life;
    this.size[i] = size;
    this.grow[i] = grow;
    this.grav[i] = 0; this.drag[i] = 0;
    this.type[i] = PT.RING;
    this.color[i] = color;
    this.rot[i] = width;   // у кольца в rot храним толщину линии
    this.vr[i] = 0;
  }

  update(dt) {
    let alive = 0;
    for (let i = 0; i < P_MAX; i++) {
      if (!this.alive[i]) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alive[i] = 0; continue; }
      alive++;
      const d = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= d;
      this.vy[i] = this.vy[i] * d + this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.size[i] += this.grow[i] * dt;
      if (this.size[i] < 0.1) this.size[i] = 0.1;
      this.rot[i] += this.vr[i] * dt;
    }
    this.count = alive;

    let talive = 0;
    for (let i = 0; i < T_MAX; i++) {
      if (!this.talive[i]) continue;
      this.tlife[i] -= dt;
      if (this.tlife[i] <= 0) { this.talive[i] = 0; continue; }
      talive++;
      this.ty[i] += this.tvy[i] * dt;
      this.tvy[i] *= Math.exp(-1.6 * dt);
    }
    this.tcount = talive;
  }

  /* ------------------------------- тексты ------------------------------ */

  spawnText(x, y, text, color = '#ffd23f', size = 13, life = 0.95) {
    let idx = -1;
    for (let k = 0; k < T_MAX; k++) {
      const i = (this.tcursor + k) % T_MAX;
      if (!this.talive[i]) { idx = i; break; }
    }
    if (idx < 0) { idx = this.tcursor; }
    this.tcursor = (idx + 1) % T_MAX;
    this.tx[idx] = x;
    this.ty[idx] = y;
    this.tvy[idx] = -34;
    this.tlife[idx] = this.tmax[idx] = life;
    this.tsize[idx] = size;
    this.ttext[idx] = text;
    this.tcolor[idx] = color;
    this.talive[idx] = 1;
  }

  /* ---------------------------- отрисовка ------------------------------ */

  render(g) {
    for (let i = 0; i < P_MAX; i++) {
      if (!this.alive[i]) continue;
      const t = clamp(this.life[i] / this.maxLife[i], 0, 1);
      const s = this.size[i];
      g.globalAlpha = this.type[i] === PT.SMOKE ? t * 0.5 : t;
      g.fillStyle = this.color[i];

      switch (this.type[i]) {
        case PT.SPARK: {
          g.save();
          g.translate(this.x[i], this.y[i]);
          g.rotate(Math.atan2(this.vy[i], this.vx[i]));
          g.fillRect(-s * 2.4, -s * 0.4, s * 4.8, s * 0.8);
          g.restore();
          break;
        }
        case PT.SMOKE: {
          g.beginPath();
          g.arc(this.x[i], this.y[i], s, 0, Math.PI * 2);
          g.fill();
          break;
        }
        case PT.SHARD: {
          g.save();
          g.translate(this.x[i], this.y[i]);
          g.rotate(this.rot[i]);
          g.fillRect(-s, -s, s * 2, s * 2);
          g.restore();
          break;
        }
        case PT.RING: {
          g.globalAlpha = t * 0.9;
          g.strokeStyle = this.color[i];
          g.lineWidth = this.rot[i] * t + 0.5;
          g.beginPath();
          g.arc(this.x[i], this.y[i], s, 0, Math.PI * 2);
          g.stroke();
          break;
        }
        case PT.FLAME: {
          g.globalAlpha = t * 0.85;
          g.beginPath();
          g.arc(this.x[i], this.y[i], s * (0.5 + t * 0.7), 0, Math.PI * 2);
          g.fill();
          break;
        }
        default: {
          g.beginPath();
          g.arc(this.x[i], this.y[i], s, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    g.globalAlpha = 1;
  }

  renderTexts(g, cam) {
    // тексты рисуем в мировом пространстве, но с постоянным экранным размером
    const inv = 1 / (cam ? cam.zoom : 1);
    for (let i = 0; i < T_MAX; i++) {
      if (!this.talive[i]) continue;
      const t = clamp(this.tlife[i] / this.tmax[i], 0, 1);
      const size = this.tsize[i] * inv;
      g.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : t / 0.7;
      g.font = `900 ${size.toFixed(1)}px "Trebuchet MS", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = size * 0.22;
      g.strokeStyle = 'rgba(0,0,0,0.65)';
      g.strokeText(this.ttext[i], this.tx[i], this.ty[i]);
      g.fillStyle = this.tcolor[i];
      g.fillText(this.ttext[i], this.tx[i], this.ty[i]);
    }
    g.globalAlpha = 1;
  }

  clear() {
    this.alive.fill(0);
    this.talive.fill(0);
    this.count = 0;
    this.tcount = 0;
  }
}

export default ParticleSystem;
