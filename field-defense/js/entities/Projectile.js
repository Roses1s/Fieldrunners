/* ==========================================================================
   Projectile.js — пул снарядов.

   Типы:
     BULLET  — быстрая трассирующая пуля (гатлинг), попадание по достижении
     MISSILE — самонаводящаяся ракета: каждый шаг доворачивает угол к цели
               (rotateTowards с ограничением угловой скорости), взрыв по площади
     GLUE    — комок клея: замедляет цель и (на 2–3 уровнях) соседей
     BEE     — пчела из улья: догоняет цель, кусает и возвращается к башне

   Все объекты переиспользуются — за бой не создаётся новых.
   ========================================================================== */

import { CONFIG } from '../utils/Constants.js';
import { clamp, rotateTowards, dist, randRange } from '../utils/MathUtil.js';
import { Sprites } from '../utils/SpriteSheet.js';
import { PT } from '../systems/ParticleSystem.js';

export const PROJ = {
  BULLET: 0,
  MISSILE: 1,
  GLUE: 2,
  BEE: 3,
  SHELL: 4
};

const PROJ_MAX = CONFIG.PROJECTILE_POOL;

class Projectile {
  constructor() {
    this.active = false;
    this.type = 0;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.angle = 0;
    this.speed = 300;
    this.turn = 6;            // рад/с (для homing)
    this.target = null;
    this.damage = 0;
    this.splash = 0;
    this.damageType = 'physical';
    this.pierceArmor = 0;
    this.life = 2;
    this.t = 0;
    this.owner = null;
    this.slow = 0;
    this.slowTime = 0;
    this.slowTargets = 1;
    this.trail = 0;
    this.size = 1;
    this.color = '#ffd23f';
    this.homing = false;
    this.returning = false;
    this.homeX = 0; this.homeY = 0;
    this.hitRadius = 4;
    this.dead = false;
  }
}

export class ProjectilePool {
  constructor(game) {
    this.game = game;
    this.pool = new Array(PROJ_MAX);
    for (let i = 0; i < PROJ_MAX; i++) this.pool[i] = new Projectile();
    this.cursor = 0;
    this.count = 0;
  }

  _alloc() {
    for (let k = 0; k < PROJ_MAX; k++) {
      const i = (this.cursor + k) % PROJ_MAX;
      if (!this.pool[i].active) { this.cursor = (i + 1) % PROJ_MAX; return this.pool[i]; }
    }
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % PROJ_MAX;
    return p;
  }

  /**
   * o = { type, x, y, target, speed, damage, splash, damageType, pierceArmor,
   *       slow, slowTime, slowTargets, owner, color, size, turn, life, angle }
   */
  spawn(o) {
    const p = this._alloc();
    p.active = true;
    p.dead = false;
    p.type = o.type ?? PROJ.BULLET;
    p.x = o.x; p.y = o.y;
    p.target = o.target || null;
    p.speed = o.speed ?? 480;
    p.damage = o.damage ?? 1;
    p.splash = o.splash ?? 0;
    p.damageType = o.damageType ?? 'physical';
    p.pierceArmor = o.pierceArmor ?? 0;
    p.slow = o.slow ?? 0;
    p.slowTime = o.slowTime ?? 0;
    p.slowTargets = o.slowTargets ?? 1;
    p.owner = o.owner || null;
    p.color = o.color ?? '#ffd23f';
    p.size = o.size ?? 1;
    p.turn = o.turn ?? 6;
    p.life = o.life ?? 2.5;
    p.t = 0;
    p.trail = 0;
    p.homing = p.type === PROJ.MISSILE || p.type === PROJ.BEE || !!o.homing;
    p.returning = false;
    p.homeX = o.homeX ?? p.x;
    p.homeY = o.homeY ?? p.y;
    p.hitRadius = o.hitRadius ?? 4;
    p.angle = o.angle !== undefined
      ? o.angle
      : (p.target ? Math.atan2(p.target.y - p.y, p.target.x - p.x) : 0);
    const s = Math.sin(p.angle), c = Math.cos(p.angle);
    p.vx = c * p.speed;
    p.vy = s * p.speed;
    return p;
  }

  update(dt) {
    const g = this.game;
    let n = 0;
    for (let i = 0; i < PROJ_MAX; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.t += dt;
      if (p.t > p.life) { p.active = false; continue; }
      n++;

      // ---- наведение ----
      if (p.homing && !p.returning) {
        const tgt = p.target;
        if (!tgt || !tgt.alive) {
          // цель мертва: ракета летит прямо и взрывается в конце жизни
          if (p.type === PROJ.MISSILE) p.life = Math.min(p.life, p.t + 0.22);
          p.homing = false;
        } else {
          const want = Math.atan2(tgt.y - p.y, tgt.x - p.x);
          p.angle = rotateTowards(p.angle, want, p.turn * dt);
          p.vx = Math.cos(p.angle) * p.speed;
          p.vy = Math.sin(p.angle) * p.speed;
        }
      }

      // ---- движение ----
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // ---- следы ----
      if (p.type === PROJ.MISSILE) {
        p.trail -= dt;
        if (p.trail <= 0) {
          p.trail = 0.016;
          g.particles.emit(
            p.x - Math.cos(p.angle) * 6, p.y - Math.sin(p.angle) * 6,
            randRange(-12, 12), randRange(-16, 4),
            randRange(0.3, 0.6), randRange(1.6, 3.2),
            Math.random() < 0.5 ? '#d8d8d8' : '#ffb46b',
            PT.SMOKE, 9, -8
          );
        }
      } else if (p.type === PROJ.BULLET) {
        p.trail -= dt;
        if (p.trail <= 0) {
          p.trail = 0.03;
          g.particles.emit(p.x, p.y, 0, 0, 0.09, 1.3, 'rgba(255,220,140,0.9)', PT.DOT, 0, 0);
        }
      }

      // ---- возвращение пчелы ----
      if (p.returning) {
        const d = dist(p.x, p.y, p.homeX, p.homeY);
        if (d < 8) { p.active = false; continue; }
        const want = Math.atan2(p.homeY - p.y, p.homeX - p.x);
        p.angle = rotateTowards(p.angle, want, p.turn * dt);
        p.vx = Math.cos(p.angle) * p.speed;
        p.vy = Math.sin(p.angle) * p.speed;
        continue;
      }

      // ---- попадание ----
      const tgt = p.target;
      if (tgt && tgt.alive) {
        const rr = tgt.radius + p.hitRadius;
        if (dist(p.x, p.y, tgt.x, tgt.y) <= rr) {
          this._impact(p, tgt);
          continue;
        }
      } else if (!p.homing) {
        // без цели снаряд просто гаснет (пули летят строго в свою цель)
        p.active = false;
        continue;
      }

      // вылет за пределы мира
      if (p.x < -60 || p.y < -60 || p.x > g.worldW + 60 || p.y > g.worldH + 60) {
        p.active = false;
      }
    }
    this.count = n;
  }

  _impact(p, tgt) {
    const g = this.game;
    switch (p.type) {
      case PROJ.BULLET: {
        g.damageEnemy(tgt, p.damage, p.damageType, { pierceArmor: p.pierceArmor, source: p.owner });
        g.particles.burst(p.x, p.y, {
          count: 3, colors: ['#fff2b0', '#ffb45a'], speed: [20, 70],
          life: [0.1, 0.22], size: [0.8, 1.8], type: PT.SPARK, drag: 3
        });
        p.active = false;
        break;
      }
      case PROJ.MISSILE: {
        this.explode(p, p.x, p.y);
        p.active = false;
        break;
      }
      case PROJ.GLUE: {
        g.effects.spawn(4 /* SPLAT */, {
          x: tgt.x, y: tgt.y + tgt.radius * 0.5, size: tgt.radius * 1.5,
          life: Math.max(0.6, p.slowTime * 0.5), color: 'rgba(110,215,250,0.85)',
          angle: randRange(0, Math.PI)
        });
        // основная цель
        tgt.applySlow(p.slow, p.slowTime);
        if (p.damage > 0) g.damageEnemy(tgt, p.damage, p.damageType, { source: p.owner });
        // соседи (сплэш-замедление на 2–3 уровне)
        if (p.slowTargets > 1 && p.splash > 0) {
          const near = g.collision.queryCircle(tgt.x, tgt.y, p.splash, true);
          let c = 0;
          for (let i = 0; i < near.length && c < p.slowTargets; i++) {
            const e = near[i];
            if (e === tgt || !e.alive) continue;
            e.applySlow(p.slow * 0.85, p.slowTime * 0.85);
            c++;
            g.effects.spawn(4, {
              x: e.x, y: e.y + e.radius * 0.5, size: e.radius * 1.3,
              life: 0.5, color: 'rgba(110,215,250,0.7)'
            });
          }
        }
        g.particles.burst(p.x, p.y, {
          count: 9, colors: ['#bff0ff', '#63cdf2', '#e6fbff'], speed: [25, 85],
          life: [0.25, 0.5], size: [1.5, 3.4], gravity: 90, drag: 2
        });
        p.active = false;
        break;
      }
      case PROJ.BEE: {
        g.damageEnemy(tgt, p.damage, p.damageType, { source: p.owner });
        g.particles.burst(p.x, p.y, { count: 3, colors: ['#ffe66d', '#c9a227'], speed: [20, 60], life: [0.1, 0.25], size: [1, 2] });
        // пчела возвращается к улью
        p.returning = true;
        p.homing = false;
        p.target = null;
        p.speed *= 1.25;
        p.life = p.t + 3;
        break;
      }
      default: {
        g.damageEnemy(tgt, p.damage, p.damageType, { source: p.owner });
        p.active = false;
      }
    }
  }

  /** Взрыв с уроном по площади (ракеты, ядерный заряд) */
  explode(p, x, y) {
    const g = this.game;
    const big = p.splash > 70;
    g.effects.spawn(1 /* EXPLOSION */, {
      x, y, size: Math.max(10, p.splash * 0.85), life: big ? 0.62 : 0.34,
      color: '#ffd9a0', width: big ? 4 : 2.4
    });
    g.effects.spawn(6 /* SHOCKWAVE */, {
      x, y, size: p.splash * 0.4, size2: p.splash * (big ? 1.9 : 1.35),
      life: big ? 0.5 : 0.28, color: 'rgba(255,220,170,0.9)', width: big ? 5 : 3
    });
    g.particles.burst(x, y, {
      count: big ? 34 : 16,
      colors: ['#fff0b0', '#ffb45a', '#ff6b2c', '#7a3a20'],
      speed: big ? [60, 260] : [40, 150],
      life: [0.25, 0.7], size: [1.5, 4], gravity: 40, drag: 1.8, type: PT.DOT
    });
    g.particles.burst(x, y, {
      count: big ? 16 : 8, colors: ['#6b6b6b', '#8d8d8d'],
      speed: [15, 60], life: [0.6, 1.2], size: [3, 7], gravity: -14, drag: 1.1, type: PT.SMOKE
    });
    g.effects.spawn(5 /* SCORCH */, {
      x, y: y + 2, size: p.splash * 0.55, life: big ? 6 : 3, angle: randRange(0, 3)
    });
    g.audio?.play(big ? 'nuke' : 'explosion', { big });
    if (big) g.camera?.shake(9, 0.5);
    else g.camera?.shake(2.2, 0.16);

    // урон по площади с затуханием к краю
    const list = g.collision.queryCircle(x, y, p.splash, false);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) continue;
      const d = dist(x, y, e.x, e.y);
      const k = clamp(1 - (d / (p.splash + e.radius)) * 0.65, 0.35, 1);
      g.damageEnemy(e, p.damage * k, p.damageType, { pierceArmor: p.pierceArmor, source: p.owner });
    }
  }

  render(g) {
    for (let i = 0; i < PROJ_MAX; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      switch (p.type) {
        case PROJ.BULLET: {
          // трассер: вытянутая светящаяся полоска
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.translate(p.x, p.y);
          g.rotate(p.angle);
          const len = 8 * p.size;
          const lg = g.createLinearGradient(-len, 0, len * 0.6, 0);
          lg.addColorStop(0, 'rgba(255,180,80,0)');
          lg.addColorStop(0.6, 'rgba(255,220,140,0.85)');
          lg.addColorStop(1, 'rgba(255,255,235,1)');
          g.fillStyle = lg;
          g.fillRect(-len, -1.1 * p.size, len * 1.6, 2.2 * p.size);
          g.restore();
          break;
        }
        case PROJ.MISSILE: {
          Sprites.draw(g, 'proj.missile', p.x, p.y, { rot: p.angle, scale: 0.95 * p.size });
          break;
        }
        case PROJ.GLUE: {
          Sprites.draw(g, 'proj.glue', p.x, p.y, { rot: p.angle, scale: p.size });
          break;
        }
        case PROJ.BEE: {
          const wob = Math.sin(p.t * 40) * 2.2;
          Sprites.draw(g, 'proj.bee', p.x, p.y + wob, { rot: p.angle, scale: p.size });
          break;
        }
        default: {
          g.fillStyle = p.color;
          g.beginPath(); g.arc(p.x, p.y, 2.5 * p.size, 0, Math.PI * 2); g.fill();
        }
      }
    }
  }

  clear() {
    for (let i = 0; i < PROJ_MAX; i++) this.pool[i].active = false;
    this.count = 0;
  }
}

export default ProjectilePool;
