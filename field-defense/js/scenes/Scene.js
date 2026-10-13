/* ==========================================================================
   Scene.js — базовый класс сцены.
   Сцена получает от Game: update(dt) с фиксированным шагом, render(g)
   в экранных CSS-пикселях и все события ввода.
   ========================================================================== */

export class Scene {
  constructor(game) {
    this.game = game;
    /** если true — сцена рисуется поверх предыдущей (пауза, game over) */
    this.transparent = false;
    /** множитель скорости симуляции (1/2/3) — только для игровой сцены */
    this.speed = 1;
    /** сцена сама управляет паузой симуляции */
    this.simPaused = false;
    this.time = 0;
  }

  /** @param {object} params */
  enter(params) { void params; }
  exit() {}

  update(dt) { this.time += dt; }
  render(g) { void g; }

  /* ------------------------- события ввода ----------------------------- */
  onDown(x, y) { void x; void y; }
  onUp(x, y) { void x; void y; }
  onTap(x, y, count) { void x; void y; void count; }
  onDragStart(x, y) { void x; void y; }
  onDrag(dx, dy, x, y) { void dx; void dy; void x; void y; }
  onDragEnd() {}
  onPinch(k, cx, cy) { void k; void cx; void cy; }
  onHover(x, y) { void x; void y; }
  onKey(key, e) { void key; void e; }

  /** Вызывается при смене размера окна/ориентации */
  resize(w, h) { void w; void h; }

  get viewW() { return this.game.viewW; }
  get viewH() { return this.game.viewH; }
}

export default Scene;
