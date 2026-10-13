/* ==========================================================================
   Draw.js — примитивы интерфейса (панели, кнопки, текст, полоски).
   Всё рисуется процедурно: никаких картинок и шрифтов извне.
   Кнопки возвращают/принимают объект-описание, чтобы один и тот же объект
   использовался и для отрисовки, и для проверки попадания тапа.
   ========================================================================== */

import { CONFIG } from './Constants.js';
import { clamp } from './MathUtil.js';
import { Sprites, rr } from './SpriteSheet.js';

const UI = CONFIG.UI;
const FONT = '"Trebuchet MS", "Segoe UI", sans-serif';

export function roundRect(g, x, y, w, h, r) { rr(g, x, y, w, h, r); }

export function panel(g, x, y, w, h, r = 14, opts = {}) {
  g.save();
  // тень
  if (opts.shadow !== false) {
    g.shadowColor = 'rgba(0,0,0,0.45)';
    g.shadowBlur = opts.blur ?? 16;
    g.shadowOffsetY = opts.offsetY ?? 4;
  }
  rr(g, x, y, w, h, r);
  g.fillStyle = opts.fill || UI.panel;
  g.fill();
  g.shadowColor = 'transparent';
  g.shadowBlur = 0;
  g.shadowOffsetY = 0;
  if (opts.stroke !== false) {
    g.lineWidth = opts.lineWidth ?? 2.5;
    g.strokeStyle = opts.strokeColor || UI.panelStroke;
    g.stroke();
    // внутренний блик сверху — панель выглядит «толстой» игровой плашкой
    g.save();
    rr(g, x + 3, y + 3, w - 6, h - 6, Math.max(2, r - 3));
    g.clip();
    const hg = g.createLinearGradient(0, y, 0, y + h * 0.45);
    hg.addColorStop(0, 'rgba(255,255,255,0.13)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hg;
    g.fillRect(x, y, w, h * 0.45);
    g.restore();
  }
  g.restore();
}

/**
 * Кнопка. b = { x, y, w, h, label, icon, sub, enabled, pressed, accent, r }
 * Возвращает b (тот же объект используется для hit-test).
 */
export function button(g, b, opts = {}) {
  const disabled = b.enabled === false;
  const r = b.r ?? 12;
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.4)';
  g.shadowBlur = 10;
  g.shadowOffsetY = 3;
  rr(g, b.x, b.y + (b.pressed ? 2 : 0), b.w, b.h, r);
  const base = disabled ? UI.buttonDisabled
    : (b.accent ? '#3f6bb5' : (b.pressed ? UI.buttonHi : UI.button));
  g.fillStyle = typeof base === 'string' ? base : UI.button;
  g.fill();
  g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;

  // верхний блик
  const lg = g.createLinearGradient(0, b.y, 0, b.y + b.h);
  lg.addColorStop(0, 'rgba(255,255,255,0.18)');
  lg.addColorStop(0.5, 'rgba(255,255,255,0.02)');
  lg.addColorStop(1, 'rgba(0,0,0,0.16)');
  rr(g, b.x, b.y + (b.pressed ? 2 : 0), b.w, b.h, r);
  g.fillStyle = lg;
  g.fill();

  g.lineWidth = 2;
  g.strokeStyle = disabled ? 'rgba(255,255,255,0.08)'
    : (b.accent ? 'rgba(255,210,63,0.85)' : UI.panelStroke);
  rr(g, b.x, b.y + (b.pressed ? 2 : 0), b.w, b.h, r);
  g.stroke();

  const cy = b.y + b.h / 2 + (b.pressed ? 2 : 0);
  let tx = b.x + b.w / 2;

  if (b.icon) {
    const isz = Math.min(b.h * 0.52, 26);
    const ix = b.label ? b.x + 12 + isz / 2 : b.x + b.w / 2;
    g.globalAlpha = disabled ? 0.35 : 1;
    Sprites.draw(g, b.icon, ix, cy, { scale: isz / 28 });
    if (b.label) tx = b.x + 12 + isz + 8 + (b.w - 24 - isz - 8) / 2;
    g.globalAlpha = 1;
  }

  if (b.label) {
    g.font = `${b.bold === false ? '700' : '900'} ${(b.size || Math.min(18, b.h * 0.4)).toFixed(0)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.globalAlpha = disabled ? 0.4 : 1;
    g.fillStyle = b.color || (b.accent ? UI.accent : UI.text);
    g.fillText(b.label, tx, cy - (b.sub ? 7 : 0));
    if (b.sub) {
      g.font = `700 ${Math.max(9, (b.size || 15) * 0.62).toFixed(0)}px ${FONT}`;
      g.fillStyle = b.subColor || UI.dim;
      g.fillText(b.sub, tx, cy + 9);
    }
    g.globalAlpha = 1;
  }
  g.restore();
  return b;
}

/** Круглая иконочная кнопка (пауза, скорость) */
export function roundButton(g, b) {
  const cx = b.x + b.r2, cy = b.y + b.r2;
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.4)';
  g.shadowBlur = 8;
  g.shadowOffsetY = 2;
  g.beginPath();
  g.arc(cx, cy, b.r2, 0, Math.PI * 2);
  g.fillStyle = b.enabled === false ? UI.buttonDisabled : (b.pressed ? UI.buttonHi : UI.button);
  g.fill();
  g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
  g.lineWidth = 2;
  g.strokeStyle = b.ring || UI.panelStroke;
  g.stroke();
  const img = b.icon ? Sprites.get(b.icon) : null;
  if (img) {
    const s = (b.r2 * 1.15) / img.width;
    g.globalAlpha = b.enabled === false ? 0.4 : 1;
    g.drawImage(img, cx - img.width * s / 2, cy - img.height * s / 2, img.width * s, img.height * s);
    g.globalAlpha = 1;
  } else if (b.label) {
    g.font = `900 ${(b.r2 * 0.85).toFixed(0)}px ${FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = b.color || UI.text;
    g.fillText(b.label, cx, cy + 1);
  }
  g.restore();
  return b;
}

export function text(g, str, x, y, o = {}) {
  g.save();
  g.font = `${o.weight || 900} ${(o.size || 16)}px ${FONT}`;
  g.textAlign = o.align || 'left';
  g.textBaseline = o.baseline || 'middle';
  if (o.stroke !== false) {
    g.lineWidth = o.strokeWidth || Math.max(2, (o.size || 16) * 0.16);
    g.strokeStyle = o.strokeColor || 'rgba(0,0,0,0.6)';
    g.lineJoin = 'round';
    g.strokeText(str, x, y);
  }
  g.fillStyle = o.color || UI.text;
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  g.fillText(str, x, y);
  g.restore();
}

export function measure(g, str, size, weight = 900) {
  g.font = `${weight} ${size}px ${FONT}`;
  return g.measureText(str).width;
}

/** Полоска прогресса с рамкой */
export function bar(g, x, y, w, h, value, o = {}) {
  const v = clamp(value, 0, 1);
  g.save();
  rr(g, x, y, w, h, h / 2);
  g.fillStyle = o.bg || 'rgba(0,0,0,0.5)';
  g.fill();
  if (v > 0) {
    rr(g, x + 1.5, y + 1.5, Math.max(h - 3, (w - 3) * v), h - 3, (h - 3) / 2);
    g.fillStyle = o.fill || UI.accent2;
    g.fill();
    if (o.gloss !== false) {
      rr(g, x + 1.5, y + 1.5, Math.max(h - 3, (w - 3) * v), (h - 3) * 0.45, (h - 3) / 2);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fill();
    }
  }
  if (o.border !== false) {
    rr(g, x, y, w, h, h / 2);
    g.lineWidth = 1.5;
    g.strokeStyle = o.border || 'rgba(255,255,255,0.22)';
    g.stroke();
  }
  g.restore();
}

/** Звёздочка рейтинга */
export function star(g, x, y, r, filled, alpha = 1) {
  const img = Sprites.get(filled ? 'icon.star' : 'icon.starEmpty');
  if (!img) return;
  g.save();
  g.globalAlpha = alpha;
  g.drawImage(img, x - r, y - r, r * 2, r * 2);
  g.restore();
}

/** Логотип игры: градиентный текст с тенью и обводкой */
export function logo(g, cx, cy, size, title = 'FIELD', subtitle = 'DEFENSE') {
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  const drawWord = (word, y, s, colors) => {
    g.font = `900 ${s}px ${FONT}`;
    const w = g.measureText(word).width;
    // тень-подложка
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillText(word, cx + 3, y + 5);
    const lg = g.createLinearGradient(cx - w / 2, y - s / 2, cx + w / 2, y + s / 2);
    lg.addColorStop(0, colors[0]);
    lg.addColorStop(0.5, colors[1]);
    lg.addColorStop(1, colors[2]);
    g.lineWidth = Math.max(3, s * 0.09);
    g.strokeStyle = 'rgba(16,22,40,0.95)';
    g.lineJoin = 'round';
    g.strokeText(word, cx, y);
    g.fillStyle = lg;
    g.fillText(word, cx, y);
    // блик
    g.save();
    g.beginPath();
    g.rect(cx - w / 2, y - s / 2, w, s * 0.42);
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillText(word, cx, y);
    g.restore();
  };

  drawWord(title, cy - size * 0.42, size, ['#fff6c9', '#ffd23f', '#f08a1f']);
  drawWord(subtitle, cy + size * 0.42, size * 0.72, ['#d9f4ff', '#4fd1ff', '#2b7fd4']);
  g.restore();
}

export function hit(b, x, y, pad = 0) {
  if (!b) return false;
  if (b.r2 !== undefined) {
    const cx = b.x + b.r2, cy = b.y + b.r2;
    return (x - cx) ** 2 + (y - cy) ** 2 <= (b.r2 + pad) ** 2;
  }
  return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
}

export function icon(g, key, x, y, size = 24, alpha = 1) {
  const img = Sprites.get(key);
  if (!img) return;
  g.save();
  g.globalAlpha = alpha;
  g.drawImage(img, x - size / 2, y - size / 2, size, size);
  g.restore();
}

export const Draw = {
  roundRect, panel, button, roundButton, text, measure, bar, star, logo, hit, icon, FONT
};

export default Draw;
