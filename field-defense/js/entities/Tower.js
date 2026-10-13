/* ==========================================================================
   Tower.js — базовый класс башни.

   Ответственность базы:
     • хранение уровня, цены, вложенных денег
     • выбор цели по режиму (FIRST / LAST / STRONGEST / WEAKEST / CLOSEST)
     • поворот турели с ограничением угловой скорости
     • откат перезарядки, отдача, анимация постройки
     • отрисовка: плита + турель + обводка уровня + радиус при выделении

   Подклассы переопределяют fire(target) — саму механику выстрела.
   ========================================================================== */

import { CELL, TARGET_MODE } from '../utils/Constants.js';
import { PROJ } from './Projectile.js';
import { clamp, normAngle, rotateTowards, dist, lerp } from '../utils/MathUtil.js';
import { Sprites, vgrad } from '../utils/SpriteSheet.js';

export class Tower {
  /**
   * @param {GameScene} game
   * @param {object} def — запись из TOWER_DEFS
   * @param {number} cx, cy — клетка сетки
   */
  constructor(game, def, cx, cy) {
    this.game = game;
    this.def = def;
    this.id = def.id;
    this.cx = cx;
    this.cy = cy;
    this.x = cx * CELL + CELL / 2;
    this.y = cy * CELL + CELL / 2;

    this.level = 1;
    this.invested = def.cost;
    this.targetMode = TARGET_MODE.FIRST;

    this.cooldown = 0;
    this.angle = -Math.PI / 2;      // турель смотрит «вверх»
    this.recoil = 0;
    this.spin = 0;                  // для вращающихся стволов
    this.buildAnim = 1;             // 1 → 0: материализация
    this.selected = false;
    this.target = null;
    this.firing = 0;                // >0 — визуально стреляет
    this.shotsFired = 0;
    this.damageDealt = 0;
    this.kills = 0;
    this.timeAlive = 0;
    this.pulse = Math.random() * 6; // фаза для «дыхания» подсветки

    this.applyLevel();
  }

  /** Подтянуть параметры текущего уровня из таблиц */
  applyLevel() {
    const d = this.def;
    const i = this.level - 1;
    this.damage = d.dmg[i];
    this.rate = d.rate[i];
    this.range = d.range[i];
    // базовые значения без баффов Усилителя: GameScene.refreshTowerBuffs()
    // каждый кадр пересчитывает damage/range от этих чисел, поэтому бафф
    // не может «накапливаться» при повторных пересчётах
    this.baseDamage = this.damage;
    this.baseRange = this.range;
    this.buffDmgMul = 1;
    this.buffRangeMul = 1;
    this.interval = 1 / Math.max(0.01, this.rate);
    this.splash = d.splash ? d.splash[i] : 0;
    this.slow = d.slow ? d.slow[i] : 0;
    this.slowTime = d.slowTime ? d.slowTime[i] : 0;
    this.chain = d.chain ? d.chain[i] : 0;
    this.cone = d.cone ? d.cone[i] * Math.PI / 180 : 0;
    this.bees = d.bees ? d.bees[i] : 0;
    this.dpsRef = d.dps ? d.dps[i] : this.damage * this.rate;
  }

  get canTargetAir() { return this.def.targets === 'both'; }
  get name() { return this.def.name; }

  /** Точка поворота турели внутри спрайта (у каждого типа своя) */
  get turretPivot() { return [26, 26]; }

  /** Позиция дула в мировых координатах (для вспышек и спавна снарядов) */
  muzzle(out) {
    const o = out || { x: 0, y: 0 };
    const d = this.def.muzzleDist ?? 18;
    o.x = this.x + Math.cos(this.angle) * d;
    o.y = this.y + Math.sin(this.angle) * d;
    return o;
  }

  /* ----------------------------- выбор цели ---------------------------- */

  canTarget(e) {
    if (!e || !e.alive) return false;
    if (e.flying && !this.canTargetAir) return false;
    if (e.invuln > 0) return false;
    return true;
  }

  /** Найти цель в радиусе по текущему режиму прицеливания */
  findTarget() {
    const g = this.game;
    const list = g.collision.queryCircle(this.x, this.y, this.range, !this.canTargetAir);
    if (!list.length) return null;

    let best = null;
    let bestScore = -Infinity;
    const mode = this.targetMode;

    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!this.canTarget(e)) continue;
      let s;
      switch (mode) {
        case TARGET_MODE.LAST: s = -e.progress; break;
        case TARGET_MODE.STRONGEST: s = e.hp; break;
        case TARGET_MODE.WEAKEST: s = -e.hp; break;
        case TARGET_MODE.CLOSEST: s = -dist(this.x, this.y, e.x, e.y); break;
        case TARGET_MODE.FIRST:
        default: s = e.progress; break;
      }
      if (s > bestScore) { bestScore = s; best = e; }
    }
    return best;
  }

  /* ------------------------------- апдейт ------------------------------ */

  update(dt) {
    this.timeAlive += dt;
    this.pulse += dt;
    if (this.buildAnim > 0) this.buildAnim = Math.max(0, this.buildAnim - dt / 0.45);
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 14);
    if (this.firing > 0) this.firing = Math.max(0, this.firing - dt * 6);
    this.cooldown -= dt;

    const target = this.findTarget();
    this.target = target;
    if (!target) {
      // вхолостую турель медленно возвращается «на север»
      this.angle = rotateTowards(this.angle, -Math.PI / 2, (this.def.turnSpeed || 6) * dt * 0.35);
      return;
    }

    // доворот к цели
    const want = Math.atan2(target.y - this.y, target.x - this.x);
    const before = this.angle;
    this.angle = rotateTowards(this.angle, want, (this.def.turnSpeed || 6) * dt);
    const aligned = Math.abs(normAngle(want - this.angle)) < 0.3;

    if (this.cooldown <= 0 && aligned && this.buildAnim < 0.55) {
      this.fire(target);
      this.cooldown = this.interval;
      this.shotsFired++;
      this.recoil = this.def.recoil ?? 1.5;
      this.firing = 1;
    } else if (!aligned && this.cooldown < -0.4) {
      this.cooldown = -0.4;
    }
    // вращение блока стволов у гатлинга
    if (this.def.behavior === 'gatling') {
      this.spin += dt * (this.firing > 0 ? 26 : lerp(6, 0, 0.5));
    }
    void before;
  }

  /** Базовый выстрел — пуля. Подклассы переопределяют. */
  fire(target) {
    const m = this.muzzle({ x: 0, y: 0 });
    this.game.projectiles.spawn({
      type: PROJ.BULLET,
      x: m.x, y: m.y,
      target,
      speed: 640,
      damage: this.damage,
      damageType: this.def.damageType,
      owner: this,
      color: this.def.accent,
      life: 1.2
    });
    this.game.audio?.play(this.def.sfx || 'shot');
  }

  /** Урон засчитан башне (для статистики) */
  registerDamage(amount) { this.damageDealt += amount; }
  registerKill() { this.kills++; }

  /* ------------------------------ отрисовка ---------------------------- */

  render(g, time) {
    const grow = 1 - this.buildAnim;                 // 0 → 1
    const s = 0.55 + 0.45 * clamp(grow * 1.25, 0, 1);
    const lift = (1 - clamp(grow * 1.4, 0, 1)) * 10;

    // мягкая контактная тень под плитой — башня «стоит» на земле, а не висит
    g.save();
    g.globalAlpha = 0.30 * clamp(grow * 2, 0, 1);
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(this.x, this.y + 13, 21 * s, 8 * s, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    g.save();
    g.translate(this.x, this.y + lift);

    // плита
    g.globalAlpha = clamp(grow * 2, 0, 1);
    Sprites.draw(g, `tower.base.${this.level - 1}`, 0, 0, { scale: s });
    g.globalAlpha = 1;

    // турель
    const img = Sprites.get(`tower.${this.def.behavior}.${this.level - 1}`);
    if (img) {
      const [px, py] = this.turretPivot;
      const rec = this.recoil;
      g.save();
      g.rotate(this.angle);
      g.translate(-rec, 0);
      const ts = s * 1.12;   // турель чуть крупнее плиты — «мультяшная» масса
      g.drawImage(img, -px * ts, -py * ts, img.width * ts, img.height * ts);
      g.restore();
    }

    // подсветка уровня 3 (золотое «дыхание»)
    if (this.level === 3) {
      const a = 0.16 + 0.1 * Math.sin(this.pulse * 2.4);
      g.globalAlpha = a;
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, 19, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }

    g.restore();

    // кольцо «строится»
    if (this.buildAnim > 0) {
      g.save();
      g.globalAlpha = this.buildAnim * 0.8;
      g.strokeStyle = '#8ce8ff';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(this.x, this.y + 10, 20 * (1.4 - this.buildAnim * 0.4), 9 * (1.4 - this.buildAnim * 0.4), 0, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    void time;
  }

  /** Круг радиуса (при выделении/постройке) */
  renderRange(g, color = 'rgba(120,220,255,0.85)', fill = 'rgba(90,190,255,0.10)') {
    g.save();
    g.beginPath();
    g.arc(this.x, this.y, this.range, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    g.setLineDash([7, 6]);
    g.lineDashOffset = -(this.game.time || 0) * 22;
    g.lineWidth = 2;
    g.strokeStyle = color;
    g.stroke();
    g.setLineDash([]);
    g.restore();
  }
}

/* ==========================================================================
   Фабрика: behavior-строка из TOWER_DEFS → класс
   ========================================================================== */

const TOWER_REGISTRY = Object.create(null);

export function registerTower(behavior, cls) { TOWER_REGISTRY[behavior] = cls; }

/**
 * Создать башню по её определению. Фабрика живёт в towers/index.js —
 * она импортирует все подклассы (и тем самым регистрирует их).
 */
export function createTowerHere(game, def, cx, cy) {
  const Cls = TOWER_REGISTRY[def.behavior] || Tower;
  return new Cls(game, def, cx, cy);
}

export function towerSupported(def) { return !!TOWER_REGISTRY[def.behavior]; }

export default Tower;
