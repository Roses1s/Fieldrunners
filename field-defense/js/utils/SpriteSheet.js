/* ==========================================================================
   SpriteSheet.js — процедурная генерация ВСЕЙ графики игры через Canvas 2D.
   Никаких внешних картинок: каждый спрайт рисуется кодом и кэшируется
   в offscreen-canvas при первом обращении (ленивая генерация).

   Соглашения:
     • тайлы и декор            — якорь bottom-center, если не сказано иное
     • турели башен             — центр в (w/2, h/2), «смотрят» вправо (0 рад)
     • враги                    — центр в (w/2, h/2), «смотрят» вправо
     • кадры анимации           — массив canvas одинакового размера
   ========================================================================== */

import { CELL, CONFIG } from './Constants.js';
import { makeRng } from './MathUtil.js';

const OUTLINE = '#241f2a';
const cache = new Map();       // key -> canvas | canvas[]
const builders = new Map();    // key -> fn()

const hasDom = typeof document !== 'undefined';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function ctxOf(c) {
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return g;
}

/* ----------------------------- примитивы ------------------------------- */

function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fillRR(g, x, y, w, h, r, fill, lw, stroke) {
  rr(g, x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) { g.lineWidth = lw; g.strokeStyle = stroke || OUTLINE; g.stroke(); }
}

function circle(g, x, y, r, fill, lw, stroke) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) { g.lineWidth = lw; g.strokeStyle = stroke || OUTLINE; g.stroke(); }
}

function poly(g, pts, fill, lw, stroke) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) { g.lineWidth = lw; g.strokeStyle = stroke || OUTLINE; g.stroke(); }
}

function vgrad(g, x, y, w, h, c0, c1) {
  const lg = g.createLinearGradient(x, y, x, y + h);
  lg.addColorStop(0, c0);
  lg.addColorStop(1, c1);
  return lg;
}

function shade(hex, amt) {
  // amt > 0 — светлее, < 0 — темнее
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= (1 + amt); g *= (1 + amt); b *= (1 + amt); }
  const to = (v) => ('0' + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2);
  return '#' + to(r) + to(g) + to(b);
}

/* ============================ ТАЙЛЫ ЗЕМЛИ ============================== */

function buildTile(biome, variant) {
  const pal = CONFIG.PALETTES[biome] || CONFIG.PALETTES.grass;
  const S = CELL * 2; // генерим в 2x для чёткости при зуме
  const c = makeCanvas(S, S), g = ctxOf(c);
  const rng = makeRng(1337 + variant * 91 + biome.length * 17);

  g.fillStyle = pal.ground[variant % pal.ground.length];
  g.fillRect(0, 0, S, S);

  // Мягкие пятна травы/песка
  for (let i = 0; i < 26; i++) {
    const x = rng() * S, y = rng() * S, r = 3 + rng() * 10;
    g.fillStyle = pal.ground[(variant + 1 + ((rng() * 3) | 0)) % pal.ground.length];
    g.globalAlpha = 0.35 + rng() * 0.3;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;

  if (biome === 'grass') {
    // травинки
    g.strokeStyle = shade(pal.groundDark, 0.18);
    g.lineWidth = 1.6;
    for (let i = 0; i < 22; i++) {
      const x = rng() * S, y = rng() * S, h = 3 + rng() * 5, a = (rng() - 0.5) * 0.7;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + a * 3, y - h * 0.6, x + a * 6, y - h);
      g.stroke();
    }
  } else if (biome === 'desert') {
    // рябь песка
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const y = rng() * S, x = rng() * S;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 8, y - 3, x + 16, y);
      g.stroke();
    }
  } else if (biome === 'lava') {
    // трещины в камне
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1.6;
    for (let i = 0; i < 8; i++) {
      let x = rng() * S, y = rng() * S;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 3; k++) { x += (rng() - 0.5) * 18; y += (rng() - 0.5) * 18; g.lineTo(x, y); }
      g.stroke();
    }
    if (rng() < 0.3) { // тлеющая жилка
      g.strokeStyle = 'rgba(255,90,30,0.5)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(rng() * S, rng() * S); g.lineTo(rng() * S, rng() * S); g.stroke();
    }
  } else { // city
    // асфальтовая крошка / плитка
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 1.4;
    for (let i = 0; i <= 2; i++) {
      g.beginPath(); g.moveTo(i * S / 2, 0); g.lineTo(i * S / 2, S); g.stroke();
      g.beginPath(); g.moveTo(0, i * S / 2); g.lineTo(S, i * S / 2); g.stroke();
    }
  }

  // лёгкая виньетка клетки для читаемости сетки
  g.strokeStyle = 'rgba(0,0,0,0.06)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, S - 2, S - 2);
  return c;
}

/* ============================== ДЕКОР ================================== */

function buildTree() {
  const W = 44, H = 52;
  const c = makeCanvas(W, H), g = ctxOf(c);
  const cx = W / 2;
  // тень
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath(); g.ellipse(cx, H - 4, 13, 5, 0, 0, Math.PI * 2); g.fill();
  // ствол
  fillRR(g, cx - 4, H - 22, 8, 20, 3, '#8a5a34', 2);
  // крона — три «облака»
  const blobs = [[cx, H - 34, 15], [cx - 10, H - 26, 11], [cx + 10, H - 27, 11]];
  for (const [x, y, r] of blobs) circle(g, x, y, r, '#2f7a34', 2.4);
  for (const [x, y, r] of blobs) {
    circle(g, x - r * 0.25, y - r * 0.3, r * 0.62, '#4aa344');
  }
  circle(g, cx - 6, H - 40, 4, 'rgba(255,255,255,0.22)');
  return c;
}

function buildPine() {
  const W = 36, H = 52;
  const c = makeCanvas(W, H), g = ctxOf(c);
  const cx = W / 2;
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath(); g.ellipse(cx, H - 4, 10, 4, 0, 0, Math.PI * 2); g.fill();
  fillRR(g, cx - 3, H - 16, 6, 14, 2, '#7a4f2c', 2);
  for (let i = 0; i < 3; i++) {
    const y = H - 14 - i * 12, w = 26 - i * 6;
    poly(g, [cx - w / 2, y, cx + w / 2, y, cx, y - 16], i % 2 ? '#2e7d3a' : '#379144', 2.2);
  }
  return c;
}

function buildBush() {
  const W = 30, H = 22;
  const c = makeCanvas(W, H), g = ctxOf(c);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.beginPath(); g.ellipse(15, H - 3, 11, 4, 0, 0, Math.PI * 2); g.fill();
  circle(g, 10, 13, 8, '#3a8a3c', 2.2);
  circle(g, 20, 12, 9, '#43993f', 2.2);
  circle(g, 15, 8, 6, '#4fae4a', 1.8);
  return c;
}

function buildRock() {
  const W = 30, H = 24;
  const c = makeCanvas(W, H), g = ctxOf(c);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath(); g.ellipse(15, H - 3, 12, 4, 0, 0, Math.PI * 2); g.fill();
  poly(g, [3, 19, 8, 8, 16, 4, 25, 10, 27, 19], '#8d8f98', 2.2);
  poly(g, [8, 8, 16, 4, 20, 10, 12, 13], '#a6a8b2');
  poly(g, [3, 19, 8, 14, 12, 19], '#767880');
  return c;
}

function buildFlower() {
  const W = 18, H = 18;
  const c = makeCanvas(W, H), g = ctxOf(c);
  g.strokeStyle = '#3d8a3a'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(9, 16); g.lineTo(9, 8); g.stroke();
  const cols = ['#ff6f91', '#ffd23f', '#ff8f4d', '#c86fff'];
  const col = cols[(Math.random() * cols.length) | 0];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    circle(g, 9 + Math.cos(a) * 3.4, 7 + Math.sin(a) * 3.4, 2.4, col, 1, OUTLINE);
  }
  circle(g, 9, 7, 2, '#fff3b0', 1, OUTLINE);
  return c;
}

function buildCactus() {
  const W = 28, H = 40;
  const c = makeCanvas(W, H), g = ctxOf(c);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.beginPath(); g.ellipse(14, H - 3, 9, 3.5, 0, 0, Math.PI * 2); g.fill();
  fillRR(g, 10, 8, 8, 29, 4, '#3f9e4a', 2.2);
  fillRR(g, 3, 14, 6, 12, 3, '#3f9e4a', 2.2);
  fillRR(g, 19, 17, 6, 10, 3, '#48ab52', 2.2);
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(14, 12); g.lineTo(14, 33); g.stroke();
  return c;
}

function buildBuilding(seed) {
  const W = 62, H = 74;
  const c = makeCanvas(W, H), g = ctxOf(c);
  const rng = makeRng(seed || 7);
  const hue = ['#9aa6b4', '#b09a8a', '#8fa0a6', '#a8a0b4'][(rng() * 4) | 0];
  const h = 44 + rng() * 22;
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath(); g.ellipse(W / 2, H - 4, 24, 6, 0, 0, Math.PI * 2); g.fill();
  fillRR(g, 8, H - h, 46, h, 3, hue, 2.4);
  fillRR(g, 8, H - h, 46, 7, 3, shade(hue, 0.18), 2);
  // окна
  for (let y = H - h + 12; y < H - 10; y += 12) {
    for (let x = 14; x < 48; x += 11) {
      fillRR(g, x, y, 7, 8, 1.5, rng() < 0.3 ? '#ffe9a3' : '#3c4a5c', 1.2);
    }
  }
  // дверь
  fillRR(g, 26, H - 16, 10, 16, 2, '#4a3a2c', 1.8);
  return c;
}

function buildBarrel() {
  const W = 20, H = 26;
  const c = makeCanvas(W, H), g = ctxOf(c);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath(); g.ellipse(10, H - 3, 8, 3, 0, 0, Math.PI * 2); g.fill();
  fillRR(g, 3, 3, 14, 20, 3, '#c0563a', 2);
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(3, 9); g.lineTo(17, 9); g.moveTo(3, 17); g.lineTo(17, 17); g.stroke();
  return c;
}

function buildLavaPool() {
  const S = CELL * 2;
  const c = makeCanvas(S, S), g = ctxOf(c);
  const rng = makeRng(99);
  const lg = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.6);
  lg.addColorStop(0, '#fff3a0');
  lg.addColorStop(0.35, '#ff9a1f');
  lg.addColorStop(1, '#c22b0d');
  g.fillStyle = lg;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 14; i++) {
    g.fillStyle = 'rgba(60,20,10,0.35)';
    g.beginPath();
    g.ellipse(rng() * S, rng() * S, 3 + rng() * 7, 2 + rng() * 4, rng() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/* ============================ БАЗЫ БАШЕН =============================== */

const LEVEL_TRIM = ['#b07a3c', '#c3ccd8', '#ffd23f']; // бронза / серебро / золото

function buildTowerBase(level) {
  const S = 48;
  const c = makeCanvas(S, S), g = ctxOf(c);
  const cx = S / 2;
  // тень
  g.fillStyle = 'rgba(0,0,0,0.24)';
  g.beginPath(); g.ellipse(cx, S - 7, 17, 6, 0, 0, Math.PI * 2); g.fill();
  // плита
  fillRR(g, 6, 10, 36, 32, 6, vgrad(g, 6, 10, 36, 32, '#9aa3b2', '#6b7382'), 2.4);
  // «газонок» под плитой
  g.fillStyle = 'rgba(0,0,0,0.12)';
  rr(g, 9, 13, 30, 26, 5); g.fill();
  fillRR(g, 10, 13, 28, 24, 5, vgrad(g, 10, 13, 28, 24, '#b9c1cd', '#828a99'), 2);
  // обводка уровня
  g.strokeStyle = LEVEL_TRIM[level] || LEVEL_TRIM[0];
  g.lineWidth = 2.4;
  rr(g, 8, 11, 32, 30, 6); g.stroke();
  // пипки уровня
  for (let i = 0; i <= level; i++) {
    circle(g, cx - 6 + i * 6, S - 8, 2, LEVEL_TRIM[level], 1, 'rgba(0,0,0,0.5)');
  }
  return c;
}

/* ============================== ТУРЕЛИ ================================= */

function buildGatlingTurret(level) {
  const S = 52;
  const c = makeCanvas(S, S), g = ctxOf(c);
  const cy = S / 2, x0 = 10;
  const metal = level === 2 ? '#8b7a4a' : (level === 1 ? '#7d8798' : '#6f7a8c');
  // корпус
  fillRR(g, x0, cy - 11, 22, 22, 5, vgrad(g, x0, cy - 11, 22, 22, shade(metal, 0.28), shade(metal, -0.18)), 2.2);
  // магазин
  fillRR(g, x0 - 4, cy + 4, 12, 10, 3, '#59606e', 2);
  // блок стволов
  const barrels = 3 + level;
  for (let i = 0; i < barrels; i++) {
    const off = (i - (barrels - 1) / 2) * 4.2;
    fillRR(g, x0 + 18, cy + off - 1.8, 20, 3.6, 1.8, i % 2 ? '#4c5260' : '#5d6472', 1.4);
  }
  // муфта
  circle(g, x0 + 18, cy, 6.5, shade(metal, 0.1), 2);
  circle(g, x0 + 18, cy, 3, '#3a4050', 1.4);
  // блик
  g.fillStyle = 'rgba(255,255,255,0.28)';
  rr(g, x0 + 3, cy - 9, 16, 4, 2); g.fill();
  return c;
}

function buildGlueTurret(level) {
  const S = 52;
  const c = makeCanvas(S, S), g = ctxOf(c);
  const cy = S / 2;
  // бак с клеем
  fillRR(g, 8, cy - 13, 20, 26, 6, vgrad(g, 8, cy - 13, 20, 26, '#7fd4f2', '#2f8fc0'), 2.4);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  rr(g, 11, cy - 10, 5, 18, 2.5); g.fill();
  // пузыри
  circle(g, 21, cy - 4, 2.4, 'rgba(255,255,255,0.55)');
  circle(g, 17, cy + 5, 1.8, 'rgba(255,255,255,0.45)');
  // сопло
  const ncol = level === 2 ? '#ffd23f' : (level === 1 ? '#c3ccd8' : '#8b95a5');
  poly(g, [28, cy - 6, 40, cy - 3, 40, cy + 3, 28, cy + 6], ncol, 2.2);
  // капля на конце
  circle(g, 41, cy, 3.4, '#bff0ff', 1.6);
  // шланг
  g.strokeStyle = '#3f6f8a'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(18, cy - 13); g.quadraticCurveTo(24, cy - 22, 32, cy - 12); g.stroke();
  return c;
}

function buildMissileTurret(level) {
  const S = 56;
  const c = makeCanvas(S, S), g = ctxOf(c);
  const cy = S / 2 + 4;
  // поворотная платформа
  circle(g, 18, cy, 10, '#6d7482', 2.2);
  circle(g, 18, cy, 5, '#565d6b', 1.6);
  // пакет труб
  const tubes = 2 + level;
  g.save();
  g.translate(18, cy);
  g.rotate(-0.42);
  for (let i = 0; i < tubes; i++) {
    const off = (i - (tubes - 1) / 2) * 7;
    fillRR(g, 2, off - 3.2, 26, 6.4, 3, i % 2 ? '#8a6f4f' : '#9c7f5c', 2);
    circle(g, 28, off, 3.2, '#3b3226', 1.4);
    // боеголовка торчит
    poly(g, [26, off - 3, 32, off, 26, off + 3], '#ff7a3c', 1.4);
  }
  g.restore();
  // рама
  fillRR(g, 8, cy + 4, 20, 8, 3, '#5b6270', 2);
  return c;
}

function buildTeslaTurret(level) {
  const S = 54;
  const c = makeCanvas(S, S), g = ctxOf(c);
  const cy = S / 2 + 2;
  // основание-катушка
  fillRR(g, 12, cy - 4, 18, 16, 4, vgrad(g, 12, cy - 4, 18, 16, '#6d7bb0', '#3f4a75'), 2.2);
  // витки
  g.strokeStyle = '#c9a227'; g.lineWidth = 1.8;
  for (let i = 0; i < 4; i++) {
    g.beginPath(); g.moveTo(13, cy - 2 + i * 3.4); g.lineTo(29, cy - 2 + i * 3.4); g.stroke();
  }
  // два электрода
  const trim = level === 2 ? '#ffd23f' : (level === 1 ? '#dfe7f2' : '#9fe8ff');
  g.strokeStyle = '#b9c4d6'; g.lineWidth = 3;
  g.beginPath();
  g.moveTo(16, cy - 4); g.quadraticCurveTo(14, cy - 18, 24, cy - 22);
  g.moveTo(26, cy - 4); g.quadraticCurveTo(30, cy - 18, 24, cy - 22);
  g.stroke();
  // шар разряда
  const lg = g.createRadialGradient(24, cy - 23, 1, 24, cy - 23, 9 + level * 1.5);
  lg.addColorStop(0, '#ffffff');
  lg.addColorStop(0.4, trim);
  lg.addColorStop(1, 'rgba(90,180,255,0)');
  g.fillStyle = lg;
  g.beginPath(); g.arc(24, cy - 23, 9 + level * 1.5, 0, Math.PI * 2); g.fill();
  circle(g, 24, cy - 23, 3.6, '#eaf9ff', 1.6, '#5aa8d8');
  return c;
}

/* ============================== ВРАГИ ================================== */

/** Универсальный пехотинец: 6 кадров ходьбы. size — сторона canvas. */
function buildHumanoidFrames(tint, opts = {}) {
  const S = opts.size || 30;
  const frames = opts.frames || 6;
  const dark = shade(tint, -0.32);
  const light = shade(tint, 0.22);
  const skin = '#e8b48c';
  const metal = '#4b5260';
  const out = [];

  for (let f = 0; f < frames; f++) {
    const c = makeCanvas(S, S), g = ctxOf(c);
    const cx = S / 2;
    const t = f / frames;
    const swing = Math.sin(t * Math.PI * 2);
    const bob = Math.abs(Math.cos(t * Math.PI * 2)) * 1.4;
    const feet = S - 4;
    const hip = feet - 8 - bob;

    // тень
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath(); g.ellipse(cx, S - 3, 7.5, 2.8, 0, 0, Math.PI * 2); g.fill();

    // ноги
    g.strokeStyle = dark; g.lineWidth = 3.6;
    g.beginPath();
    g.moveTo(cx, hip); g.lineTo(cx + swing * 4.6, feet);
    g.moveTo(cx, hip); g.lineTo(cx - swing * 4.6, feet);
    g.stroke();
    // ботинки
    g.fillStyle = '#2f3540';
    fillRR(g, cx + swing * 4.6 - 3, feet - 2.5, 6.5, 3.2, 1.4, '#2f3540', 0);
    fillRR(g, cx - swing * 4.6 - 3.5, feet - 2.5, 6.5, 3.2, 1.4, '#2f3540', 0);

    // торс
    const torsoTop = hip - 11;
    fillRR(g, cx - 5.5, torsoTop, 11, 12, 3.5, vgrad(g, cx - 5.5, torsoTop, 11, 12, light, tint), 2);
    // разгрузка
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(cx - 4, torsoTop + 4); g.lineTo(cx + 4, torsoTop + 4); g.stroke();

    // рюкзак
    fillRR(g, cx - 9, torsoTop + 1, 5, 8, 2, dark, 1.6);

    // руки + оружие
    g.strokeStyle = tint; g.lineWidth = 3;
    const armY = torsoTop + 4;
    g.beginPath(); g.moveTo(cx, armY); g.lineTo(cx + 6 + swing, armY + 2); g.stroke();
    // винтовка
    if (!opts.noGun) {
      fillRR(g, cx + 3, armY - 1.4, 13, 3, 1.4, metal, 1.4);
      fillRR(g, cx + 6, armY + 1, 3, 4, 1, '#3a404c', 1);
    }

    // голова
    const hy = torsoTop - 4.5;
    circle(g, cx + 1, hy, 4.6, skin, 2);
    // шлем
    g.fillStyle = opts.helm || dark;
    g.beginPath();
    g.arc(cx + 1, hy - 0.6, 5.1, Math.PI * 1.02, Math.PI * 2.02);
    g.closePath();
    g.lineWidth = 2; g.strokeStyle = OUTLINE; g.stroke(); g.fill();
    // глаз
    circle(g, cx + 3.4, hy + 0.6, 0.9, '#22262e', 0);

    // «след скорости» для бегуна
    if (opts.speedLines) {
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(cx - 8 - i * 3, torsoTop + 2 + i * 3.5);
        g.lineTo(cx - 14 - i * 3, torsoTop + 2 + i * 3.5);
        g.stroke();
      }
    }
    out.push(c);
  }
  return out;
}

function buildBikerFrames() {
  const S = 38, frames = 4, out = [];
  for (let f = 0; f < frames; f++) {
    const c = makeCanvas(S, S), g = ctxOf(c);
    const cy = S / 2 + 4;
    const wob = Math.sin((f / frames) * Math.PI * 2) * 0.7;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath(); g.ellipse(S / 2, S - 3, 13, 3, 0, 0, Math.PI * 2); g.fill();
    // колёса
    for (const wx of [8, 28]) {
      circle(g, wx, cy + 5, 5.4, '#22262e', 2);
      circle(g, wx, cy + 5, 2.2, '#8d95a3', 1.2);
      g.save(); g.translate(wx, cy + 5); g.rotate(f * 0.9);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(-4, 0); g.lineTo(4, 0); g.moveTo(0, -4); g.lineTo(0, 4); g.stroke();
      g.restore();
    }
    // рама
    poly(g, [8, cy + 5, 16, cy - 3, 26, cy - 3, 28, cy + 5], null, 3, '#c8862a');
    fillRR(g, 14, cy - 6, 12, 5, 2, '#e0952f', 2);
    // rider
    g.save(); g.translate(18, cy - 8); g.rotate(-0.16 + wob * 0.05);
    fillRR(g, -4, -8, 9, 10, 3, vgrad(g, -4, -8, 9, 10, '#e0674a', '#b3402a'), 2);
    circle(g, 1, -12, 4.4, '#dfe6f0', 2);   // шлем
    g.fillStyle = 'rgba(60,90,130,0.9)';
    rr(g, 1.5, -13.5, 4, 3, 1.2); g.fill();
    g.strokeStyle = '#b3402a'; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(0, -6); g.lineTo(7, -3); g.stroke();
    g.restore();
    out.push(c);
  }
  return out;
}

function buildCopterSprite() {
  const S = 46;
  const c = makeCanvas(S, S), g = ctxOf(c);
  const cy = S / 2 + 3;
  // хвост
  poly(g, [10, cy - 2, 2, cy - 5, 2, cy + 1, 10, cy + 3], '#3c5f8f', 2);
  poly(g, [2, cy - 8, 6, cy - 5, 2, cy - 2], '#4a6fa5', 1.8);
  // корпус
  fillRR(g, 10, cy - 9, 24, 17, 8, vgrad(g, 10, cy - 9, 24, 17, '#6b93c8', '#38588a'), 2.4);
  // кабина
  g.fillStyle = 'rgba(190,235,255,0.85)';
  g.beginPath(); g.ellipse(29, cy - 1, 6.5, 5.5, 0, -1.1, 1.5); g.fill();
  g.strokeStyle = OUTLINE; g.lineWidth = 1.6; g.stroke();
  // полозья
  g.strokeStyle = '#2f3d52'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(14, cy + 8); g.lineTo(14, cy + 12); g.moveTo(28, cy + 8); g.lineTo(28, cy + 12);
  g.moveTo(9, cy + 12); g.lineTo(33, cy + 12); g.stroke();
  // втулка ротора (лопасти рисуются в рантайме — вращение)
  fillRR(g, 19, cy - 14, 6, 6, 2, '#5a6a80', 1.8);
  return c;
}

function buildTankFrames() {
  const S = 44, frames = 4, out = [];
  for (let f = 0; f < frames; f++) {
    const c = makeCanvas(S, S), g = ctxOf(c);
    const cy = S / 2 + 5;
    g.fillStyle = 'rgba(0,0,0,0.24)';
    g.beginPath(); g.ellipse(S / 2, S - 3, 16, 3.4, 0, 0, Math.PI * 2); g.fill();
    // гусеницы
    fillRR(g, 5, cy, 34, 11, 5, '#2f3540', 2.2);
    for (let i = 0; i < 6; i++) {
      const x = 8 + ((i * 6 + f * 2) % 30);
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(x, cy + 1.5, 2.4, 8);
    }
    circle(g, 10, cy + 5.5, 3, '#5d6472', 1.4);
    circle(g, 34, cy + 5.5, 3, '#5d6472', 1.4);
    // корпус
    poly(g, [7, cy, 12, cy - 11, 34, cy - 11, 38, cy], '#6b7a52', 2.4);
    fillRR(g, 12, cy - 11, 22, 4, 2, '#7d8c60', 1.6);
    // башня
    fillRR(g, 15, cy - 19, 15, 9, 3, vgrad(g, 15, cy - 19, 15, 9, '#7f8f63', '#5b6b45'), 2.2);
    fillRR(g, 29, cy - 16.5, 13, 4, 2, '#4e5a3c', 2);
    // люк + антенна
    circle(g, 21, cy - 19, 2.4, '#4e5a3c', 1.4);
    g.strokeStyle = '#3d4733'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(17, cy - 19); g.lineTo(15, cy - 26); g.stroke();
    out.push(c);
  }
  return out;
}

function buildTransportFrames() {
  const S = 46, frames = 4, out = [];
  for (let f = 0; f < frames; f++) {
    const c = makeCanvas(S, S), g = ctxOf(c);
    const cy = S / 2 + 6;
    g.fillStyle = 'rgba(0,0,0,0.24)';
    g.beginPath(); g.ellipse(S / 2, S - 3, 17, 3.4, 0, 0, Math.PI * 2); g.fill();
    // колёса
    for (const wx of [12, 33]) {
      circle(g, wx, cy + 4, 5.2, '#22262e', 2);
      circle(g, wx, cy + 4, 2, '#8d95a3', 1.2);
      g.save(); g.translate(wx, cy + 4); g.rotate(f * 1.2);
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(-3.6, 0); g.lineTo(3.6, 0); g.stroke();
      g.restore();
    }
    // кузов
    fillRR(g, 4, cy - 14, 26, 16, 3, vgrad(g, 4, cy - 14, 26, 16, '#8d7c58', '#6b5c3f'), 2.4);
    // тент
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      g.beginPath(); g.moveTo(8 + i * 6, cy - 14); g.lineTo(8 + i * 6, cy + 2); g.stroke();
    }
    // кабина
    fillRR(g, 30, cy - 12, 13, 14, 3, vgrad(g, 30, cy - 12, 13, 14, '#9c8a63', '#75653f'), 2.4);
    g.fillStyle = 'rgba(180,225,255,0.85)';
    rr(g, 33, cy - 10, 8, 5, 1.6); g.fill();
    g.strokeStyle = OUTLINE; g.lineWidth = 1.4; g.stroke();
    // мигалка
    circle(g, 36, cy - 14, 2, f % 2 ? '#ffd23f' : '#ff7a3c', 1.2);
    out.push(c);
  }
  return out;
}

function buildBossFrames() {
  const S = 84, frames = 6, out = [];
  for (let f = 0; f < frames; f++) {
    const c = makeCanvas(S, S), g = ctxOf(c);
    const cx = S / 2, t = f / frames;
    const step = Math.sin(t * Math.PI * 2);
    const bob = Math.abs(Math.cos(t * Math.PI * 2)) * 2.2;
    const feet = S - 8;
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath(); g.ellipse(cx, S - 5, 26, 6, 0, 0, Math.PI * 2); g.fill();

    // ноги-опоры
    for (const s of [-1, 1]) {
      const kx = cx + s * 13 + step * s * 5;
      g.strokeStyle = '#4a3a44'; g.lineWidth = 8;
      g.beginPath();
      g.moveTo(cx + s * 8, feet - 26 - bob);
      g.lineTo(kx, feet - 12);
      g.lineTo(kx + s * 2, feet);
      g.stroke();
      fillRR(g, kx - 7, feet - 5, 15, 6, 2.5, '#3b2f37', 2);
    }

    // корпус
    const bodyTop = feet - 46 - bob;
    fillRR(g, cx - 21, bodyTop, 42, 30, 8, vgrad(g, cx - 21, bodyTop, 42, 30, '#8a5670', '#5b3446'), 2.8);
    // бронеплиты
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - 21, bodyTop + 10); g.lineTo(cx + 21, bodyTop + 10); g.stroke();
    fillRR(g, cx - 14, bodyTop + 13, 28, 10, 3, '#6d4155', 1.8);
    // «глаз»
    const glow = g.createRadialGradient(cx + 12, bodyTop + 6, 1, cx + 12, bodyTop + 6, 8);
    glow.addColorStop(0, '#fff'); glow.addColorStop(0.4, '#ff5a3c'); glow.addColorStop(1, 'rgba(255,90,60,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(cx + 12, bodyTop + 6, 8, 0, Math.PI * 2); g.fill();
    circle(g, cx + 12, bodyTop + 6, 3, '#ffd0c0', 1.4, '#8a2f1f');

    // пушка на плече
    g.save();
    g.translate(cx - 14, bodyTop + 4);
    g.rotate(-0.12);
    fillRR(g, -18, -4, 20, 8, 3, '#4b5260', 2.2);
    circle(g, -18, 0, 4.4, '#333a46', 1.8);
    g.restore();

    // антенны/рога
    g.strokeStyle = '#3b2f37'; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - 8, bodyTop); g.lineTo(cx - 13, bodyTop - 10);
    g.moveTo(cx + 6, bodyTop); g.lineTo(cx + 10, bodyTop - 12);
    g.stroke();
    circle(g, cx + 10, bodyTop - 13, 2.6, f % 2 ? '#ffd23f' : '#ff7a3c', 1.2);
    out.push(c);
  }
  return out;
}

/* ============================ СНАРЯДЫ ================================== */

function buildBullet() {
  const S = 12;
  const c = makeCanvas(S, S), g = ctxOf(c);
  const lg = g.createRadialGradient(S / 2, S / 2, 0.5, S / 2, S / 2, S / 2);
  lg.addColorStop(0, '#fffbe0');
  lg.addColorStop(0.4, '#ffd23f');
  lg.addColorStop(1, 'rgba(255,160,40,0)');
  g.fillStyle = lg;
  g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.fill();
  return c;
}

function buildMissile() {
  const W = 22, H = 10;
  const c = makeCanvas(W, H), g = ctxOf(c);
  const cy = H / 2;
  fillRR(g, 3, cy - 2.6, 13, 5.2, 2.4, vgrad(g, 3, cy - 2.6, 13, 5.2, '#e8edf5', '#9aa4b4'), 1.6);
  poly(g, [16, cy - 2.6, 21, cy, 16, cy + 2.6], '#ff7a3c', 1.4);
  poly(g, [3, cy - 4.2, 7, cy - 2.4, 3, cy - 2.4], '#c0563a', 1.2);
  poly(g, [3, cy + 4.2, 7, cy + 2.4, 3, cy + 2.4], '#c0563a', 1.2);
  circle(g, 2, cy, 2.2, 'rgba(255,200,120,0.9)', 0);
  return c;
}

function buildGlueBlob() {
  const S = 14;
  const c = makeCanvas(S, S), g = ctxOf(c);
  const lg = g.createRadialGradient(S / 2 - 1, S / 2 - 2, 1, S / 2, S / 2, S / 2);
  lg.addColorStop(0, '#e6fbff');
  lg.addColorStop(0.5, '#63cdf2');
  lg.addColorStop(1, '#2f8fc0');
  g.fillStyle = lg;
  g.beginPath();
  g.moveTo(S / 2, 1);
  g.quadraticCurveTo(S - 1, S / 2 + 2, S / 2, S - 1);
  g.quadraticCurveTo(1, S / 2 + 2, S / 2, 1);
  g.fill();
  g.lineWidth = 1.4; g.strokeStyle = 'rgba(20,60,90,0.7)'; g.stroke();
  return c;
}

function buildBee() {
  const S = 10;
  const c = makeCanvas(S, S), g = ctxOf(c);
  g.fillStyle = '#ffd23f';
  g.beginPath(); g.ellipse(S / 2, S / 2, 3.2, 2.4, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#22262e'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(S / 2 - 0.5, S / 2 - 2.4); g.lineTo(S / 2 - 0.5, S / 2 + 2.4); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.beginPath(); g.ellipse(S / 2 + 1, S / 2 - 2.6, 2.2, 1.2, -0.4, 0, Math.PI * 2); g.fill();
  return c;
}

/* ============================== ИКОНКИ ================================= */

function iconCanvas(S, draw) {
  const c = makeCanvas(S, S), g = ctxOf(c);
  draw(g, S);
  return c;
}

function buildCoin() {
  return iconCanvas(28, (g, S) => {
    const cx = S / 2, cy = S / 2;
    circle(g, cx, cy + 1, 11, '#b8860b', 0);
    circle(g, cx, cy, 11, vgrad(g, cx - 11, cy - 11, 22, 22, '#ffe98a', '#e8a92a'), 2.2, '#8a5f12');
    circle(g, cx, cy, 7.4, null, 1.6, 'rgba(138,95,18,0.55)');
    g.fillStyle = '#8a5f12';
    g.font = 'bold 13px "Trebuchet MS", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('$', cx, cy + 1);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath(); g.ellipse(cx - 4, cy - 5, 3, 1.6, -0.6, 0, Math.PI * 2); g.fill();
  });
}

function buildHeart() {
  return iconCanvas(28, (g, S) => {
    const cx = S / 2;
    g.beginPath();
    g.moveTo(cx, S - 5);
    g.bezierCurveTo(cx - 16, S / 2 - 2, cx - 8, 2, cx, 9);
    g.bezierCurveTo(cx + 8, 2, cx + 16, S / 2 - 2, cx, S - 5);
    g.closePath();
    g.fillStyle = vgrad(g, 0, 2, S, S, '#ff8a8a', '#d92b2b');
    g.fill();
    g.lineWidth = 2.2; g.strokeStyle = '#7d1414'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.ellipse(cx - 4.5, 9, 2.6, 1.6, -0.5, 0, Math.PI * 2); g.fill();
  });
}

function buildStar(filled) {
  return iconCanvas(30, (g, S) => {
    const cx = S / 2, cy = S / 2 + 1, R = 12, r = 5.2;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? r : R;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.fillStyle = filled ? vgrad(g, 0, 0, S, S, '#fff3b0', '#f0a92a') : 'rgba(255,255,255,0.12)';
    g.fill();
    g.lineWidth = 2; g.strokeStyle = filled ? '#8a5f12' : 'rgba(255,255,255,0.3)'; g.stroke();
  });
}

function buildGlyphIcon(kind) {
  return iconCanvas(28, (g, S) => {
    g.strokeStyle = '#eaf1ff'; g.fillStyle = '#eaf1ff';
    g.lineWidth = 2.6; g.lineCap = 'round';
    const cx = S / 2, cy = S / 2;
    switch (kind) {
      case 'play':
        poly(g, [9, 5, 23, 14, 9, 23], '#eaf1ff', 2.4);
        break;
      case 'pause':
        fillRR(g, 8, 6, 4.6, 16, 2, '#eaf1ff', 0);
        fillRR(g, 15.4, 6, 4.6, 16, 2, '#eaf1ff', 0);
        break;
      case 'ff':
        poly(g, [5, 6, 14, 14, 5, 22], '#eaf1ff', 2);
        poly(g, [14, 6, 23, 14, 14, 22], '#eaf1ff', 2);
        break;
      case 'gear':
        circle(g, cx, cy, 5, null, 2.6, '#eaf1ff');
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * 7.5, cy + Math.sin(a) * 7.5);
          g.lineTo(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11);
          g.stroke();
        }
        break;
      case 'home':
        poly(g, [4, 13, 14, 4, 24, 13], null, 2.6, '#eaf1ff');
        fillRR(g, 7, 13, 14, 11, 2, null, 2.6, '#eaf1ff');
        break;
      case 'restart':
        g.beginPath(); g.arc(cx, cy, 8, -0.6, Math.PI * 1.5); g.stroke();
        poly(g, [cx + 5, cy - 11, cx + 12, cy - 6, cx + 3, cy - 3], '#eaf1ff', 1.6);
        break;
      case 'sell':
        g.beginPath(); g.arc(cx, cy + 2, 7, 0, Math.PI * 2); g.stroke();
        g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('$', cx, cy + 3);
        poly(g, [cx - 4, cy - 9, cx, cy - 14, cx + 4, cy - 9], '#6ee36e', 1.6);
        break;
      case 'up':
        poly(g, [5, 17, 14, 7, 23, 17], null, 3, '#6ee36e');
        g.beginPath(); g.moveTo(6, 22); g.lineTo(22, 22); g.stroke();
        break;
      case 'target':
        circle(g, cx, cy, 8, null, 2.2, '#eaf1ff');
        g.beginPath();
        g.moveTo(cx - 12, cy); g.lineTo(cx - 4, cy);
        g.moveTo(cx + 4, cy); g.lineTo(cx + 12, cy);
        g.moveTo(cx, cy - 12); g.lineTo(cx, cy - 4);
        g.moveTo(cx, cy + 4); g.lineTo(cx, cy + 12);
        g.stroke();
        circle(g, cx, cy, 1.8, '#ff5a5a', 0);
        break;
      case 'lock':
        fillRR(g, 6, 12, 16, 12, 3, '#eaf1ff', 0);
        g.beginPath(); g.arc(cx, 12, 5.5, Math.PI, 0); g.lineWidth = 2.6; g.stroke();
        circle(g, cx, 18, 1.8, '#1b2440', 0);
        break;
      case 'sound':
        poly(g, [5, 11, 10, 11, 16, 5, 16, 23, 10, 17, 5, 17], '#eaf1ff', 2);
        g.beginPath(); g.arc(17, 14, 5, -0.9, 0.9); g.stroke();
        g.beginPath(); g.arc(17, 14, 9, -0.8, 0.8); g.stroke();
        break;
      case 'mute':
        poly(g, [5, 11, 10, 11, 16, 5, 16, 23, 10, 17, 5, 17], '#eaf1ff', 2);
        g.beginPath(); g.moveTo(19, 9); g.lineTo(26, 19); g.moveTo(26, 9); g.lineTo(19, 19); g.stroke();
        break;
      case 'close':
        g.beginPath(); g.moveTo(7, 7); g.lineTo(21, 21); g.moveTo(21, 7); g.lineTo(7, 21); g.stroke();
        break;
      case 'wave':
        g.beginPath();
        g.moveTo(3, 18);
        g.bezierCurveTo(8, 6, 12, 26, 17, 13);
        g.bezierCurveTo(20, 6, 23, 18, 25, 15);
        g.stroke();
        break;
      case 'skull':
        circle(g, cx, cy - 1, 8, '#eaf1ff', 2);
        fillRR(g, cx - 5, cy + 4, 10, 6, 2, '#eaf1ff', 2);
        circle(g, cx - 3, cy - 2, 2.2, '#1b2440', 0);
        circle(g, cx + 3, cy - 2, 2.2, '#1b2440', 0);
        break;
    }
  });
}

/* ========================= РЕГИСТР СТРОИТЕЛЕЙ ========================== */

function reg(key, fn) { builders.set(key, fn); }

// Тайлы по биомам
for (const biome of ['grass', 'desert', 'lava', 'city']) {
  for (let v = 0; v < 4; v++) {
    reg(`tile.${biome}.${v}`, () => buildTile(biome, v));
  }
}
reg('tile.lavaPool', () => buildLavaPool());

// Декор
reg('decor.tree', buildTree);
reg('decor.pine', buildPine);
reg('decor.bush', buildBush);
reg('decor.rock', buildRock);
reg('decor.flower', buildFlower);
reg('decor.cactus', buildCactus);
reg('decor.barrel', buildBarrel);
reg('decor.building.0', () => buildBuilding(3));
reg('decor.building.1', () => buildBuilding(71));
reg('decor.building.2', () => buildBuilding(211));

/* ==========================================================================
   Турели второй очереди: Пиро, Лазер, Улей, Ядерная.
   Все рисуются кодом, «вправо» = угол 0 (как у остальных башен).
   ========================================================================== */

/** Пиро: бак со смесью + широкое сопло конусом + дежурный огонёк */
function buildFlameTurret(level) {
  const S = 54;
  const c = makeCanvas(S, S), g = ctxOf(c);
  const cy = S / 2 + 1;
  const trim = level === 2 ? '#ffd23f' : (level === 1 ? '#c3ccd8' : '#8b95a5');

  // бак(и) со смесью
  fillRR(g, 8, cy - 12, 18, 25, 6, vgrad(g, 8, cy - 12, 18, 25, '#d8643a', '#8e3620'), 2.2);
  g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 1.8;
  for (let i = 0; i < 3; i++) {
    g.beginPath(); g.moveTo(9, cy - 7 + i * 7); g.lineTo(25, cy - 7 + i * 7); g.stroke();
  }
  if (level >= 1) {
    // второй бак на уровнях 2–3
    fillRR(g, 12, cy - 19, 12, 9, 4, vgrad(g, 12, cy - 19, 12, 9, '#e07a4a', '#93401f'), 2);
  }
  // манометр
  circle(g, 15, cy - 3, 3.2, '#2b2f3a', 1.4, trim);
  g.strokeStyle = '#c6ff4f'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(15, cy - 3); g.lineTo(17, cy - 5); g.stroke();

  // сопло: расширяющийся конус
  const nw = 7 + level * 1.6;
  poly(g, [26, cy - 4, 44, cy - nw, 46, cy - nw + 1.5, 46, cy + nw - 1.5, 44, cy + nw, 26, cy + 4],
    vgrad(g, 26, cy - nw, 20, nw * 2, '#6f7683', '#3b414d'), 2.2);
  // раструб
  fillRR(g, 43, cy - nw - 0.5, 5, nw * 2 + 1, 2, trim, 1.8);
  // дежурный огонёк у среза
  const fl = g.createRadialGradient(49, cy, 0.5, 49, cy, 6 + level);
  fl.addColorStop(0, 'rgba(255,255,220,0.95)');
  fl.addColorStop(0.45, 'rgba(255,155,61,0.75)');
  fl.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = fl;
  g.beginPath(); g.arc(49, cy, 6 + level, 0, Math.PI * 2); g.fill();
  // шланг
  g.strokeStyle = '#5a3a2a'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(17, cy + 13); g.quadraticCurveTo(24, cy + 21, 31, cy + 9); g.stroke();
  return c;
}

/** Лазер: корпус с двумя излучателями, фокусирующий кристалл, радиатор */
function buildLaserTurret(level) {
  const S = 54;
  const c = makeCanvas(S, S), g = ctxOf(c);
  const cy = S / 2 + 1;
  const trim = level === 2 ? '#ffd23f' : (level === 1 ? '#dfe7f2' : '#9aa3b5');

  // радиатор сзади
  g.strokeStyle = '#4a5162'; g.lineWidth = 2;
  for (let i = 0; i < 3 + level; i++) {
    const x = 9 + i * 3.2;
    g.beginPath(); g.moveTo(x, cy - 11); g.lineTo(x, cy + 11); g.stroke();
  }
  // корпус
  fillRR(g, 14, cy - 8, 24, 16, 5, vgrad(g, 14, cy - 8, 24, 16, '#8a6fc0', '#4d3a75'), 2.2);
  // два излучателя (рельсы)
  fillRR(g, 30, cy - 9.5, 16, 5, 2.2, vgrad(g, 30, cy - 9.5, 16, 5, '#cfd6e4', '#6c7486'), 1.8);
  fillRR(g, 30, cy + 4.5, 16, 5, 2.2, vgrad(g, 30, cy + 4.5, 16, 5, '#cfd6e4', '#6c7486'), 1.8);
  // кристалл в фокусе
  const cx0 = 45, cr = 4.2 + level * 0.9;
  const lg = g.createRadialGradient(cx0, cy, 0.5, cx0, cy, cr * 2.6);
  lg.addColorStop(0, '#ffffff');
  lg.addColorStop(0.35, '#ff5ad1');
  lg.addColorStop(1, 'rgba(255,90,209,0)');
  g.fillStyle = lg;
  g.beginPath(); g.arc(cx0, cy, cr * 2.6, 0, Math.PI * 2); g.fill();
  poly(g, [cx0, cy - cr, cx0 + cr * 0.85, cy, cx0, cy + cr, cx0 - cr * 0.85, cy],
    '#ffd9f4', 1.6, trim);
  // энерго-шляпка сверху
  circle(g, 20, cy - 10, 2.6, '#ff5ad1', 1.4, trim);
  return c;
}

/** Улей: блок сот + леток + пара пчёл на подлёте */
function buildHiveTurret(level) {
  const S = 54;
  const c = makeCanvas(S, S), g = ctxOf(c);
  const cy = S / 2 + 2;
  const trim = level === 2 ? '#ffd23f' : (level === 1 ? '#c9a227' : '#8b7a3a');

  // корпус улья
  fillRR(g, 10, cy - 15, 26, 30, 6, vgrad(g, 10, cy - 15, 26, 30, '#e0b84a', '#8a6a1c'), 2.4);
  // соты (шестиугольники)
  const hex = (hx, hy, r) => {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      const px = hx + Math.cos(a) * r, py = hy + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
  };
  const rows = 2 + level;
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < 2; rx++) {
      const hx = 17 + rx * 12, hy = cy - 9 + ry * (18 / rows) + (rx % 2 ? 3 : 0);
      hex(hx, hy, 4.6);
      g.fillStyle = 'rgba(60,40,10,0.55)'; g.fill();
      g.strokeStyle = 'rgba(255,235,160,0.5)'; g.lineWidth = 1; g.stroke();
    }
  }
  // леток (щель) спереди
  fillRR(g, 34, cy - 3, 8, 6, 2.5, '#3a2c0c', 1.8);
  // посадочная полка
  fillRR(g, 32, cy + 4, 12, 3.4, 1.6, trim, 1.4);
  // пчёлы на подлёте
  const bee = (bx, by, sc) => {
    g.save(); g.translate(bx, by); g.scale(sc, sc);
    g.fillStyle = '#ffe66d';
    g.beginPath(); g.ellipse(0, 0, 3.4, 2.4, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a2c0c'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(-0.6, -2.2); g.lineTo(-0.6, 2.2); g.moveTo(1.6, -2); g.lineTo(1.6, 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath(); g.ellipse(-0.6, -3, 2.6, 1.3, -0.4, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  bee(44, cy - 8, 1 + level * 0.1);
  if (level >= 1) bee(47, cy + 6, 0.9);
  if (level >= 2) bee(41, cy + 12, 0.8);
  return c;
}

/** Ядерная: короткая мортира с толстым стволом, зелёный заряд, опознавательные полосы */
function buildNukeTurret(level) {
  const S = 56;
  const c = makeCanvas(S, S), g = ctxOf(c);
  const cy = S / 2 + 3;
  const trim = level === 2 ? '#ffd23f' : (level === 1 ? '#b9c4d6' : '#7d8798');

  // станина
  fillRR(g, 8, cy - 6, 22, 18, 4, vgrad(g, 8, cy - 6, 22, 18, '#6b7480', '#39414c'), 2.4);
  // опознавательные полосы (опасный груз)
  g.save();
  rr(g, 9, cy + 5, 20, 6, 2); g.clip();
  g.strokeStyle = '#c6ff4f'; g.lineWidth = 2.4;
  for (let i = -1; i < 6; i++) {
    g.beginPath(); g.moveTo(9 + i * 5, cy + 12); g.lineTo(9 + i * 5 + 6, cy + 3); g.stroke();
  }
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.6;
  rr(g, 9, cy + 5, 20, 6, 2); g.stroke();

  // толстый ствол мортиры (задран вверх-вперёд)
  const bw = 8 + level * 1.3;
  g.save();
  g.translate(24, cy - 4);
  g.rotate(-0.34);
  fillRR(g, 0, -bw / 2, 24, bw, 3, vgrad(g, 0, -bw / 2, 24, bw, '#7e8898', '#414a58'), 2.2);
  // дульный срез
  fillRR(g, 21, -bw / 2 - 1, 5, bw + 2, 2, trim, 1.8);
  // бандажи
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2;
  for (let i = 0; i < 2 + level; i++) {
    const x = 5 + i * 6;
    g.beginPath(); g.moveTo(x, -bw / 2 + 1); g.lineTo(x, bw / 2 - 1); g.stroke();
  }
  g.restore();

  // заряд в стволе: зелёное свечение
  const gx = 47, gy = cy - 12;
  const lg = g.createRadialGradient(gx, gy, 0.5, gx, gy, 8 + level * 1.5);
  lg.addColorStop(0, '#ffffff');
  lg.addColorStop(0.4, '#c6ff4f');
  lg.addColorStop(1, 'rgba(140,214,47,0)');
  g.fillStyle = lg;
  g.beginPath(); g.arc(gx, gy, 8 + level * 1.5, 0, Math.PI * 2); g.fill();
  circle(g, gx, gy, 3.4, '#e9ffb0', 1.6, '#6f9a24');
  // гидроцилиндр подъёма
  g.strokeStyle = '#2f3540'; g.lineWidth = 3.4;
  g.beginPath(); g.moveTo(14, cy + 4); g.lineTo(24, cy - 8); g.stroke();
  g.strokeStyle = trim; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(14, cy + 4); g.lineTo(24, cy - 8); g.stroke();
  return c;
}

/** Мина ядерного заряда: тёмный корпус, зелёная головка, хвостовые перья */
function buildShell() {
  const c = makeCanvas(20, 10), g = ctxOf(c);
  // перья
  poly(g, [1, 5, 5, 1.5, 6.5, 5, 5, 8.5], '#6f9a24', 1.2);
  // корпус
  fillRR(g, 5, 2.6, 9, 4.8, 2.2, vgrad(g, 5, 2.6, 9, 4.8, '#8b929e', '#3d434e'), 1.4);
  // головка
  const lg = g.createRadialGradient(16, 5, 0.4, 16, 5, 4.4);
  lg.addColorStop(0, '#ffffff');
  lg.addColorStop(0.4, '#c6ff4f');
  lg.addColorStop(1, 'rgba(140,214,47,0)');
  g.fillStyle = lg;
  g.beginPath(); g.arc(16, 5, 4.4, 0, Math.PI * 2); g.fill();
  circle(g, 15.6, 5, 2.2, '#e9ffb0', 1.2, '#6f9a24');
  return c;
}

// Башни
for (let lvl = 0; lvl < 3; lvl++) {
  reg(`tower.base.${lvl}`, () => buildTowerBase(lvl));
  reg(`tower.gatling.${lvl}`, () => buildGatlingTurret(lvl));
  reg(`tower.glue.${lvl}`, () => buildGlueTurret(lvl));
  reg(`tower.missile.${lvl}`, () => buildMissileTurret(lvl));
  reg(`tower.tesla.${lvl}`, () => buildTeslaTurret(lvl));
  reg(`tower.flame.${lvl}`, () => buildFlameTurret(lvl));
  reg(`tower.laser.${lvl}`, () => buildLaserTurret(lvl));
  reg(`tower.hive.${lvl}`, () => buildHiveTurret(lvl));
  reg(`tower.nuke.${lvl}`, () => buildNukeTurret(lvl));
}

// Враги
reg('enemy.soldier', () => buildHumanoidFrames('#4f8f3a', { helm: '#3c6b2c' }));
reg('enemy.runner', () => buildHumanoidFrames('#d84a3a', { helm: '#a13026', speedLines: true, noGun: true, frames: 6 }));
reg('enemy.biker', buildBikerFrames);
reg('enemy.copter', () => [buildCopterSprite()]);
reg('enemy.tank', buildTankFrames);
reg('enemy.transport', buildTransportFrames);
reg('enemy.boss', buildBossFrames);

// Снаряды
reg('proj.bullet', buildBullet);
reg('proj.missile', buildMissile);
reg('proj.glue', buildGlueBlob);
reg('proj.bee', buildBee);
reg('proj.shell', buildShell);

// Иконки
reg('icon.coin', buildCoin);
reg('icon.heart', buildHeart);
reg('icon.star', () => buildStar(true));
reg('icon.starEmpty', () => buildStar(false));
for (const k of ['play', 'pause', 'ff', 'gear', 'home', 'restart', 'sell', 'up',
  'target', 'lock', 'sound', 'mute', 'close', 'wave', 'skull']) {
  reg(`icon.${k}`, () => buildGlyphIcon(k));
}

/* ============================== ПУБЛИЧНОЕ API =========================== */

export const Sprites = {
  /** Одиночный спрайт (ленивая генерация + кэш) */
  get(key) {
    if (!hasDom) return null;
    let v = cache.get(key);
    if (v === undefined) {
      const b = builders.get(key);
      v = b ? b() : null;
      cache.set(key, v);
    }
    return v;
  },

  /** Массив кадров анимации */
  getFrames(key) {
    const v = Sprites.get(key);
    return Array.isArray(v) ? v : (v ? [v] : []);
  },

  /** Есть ли билдер (для проверки опечаток в ключах) */
  has(key) { return builders.has(key); },

  /**
   * Белый силуэт кадра — используется для вспышки при попадании.
   * Генерируется один раз и кэшируется (композит 'source-in').
   */
  getSilhouette(key, frame, color = '#ffffff') {
    if (!hasDom) return null;
    const frames = Sprites.getFrames(key);
    if (!frames.length) return null;
    const idx = ((frame | 0) % frames.length + frames.length) % frames.length;
    const ck = `sil:${key}:${idx}:${color}`;
    let v = cache.get(ck);
    if (v !== undefined) return v;
    const src = frames[idx];
    const c = makeCanvas(src.width, src.height);
    const g = ctxOf(c);
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    cache.set(ck, c);
    return c;
  },

  /**
   * Нарисовать спрайт с поворотом/отражением.
   * align: 'center' | 'bottom' (якорь по нижней точке — для юнитов/декора)
   */
  draw(g, key, x, y, opts) {
    const img = Sprites.get(key);
    if (!img) return;
    const o = opts || {};
    const rot = o.rot || 0;
    const s = o.scale || 1;
    const flip = o.flip ? -1 : 1;
    const w = img.width * s, h = img.height * s;
    g.save();
    g.translate(x, y);
    if (o.alpha !== undefined) g.globalAlpha = o.alpha;
    if (rot) g.rotate(rot);
    if (flip !== 1) g.scale(flip, 1);
    const oy = o.align === 'bottom' ? -h : -h / 2;
    g.drawImage(img, -w / 2, oy, w, h);
    g.restore();
  },

  /** Нарисовать кадр анимации */
  drawFrame(g, key, frame, x, y, opts) {
    const frames = Sprites.getFrames(key);
    if (!frames.length) return;
    const img = frames[((frame | 0) % frames.length + frames.length) % frames.length];
    const o = opts || {};
    const s = o.scale || 1;
    const w = img.width * s, h = img.height * s;
    g.save();
    g.translate(x, y);
    if (o.alpha !== undefined) g.globalAlpha = o.alpha;
    if (o.rot) g.rotate(o.rot);
    if (o.flip) g.scale(-1, 1);
    g.drawImage(img, -w / 2, o.align === 'bottom' ? -h : -h / 2, w, h);
    g.restore();
  },

  /** Очистка кэша (например, при смене DPR-стратегии) */
  clear() { cache.clear(); }
};

export { shade, rr, fillRR, circle, poly, vgrad, makeCanvas, ctxOf };
export default Sprites;
