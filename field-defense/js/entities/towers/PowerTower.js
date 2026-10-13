/* ==========================================================================
   PowerTower.js — «Усилитель» ($65, апгрейд $80).

   Не стреляет вообще. Излучает ауру (2.0/2.3/2.6 тайла), внутри которой
   соседние башни получают +15/25/40% к урону и +8/12/18% к радиусу.
   Бафф пересчитывает GameScene.refreshTowerBuffs() от базовых значений,
   поэтому он не накапливается и мгновенно пропадает при продаже Усилителя.
   Усилители не усиливают друг друга.
   ========================================================================== */

import { Tower, registerTower } from '../Tower.js';

export class PowerTower extends Tower {
  constructor(game, def, cx, cy) {
    super(game, def, cx, cy);
    this.buffDmgVal = 0;
    this.buffRangeVal = 0;
    this.applyLevel();
  }

  get turretPivot() { return [26, 27]; }

  applyLevel() {
    super.applyLevel();
    const i = this.level - 1;
    this.buffDmgVal = this.def.buffDmg ? this.def.buffDmg[i] : 0;
    this.buffRangeVal = this.def.buffRange ? this.def.buffRange[i] : 0;
  }

  update(dt) {
    // только «дыхание» и анимация постройки: целей и выстрелов нет
    this.timeAlive += dt;
    this.pulse += dt;
    if (this.buildAnim > 0) this.buildAnim = Math.max(0, this.buildAnim - dt / 0.45);
    this.target = null;
    this.angle += dt * 0.5;   // излучатель медленно поворачивается
  }

  fire() { /* не стреляет */ }

  render(g, time) {
    super.render(g, time);
    // мягкая пульсирующая аура (подсказка радиуса без выделения башни)
    const r = this.baseRange * (0.985 + 0.015 * Math.sin(this.pulse * 2));
    g.save();
    g.globalAlpha = 0.05 + 0.02 * Math.sin(this.pulse * 2);
    g.fillStyle = '#c9a6ff';
    g.beginPath(); g.arc(this.x, this.y, r, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.16;
    g.strokeStyle = '#c9a6ff';
    g.lineWidth = 1.4;
    g.beginPath(); g.arc(this.x, this.y, r, 0, Math.PI * 2); g.stroke();
    g.restore();
    void time;
  }

  renderRange(g, color, fill) {
    super.renderRange(g, color || 'rgba(201,166,255,0.85)', fill || 'rgba(201,166,255,0.08)');
    g.save();
    g.fillStyle = 'rgba(230,216,255,0.95)';
    g.font = '700 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(`аура: +${Math.round(this.buffDmgVal * 100)}% урона`, this.x, this.y - 36);
    g.restore();
  }
}

registerTower('power', PowerTower);
export default PowerTower;
