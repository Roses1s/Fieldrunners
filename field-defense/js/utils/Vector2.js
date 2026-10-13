/* ==========================================================================
   Vector2.js — минималистичный 2D-вектор.
   В горячих циклах (снаряды, частицы) используются «сырые» x/y, чтобы не
   плодить объекты под сборщик мусора; Vector2 — для читаемого кода логики.
   ========================================================================== */

export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x, y) { this.x = x; this.y = y; return this; }
  copy(v) { this.x = v.x; this.y = v.y; return this; }
  clone() { return new Vector2(this.x, this.y); }

  add(v) { this.x += v.x; this.y += v.y; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  mul(s) { this.x *= s; this.y *= s; return this; }

  length() { return Math.hypot(this.x, this.y); }
  lengthSq() { return this.x * this.x + this.y * this.y; }

  normalize() {
    const l = this.length();
    if (l > 1e-9) { this.x /= l; this.y /= l; }
    return this;
  }

  distanceTo(v) { return Math.hypot(v.x - this.x, v.y - this.y); }
  angle() { return Math.atan2(this.y, this.x); }

  static fromAngle(a, len = 1) {
    return new Vector2(Math.cos(a) * len, Math.sin(a) * len);
  }

  static add(a, b) { return new Vector2(a.x + b.x, a.y + b.y); }
  static sub(a, b) { return new Vector2(a.x - b.x, a.y - b.y); }
}

export default Vector2;
