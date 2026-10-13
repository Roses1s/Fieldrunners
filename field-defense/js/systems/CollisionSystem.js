/* ==========================================================================
   CollisionSystem.js — пространственный хэш для быстрого поиска врагов
   в радиусе башни и для сплэш-урона. Перестраивается раз за игровой шаг
   (O(n)), запросы — O(1) по корзине. Никаких аллокаций в горячем пути:
   корзины переиспользуются между кадрами.
   ========================================================================== */

import { CONFIG } from '../utils/Constants.js';

const CELL_SIZE = CONFIG.SPATIAL_CELL;

export class CollisionSystem {
  constructor(worldW, worldH) {
    this.cols = Math.max(1, Math.ceil(worldW / CELL_SIZE));
    this.rows = Math.max(1, Math.ceil(worldH / CELL_SIZE));
    this.buckets = new Array(this.cols * this.rows);
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
    this._query = [];          // переиспользуемый массив результата
    this.ground = [];          // отдельно наземные (для башен «ground»)
    this._groundQuery = [];
  }

  _bucket(x, y) {
    let cx = (x / CELL_SIZE) | 0;
    let cy = (y / CELL_SIZE) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  /** Перестроить хэш по списку живых врагов */
  rebuild(enemies) {
    for (let i = 0; i < this.buckets.length; i++) {
      if (this.buckets[i].length) this.buckets[i].length = 0;
    }
    if (this.ground.length) this.ground.length = 0;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive) continue;
      this.buckets[this._bucket(e.x, e.y)].push(e);
      if (!e.flying) this.ground.push(e);
    }
  }

  /**
   * Все враги, чья позиция попадает в круг (x, y, r).
   * @param {boolean} groundOnly — только наземные
   * @returns {Array} тот же массив каждый раз — не хранить ссылку!
   */
  queryCircle(x, y, r, groundOnly) {
    const out = groundOnly ? this._groundQuery : this._query;
    out.length = 0;
    const r2 = r * r;
    const minCx = Math.max(0, ((x - r) / CELL_SIZE) | 0);
    const maxCx = Math.min(this.cols - 1, ((x + r) / CELL_SIZE) | 0);
    const minCy = Math.max(0, ((y - r) / CELL_SIZE) | 0);
    const maxCy = Math.min(this.rows - 1, ((y + r) / CELL_SIZE) | 0);

    for (let cy = minCy; cy <= maxCy; cy++) {
      const row = cy * this.cols;
      for (let cx = minCx; cx <= maxCx; cx++) {
        const b = this.buckets[row + cx];
        for (let i = 0; i < b.length; i++) {
          const e = b[i];
          if (!e.alive) continue;
          if (groundOnly && e.flying) continue;
          const dx = e.x - x, dy = e.y - y;
          const rr = r + e.radius;
          if (dx * dx + dy * dy <= rr * rr) out.push(e);
        }
      }
    }
    return out;
  }

  /** Все враги в прямоугольнике (для лазера/конуса) */
  queryRect(x, y, w, h, groundOnly) {
    const out = groundOnly ? this._groundQuery : this._query;
    out.length = 0;
    const minCx = Math.max(0, (x / CELL_SIZE) | 0);
    const maxCx = Math.min(this.cols - 1, ((x + w) / CELL_SIZE) | 0);
    const minCy = Math.max(0, (y / CELL_SIZE) | 0);
    const maxCy = Math.min(this.rows - 1, ((y + h) / CELL_SIZE) | 0);
    for (let cy = minCy; cy <= maxCy; cy++) {
      const row = cy * this.cols;
      for (let cx = minCx; cx <= maxCx; cx++) {
        const b = this.buckets[row + cx];
        for (let i = 0; i < b.length; i++) {
          const e = b[i];
          if (!e.alive) continue;
          if (groundOnly && e.flying) continue;
          if (e.x + e.radius >= x && e.x - e.radius <= x + w &&
              e.y + e.radius >= y && e.y - e.radius <= y + h) out.push(e);
        }
      }
    }
    return out;
  }
}

export default CollisionSystem;
