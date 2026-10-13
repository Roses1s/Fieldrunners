/* ==========================================================================
   Camera.js — мировые координаты <-> экранные, зум, панорама, тряска.
   Хранит «базовый» zoom (карта вписана в экран) и множитель пользователя.
   ========================================================================== */

import { CONFIG } from './Constants.js';
import { clamp, randRange } from './MathUtil.js';

export class Camera {
  constructor() {
    this.x = 0;            // мировая координата левого верхнего угла экрана
    this.y = 0;
    this.zoom = 1;         // итоговый масштаб (base * user)
    this.baseZoom = 1;     // масштаб «вписать карту»
    this.userZoom = 1;     // множитель от pinch/колеса
    this.viewW = 800;
    this.viewH = 480;
    this.worldW = 800;
    this.worldH = 480;
    this.shakeT = 0;
    this.shakeAmp = 0;
    this.offX = 0;         // смещение тряски (экранные px)
    this.offY = 0;
  }

  /** Привязка к размеру экрана и мира; сразу вписывает карту */
  resize(viewW, viewH, worldW, worldH) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.worldW = worldW;
    this.worldH = worldH;
    this.fit();
  }

  /** Подобрать базовый зум так, чтобы карта целиком помещалась на экране */
  fit(padding = 8) {
    const zx = (this.viewW - padding * 2) / this.worldW;
    const zy = (this.viewH - padding * 2) / this.worldH;
    this.baseZoom = Math.max(0.35, Math.min(zx, zy));
    this.applyZoom();
    this.center();
  }

  applyZoom() {
    this.zoom = this.baseZoom * this.userZoom;
  }

  center() {
    // центрируем карту; если она меньше экрана — по центру экрана
    const scaledW = this.worldW * this.zoom;
    const scaledH = this.worldH * this.zoom;
    this.x = scaledW <= this.viewW
      ? (scaledW - this.viewW) / 2
      : clamp(this.x, 0, scaledW - this.viewW);
    this.y = scaledH <= this.viewH
      ? (scaledH - this.viewH) / 2
      : clamp(this.y, 0, scaledH - this.viewH);
  }

  /** Зум с якорем в экранной точке (px, py) */
  zoomAt(factor, px, py) {
    const before = this.zoom;
    this.userZoom = clamp(this.userZoom * factor, CONFIG.MIN_ZOOM, CONFIG.MAX_ZOOM);
    this.applyZoom();
    const after = this.zoom;
    if (Math.abs(after - before) < 1e-6) return;
    // мировая точка под пальцем должна остаться под пальцем
    const wx = this.x + px / before;
    const wy = this.y + py / before;
    this.x = wx - px / after;
    this.y = wy - py / after;
    this.clamp();
  }

  setUserZoom(z) {
    this.userZoom = clamp(z, CONFIG.MIN_ZOOM, CONFIG.MAX_ZOOM);
    this.applyZoom();
    this.clamp();
  }

  pan(dxScreen, dyScreen) {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.clamp();
  }

  clamp() {
    const scaledW = this.worldW * this.zoom;
    const scaledH = this.worldH * this.zoom;
    if (scaledW <= this.viewW) this.x = (scaledW - this.viewW) / 2;
    else this.x = clamp(this.x, 0, scaledW - this.viewW);
    if (scaledH <= this.viewH) this.y = (scaledH - this.viewH) / 2;
    else this.y = clamp(this.y, 0, scaledH - this.viewH);
  }

  screenToWorld(sx, sy, out) {
    const o = out || { x: 0, y: 0 };
    o.x = this.x + (sx - this.offX) / this.zoom;
    o.y = this.y + (sy - this.offY) / this.zoom;
    return o;
  }

  worldToScreen(wx, wy, out) {
    const o = out || { x: 0, y: 0 };
    o.x = (wx - this.x) * this.zoom + this.offX;
    o.y = (wy - this.y) * this.zoom + this.offY;
    return o;
  }

  /** Видимый мировой прямоугольник (для culling) */
  get viewRect() {
    return {
      x: this.x - 40 / this.zoom,
      y: this.y - 40 / this.zoom,
      w: this.viewW / this.zoom + 80 / this.zoom,
      h: this.viewH / this.zoom + 80 / this.zoom
    };
  }

  shake(amp = 6, time = 0.3) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = Math.max(this.shakeT, time);
  }

  update(dt) {
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT) * this.shakeAmp;
      this.offX = randRange(-k, k);
      this.offY = randRange(-k, k);
      if (this.shakeT <= 0) {
        this.shakeT = 0;
        this.shakeAmp = 0;
        this.offX = 0;
        this.offY = 0;
      }
    }
  }

  /** Применить трансформацию к контексту (дальше рисуем в мировых координатах) */
  applyTransform(g, dpr) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.translate(this.offX, this.offY);
    g.scale(this.zoom, this.zoom);
    g.translate(-this.x, -this.y);
  }

  /** Сбросить трансформацию в экранные CSS-пиксели (для HUD) */
  applyScreen(g, dpr) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

export default Camera;
