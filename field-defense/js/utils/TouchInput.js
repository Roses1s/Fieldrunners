/* ==========================================================================
   TouchInput.js — единая обработка тач/мыши/пера.
   Жесты:
     • TAP          — короткое нажатие без смещения  → scene.onTap(x, y)
     • DRAG (1 палец) — панорама карты               → scene.onDrag(dx, dy)
     • PINCH (2 пальца) — зум                         → scene.onPinch(k, cx, cy)
     • HOVER (мышь)  — подсветка клетки               → scene.onHover(x, y)
   Все координаты — CSS-пиксели относительно canvas.
   ========================================================================== */

const TAP_MOVE_LIMIT = 12;   // px — больше считаем драгом
const TAP_TIME_LIMIT = 380;  // ms
const PINCH_MIN_DIST = 14;

export class TouchInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.target = null;         // активная сцена
    this.pointers = new Map();  // pointerId -> {x, y, sx, sy, t, moved}
    this.pinchDist = 0;
    this.isPinching = false;
    this.isDragging = false;
    this.dragId = null;
    this.lastX = 0;
    this.lastY = 0;
    this.hoverX = -1;
    this.hoverY = -1;
    this.enabled = true;
    this.lastActivity = performance.now();
    this.multiTapCount = 0;
    this.multiTapTimer = 0;

    this._bind();
  }

  setTarget(scene) {
    this.target = scene;
    this.pointers.clear();
    this.isPinching = false;
    this.isDragging = false;
    this.dragId = null;
  }

  _bind() {
    const c = this.canvas;
    const opts = { passive: false };

    c.addEventListener('pointerdown', (e) => this._down(e), opts);
    c.addEventListener('pointermove', (e) => this._move(e), opts);
    c.addEventListener('pointerup', (e) => this._up(e), opts);
    c.addEventListener('pointercancel', (e) => this._up(e), opts);
    c.addEventListener('pointerleave', () => { this.hoverX = -1; this.hoverY = -1; }, opts);
    // Зум колесом на десктопе
    c.addEventListener('wheel', (e) => this._wheel(e), opts);
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    // Блокируем системные жесты браузера (свайп «назад», pull-to-refresh)
    document.addEventListener('gesturestart', (e) => e.preventDefault(), opts);
    document.addEventListener('touchmove', (e) => e.preventDefault(), opts);
    document.addEventListener('dblclick', (e) => e.preventDefault(), opts);

    // Клавиатура — для отладки на десктопе
    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _touch() { this.lastActivity = performance.now(); }

  _down(e) {
    if (!this.enabled) return;
    this._touch();
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }

    const p = this._pos(e);
    this.pointers.set(e.pointerId, {
      x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), moved: false
    });

    if (this.pointers.size === 1) {
      this.dragId = e.pointerId;
      this.lastX = p.x;
      this.lastY = p.y;
      this.isDragging = false;
      this.target?.onDown?.(p.x, p.y);
    } else if (this.pointers.size === 2) {
      // переход в режим pinch — отменяем драг
      this.isDragging = false;
      this.dragId = null;
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.isPinching = this.pinchDist > PINCH_MIN_DIST;
      this.target?.onDragEnd?.();
    }
  }

  _move(e) {
    if (!this.enabled) return;
    const p = this._pos(e);

    if (e.pointerType === 'mouse') {
      this.hoverX = p.x;
      this.hoverY = p.y;
      this.target?.onHover?.(p.x, p.y);
    }

    const rec = this.pointers.get(e.pointerId);
    if (!rec) return;
    this._touch();
    e.preventDefault();

    rec.x = p.x;
    rec.y = p.y;
    if (Math.hypot(p.x - rec.sx, p.y - rec.sy) > TAP_MOVE_LIMIT) rec.moved = true;

    if (this.pointers.size >= 2 && this.isPinching) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      if (d > PINCH_MIN_DIST && this.pinchDist > PINCH_MIN_DIST) {
        this.target?.onPinch?.(d / this.pinchDist, cx, cy);
      }
      this.pinchDist = d;
      return;
    }

    if (this.pointers.size === 1 && rec.moved) {
      if (!this.isDragging) {
        this.isDragging = true;
        this.target?.onDragStart?.(p.x, p.y);
      }
      const dx = p.x - this.lastX;
      const dy = p.y - this.lastY;
      this.lastX = p.x;
      this.lastY = p.y;
      this.target?.onDrag?.(dx, dy, p.x, p.y);
    }
  }

  _up(e) {
    if (!this.enabled) return;
    this._touch();
    const rec = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    try { this.canvas.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }

    if (this.pointers.size < 2) this.isPinching = false;

    if (!rec) return;

    if (this.pointers.size === 0) {
      if (this.isDragging) {
        this.isDragging = false;
        this.target?.onDragEnd?.();
      } else {
        const dt = performance.now() - rec.t;
        if (!rec.moved && dt < TAP_TIME_LIMIT) {
          // Двойной тап (для десктопа/быстрой игры)
          const now = performance.now();
          if (now - this.multiTapTimer < 300) this.multiTapCount++;
          else this.multiTapCount = 1;
          this.multiTapTimer = now;
          this.target?.onTap?.(rec.x, rec.y, this.multiTapCount);
        }
      }
      this.target?.onUp?.(rec.x, rec.y);
      this.dragId = null;
    } else {
      // Остался один палец — переустанавливаем точку отсчёта для драга
      const [rem] = [...this.pointers.values()];
      this.lastX = rem.x;
      this.lastY = rem.y;
    }
  }

  _wheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    this._touch();
    const p = this._pos(e);
    const k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.target?.onPinch?.(k, p.x, p.y);
  }

  _key(e, down) {
    if (!down) return;
    this._touch();
    this.target?.onKey?.(e.key, e);
  }

  /** Секунд с последнего действия пользователя (для «батарейного» режима) */
  idleSeconds() {
    return (performance.now() - this.lastActivity) / 1000;
  }
}

export default TouchInput;
