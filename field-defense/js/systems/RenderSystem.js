/* ==========================================================================
   RenderSystem.js — отрисовка мира.

   Оптимизации:
     • статичный фон (тайлы, дорога, зоны, декор, входы/выходы) запекается
       в offscreen-canvas и перерисовывается только по dirty-флагу сетки;
     • culling: объекты вне видимого прямоугольника не рисуются;
     • сортировка по глубине одним проходом (башни + наземные враги);
     • все спрайты — из процедурного кэша Sprites (ленивая генерация).
   ========================================================================== */

import { CELL, TILE, CONFIG } from '../utils/Constants.js';
import { clamp, makeRng, randRange } from '../utils/MathUtil.js';
import { Sprites, makeCanvas, ctxOf, shade } from '../utils/SpriteSheet.js';

const BG_SCALE = 2;   // фон печатаем в 2x — crisp при зуме до 2x

export class RenderSystem {
  constructor(game) {
    this.game = game;
    this.grid = game.grid;
    this.bg = null;
    this.bgVersion = -1;
    this.routeVersion = -1;
    this.routePoints = [];
    this.renderList = [];
  }

  get pal() { return CONFIG.PALETTES[this.grid.biome] || CONFIG.PALETTES.grass; }

  /* ============================ СТАТИЧНЫЙ ФОН ========================== */

  ensureBackground() {
    const dirty = this.grid.dirty || !this.bg || this.bgVersion !== this.grid.def.seed;
    if (!dirty && this.bg) return;
    this.grid.dirty = false;
    this.bgVersion = this.grid.def.seed;
    this.buildBackground();
  }

  buildBackground() {
    const g = this.grid;
    const W = g.worldW * BG_SCALE;
    const H = g.worldH * BG_SCALE;
    if (!this.bg || this.bg.width !== W || this.bg.height !== H) {
      this.bg = makeCanvas(W, H);
    }
    const c = ctxOf(this.bg);
    c.setTransform(BG_SCALE, 0, 0, BG_SCALE, 0, 0);
    c.clearRect(0, 0, g.worldW, g.worldH);

    const rng = makeRng(g.def.seed || 1);
    const pal = this.pal;

    // ---- 1. тайлы земли ----
    for (let cy = 0; cy < g.rows; cy++) {
      for (let cx = 0; cx < g.cols; cx++) {
        const v = (rng() * 4) | 0;
        const tile = Sprites.get(`tile.${g.biome}.${v}`);
        if (tile) c.drawImage(tile, cx * CELL, cy * CELL, CELL, CELL);
      }
    }

    // ---- 2. зоны (вода / скалы / лава) ----
    for (const z of (g.zones || [])) this._drawZone(c, z);

    // ---- 3. дорога (только для фиксированных карт) ----
    if (!g.maze && g.pathCells.length) this._drawPath(c, g.pathCells);

    // ---- 4. лёгкая сетка ----
    c.save();
    c.strokeStyle = 'rgba(0,0,0,0.06)';
    c.lineWidth = 1;
    for (let i = 0; i <= g.cols; i++) {
      c.beginPath(); c.moveTo(i * CELL, 0); c.lineTo(i * CELL, g.worldH); c.stroke();
    }
    for (let j = 0; j <= g.rows; j++) {
      c.beginPath(); c.moveTo(0, j * CELL); c.lineTo(g.worldW, j * CELL); c.stroke();
    }
    c.restore();

    // ---- 5. декор ----
    const sorted = g.decor.slice().sort((a, b) => a.cy - b.cy);
    for (const d of sorted) {
      const key = `decor.${d.type}` + (d.type === 'building' ? `.${d.variant || 0}` : '');
      const img = Sprites.get(key) || Sprites.get('decor.rock');
      if (!img) continue;
      const x = cx_(d.cx), y = cy_(d.cy);
      const s = d.scale || 1;
      c.drawImage(img, x - img.width * s / 2, y + CELL * 0.32 - img.height * s, img.width * s, img.height * s);
    }

    // ---- 6. входы и выходы ----
    for (const e of g.entries) this._drawEntry(c, e.cx, e.cy);
    for (const e of g.exits) this._drawExit(c, e.cx, e.cy);

    // ---- 7. виньетка карты ----
    const vg = c.createLinearGradient(0, 0, 0, g.worldH);
    vg.addColorStop(0, 'rgba(0,0,0,0.10)');
    vg.addColorStop(0.25, 'rgba(0,0,0,0)');
    vg.addColorStop(0.75, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.12)');
    c.fillStyle = vg;
    c.fillRect(0, 0, g.worldW, g.worldH);
  }

  _drawZone(c, z) {
    const x = z.x * CELL, y = z.y * CELL;
    const w = z.w * CELL, h = z.h * CELL;
    const rng = makeRng(z.x * 71 + z.y * 13 + z.w * 7);

    if (z.kind === 'water') {
      c.save();
      c.beginPath();
      roundRectPath(c, x + 2, y + 2, w - 4, h - 4, 12);
      c.clip();
      const lg = c.createLinearGradient(x, y, x, y + h);
      lg.addColorStop(0, '#4fb6e8');
      lg.addColorStop(0.5, '#2f8fc8');
      lg.addColorStop(1, '#236fa5');
      c.fillStyle = lg;
      c.fillRect(x, y, w, h);
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const wy = y + 8 + rng() * (h - 14);
        const wx = x + 4 + rng() * (w - 24);
        c.beginPath();
        c.moveTo(wx, wy);
        c.quadraticCurveTo(wx + 7, wy - 3, wx + 14, wy);
        c.stroke();
      }
      c.restore();
      // берег
      c.strokeStyle = 'rgba(0,0,0,0.25)';
      c.lineWidth = 3;
      roundRectPath(c, x + 2, y + 2, w - 4, h - 4, 12);
      c.stroke();
    } else if (z.kind === 'lava') {
      c.save();
      c.beginPath();
      roundRectPath(c, x + 1, y + 1, w - 2, h - 2, 10);
      c.clip();
      const tile = Sprites.get('tile.lavaPool');
      if (tile) {
        for (let j = 0; j < z.h; j++) {
          for (let i = 0; i < z.w; i++) {
            c.drawImage(tile, x + i * CELL, y + j * CELL, CELL, CELL);
          }
        }
      }
      c.restore();
      c.strokeStyle = '#3a1a10';
      c.lineWidth = 3;
      roundRectPath(c, x + 1, y + 1, w - 2, h - 2, 10);
      c.stroke();
    } else {
      // скалы: несколько валунов на зону
      c.save();
      c.fillStyle = 'rgba(0,0,0,0.22)';
      roundRectPath(c, x + 4, y + 6, w - 8, h - 8, 14);
      c.fill();
      const n = Math.max(3, Math.round((w * h) / 900));
      for (let i = 0; i < n; i++) {
        const bx = x + 8 + rng() * (w - 16);
        const by = y + 8 + rng() * (h - 16);
        const r = 7 + rng() * 11;
        const base = this.grid.biome === 'desert' ? '#c2a370' : '#8d8f98';
        c.beginPath();
        c.moveTo(bx - r, by + r * 0.6);
        c.lineTo(bx - r * 0.6, by - r * 0.7);
        c.lineTo(bx + r * 0.3, by - r * 0.9);
        c.lineTo(bx + r, by + r * 0.2);
        c.lineTo(bx + r * 0.6, by + r * 0.75);
        c.closePath();
        c.fillStyle = base;
        c.fill();
        c.lineWidth = 2.2;
        c.strokeStyle = 'rgba(0,0,0,0.55)';
        c.stroke();
        c.beginPath();
        c.moveTo(bx - r * 0.6, by - r * 0.7);
        c.lineTo(bx + r * 0.3, by - r * 0.9);
        c.lineTo(bx + r * 0.1, by - r * 0.1);
        c.closePath();
        c.fillStyle = shade(base, 0.22);
        c.fill();
      }
      c.restore();
    }
  }

  /** Дорога: широкая полилиния по центрам клеток пути */
  _drawPath(c, cells) {
    const g = this.grid;
    const pts = [];
    const p = { x: 0, y: 0 };
    for (const i of cells) {
      g.center(i, p);
      pts.push({ x: p.x, y: p.y });
    }
    if (!pts.length) return;

    // продлеваем до краёв карты (вход/выход)
    const first = pts[0], last = pts[pts.length - 1];
    const entry = g.entries[0];
    const exit = g.exits[0];
    if (entry) {
      const ex = g.centerX(entry.cx), ey = g.centerY(entry.cy);
      if (first.x === ex) pts.unshift({ x: ex + (ex < g.worldW / 2 ? -CELL : CELL), y: ey });
      else pts.unshift({ x: ex, y: ey + (ey < g.worldH / 2 ? -CELL : CELL) });
    }
    if (exit) {
      const ex = g.centerX(exit.cx), ey = g.centerY(exit.cy);
      if (last.x === ex) pts.push({ x: ex + (ex > g.worldW / 2 ? CELL : -CELL), y: ey });
      else pts.push({ x: ex, y: ey + (ey > g.worldH / 2 ? CELL : -CELL) });
    }

    const pal = this.pal;
    const trace = (width, color) => {
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.lineWidth = width;
      c.strokeStyle = color;
      c.stroke();
    };

    // тень под дорогой
    c.save();
    c.translate(0, 3);
    trace(CELL * 0.96, 'rgba(0,0,0,0.16)');
    c.restore();

    trace(CELL * 0.94, pal.pathEdge);     // обочина
    trace(CELL * 0.8, pal.path);          // полотно
    // колеи
    c.save();
    c.globalAlpha = 0.16;
    trace(2.5, '#000');
    c.restore();

    // камешки/пыль на полотне
    const rng = makeRng((g.def.seed || 3) + 555);
    c.save();
    for (const cell of cells) {
      g.center(cell, p);
      for (let k = 0; k < 3; k++) {
        const ox = (rng() - 0.5) * CELL * 0.72;
        const oy = (rng() - 0.5) * CELL * 0.72;
        c.globalAlpha = 0.18 + rng() * 0.22;
        c.fillStyle = rng() < 0.5 ? pal.pathSpeck : '#ffffff';
        c.beginPath();
        c.arc(p.x + ox, p.y + oy, 0.8 + rng() * 1.8, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();

    // травка по краям (для grass)
    if (g.biome === 'grass') {
      c.save();
      c.strokeStyle = '#4f9536';
      c.lineWidth = 1.6;
      for (const cell of cells) {
        g.center(cell, p);
        for (let k = 0; k < 5; k++) {
          const a = rng() * Math.PI * 2;
          const r = CELL * 0.44 + rng() * 4;
          const bx = p.x + Math.cos(a) * r;
          const by = p.y + Math.sin(a) * r;
          c.globalAlpha = 0.5;
          c.beginPath();
          c.moveTo(bx, by);
          c.lineTo(bx + (rng() - 0.5) * 4, by - 3 - rng() * 3);
          c.stroke();
        }
      }
      c.restore();
    }
  }

  /** Вход: тёмный тоннель/бункер на границе карты */
  _drawEntry(c, cx, cy) {
    const g = this.grid;
    const x = g.centerX(cx), y = g.centerY(cy);
    const atLeft = cx <= 0, atRight = cx >= g.cols - 1;
    const atTop = cy <= 0, atBottom = cy >= g.rows - 1;
    const dir = atLeft ? 1 : atRight ? -1 : 0;   // куда «смотрит» зев
    c.save();
    c.translate(x, y);
    if (!dir) c.rotate(atTop ? Math.PI / 2 : -Math.PI / 2);
    else if (dir < 0) c.rotate(Math.PI);

    // мешки с песком по краям
    c.fillStyle = 'rgba(0,0,0,0.28)';
    roundRectPath(c, -CELL * 0.72, -CELL * 0.62, CELL * 0.9, CELL * 1.24, 8);
    c.fill();
    for (let i = -1; i <= 1; i += 2) {
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        c.ellipse(-CELL * 0.42, i * (CELL * 0.28 + k * 0.06), 9, 6.5, 0, 0, Math.PI * 2);
        c.fillStyle = k % 2 ? '#9c8a63' : '#8a7853';
        c.fill();
        c.lineWidth = 1.6;
        c.strokeStyle = 'rgba(0,0,0,0.4)';
        c.stroke();
      }
    }
    // зев тоннеля
    const lg = c.createLinearGradient(-CELL * 0.5, 0, CELL * 0.2, 0);
    lg.addColorStop(0, '#0a0d14');
    lg.addColorStop(0.7, '#22283a');
    lg.addColorStop(1, '#3a4258');
    c.fillStyle = lg;
    roundRectPath(c, -CELL * 0.55, -CELL * 0.42, CELL * 0.78, CELL * 0.84, 6);
    c.fill();
    c.lineWidth = 2.4;
    c.strokeStyle = '#1b2130';
    roundRectPath(c, -CELL * 0.55, -CELL * 0.42, CELL * 0.78, CELL * 0.84, 6);
    c.stroke();
    // красный маркер «отсюда идут»
    c.fillStyle = 'rgba(255,90,90,0.85)';
    c.beginPath();
    c.moveTo(-CELL * 0.05, -6);
    c.lineTo(CELL * 0.22, 0);
    c.lineTo(-CELL * 0.05, 6);
    c.closePath();
    c.fill();
    c.restore();
  }

  /** Выход: защищаемая база с флагом */
  _drawExit(c, cx, cy) {
    const g = this.grid;
    const x = g.centerX(cx), y = g.centerY(cy);
    c.save();
    c.translate(x, y + 2);
    // площадка
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath();
    c.ellipse(0, 10, 20, 7, 0, 0, Math.PI * 2);
    c.fill();
    // корпус
    const lg = c.createLinearGradient(0, -18, 0, 12);
    lg.addColorStop(0, '#e8eef7');
    lg.addColorStop(1, '#9fb0c8');
    c.fillStyle = lg;
    roundRectPath(c, -16, -14, 32, 26, 5);
    c.fill();
    c.lineWidth = 2.4;
    c.strokeStyle = '#2b3245';
    roundRectPath(c, -16, -14, 32, 26, 5);
    c.stroke();
    // крыша
    c.fillStyle = '#4f8f3a';
    roundRectPath(c, -19, -20, 38, 8, 3);
    c.fill();
    c.strokeStyle = '#2b3245';
    c.lineWidth = 2.2;
    roundRectPath(c, -19, -20, 38, 8, 3);
    c.stroke();
    // ворота
    c.fillStyle = '#3c4a5c';
    roundRectPath(c, -7, -2, 14, 14, 2);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(-7, 2 + i * 4);
      c.lineTo(7, 2 + i * 4);
      c.stroke();
    }
    // флагшток + флаг
    c.strokeStyle = '#c3ccd8';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(12, -18); c.lineTo(12, -36); c.stroke();
    c.fillStyle = '#ffd23f';
    c.beginPath();
    c.moveTo(12, -36);
    c.lineTo(26, -31);
    c.lineTo(12, -26);
    c.closePath();
    c.fill();
    c.strokeStyle = '#2b3245';
    c.lineWidth = 1.6;
    c.stroke();
    c.restore();
  }

  /* =========================== ДИНАМИЧЕСКИЙ РЕНДЕР ====================== */

  /** Главный вызов: рисует мир в трансформации камеры */
  render(g, cam) {
    this.ensureBackground();
    const view = cam.viewRect;

    // ---- фон ----
    if (this.bg) {
      const sx = Math.max(0, view.x) * BG_SCALE;
      const sy = Math.max(0, view.y) * BG_SCALE;
      const sw = Math.min(this.bg.width - sx, view.w * BG_SCALE);
      const sh = Math.min(this.bg.height - sy, view.h * BG_SCALE);
      if (sw > 0 && sh > 0) {
        g.drawImage(this.bg, sx, sy, sw, sh, sx / BG_SCALE, sy / BG_SCALE, sw / BG_SCALE, sh / BG_SCALE);
      }
    }

    // ---- пульсация лавы ----
    const zones = this.grid.zones || [];
    for (const z of zones) {
      if (z.kind !== 'lava') continue;
      const a = 0.12 + 0.08 * Math.sin(this.game.time * 2.4 + z.x);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = a;
      g.fillStyle = '#ff6a1f';
      g.fillRect(z.x * CELL, z.y * CELL, z.w * CELL, z.h * CELL);
      g.restore();
    }

    // ---- подсказка маршрута для maze-карт ----
    if (this.grid.maze) this._renderRouteHint(g);

    // ---- сетка в режиме строительства ----
    if (this.game.buildMode) this._renderBuildGrid(g, view);

    // ---- сущности с сортировкой по глубине ----
    this._renderEntities(g, view);

    // ---- отладочная сетка (клавиша G): типы клеток + flow-field ----
    if (this.game.debugGrid) this._renderDebugGrid(g, view);
  }

  /**
   * Отладочный оверлей сетки. Показывает:
   *   • тип каждой клетки (пусто / путь / заблокировано / башня / вход / выход);
   *   • направления flow-field стрелками (куда пойдёт наземный враг);
   *   • красным крестом — проходимые клетки без пути к выходу (замурованы);
   *   • радиусы всех башен.
   * Рисуется только по видимым клеткам (culling), поэтому дёшево.
   */
  _renderDebugGrid(g, view) {
    const grid = this.grid;
    const path = this.game.path;
    const FILL = {
      [TILE.EMPTY]: 'rgba(120,230,140,0.10)',
      [TILE.PATH]: 'rgba(255,206,120,0.16)',
      [TILE.BLOCKED]: 'rgba(150,150,175,0.22)',
      [TILE.TOWER]: 'rgba(120,190,255,0.20)',
      [TILE.ENTRY]: 'rgba(255,110,110,0.30)',
      [TILE.EXIT]: 'rgba(110,255,200,0.30)'
    };
    const INF = 0x3fffffff;

    const minCx = Math.max(0, Math.floor(view.x / CELL));
    const maxCx = Math.min(grid.cols - 1, Math.ceil((view.x + view.w) / CELL));
    const minCy = Math.max(0, Math.floor(view.y / CELL));
    const maxCy = Math.min(grid.rows - 1, Math.ceil((view.y + view.h) / CELL));

    g.save();

    // --- заливка по типу клетки ---
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const i = grid.idx(cx, cy);
        const t = grid.tileByIdx(i);
        const col = FILL[t];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(cx * CELL, cy * CELL, CELL, CELL);
      }
    }

    // --- линии сетки ---
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.beginPath();
    for (let cx = minCx; cx <= maxCx + 1; cx++) {
      g.moveTo(cx * CELL, minCy * CELL);
      g.lineTo(cx * CELL, (maxCy + 1) * CELL);
    }
    for (let cy = minCy; cy <= maxCy + 1; cy++) {
      g.moveTo(minCx * CELL, cy * CELL);
      g.lineTo((maxCx + 1) * CELL, cy * CELL);
    }
    g.stroke();

    // --- flow-field: стрелки к выходу + отметки замурованных клеток ---
    if (path) {
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.fillStyle = 'rgba(255,255,255,0.55)';
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          const i = grid.idx(cx, cy);
          if (!grid.isWalkable(i)) continue;
          const px = cx * CELL + CELL / 2;
          const py = cy * CELL + CELL / 2;

          if (path.dist[i] >= INF) {
            // проходимая клетка без маршрута — строить здесь нельзя
            g.strokeStyle = 'rgba(255,90,90,0.9)';
            g.beginPath();
            g.moveTo(px - 7, py - 7); g.lineTo(px + 7, py + 7);
            g.moveTo(px + 7, py - 7); g.lineTo(px - 7, py + 7);
            g.stroke();
            g.strokeStyle = 'rgba(255,255,255,0.55)';
            continue;
          }
          if (path.dist[i] === 0) continue;   // это выход

          const ni = path.next[i];
          if (ni < 0 || ni >= path.next.length) continue;
          const ncx = ni % grid.cols;
          const ncy = (ni / grid.cols) | 0;
          const dx = ncx - cx, dy = ncy - cy;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len, uy = dy / len;
          const x1 = px + ux * 4, y1 = py + uy * 4;
          const x2 = px + ux * 14, y2 = py + uy * 14;

          g.beginPath();
          g.moveTo(x1, y1);
          g.lineTo(x2, y2);
          g.stroke();
          // наконечник
          g.beginPath();
          g.moveTo(x2, y2);
          g.lineTo(x2 - ux * 5 - uy * 3.4, y2 - uy * 5 + ux * 3.4);
          g.lineTo(x2 - ux * 5 + uy * 3.4, y2 - uy * 5 - ux * 3.4);
          g.closePath();
          g.fill();
        }
      }
    }

    // --- радиусы башен ---
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(140,210,255,0.45)';
    for (const t of grid.allTowers()) {
      if (!t) continue;
      g.beginPath();
      g.arc(t.x, t.y, t.range, 0, Math.PI * 2);
      g.stroke();
    }

    g.restore();
  }

  _renderRouteHint(g) {
    const path = this.game.path;
    if (this.routeVersion !== path.version) {
      this.routeVersion = path.version;
      this.routePoints = path.routePoints(path.entryRoutes[0]);
    }
    const pts = this.routePoints;
    if (pts.length < 2) return;
    g.save();
    g.globalAlpha = 0.5;
    g.setLineDash([9, 9]);
    g.lineDashOffset = -this.game.time * 26;
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255,240,200,0.55)';
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.stroke();
    g.setLineDash([]);
    g.restore();
  }

  _renderBuildGrid(g, view) {
    const grid = this.grid;
    const minCx = Math.max(0, Math.floor(view.x / CELL));
    const maxCx = Math.min(grid.cols - 1, Math.ceil((view.x + view.w) / CELL));
    const minCy = Math.max(0, Math.floor(view.y / CELL));
    const maxCy = Math.min(grid.rows - 1, Math.ceil((view.y + view.h) / CELL));

    g.save();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,255,255,0.10)';
    g.beginPath();
    for (let cx = minCx; cx <= maxCx + 1; cx++) {
      g.moveTo(cx * CELL, minCy * CELL);
      g.lineTo(cx * CELL, (maxCy + 1) * CELL);
    }
    for (let cy = minCy; cy <= maxCy + 1; cy++) {
      g.moveTo(minCx * CELL, cy * CELL);
      g.lineTo((maxCx + 1) * CELL, cy * CELL);
    }
    g.stroke();

    // подсветка доступных для строительства клеток
    g.fillStyle = 'rgba(120,230,140,0.07)';
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        if (grid.isBuildableCell(cx, cy)) g.fillRect(cx * CELL + 1, cy * CELL + 1, CELL - 2, CELL - 2);
      }
    }
    g.restore();
  }

  _renderEntities(g, view) {
    const game = this.game;
    const list = this.renderList;
    list.length = 0;

    // башни + наземные враги в один список (сортировка по Y)
    const towers = game.towers;
    for (let i = 0; i < towers.length; i++) {
      const t = towers[i];
      if (!inRect(t.x, t.y, view, 40)) continue;
      list.push({ y: t.y + 14, kind: 0, o: t });
    }
    const enemies = game.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive || !inRect(e.x, e.y, view, 50)) continue;
      list.push({ y: e.y + (e.flying ? -1000 : 0), kind: 1, o: e });
    }
    list.sort(cmpY);

    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it.kind === 0) it.o.render(g, game.time);
      else it.o.render(g);
    }

    // снаряды и эффекты — поверх
    game.projectiles.render(g);
    game.effects.render(g);
    game.particles.render(g);
    game.particles.renderTexts(g, game.camera);
  }

  /* ======================= ПОДСВЕТКА КЛЕТКИ / ПРЕВЬЮ ==================== */

  /** Зелёная/красная подсветка клетки под пальцем */
  renderCellHighlight(g, cx, cy, ok, label) {
    const x = cx * CELL, y = cy * CELL;
    g.save();
    g.lineWidth = 2.5;
    g.strokeStyle = ok ? 'rgba(110,227,110,0.95)' : 'rgba(255,90,90,0.95)';
    g.fillStyle = ok ? 'rgba(110,227,110,0.22)' : 'rgba(255,90,90,0.22)';
    roundRectPath(g, x + 2, y + 2, CELL - 4, CELL - 4, 6);
    g.fill();
    g.stroke();
    if (!ok) {
      // крест
      g.beginPath();
      g.moveTo(x + 9, y + 9); g.lineTo(x + CELL - 9, y + CELL - 9);
      g.moveTo(x + CELL - 9, y + 9); g.lineTo(x + 9, y + CELL - 9);
      g.lineWidth = 3;
      g.stroke();
    }
    if (label) {
      g.font = '900 10px "Trebuchet MS", sans-serif';
      g.textAlign = 'center';
      g.fillStyle = ok ? '#d9ffd9' : '#ffd9d9';
      g.fillText(label, x + CELL / 2, y - 6);
    }
    g.restore();
  }

  /** Призрак башни при выборе места (полупрозрачная + радиус) */
  renderGhost(g, def, cx, cy, ok) {
    const x = cx * CELL + CELL / 2, y = cy * CELL + CELL / 2;
    const range = def.range ? def.range[0] : CELL * 2.5;
    g.save();
    g.globalAlpha = 0.55;
    g.beginPath();
    g.arc(x, y, range, 0, Math.PI * 2);
    g.fillStyle = ok ? 'rgba(110,227,110,0.12)' : 'rgba(255,90,90,0.12)';
    g.fill();
    g.setLineDash([6, 6]);
    g.lineWidth = 2;
    g.strokeStyle = ok ? 'rgba(110,227,110,0.8)' : 'rgba(255,90,90,0.8)';
    g.stroke();
    g.setLineDash([]);

    const base = Sprites.get('tower.base.0');
    const tur = Sprites.get(`tower.${def.behavior}.0`);
    g.globalAlpha = ok ? 0.75 : 0.4;
    if (base) g.drawImage(base, x - base.width / 2, y - base.height / 2);
    if (tur) g.drawImage(tur, x - tur.width / 2, y - tur.height / 2 - 4);
    g.restore();
  }

  /** Маркеры входов/выходов в рантайме (стрелки, пульсация) */
  renderMarkers(g, time) {
    const grid = this.grid;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    g.save();
    for (const e of grid.entries) {
      const x = grid.centerX(e.cx), y = grid.centerY(e.cy);
      g.globalAlpha = 0.35 + pulse * 0.35;
      g.strokeStyle = '#ff6b6b';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(x, y, CELL * 0.62 + pulse * 3, 0, Math.PI * 2);
      g.stroke();
    }
    for (const e of grid.exits) {
      const x = grid.centerX(e.cx), y = grid.centerY(e.cy);
      g.globalAlpha = 0.3 + pulse * 0.3;
      g.strokeStyle = '#6ee36e';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(x, y, CELL * 0.7 + pulse * 3, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }
}

/* ------------------------------ хелперы -------------------------------- */

function cx_(cx) { return cx * CELL + CELL / 2; }
function cy_(cy) { return cy * CELL + CELL / 2; }

function inRect(x, y, r, pad) {
  return x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
}

function cmpY(a, b) { return a.y - b.y; }

function roundRectPath(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export { roundRectPath, BG_SCALE };
export default RenderSystem;
