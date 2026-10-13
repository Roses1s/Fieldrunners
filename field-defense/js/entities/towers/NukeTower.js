/* ==========================================================================
   NukeTower.js — ядерная мортира ($120, апгрейд $90).

   Самая дорогая и самая медленная башня: 0.2/0.25/0.3 выстрела в секунду
   (перезарядка 5 / 4 / 3.3 с), зато 280/560/840 урона по огромной площади
   2.0/2.5/3.25 тайла. Ключевая особенность — ослабленный эпицентр: в радиусе
   0.5/0.6/0.7 тайла от точки разрыва проходит только 25% урона, поэтому
   мортиру выгоднее ставить так, чтобы дорога шла по кольцу поражения.
   Мина самонаводится, летит по навесной траектории и достаёт воздух.
   ========================================================================== */

import { Tower, registerTower } from '../Tower.js';
import { FX } from '../Effect.js';
import { PT } from '../../systems/ParticleSystem.js';
import { clamp, randRange } from '../../utils/MathUtil.js';

export class NukeTower extends Tower {
  constructor(game, def, cx, cy) {
    super(game, def, cx, cy);
    this.innerGap = def.innerGap ? def.innerGap[0] : 0;
    this.chargeGlow = 0;      // 0 → 1: насколько заряжен следующий выстрел
  }

  get turretPivot() { return [26, 30]; }

  applyLevel() {
    super.applyLevel();
    const i = this.level - 1;
    if (this.def.innerGap) this.innerGap = this.def.innerGap[i];
  }

  fire(target) {
    const g = this.game;
    const d = this.def;
    const a = this.angle - 0.34;                 // ствол задран вверх
    const mx = this.x + Math.cos(this.angle) * 20;
    const my = this.y - 12 + Math.sin(this.angle) * 20;

    g.projectiles.spawn({
      type: 4 /* PROJ.SHELL */,
      x: mx, y: my,
      target,
      angle: a,
      speed: d.projSpeed || 195,
      turn: d.projTurn || 2.6,                   // мина доворачивает лениво
      damage: this.damage,
      splash: this.splash,
      innerGap: this.innerGap,                   // «пустой центр» взрыва
      gapRatio: d.gapDamageRatio ?? 0.25,        // доля урона в эпицентре
      damageType: d.damageType,
      pierceArmor: d.pierceArmor || 0,
      owner: this,
      size: 1 + this.level * 0.12,
      life: 3.4,
      hitRadius: 7
    });

    // выхлоп и дым из ствола
    g.particles.burst(mx, my, {
      count: 14, colors: ['#d8d8d8', '#9a9a9a', '#c6ff4f'],
      speed: [20, 90], life: [0.4, 1.0], size: [2.6, 6.5],
      gravity: -16, drag: 2, type: PT.SMOKE, dir: a + Math.PI, spread: 0.8
    });
    g.particles.burst(mx, my, {
      count: 8, colors: ['#fff0b0', '#c6ff4f'],
      speed: [40, 150], life: [0.12, 0.3], size: [1, 2.4], type: PT.SPARK, drag: 4
    });
    g.effects.spawn(FX.MUZZLE, {
      x: mx, y: my, angle: a, size: 14 + this.level * 2, life: 0.16, color: '#dfffb0'
    });
    g.effects.spawn(FX.SHOCKWAVE, {
      x: mx, y: my, size: 6, size2: 26, life: 0.3,
      color: 'rgba(200,200,200,0.5)', width: 2
    });

    // отдача у мортиры заметная
    this.recoil = (d.recoil ?? 3) + this.level;
    g.camera?.shake(clamp(d.shake || 6, 1, 12) * 0.35, 0.16);
    g.audio?.play('nuke', { big: false, priority: 2 });
    this.chargeGlow = 0;
  }

  update(dt) {
    super.update(dt);
    // индикатор перезарядки: 0 — только что выстрелили, 1 — готов
    const total = Math.max(0.001, this.interval);
    this.chargeGlow = clamp(1 - this.cooldown / total, 0, 1);
    if (this.chargeGlow >= 1 && Math.random() < dt * 2.2) {
      // заряд «подрагивает» готовностью
      const gx = this.x + Math.cos(this.angle - 0.34) * 22;
      const gy = this.y - 12 + Math.sin(this.angle - 0.34) * 22;
      this.game.particles.emit(gx + randRange(-2, 2), gy + randRange(-2, 2),
        randRange(-6, 6), randRange(-16, -6), randRange(0.3, 0.6),
        randRange(1.4, 2.6), '#c6ff4f', PT.SMOKE, 3, -8);
    }
  }

  render(g, time) {
    super.render(g, time);

    // дуга перезарядки у основания — видно, когда мортира готова
    const k = clamp(this.chargeGlow, 0, 1);
    if (k < 0.02) return;
    g.save();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.arc(this.x, this.y + 12, 13, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
    g.strokeStyle = k >= 1 ? '#c6ff4f' : 'rgba(198,255,79,0.65)';
    g.beginPath();
    g.arc(this.x, this.y + 12, 13, Math.PI * 0.15, Math.PI * 0.15 + Math.PI * 0.7 * k);
    g.stroke();
    if (k >= 1) {
      g.globalAlpha = 0.35 + 0.25 * Math.sin(time * 6);
      g.fillStyle = '#c6ff4f';
      g.beginPath(); g.arc(this.x, this.y + 12, 3, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  /**
   * Радиус показываем как «пончик»: внешний круг — зона поражения,
   * внутренний — ослабленный эпицентр. Это главная подсказка для игрока:
   * мортиру надо ставить так, чтобы дорога шла ПО КОЛЬЦУ, а не через центр.
   */
  renderRange(g, color, fill) {
    super.renderRange(g, color || 'rgba(198,255,79,0.8)', fill || 'rgba(198,255,79,0.07)');
    if (!this.innerGap) return;
    g.save();
    // ослабленный эпицентр
    g.fillStyle = 'rgba(20,32,20,0.55)';
    g.beginPath();
    g.arc(this.x, this.y, this.innerGap, 0, Math.PI * 2);
    g.fill();
    g.setLineDash([4, 4]);
    g.strokeStyle = 'rgba(230,255,200,0.85)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(this.x, this.y, this.innerGap, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(230,255,200,0.9)';
    g.font = '700 10px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('эпицентр: −75%', this.x, this.y + 3);
    g.restore();
  }
}

registerTower('nuke', NukeTower);
export default NukeTower;
