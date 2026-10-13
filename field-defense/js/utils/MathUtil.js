/* ==========================================================================
   MathUtil.js — математические хелперы (без аллокаций в горячих путях)
   ========================================================================== */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v, a, b) {
  return v < a ? a : (v > b ? b : v);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** Нормализация угла в диапазон (-PI, PI] */
export function normAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

/** Поворот к целевому углу с ограничением шага (используется для homing-ракет) */
export function lerpAngle(a, b, t) {
  return a + normAngle(b - a) * clamp(t, 0, 1);
}

/** Шаг поворота с ограничением максимальной угловой скорости (рад/с) */
export function rotateTowards(a, b, maxDelta) {
  const d = normAngle(b - a);
  if (Math.abs(d) <= maxDelta) return b;
  return a + Math.sign(d) * maxDelta;
}

export function randRange(a, b) {
  return a + Math.random() * (b - a);
}

export function randInt(a, b) {
  return Math.floor(a + Math.random() * (b - a + 1));
}

export function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

/** Детерминированный PRNG (для фонов/декора — чтобы карта не «прыгала») */
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Расстояние от точки до отрезка (для лучей/конусов) */
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  return dist(px, py, ax + dx * t, ay + dy * t);
}

/** Форматирование чисел для HUD: 1200 -> "1.2K" */
export function fmtNum(n) {
  n = Math.round(n);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (Math.abs(n) >= 10000) return (n / 1000).toFixed(n >= 1e5 ? 0 : 1) + 'K';
  return String(n);
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = (sec / 60) | 0;
  const s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

export default {
  TAU, DEG, clamp, lerp, smoothstep, dist, dist2, normAngle, lerpAngle,
  rotateTowards, randRange, randInt, pick, makeRng, distToSegment, fmtNum, fmtTime
};
