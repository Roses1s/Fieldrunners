/* ==========================================================================
   PathfindingSystem.js — поиск пути.

   Два инструмента:
     1) A* (Manhattan-эвристика) — для проверки «есть ли путь» и для
        построения наглядного маршрута от входа до выхода.
     2) Flow field (волновой алгоритм от выходов) — кэш направлений для ВСЕХ
        наземных врагов сразу: пересчитывается только при изменении сетки
        (постройка/продажа башни), поэтому враги мгновенно перестраиваются.

   Воздушные юниты flow field игнорируют: они летят по прямой (или по
   воздушному коридору карты) — см. Enemy.updateFlying().
   ========================================================================== */

import { CELL, TILE } from '../utils/Constants.js';

const INF = 0x3fffffff;

export class PathfindingSystem {
  constructor(grid) {
    this.grid = grid;
    const n = grid.cols * grid.rows;
    this.dist = new Int32Array(n);     // расстояние до ближайшего выхода, в клетках
    this.next = new Int32Array(n);     // индекс следующей клетки к выходу
    this.queue = new Int32Array(n);    // кольцевая очередь для BFS
    this.tmpDist = new Int32Array(n);  // временный flow field для проверки стройки
    this.tmpQueue = new Int32Array(n);
    this.version = 0;                  // счётчик пересчётов (для кэшей)
    this.entryRoutes = [];             // наглядные маршруты от каждого входа
    this.reachableEntries = [];        // входы, у которых есть путь
    this.rebuild();
  }

  /* --------------------------- flow field ------------------------------ */

  /** Полный пересчёт: BFS от всех выходов по проходимым клеткам */
  rebuild() {
    const g = this.grid;
    const n = g.cols * g.rows;
    const { dist, next, queue } = this;
    dist.fill(INF);
    next.fill(-1);

    let head = 0, tail = 0;
    for (const e of g.exits) {
      const i = g.idx(e.cx, e.cy);
      if (dist[i] === INF) {
        dist[i] = 0;
        next[i] = -1;          // цель достигнута
        queue[tail++] = i;
      }
    }

    const cols = g.cols;
    while (head < tail) {
      const cur = queue[head++];
      const d = dist[cur] + 1;
      const cx = cur % cols, cy = (cur / cols) | 0;

      // 4-связность (диагонали запрещены — как в оригинале жанра)
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= cols || ny >= g.rows) continue;
        const ni = ny * cols + nx;
        if (dist[ni] !== INF) continue;
        if (!g.isWalkable(ni)) continue;
        dist[ni] = d;
        next[ni] = cur;
        queue[tail++] = ni;
      }
    }

    this.version++;
    this._updateEntryRoutes();
    return this;
  }

  _updateEntryRoutes() {
    const g = this.grid;
    this.entryRoutes = [];
    this.reachableEntries = [];
    for (const e of g.entries) {
      const start = g.idx(e.cx, e.cy);
      const route = this.routeFrom(start);
      this.entryRoutes.push(route);
      if (route && route.length) this.reachableEntries.push(e);
    }
  }

  /** Маршрут от клетки до выхода по flow field (массив индексов) */
  routeFrom(startIdx) {
    const g = this.grid;
    const n = g.cols * g.rows;
    if (startIdx < 0 || startIdx >= n) return null;
    if (this.dist[startIdx] >= INF) return null;
    const out = [startIdx];
    let cur = startIdx;
    let guard = n + 8;
    while (this.next[cur] !== -1 && guard-- > 0) {
      cur = this.next[cur];
      out.push(cur);
    }
    return out;
  }

  /** Сколько клеток осталось пройти от данной клетки (-1 = недостижимо) */
  distToExit(i) {
    return (i < 0 || i >= this.dist.length) ? INF : this.dist[i];
  }

  /** Следующая клетка для движения из i (или -1) */
  nextFrom(i) {
    return (i < 0 || i >= this.next.length) ? -1 : this.next[i];
  }

  /* ------------------------------- A* ---------------------------------- */

  /**
   * Классический A* с Manhattan-эвристикой до ближайшего выхода.
   * Используется для валидации строительства и для «подсказки маршрута».
   * @returns {number[]|null} массив индексов клеток от start до goal
   */
  astar(startIdx, extraBlocked = null) {
    const g = this.grid;
    const cols = g.cols, rows = g.rows;
    const n = cols * rows;
    if (startIdx < 0 || startIdx >= n) return null;
    if (!g.exits.length) return null;

    const gScore = new Int32Array(n).fill(INF);
    const fScore = new Int32Array(n).fill(INF);
    const cameFrom = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);

    // цели
    const goalIdx = g.exits.map((e) => g.idx(e.cx, e.cy));
    const isGoal = (i) => goalIdx.indexOf(i) !== -1;

    // эвристика: минимальный Manhattan до любого выхода
    const h = (i) => {
      const cx = i % cols, cy = (i / cols) | 0;
      let best = INF;
      for (const gi of goalIdx) {
        const gx = gi % cols, gy = (gi / cols) | 0;
        const d = Math.abs(cx - gx) + Math.abs(cy - gy);
        if (d < best) best = d;
      }
      return best;
    };

    const walkable = (i) => {
      if (extraBlocked && extraBlocked.has(i)) return false;
      // вход всегда проходим (на нём нельзя строить), выход — тоже
      const t = g.tiles[i];
      if (t === TILE.ENTRY || t === TILE.EXIT) return true;
      return g.isWalkable(i);
    };

    // простая двоичная куча
    const heap = [];
    const push = (i, f) => {
      heap.push({ i, f });
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (heap[p].f <= heap[c].f) break;
        const t = heap[p]; heap[p] = heap[c]; heap[c] = t;
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let p = 0;
        for (;;) {
          const l = p * 2 + 1, r = l + 1;
          let m = p;
          if (l < heap.length && heap[l].f < heap[m].f) m = l;
          if (r < heap.length && heap[r].f < heap[m].f) m = r;
          if (m === p) break;
          const t = heap[p]; heap[p] = heap[m]; heap[m] = t;
          p = m;
        }
      }
      return top;
    };

    gScore[startIdx] = 0;
    fScore[startIdx] = h(startIdx);
    push(startIdx, fScore[startIdx]);

    let guard = n * 4;
    while (heap.length && guard-- > 0) {
      const { i: cur } = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (isGoal(cur)) {
        // восстановить путь
        const path = [cur];
        let c = cur;
        while (cameFrom[c] !== -1) { c = cameFrom[c]; path.push(c); }
        path.reverse();
        return path;
      }
      const cx = cur % cols, cy = (cur / cols) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (closed[ni] || !walkable(ni)) continue;
        const tentative = gScore[cur] + 1;
        if (tentative < gScore[ni]) {
          gScore[ni] = tentative;
          cameFrom[ni] = cur;
          fScore[ni] = tentative + h(ni);
          push(ni, fScore[ni]);
        }
      }
    }
    return null;
  }

  /**
   * Главная проверка для mazing: можно ли поставить башню в клетку так, чтобы
   *   • ВСЕ входы по-прежнему имели путь к выходу;
   *   • ни один живой враг не оказался замурован (extraSources — их клетки).
   * Без этого враги застревали бы внутри лабиринта.
   *
   * Реализация: один временный волновой проход (BFS) от выходов с учётом
   * «виртуально» занятой клетки — O(клеток) вместо O(A* × источников).
   * На телефоне это микросекунды даже при сотне врагов.
   */
  canBuildAt(cx, cy, extraSources = null) {
    const g = this.grid;
    if (!g.isBuildableCell(cx, cy)) return false;
    if (!g.maze) {
      // на картах с фиксированным путём башни не влияют на маршрут
      return true;
    }
    const blockedIdx = g.idx(cx, cy);
    this._computeTempDist(blockedIdx);

    for (const e of g.entries) {
      if (this.tmpDist[g.idx(e.cx, e.cy)] >= INF) return false;
    }
    if (extraSources) {
      for (let i = 0; i < extraSources.length; i++) {
        const src = extraSources[i];
        if (src < 0 || src === blockedIdx) continue;
        if (this.dist[src] >= INF) continue;      // уже был недостижим — не хуже
        if (this.tmpDist[src] >= INF) return false;
      }
    }
    return true;
  }

  /** Волновой проход от выходов, будто клетка blockedIdx уже занята башней */
  _computeTempDist(blockedIdx) {
    const g = this.grid;
    const cols = g.cols;
    const { tmpDist: dist, tmpQueue: queue } = this;
    dist.fill(INF);
    let head = 0, tail = 0;

    for (const e of g.exits) {
      const i = g.idx(e.cx, e.cy);
      if (i === blockedIdx || dist[i] !== INF) continue;
      dist[i] = 0;
      queue[tail++] = i;
    }

    while (head < tail) {
      const cur = queue[head++];
      const d = dist[cur] + 1;
      const cx = cur % cols, cy = (cur / cols) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= cols || ny >= g.rows) continue;
        const ni = ny * cols + nx;
        if (ni === blockedIdx || dist[ni] !== INF) continue;
        if (!g.isWalkable(ni)) continue;
        dist[ni] = d;
        queue[tail++] = ni;
      }
    }
  }

  /** Мировые координаты центра клетки по индексу */
  cellCenter(i, out) {
    const g = this.grid;
    const o = out || { x: 0, y: 0 };
    o.x = (i % g.cols) * CELL + CELL / 2;
    o.y = ((i / g.cols) | 0) * CELL + CELL / 2;
    return o;
  }

  /** Точки маршрута в мировых координатах (для отрисовки подсказки) */
  routePoints(idxRoute) {
    if (!idxRoute) return [];
    const out = [];
    const p = { x: 0, y: 0 };
    for (const i of idxRoute) {
      this.cellCenter(i, p);
      out.push({ x: p.x, y: p.y });
    }
    return out;
  }
}

export default PathfindingSystem;
