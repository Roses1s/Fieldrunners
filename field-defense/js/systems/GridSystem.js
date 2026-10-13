/* ==========================================================================
   GridSystem.js — сетка карты: типы клеток, башни, входы/выходы, декор.
   Единая модель для обоих типов карт:
     • fixed  — враги ходят только по клеткам PATH (путь нарисован на карте)
     • maze   — враги идут кратчайшим маршрутом через EMPTY, игрок строит
                лабиринт башнями (barrage/mazing)
   ========================================================================== */

import { CELL, TILE } from '../utils/Constants.js';

export class GridSystem {
  /**
   * @param {object} mapDef — данные карты из maps/*.js
   */
  constructor(mapDef) {
    this.def = mapDef;
    this.cols = mapDef.cols;
    this.rows = mapDef.rows;
    this.maze = !!mapDef.maze;
    this.biome = mapDef.biome || 'grass';

    const n = this.cols * this.rows;
    this.tiles = new Uint8Array(n).fill(TILE.EMPTY);
    this.towers = new Array(n).fill(null);
    this.dirty = true;           // флаг перерисовки статичного фона

    this.entries = (mapDef.entries || []).map((e) => ({ cx: e[0], cy: e[1] }));
    this.exits = (mapDef.exits || []).map((e) => ({ cx: e[0], cy: e[1] }));

    this.pathCells = [];         // клетки фиксированного пути (в порядке обхода)
    this.decor = mapDef.decor || [];

    this._buildTiles();
  }

  /* ------------------------------ доступ ------------------------------- */

  idx(cx, cy) { return cy * this.cols + cx; }
  inBounds(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows; }
  tileAt(cx, cy) { return this.inBounds(cx, cy) ? this.tiles[this.idx(cx, cy)] : TILE.BLOCKED; }
  tileByIdx(i) { return this.tiles[i]; }
  towerAt(cx, cy) { return this.inBounds(cx, cy) ? this.towers[this.idx(cx, cy)] : null; }
  towerByIdx(i) { return this.towers[i]; }

  cellOf(cx, cy) { return { cx, cy }; }
  cellFromIdx(i) { return { cx: i % this.cols, cy: (i / this.cols) | 0 }; }

  /** Центр клетки в мировых координатах */
  centerX(cx) { return cx * CELL + CELL / 2; }
  centerY(cy) { return cy * CELL + CELL / 2; }
  center(i, out) {
    const cx = i % this.cols, cy = (i / this.cols) | 0;
    const o = out || { x: 0, y: 0 };
    o.x = cx * CELL + CELL / 2;
    o.y = cy * CELL + CELL / 2;
    return o;
  }

  cellFromWorld(wx, wy) {
    return { cx: Math.floor(wx / CELL), cy: Math.floor(wy / CELL) };
  }

  get worldW() { return this.cols * CELL; }
  get worldH() { return this.rows * CELL; }

  /* --------------------------- заполнение ------------------------------ */

  _buildTiles() {
    const d = this.def;

    // Зоны-прямоугольники: { x, y, w, h, kind } — непроходимые и незастраиваемые
    this.zones = (d.zones || []).map((z) => Object.assign({ kind: 'rock' }, z));
    for (const z of this.zones) this._fillRect(z.x, z.y, z.w, z.h, TILE.BLOCKED);

    // Дополнительные способы задать запрет строительства
    for (const b of (d.blockedRects || [])) this._fillRect(b[0], b[1], b[2], b[3], TILE.BLOCKED);
    for (const b of (d.blockedCells || [])) this._set(b[0], b[1], TILE.BLOCKED);

    // Декор занимает клетку (если не помечен как «чистый»)
    for (const dec of this.decor) {
      if (dec.solid !== false) this._set(dec.cx, dec.cy, TILE.BLOCKED);
    }

    // Фиксированный путь: разворачиваем путевые точки в список клеток
    if (d.path && d.path.length) {
      this.pathCells = this._expandPath(d.path);
      for (const i of this.pathCells) {
        if (this.tiles[i] !== TILE.ENTRY && this.tiles[i] !== TILE.EXIT) this.tiles[i] = TILE.PATH;
      }
    }

    // Входы и выходы
    for (const e of this.entries) this._set(e.cx, e.cy, TILE.ENTRY);
    for (const e of this.exits) this._set(e.cx, e.cy, TILE.EXIT);

    // В maze-режиме «дороги» как таковой нет — ENTRY/EXIT стоят на EMPTY
    if (this.maze && !this.pathCells.length) {
      // стартовая «тропа» от входа до выхода нужна только для подсказки
      this.pathCells = [];
    }
  }

  _set(cx, cy, v) {
    if (!this.inBounds(cx, cy)) return;
    this.tiles[this.idx(cx, cy)] = v;
    this.dirty = true;
  }

  _fillRect(x, y, w, h, v) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) this._set(i, j, v);
    }
  }

  /** Путевые точки [[cx,cy],...] → плотный список индексов клеток (без диагоналей) */
  _expandPath(points) {
    const out = [];
    for (let k = 0; k < points.length - 1; k++) {
      const [ax, ay] = points[k];
      const [bx, by] = points[k + 1];
      let cx = ax, cy = ay;
      if (k === 0) out.push(this.idx(cx, cy));
      const dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
      let guard = this.cols + this.rows + 4;
      while ((cx !== bx || cy !== by) && guard-- > 0) {
        if (cx !== bx) cx += dx;
        else if (cy !== by) cy += dy;
        out.push(this.idx(cx, cy));
      }
    }
    return out;
  }

  /* --------------------------- строительство --------------------------- */

  /** Можно ли строить в клетке (без учёта связности пути — её проверяет PathfindingSystem) */
  isBuildableCell(cx, cy) {
    if (!this.inBounds(cx, cy)) return false;
    const t = this.tiles[this.idx(cx, cy)];
    if (t !== TILE.EMPTY) return false;
    if (this.towers[this.idx(cx, cy)]) return false;
    return true;
  }

  /** Проходима ли клетка для наземного врага */
  isWalkable(i) {
    if (i < 0 || i >= this.tiles.length) return false;
    if (this.towers[i]) return false;
    const t = this.tiles[i];
    if (this.maze) return t === TILE.EMPTY || t === TILE.ENTRY || t === TILE.EXIT || t === TILE.PATH;
    return t === TILE.PATH || t === TILE.ENTRY || t === TILE.EXIT;
  }

  placeTower(tower) {
    const i = this.idx(tower.cx, tower.cy);
    this.towers[i] = tower;
    this.dirty = true;
    return tower;
  }

  removeTower(tower) {
    const i = this.idx(tower.cx, tower.cy);
    if (this.towers[i] === tower) this.towers[i] = null;
    this.dirty = true;
  }

  /** Список всех башен (без дыр) */
  allTowers() {
    const out = [];
    for (let i = 0; i < this.towers.length; i++) if (this.towers[i]) out.push(this.towers[i]);
    return out;
  }
}

export default GridSystem;
