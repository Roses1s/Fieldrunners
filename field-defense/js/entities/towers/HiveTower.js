/* ==========================================================================
   HiveTower.js — улей ($30, апгрейд $20).

   Групповой урон: раз в секунду выпускает рой из 3/5/8 пчёл, каждая летит
   в СВОЮ цель (хоуминг), поэтому улей накрывает сразу нескольких врагов —
   в том числе воздушных. Пчела наносит 53/64/60 урона и возвращается в улей
   (возврат уже реализован в пуле снарядов: p.returning, homeX/homeY).
   Слаб против одной жирной цели, силён против толпы — зеркало клея.
   ========================================================================== */

import { Tower, registerTower } from '../Tower.js';
import { FX } from '../Effect.js';
import { PT } from '../../systems/ParticleSystem.js';
import { randRange } from '../../utils/MathUtil.js';

export class HiveTower extends Tower {
  get turretPivot() { return [24, 28]; }

  /**
   * Цели для роя: берём столько разных врагов, сколько пчёл.
   * Если врагов меньше — добиваем рой по ближайшим (чтобы урон не пропадал).
   */
  pickTargets(count) {
    const g = this.game;
    const list = g.collision.queryCircle(this.x, this.y, this.range, !this.canTargetAir);
    const pool = [];
    for (let i = 0; i < list.length; i++) {
      if (this.canTarget(list[i])) pool.push(list[i]);
    }
    if (!pool.length) return [];
    // сортировка по «продвинутости»: самые опасные (ближе к выходу) первыми
    pool.sort((a, b) => b.progress - a.progress);

    const out = [];
    for (let k = 0; k < count; k++) {
      out.push(pool[k % pool.length]);
    }
    return out;
  }

  fire(target) {
    const g = this.game;
    const d = this.def;
    const count = Math.max(1, this.bees || 1);
    const targets = this.pickTargets(count);
    const hx = this.x + 12;          // леток справа от корпуса
    const hy = this.y - 12;

    for (let i = 0; i < targets.length; i++) {
      const tgt = targets[i];
      // пчёлы вылетают не из одной точки, а «веером» из летка
      const a = randRange(-0.5, 0.5);
      g.projectiles.spawn({
        type: 3 /* PROJ.BEE */,
        x: hx + Math.cos(a) * 4,
        y: hy + Math.sin(a) * 4,
        target: tgt,
        speed: 165 + this.level * 12,
        turn: 5.2,
        damage: this.damage,
        damageType: d.damageType,
        owner: this,
        size: 0.9 + this.level * 0.08,
        life: 4,
        hitRadius: 6,
        homeX: hx, homeY: hy        // куда пчела вернётся после укуса
      });
    }

    // если целей не нашлось — просто «жужжим» впустую (выстрел всё равно засчитан)
    if (!targets.length && target) {
      g.projectiles.spawn({
        type: 3, x: hx, y: hy, target,
        speed: 165, turn: 5.2, damage: this.damage,
        damageType: d.damageType, owner: this, life: 4, hitRadius: 6,
        homeX: hx, homeY: hy
      });
    }

    g.particles.burst(hx, hy, {
      count: 4 + count, colors: ['#ffe66d', '#c9a227', '#fff6c9'],
      speed: [18, 62], life: [0.16, 0.4], size: [1, 2.2], gravity: -14, drag: 2, type: PT.DOT
    });
    g.effects.spawn(FX.MUZZLE, {
      x: hx, y: hy, angle: this.angle, size: 6 + this.level, life: 0.12, color: '#ffe66d'
    });
    g.audio?.play('bee', { priority: count > 5 ? 2 : 1 });
  }

  /** Рой над ульем — декоративное жужжание, показывает что башня живая */
  render(g, time) {
    super.render(g, time);
    const bees = 1 + this.level;
    g.save();
    for (let i = 0; i < bees; i++) {
      const a = time * (1.1 + i * 0.23) + i * 2.1;
      const r = 15 + i * 3.4 + Math.sin(time * 2 + i) * 1.6;
      const bx = this.x + Math.cos(a) * r;
      const by = this.y - 16 + Math.sin(a) * r * 0.42;
      g.globalAlpha = 0.75;
      g.fillStyle = '#ffe66d';
      g.beginPath(); g.ellipse(bx, by, 2.1, 1.5, a, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.35;
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(bx, by - 1.6, 1.7, 0.9, 0, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  /** Радиус улья показываем чуть мягче: рой летит по дуге, а не по прямой */
  renderRange(g, color, fill) {
    super.renderRange(g, color || 'rgba(255,230,109,0.85)', fill || 'rgba(255,214,80,0.10)');
    // отметим, сколько пчёл в рое — полезно при выборе башни
    const n = this.bees || 0;
    if (!n) return;
    g.save();
    g.fillStyle = 'rgba(255,230,109,0.95)';
    g.font = '700 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(`рой: ${n}`, this.x, this.y - 34);
    g.restore();
  }
}

registerTower('hive', HiveTower);
export default HiveTower;
