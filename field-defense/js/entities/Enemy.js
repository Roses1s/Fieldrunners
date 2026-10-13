/* ==========================================================================
   Enemy.js — базовый класс врага.

   Движение: единая модель «шаг по клеткам» для обоих типов карт.
     • fixed-карты — проходимы только клетки PATH, поэтому flow field
       автоматически ведёт врага ровно по нарисованной дороге;
     • maze-карты — flow field пересчитывается при постройке башни, и ВСЕ
       враги мгновенно перестраивают маршрут (barrage/mazing).
   Воздушные юниты flow field игнорируют и летят по прямой к выходу.

   Статусы:
     • замедление НЕ стакается — берётся максимальный активный процент;
     • горение тикает раз в 0.5 с (burnDamage = burnDps * 0.5);
     • броня вычитается из каждого попадания: dmg = max(1, dmg - armor).
   ========================================================================== */

import { CELL } from '../utils/Constants.js';
import { clamp, dist, lerpAngle, randRange, normAngle } from '../utils/MathUtil.js';
import { Sprites } from '../utils/SpriteSheet.js';
import { PT } from '../systems/ParticleSystem.js';
import { FX } from './Effect.js';

export class Enemy {
  /**
   * @param {GameScene} game
   * @param {object} def — запись из ENEMY_DEFS
   * @param {number} entryIdx — индекс точки входа
   * @param {number} wave
   * @param {object} mods — { hpMul, armorMul, speedMul, isBoss }
   */
  constructor(game, def, entryIdx, wave, mods = {}) {
    this.game = game;
    this.def = def;
    this.id = def.id;
    this.wave = wave;
    this.alive = true;
    this.reachedEnd = false;

    const grid = game.grid;
    const path = game.path;
    const entry = grid.entries[clamp(entryIdx | 0, 0, grid.entries.length - 1)] || grid.entries[0];

    // ---- масштабирование по волне ----
    const hpScale = Math.pow(game.hpScale, Math.max(0, wave - 1));
    this.maxHp = Math.max(1, Math.round(def.hp * hpScale * (mods.hpMul || 1)));
    this.hp = this.maxHp;
    this.armor = Math.round(def.armor * Math.pow(game.armorScale, Math.max(0, wave - 1)) * (mods.armorMul || 1));
    this.baseSpeed = def.speed * (mods.speedMul || 1) * (game.speedScale || 1);
    this.reward = def.reward;
    this.livesCost = def.isBoss || mods.isBoss ? 5 : (def.livesCost || 1);
    this.radius = def.radius;
    this.flying = !!def.flying;
    this.slowImmune = !!def.slowImmune;
    this.regen = def.regen || 0;
    this.scale = def.scale || 1;
    this.frames = def.frames || 4;
    this.spriteKey = `enemy.${def.id}`;

    // ---- позиция на пути ----
    this.cellIdx = grid.idx(entry.cx, entry.cy);
    this.anchorIdx = this.cellIdx;
    const c = { x: 0, y: 0 };
    grid.center(this.cellIdx, c);
    this.x = c.x;
    this.y = c.y;
    this.altitude = this.flying ? 16 : 0;
    this.angle = 0;                 // направление взгляда
    this.moveAngle = 0;
    this.progress = 0;              // сколько мировых px пройдено (для FIRST/LAST)
    this.remain = 0;                // клеток до выхода
    this.pathVersion = path.version;

    // ---- статусы ----
    this.slowPct = 0;
    this.slowTimer = 0;
    this.burnDps = 0;
    this.burnTimer = 0;
    this.burnTick = 0;
    this.hitFlash = 0;
    this.invuln = 0;
    this.spawnAnim = 1;             // 1 → 0: появление
    this.animT = Math.random() * 10;
    this.deadAnim = 0;
    this.lastDamageBy = null;

    // воздушные цели летят по прямой к ближайшему выходу
    if (this.flying) {
      let best = null, bd = Infinity;
      for (const e of grid.exits) {
        const ex = grid.centerX(e.cx), ey = grid.centerY(e.cy);
        const d = dist(this.x, this.y, ex, ey);
        if (d < bd) { bd = d; best = { x: ex, y: ey }; }
      }
      this.flyTarget = best || { x: this.x, y: this.y };
      this.moveAngle = Math.atan2(this.flyTarget.y - this.y, this.flyTarget.x - this.x);
      this.angle = this.moveAngle;
      this.progress = 0;
      this.remain = bd / CELL;
    } else {
      this._refreshAnchor(true);
    }
  }

  get speed() {
    const s = this.slowPct > 0 ? this.baseSpeed * (1 - this.slowPct) : this.baseSpeed;
    return s;
  }

  /* ------------------------------- движение ---------------------------- */

  /** Пересчитать целевую клетку по flow field */
  _refreshAnchor(initial = false) {
    const path = this.game.path;
    this.pathVersion = path.version;
    if (initial) {
      this.anchorIdx = path.nextFrom(this.cellIdx);
    } else {
      // если целевая клетка внезапно занята башней — отступаем в текущую
      if (!this.game.grid.isWalkable(this.anchorIdx)) {
        this.anchorIdx = this.cellIdx;
      }
    }
    this.remain = path.distToExit(this.anchorIdx < 0 ? this.cellIdx : this.anchorIdx);
  }

  update(dt) {
    if (!this.alive) return;

    if (this.spawnAnim > 0) this.spawnAnim = Math.max(0, this.spawnAnim - dt * 2.6);
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 10);
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    this.animT += dt * (0.6 + this.speed / 42);

    // ---- статусы ----
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) { this.slowTimer = 0; this.slowPct = 0; }
    }
    if (this.burnTimer > 0) {
      this.burnTimer -= dt;
      this.burnTick -= dt;
      if (this.burnTick <= 0) {
        this.burnTick = 0.5;
        this.takeDamage(this.burnDps * 0.5, 'fire', { noArmor: false, ignoreFlash: true });
      }
      if (this.burnTimer <= 0) { this.burnDps = 0; this.burnTimer = 0; }
      else if (Math.random() < dt * 14) {
        this.game.particles.emit(
          this.x + randRange(-this.radius * 0.6, this.radius * 0.6),
          this.y - this.altitude + randRange(-2, 4),
          randRange(-6, 6), randRange(-38, -18),
          randRange(0.25, 0.5), randRange(1.4, 3),
          Math.random() < 0.5 ? '#ff9b3d' : '#ffd23f', PT.FLAME, -1.5, -14
        );
      }
    }
    if (this.regen > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * this.regen * dt);
    }

    this.updateVfx(dt);

    // ---- пересчёт маршрута при изменении сетки ----
    if (!this.flying && this.pathVersion !== this.game.path.version) {
      this._refreshAnchor(false);
    }

    if (this.flying) this._updateFlying(dt);
    else this._updateGround(dt);

    if (this.hp <= 0) this.die();
  }

  _updateGround(dt) {
    const grid = this.game.grid;
    const path = this.game.path;

    if (this.anchorIdx < 0) {
      // стоим на выходе
      this.leak();
      return;
    }

    const t = grid.center(this.anchorIdx, { x: 0, y: 0 });
    const dx = t.x - this.x, dy = t.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;

    if (d <= Math.max(0.6, step)) {
      // дошли до клетки
      this.x = t.x; this.y = t.y;
      this.progress += d;
      this.cellIdx = this.anchorIdx;
      const nxt = path.nextFrom(this.cellIdx);
      if (nxt < 0) {
        this.leak();
        return;
      }
      this.anchorIdx = nxt;
      this.remain = path.distToExit(nxt);
    } else {
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
      this.progress += step;
      this.moveAngle = Math.atan2(dy, dx);
    }
    // плавный доворот спрайта
    this.angle = lerpAngle(this.angle, this.moveAngle, clamp(dt * 12, 0, 1));
  }

  _updateFlying(dt) {
    const ft = this.flyTarget;
    const dx = ft.x - this.x, dy = ft.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    this.moveAngle = Math.atan2(dy, dx);
    this.angle = lerpAngle(this.angle, this.moveAngle, clamp(dt * 4, 0, 1));
    this.progress += step;
    this.remain = d / CELL;

    // лёгкое покачивание
    this.altitude = 16 + Math.sin(this.animT * 2.2) * 2.2;

    if (d <= Math.max(1, step)) {
      this.x = ft.x; this.y = ft.y;
      this.leak();
      return;
    }
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
  }

  /**
   * Переставить врага в произвольную точку мира (используется для десанта
   * из транспорта). Опорная клетка и следующая клетка пересчитываются.
   */
  placeAt(x, y) {
    const grid = this.game.grid;
    const path = this.game.path;
    this.x = x;
    this.y = y;
    if (this.flying) return this;
    let c = grid.cellFromWorld(x, y);
    if (!grid.inBounds(c.cx, c.cy)) c = grid.cellFromIdx(this.cellIdx);
    let idx = grid.idx(c.cx, c.cy);
    if (!grid.isWalkable(idx)) {
      // ищем ближайшую проходимую клетку рядом
      let best = -1, bd = Infinity;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = c.cx + dx, ny = c.cy + dy;
          if (!grid.inBounds(nx, ny)) continue;
          const ni = grid.idx(nx, ny);
          if (!grid.isWalkable(ni)) continue;
          const d = Math.abs(dx) + Math.abs(dy);
          if (d < bd) { bd = d; best = ni; }
        }
      }
      if (best >= 0) idx = best;
      else idx = this.cellIdx;
      const cc = grid.center(idx, { x: 0, y: 0 });
      this.x = cc.x;
      this.y = cc.y;
    }
    this.cellIdx = idx;
    this.anchorIdx = path.nextFrom(idx);
    if (this.anchorIdx < 0) this.anchorIdx = idx;
    this.remain = path.distToExit(this.anchorIdx);
    this.pathVersion = path.version;
    return this;
  }

  /** Хук для подклассов: дым, пыль, следы */
  updateVfx(dt) { void dt; }

  /* ------------------------------- статусы ----------------------------- */

  /** Замедление: берётся максимальный процент, время — наибольшее */
  applySlow(pct, time) {
    if (this.slowImmune || pct <= 0) {
      if (this.slowImmune && pct > 0) {
        this.game.texts?.spawn(this.x, this.y - this.radius - 12, 'IMMUNE', '#9fb4d8', 10, 0.6);
      }
      return false;
    }
    const p = clamp(pct, 0, 0.92);
    if (p >= this.slowPct) this.slowPct = p;
    this.slowTimer = Math.max(this.slowTimer, time);
    return true;
  }

  applyBurn(dps, time) {
    this.burnDps = Math.max(this.burnDps, dps);
    this.burnTimer = Math.max(this.burnTimer, time);
    if (this.burnTick <= 0) this.burnTick = 0.5;
  }

  /* -------------------------------- урон ------------------------------- */

  /**
   * @param {number} amount — «сырой» урон
   * @param {string} type — тип урона
   * @param {object} o — { pierceArmor, source, ignoreFlash }
   * @returns {number} фактически нанесённый урон
   */
  takeDamage(amount, type = 'physical', o = {}) {
    if (!this.alive || this.invuln > 0) return 0;
    const pierce = clamp(o.pierceArmor || 0, 0, 1);
    const armor = this.armor * (1 - pierce);
    const dmg = Math.max(1, amount - armor);
    this.hp -= dmg;
    if (!o.ignoreFlash) this.hitFlash = 1;
    this.lastDamageBy = o.source || null;
    if (o.source?.registerDamage) o.source.registerDamage(dmg);
    return dmg;
  }

  /* -------------------------------- смерть ------------------------------ */

  die() {
    if (!this.alive) return;
    this.alive = false;
    const g = this.game;
    const def = this.def;

    // награда
    g.economy.killReward(def, this.wave, this.x, this.y - this.altitude - 10);
    g.economy.kills++;
    g.waves.onEnemyKilled();
    if (this.lastDamageBy?.registerKill) this.lastDamageBy.registerKill();

    // эффекты смерти
    if (def.isBoss) {
      g.effects.spawn(FX.EXPLOSION, { x: this.x, y: this.y, size: 46, life: 0.8, color: '#ffd9a0', width: 5 });
      g.effects.spawn(FX.SHOCKWAVE, { x: this.x, y: this.y, size: 20, size2: 130, life: 0.6, color: 'rgba(255,220,170,0.9)', width: 6 });
      g.particles.burst(this.x, this.y, {
        count: 46, colors: ['#fff0b0', '#ff9b3d', '#ff5a2c', '#6b6b6b'],
        speed: [50, 240], life: [0.4, 1.1], size: [2, 6], gravity: 90, drag: 1.4
      });
      g.camera.shake(10, 0.6);
      g.audio?.play('kill', { big: true });
      g.audio?.play('explosion', { big: true });
      g.texts?.spawn(this.x, this.y - 40, 'БОСС УНИЧТОЖЕН', '#ffd23f', 18, 1.4);
    } else if (this.radius >= 13) {
      // техника — взрыв
      g.effects.spawn(FX.EXPLOSION, { x: this.x, y: this.y, size: 20, life: 0.4, color: '#ffd9a0', width: 3 });
      g.particles.burst(this.x, this.y, {
        count: 18, colors: ['#fff0b0', '#ff9b3d', '#6b6b6b', '#3a3a3a'],
        speed: [40, 150], life: [0.3, 0.8], size: [1.6, 4.4], gravity: 110, drag: 1.6
      });
      g.particles.burst(this.x, this.y, {
        count: 7, colors: ['#5a5a5a', '#7d7d7d'], speed: [10, 40],
        life: [0.6, 1.2], size: [3, 7], gravity: -16, drag: 1.2, type: PT.SMOKE
      });
      g.audio?.play('kill', { big: true });
      g.camera.shake(2, 0.14);
    } else {
      // пехота — «пуф»
      g.particles.burst(this.x, this.y - 4, {
        count: 10, colors: [def.tint, '#ffffff', '#ffd23f'],
        speed: [30, 110], life: [0.2, 0.5], size: [1.4, 3.2], gravity: 130, drag: 2
      });
      g.audio?.play('kill');
    }

    // десант из транспорта
    if (def.onDeath && def.onDeath.spawn) {
      g.spawnSquad({
        type: def.onDeath.spawn,
        count: def.onDeath.count || 2,
        at: { x: this.x, y: this.y },
        cellIdx: this.cellIdx,
        spread: def.onDeath.spread || 6,
        wave: this.wave
      });
    }

    g.onEnemyRemoved(this);
  }

  /** Дошёл до выхода — минус жизнь */
  leak() {
    if (!this.alive) return;
    this.alive = false;
    this.reachedEnd = true;
    const g = this.game;
    g.economy.leak(this.livesCost, this.x, this.y - this.altitude - 14);
    g.waves.onEnemyLeaked();
    g.effects.spawn(FX.SHOCKWAVE, {
      x: this.x, y: this.y, size: 6, size2: 44, life: 0.4,
      color: 'rgba(255,90,90,0.9)', width: 4
    });
    g.particles.burst(this.x, this.y, {
      count: 14, colors: ['#ff6b6b', '#ffd23f'], speed: [30, 110],
      life: [0.25, 0.6], size: [1.6, 3.4], gravity: 60
    });
    g.camera.shake(4, 0.25);
    g.audio?.play('leak');
    g.onEnemyRemoved(this);
  }

  /** Клетка, в которой сейчас стоит враг (для запрета строительства поверх) */
  occupiedCells(out) {
    out = out || [];
    out.length = 0;
    if (this.flying) return out;
    out.push(this.cellIdx);
    if (this.anchorIdx >= 0 && this.anchorIdx !== this.cellIdx) out.push(this.anchorIdx);
    return out;
  }

  /* ------------------------------ отрисовка ---------------------------- */

  render(g) {
    if (!this.alive) return;
    const drawY = this.y - this.altitude;
    const s = this.scale * (this.spawnAnim > 0 ? (1 + this.spawnAnim * 0.25) : 1);
    const frame = Math.floor(this.animT * 8) % this.frames;
    const flip = Math.cos(this.angle) < 0;

    // тень
    g.save();
    g.globalAlpha = this.flying ? 0.22 : 0.3;
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(this.x, this.y + this.radius * 0.5, this.radius * (this.flying ? 0.85 : 1), this.radius * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // появление: полупрозрачность + выезд снизу
    const appear = this.spawnAnim > 0 ? 1 - this.spawnAnim : 1;

    Sprites.drawFrame(g, this.spriteKey, frame, this.x, drawY + (this.spawnAnim * 6), {
      scale: s, flip, alpha: clamp(appear * 1.6, 0, 1), align: 'center'
    });

    this.renderExtra(g, frame, flip, s, drawY);

    // белая вспышка при попадании (силуэт через кэш)
    if (this.hitFlash > 0) {
      const sil = Sprites.getSilhouette(this.spriteKey, frame);
      if (sil) {
        g.save();
        g.globalAlpha = clamp(this.hitFlash * 0.85, 0, 0.85);
        g.globalCompositeOperation = 'lighter';
        const w = sil.width * s, h = sil.height * s;
        g.translate(this.x, drawY + this.spawnAnim * 6);
        if (flip) g.scale(-1, 1);
        g.drawImage(sil, -w / 2, -h / 2, w, h);
        g.restore();
      }
    }

    // индикатор замедления
    if (this.slowPct > 0) {
      g.save();
      g.globalAlpha = 0.5;
      g.strokeStyle = '#7fe4ff';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(this.x, this.y + this.radius * 0.45, this.radius * 1.05, this.radius * 0.5, 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 0.22;
      g.fillStyle = '#7fe4ff';
      g.fill();
      g.restore();
    }

    this.renderHealthBar(g, drawY);
  }

  renderExtra(g, frame, flip, s, drawY) {
    void g; void frame; void flip; void s; void drawY;
  }

  renderHealthBar(g, drawY) {
    if (this.hp >= this.maxHp && !this.def.isBoss) return;
    const w = Math.max(20, this.radius * 2.6);
    const h = this.def.isBoss ? 6 : 4;
    const x = this.x - w / 2;
    const y = drawY - this.radius * this.scale - (this.def.isBoss ? 22 : 13);
    const p = clamp(this.hp / this.maxHp, 0, 1);

    g.save();
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    // зелёный → жёлтый → красный
    const col = p > 0.6 ? '#6ee36e' : (p > 0.3 ? '#ffd23f' : '#ff5a5a');
    g.fillStyle = col;
    g.fillRect(x, y, w * p, h);
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.fillRect(x, y, w * p, h * 0.42);
    if (this.def.isBoss) {
      g.strokeStyle = 'rgba(255,210,63,0.85)';
      g.lineWidth = 1.4;
      g.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
    }
    g.restore();
  }
}

export default Enemy;

/* ==========================================================================
   Реестр поведений врагов: ENEMY_DEFS[id].behavior → класс.
   Подклассы регистрируют себя при импорте (см. enemies/index.js).
   ========================================================================== */

const ENEMY_REGISTRY = Object.create(null);

export function registerEnemy(behavior, cls) { ENEMY_REGISTRY[behavior] = cls; }

export function createEnemyHere(game, def, entryIdx, wave, mods) {
  const Cls = ENEMY_REGISTRY[def.behavior] || Enemy;
  return new Cls(game, def, entryIdx, wave, mods);
}

export function enemySupported(def) { return !!ENEMY_REGISTRY[def.behavior]; }
