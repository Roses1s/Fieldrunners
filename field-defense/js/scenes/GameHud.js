/* ==========================================================================
   GameHud.js — внутриигровой интерфейс (рисуется в экранных координатах).

   Состав:
     • слева сверху   — деньги и жизни
     • сверху центр   — номер волны, полоса прогресса, таймер перерыва
     • справа сверху  — пауза и скорость x1/x2/x3
     • снизу центр    — «Следующая волна» (пульсирует в перерыве, бонус $)
     • радиальное меню постройки вокруг тапнутой клетки
     • панель выбранной башни: Улучшить / Продать / Режим цели
     • всплывающие подсказки (toast)

   Все тач-цели ≥ 44×44 px.
   ========================================================================== */

import { CONFIG, TARGET_MODE } from '../utils/Constants.js';
import { Draw } from '../utils/Draw.js';
import { Sprites } from '../utils/SpriteSheet.js';
import { clamp, fmtNum, fmtTime } from '../utils/MathUtil.js';
import { WAVE_STATE } from '../systems/WaveSystem.js';

const FONT_HUD = '"Trebuchet MS", "Segoe UI", sans-serif';
const TOUCH = 46;   // минимальный размер тач-цели

export class GameHud {
  constructor(scene) {
    this.scene = scene;
    this.game = scene.game;
    this.buttons = {};
    this.radial = null;      // { cx, cy, r, items:[{def, x, y, r, enabled, reason}] }
    this.panel = null;       // панель выбранной башни
    this.toastText = '';
    this.toastColor = '#fff';
    this.toastT = 0;
    this.pressedKey = null;
    this.nextWavePulse = 0;
    this.layout(this.game.viewW, this.game.viewH);
  }

  /* ------------------------------- раскладка --------------------------- */

  layout(w, h) {
    const s = this.game.safe;
    const pad = 8;
    const b = this.buttons;

    // деньги / жизни (слева сверху)
    b.money = { x: s.left + pad, y: s.top + pad, w: 116, h: 34 };
    b.lives = { x: s.left + pad, y: s.top + pad + 40, w: 96, h: 32 };

    // волна (сверху по центру)
    const waveW = Math.min(260, w * 0.42);
    b.wave = { x: w / 2 - waveW / 2, y: s.top + pad, w: waveW, h: 46 };

    // пауза и скорость (справа сверху)
    const rr = 21;
    b.speed = { x: w - s.right - pad - rr * 2, y: s.top + pad, r2: rr, icon: 'icon.ff', label: 'x1' };
    b.pause = { x: w - s.right - pad - rr * 2 - rr * 2 - 10, y: s.top + pad, r2: rr, icon: 'icon.pause' };

    // «следующая волна» (снизу по центру)
    const nwW = Math.min(250, w * 0.44);
    const nwH = 50;
    b.nextWave = {
      x: w / 2 - nwW / 2, y: h - s.bottom - pad - nwH, w: nwW, h: nwH,
      label: 'СЛЕДУЮЩАЯ ВОЛНА', accent: true
    };

    // панель башни (снизу; когда она открыта — кнопка волны уезжает выше)
    const pW = Math.min(360, w - 24);
    const pH = 100;
    b.towerPanel = { x: w / 2 - pW / 2, y: h - s.bottom - pad - pH, w: pW, h: pH };

    this.nextWaveHomeY = b.nextWave.y;
    this.viewW = w;
    this.viewH = h;
  }

  toast(text, color = '#ffd9d9') {
    this.toastText = text;
    this.toastColor = color;
    this.toastT = 2.2;
  }

  /* ----------------------------- радиальное меню ------------------------ */

  /**
   * Открыть меню выбора башни вокруг клетки.
   * @param {number} cx, cy — клетка сетки
   * @param {number} sx, sy — её экранные координаты
   */
  openRadial(cx, cy, sx, sy) {
    const scene = this.scene;
    const defs = scene.availableTowers();
    const n = defs.length;
    if (!n) return;

    const r = clamp(Math.min(this.viewW, this.viewH) * 0.19, 62, 92);
    const iconR = TOUCH / 2;

    // центр меню не должен вылезать за экран
    const mx = clamp(sx, r + iconR + 6, this.viewW - r - iconR - 6);
    const my = clamp(sy, r + iconR + 6 + this.game.safe.top, this.viewH - r - iconR - 6 - this.game.safe.bottom);

    const items = [];
    const start = -Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? start : start + (i / n) * Math.PI * 2;
      const def = defs[i];
      const affordable = scene.economy.money >= def.cost;
      const unlocked = scene.isTowerAvailable(def.id);
      items.push({
        def,
        x: mx + Math.cos(a) * r,
        y: my + Math.sin(a) * r,
        r: iconR,
        angle: a,
        enabled: affordable && unlocked,
        reason: !unlocked ? 'Закрыто' : (!affordable ? 'Нет денег' : '')
      });
    }

    this.radial = { cx, cy, mx, my, r, items, open: 0, closing: false };
    scene.buildMode = true;
    this.game.audio?.play('ui');
  }

  closeRadial() {
    if (!this.radial) return;
    this.radial = null;
    this.scene.buildMode = false;
  }

  /** @returns {object|null} пункт меню под точкой (x, y) */
  radialHit(x, y) {
    if (!this.radial) return null;
    for (const it of this.radial.items) {
      const d = Math.hypot(x - it.x, y - it.y);
      if (d <= it.r + 8) return it;
    }
    return null;
  }

  /* ------------------------------- обработка --------------------------- */

  /**
   * @param {number} count — номер повторного тапа (2 = дабл-тап)
   * @returns {boolean} true, если HUD перехватил тап
   */
  onTap(x, y, count = 1) {
    const b = this.buttons;
    const s = this.scene;

    // радиальное меню — приоритет
    if (this.radial) {
      const it = this.radialHit(x, y);
      if (it) {
        if (!it.enabled) {
          this.toast(it.reason || 'Недоступно');
          this.game.audio?.play('deny');
        } else {
          s.buildTower(this.radial.cx, this.radial.cy, it.def.id);
          this.closeRadial();
        }
        return true;
      }
      // дабл-тап мимо иконок отдаём сцене — это быстрая стройка
      if (count >= 2) {
        this.closeRadial();
        return false;
      }
      this.closeRadial();
      return true;
    }

    // панель башни
    if (this.panel && s.selectedTower) {
      const p = this.panel;
      if (hitRect(p.upgrade, x, y)) { s.doUpgrade(); return true; }
      if (hitRect(p.sell, x, y)) { s.doSell(); return true; }
      if (hitRect(p.target, x, y)) { s.doCycleTarget(); return true; }
      if (hitRect(p.close, x, y)) { s.selectTower(null); return true; }
      if (hitRect(p.box, x, y)) return true;   // тап по панели не проходит в мир
    }

    if (hitRound(b.pause, x, y)) { s.openPause(); return true; }
    if (hitRound(b.speed, x, y)) { s.cycleSpeed(); return true; }
    if (hitRect(b.nextWave, x, y)) { s.sendNextWave(); return true; }
    if (hitRect(b.lives, x, y) || hitRect(b.money, x, y)) return true;

    return false;
  }

  onDown(x, y) {
    const b = this.buttons;
    this.pressedKey =
      hitRound(b.pause, x, y) ? 'pause'
        : hitRound(b.speed, x, y) ? 'speed'
          : hitRect(b.nextWave, x, y) ? 'nextWave'
            : this.panel && hitRect(this.panel.upgrade, x, y) ? 'upgrade'
              : this.panel && hitRect(this.panel.sell, x, y) ? 'sell'
                : this.panel && hitRect(this.panel.target, x, y) ? 'target'
                  : null;
  }

  onUp() { this.pressedKey = null; }

  update(dt) {
    if (this.toastT > 0) this.toastT = Math.max(0, this.toastT - dt);
    this.nextWavePulse += dt;
    if (this.radial) this.radial.open = clamp(this.radial.open + dt * 7, 0, 1);

    // панель башни пересобирается каждый кадр (дёшево: только прямоугольники)
    const s = this.scene;
    if (s.selectedTower) {
      this._layoutTowerPanel(s.selectedTower);
      // кнопка «следующая волна» уезжает над панелью, чтобы не перекрываться
      const tp = this.buttons.towerPanel;
      this.buttons.nextWave.y = Math.max(
        this.game.safe.top + 56,
        Math.min(this.nextWaveHomeY, tp.y - 8 - this.buttons.nextWave.h)
      );
    } else {
      this.panel = null;
      this.buttons.nextWave.y = this.nextWaveHomeY;
    }
  }

  _layoutTowerPanel(tower) {
    const b = this.buttons.towerPanel;
    const x = b.x, y = b.y, w = b.w, h = b.h;
    const upCost = tower.level < 3 ? tower.def.upCost[tower.level - 1] : 0;
    const sell = Math.floor(tower.invested * CONFIG.SELL_RATIO);
    const btnH = 46;
    const gap = 8;
    const bw = (w - 24 - gap * 2) / 3;

    this.panel = {
      box: { x, y, w, h },
      btnH,
      upgrade: {
        x: x + 12, y: y + h - btnH - 10, w: bw, h: btnH,
        label: tower.level < 3 ? 'УЛУЧШИТЬ' : 'МАКС',
        sub: tower.level < 3 ? `$${upCost}` : 'уровень 3',
        icon: 'icon.up',
        enabled: tower.level < 3 && this.scene.economy.money >= upCost,
        pressed: this.pressedKey === 'upgrade'
      },
      sell: {
        x: x + 12 + bw + gap, y: y + h - btnH - 10, w: bw, h: btnH,
        label: 'ПРОДАТЬ', sub: `+$${sell}`, icon: 'icon.sell',
        enabled: true, pressed: this.pressedKey === 'sell'
      },
      target: {
        x: x + 12 + (bw + gap) * 2, y: y + h - btnH - 10, w: bw, h: btnH,
        label: 'ЦЕЛЬ', sub: targetLabel(tower.targetMode), icon: 'icon.target',
        enabled: true, pressed: this.pressedKey === 'target'
      },
      close: { x: x + w - 34, y: y + 6, r2: 14, icon: 'icon.close' }
    };
  }

  /* ------------------------------- отрисовка --------------------------- */

  render(g) {
    const s = this.scene;
    const b = this.buttons;
    const eco = s.economy;
    const wave = s.waves.hudInfo();

    // ---- деньги ----
    const pulse = eco.pulse;
    const scale = 1 + pulse * 0.06 * (eco.pulseDir > 0 ? 1 : -1);
    g.save();
    g.translate(b.money.x + b.money.w / 2, b.money.y + b.money.h / 2);
    g.scale(scale, scale);
    g.translate(-(b.money.x + b.money.w / 2), -(b.money.y + b.money.h / 2));
    Draw.panel(g, b.money.x, b.money.y, b.money.w, b.money.h, 17, { shadow: true, blur: 10 });
    Draw.icon(g, 'icon.coin', b.money.x + 19, b.money.y + b.money.h / 2, 24);
    Draw.text(g, '$' + fmtNum(eco.money), b.money.x + 35, b.money.y + b.money.h / 2 + 1, {
      size: 19, color: pulse > 0.2 ? (eco.pulseDir > 0 ? '#ffe98a' : '#ffb0b0') : '#ffffff', align: 'left'
    });
    g.restore();

    // ---- жизни ----
    Draw.panel(g, b.lives.x, b.lives.y, b.lives.w, b.lives.h, 16, { blur: 10 });
    Draw.icon(g, 'icon.heart', b.lives.x + 17, b.lives.y + b.lives.h / 2, 22);
    const livesCol = eco.lives > eco.maxLives * 0.5 ? '#ffffff'
      : eco.lives > eco.maxLives * 0.25 ? '#ffd23f' : '#ff6b6b';
    Draw.text(g, `${eco.lives}/${eco.maxLives}`, b.lives.x + 31, b.lives.y + b.lives.h / 2 + 1, {
      size: 16, color: livesCol, align: 'left'
    });

    // ---- волна ----
    Draw.panel(g, b.wave.x, b.wave.y, b.wave.w, b.wave.h, 14, { blur: 10 });
    const waveLabel = s.endless
      ? `ВОЛНА ${wave.wave}`
      : `ВОЛНА ${wave.wave}/${wave.total}`;
    Draw.text(g, waveLabel, b.wave.x + b.wave.w / 2, b.wave.y + 15, { size: 15, align: 'center' });

    if (wave.state === WAVE_STATE.BREAK) {
      const t = wave.timer;
      Draw.text(g, `следующая через ${Math.ceil(t)} с`, b.wave.x + b.wave.w / 2, b.wave.y + 32, {
        size: 12, color: '#9fd0ff', align: 'center', weight: 700
      });
      Draw.bar(g, b.wave.x + 12, b.wave.y + b.wave.h - 8, b.wave.w - 24, 4,
        1 - t / Math.max(0.001, s.waves.breakTime), { fill: '#4fd1ff', border: false });
    } else if (wave.state === WAVE_STATE.DONE) {
      Draw.text(g, 'все волны отбиты', b.wave.x + b.wave.w / 2, b.wave.y + 32, {
        size: 12, color: '#6ee36e', align: 'center', weight: 700
      });
    } else {
      Draw.text(g, `врагов: ${wave.alive}${wave.nextBoss || wave.boss ? '  ⚠ БОСС' : ''}`,
        b.wave.x + b.wave.w / 2, b.wave.y + 32, {
          size: 12, color: wave.boss ? '#ff9b9b' : '#9fd0ff', align: 'center', weight: 700
        });
      Draw.bar(g, b.wave.x + 12, b.wave.y + b.wave.h - 8, b.wave.w - 24, 4,
        wave.progress ?? 0, { fill: '#ffd23f', border: false });
    }

    // ---- пауза / скорость ----
    b.speed.label = 'x' + (s.gameSpeed || 1);
    Draw.roundButton(g, Object.assign(b.pause, { pressed: this.pressedKey === 'pause' }));
    Draw.roundButton(g, Object.assign(b.speed, {
      pressed: this.pressedKey === 'speed',
      ring: s.gameSpeed > 1 ? 'rgba(255,210,63,0.9)' : CONFIG.UI.panelStroke,
      color: '#ffd23f'
    }));

    // ---- кнопка следующей волны ----
    const canSend = wave.state === WAVE_STATE.BREAK && s.waves.hasNext;
    const nw = b.nextWave;
    if (wave.state === WAVE_STATE.DONE) {
      nw.label = 'ПОБЕДА';
      nw.sub = '';
      nw.enabled = false;
    } else if (canSend) {
      const p = 0.5 + 0.5 * Math.sin(this.nextWavePulse * 4.2);
      nw.label = 'СЛЕДУЮЩАЯ ВОЛНА';
      nw.sub = wave.earlyBonus > 0 ? `бонус +$${wave.earlyBonus}` : 'готово';
      nw.enabled = true;
      nw.pressed = this.pressedKey === 'nextWave';
      // пульсирующее свечение
      g.save();
      g.globalAlpha = 0.25 + p * 0.35;
      g.shadowColor = '#ffd23f';
      g.shadowBlur = 18 + p * 14;
      Draw.roundRect(g, nw.x - 2, nw.y - 2, nw.w + 4, nw.h + 4, 14);
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 2.5;
      g.stroke();
      g.restore();
    } else {
      nw.label = 'ВОЛНА ИДЁТ';
      nw.sub = `осталось ${wave.alive}`;
      nw.enabled = false;
    }
    Draw.button(g, nw, { size: 16 });

    // ---- радиальное меню ----
    if (this.radial) this._renderRadial(g);

    // ---- панель башни ----
    if (this.panel && s.selectedTower) this._renderTowerPanel(g, s.selectedTower);

    // ---- тост ----
    if (this.toastT > 0) {
      const a = clamp(this.toastT / 0.4, 0, 1);
      g.save();
      g.globalAlpha = a;
      g.font = `900 15px ${FONT_HUD}`;
      const tw = g.measureText(this.toastText).width + 28;
      const tx = this.viewW / 2 - tw / 2;
      const ty = this.game.safe.top + 62;
      Draw.panel(g, tx, ty, tw, 32, 16, { fill: 'rgba(40,20,26,0.9)', strokeColor: 'rgba(255,120,120,0.5)' });
      Draw.text(g, this.toastText, this.viewW / 2, ty + 17, { size: 14, color: this.toastColor, align: 'center' });
      g.restore();
    }

    // ---- подсказка карты (первые секунды) ----
    if (s.time < 7 && !s.demo) {
      const a = clamp((7 - s.time) / 2, 0, 1) * clamp(s.time / 0.6, 0, 1);
      g.save();
      g.globalAlpha = a;
      const tip = s.mapDef.tips || 'Тапните по свободной клетке, чтобы построить башню';
      g.font = `700 14px ${FONT_HUD}`;
      const w = g.measureText(tip).width + 28;
      Draw.panel(g, this.viewW / 2 - w / 2, this.game.safe.top + 96, w, 30, 15,
        { fill: 'rgba(18,26,48,0.85)' });
      Draw.text(g, tip, this.viewW / 2, this.game.safe.top + 111, {
        size: 13, align: 'center', color: '#cfe4ff', weight: 700
      });
      g.restore();
    }
  }

  _renderRadial(g) {
    const r = this.radial;
    const k = r.open;
    g.save();
    // затемнение вокруг + кольцо
    g.globalAlpha = 0.35 * k;
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(r.mx, r.my, r.r + 46, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = k;
    g.strokeStyle = 'rgba(140,180,255,0.45)';
    g.lineWidth = 2;
    g.setLineDash([5, 5]);
    g.beginPath();
    g.arc(r.mx, r.my, r.r, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);

    for (const it of r.items) {
      const ix = r.mx + (it.x - r.mx) * k;
      const iy = r.my + (it.y - r.my) * k;
      const pressed = this.pressedRadial === it;
      g.save();
      g.globalAlpha = k;
      // круг-подложка
      g.beginPath();
      g.arc(ix, iy, it.r + (pressed ? 1 : 0), 0, Math.PI * 2);
      const grad = g.createLinearGradient(ix, iy - it.r, ix, iy + it.r);
      if (!it.enabled) { grad.addColorStop(0, '#2a2f3d'); grad.addColorStop(1, '#1c202b'); }
      else { grad.addColorStop(0, '#3a5490'); grad.addColorStop(1, '#22304f'); }
      g.fillStyle = grad;
      g.shadowColor = 'rgba(0,0,0,0.5)';
      g.shadowBlur = 8;
      g.fill();
      g.shadowBlur = 0;
      g.lineWidth = 2.2;
      g.strokeStyle = it.enabled ? 'rgba(255,210,63,0.75)' : 'rgba(255,255,255,0.12)';
      g.stroke();

      // миниатюра башни
      const base = Sprites.get('tower.base.0');
      const tur = Sprites.get(`tower.${it.def.behavior}.0`);
      g.globalAlpha = k * (it.enabled ? 1 : 0.38);
      if (base) g.drawImage(base, ix - 15, iy - 17, 30, 30);
      if (tur) g.drawImage(tur, ix - tur.width * 0.42, iy - 14 - tur.height * 0.42, tur.width * 0.84, tur.height * 0.84);
      g.globalAlpha = k;

      // цена
      const costTxt = '$' + it.def.cost;
      g.font = `900 12px ${FONT_HUD}`;
      const cw = g.measureText(costTxt).width + 10;
      Draw.panel(g, ix - cw / 2, iy + it.r - 8, cw, 17, 8, {
        fill: it.enabled ? 'rgba(20,28,48,0.95)' : 'rgba(20,20,26,0.9)',
        strokeColor: it.enabled ? 'rgba(255,210,63,0.5)' : 'rgba(255,255,255,0.1)',
        shadow: false, lineWidth: 1.4
      });
      Draw.text(g, costTxt, ix, iy + it.r + 1, {
        size: 11, align: 'center', color: it.enabled ? '#ffd23f' : '#8a8f9c', weight: 900, stroke: false
      });

      if (!it.enabled && it.reason) {
        Draw.text(g, it.reason, ix, iy - it.r - 8, {
          size: 10, align: 'center', color: '#ff9b9b', weight: 700
        });
      }
      g.restore();
    }

    // подпись клетки в центре
    g.globalAlpha = k;
    Draw.text(g, 'СТРОИТЬ', r.mx, r.my, { size: 11, align: 'center', color: '#9fd0ff', weight: 700 });
    g.restore();
    g.globalAlpha = 1;
  }

  _renderTowerPanel(g, tower) {
    const p = this.panel;
    const d = tower.def;
    Draw.panel(g, p.box.x, p.box.y, p.box.w, p.box.h, 16);

    // иконка
    const base = Sprites.get(`tower.base.${tower.level - 1}`);
    const tur = Sprites.get(`tower.${d.behavior}.${tower.level - 1}`);
    const ix = p.box.x + 30, iy = p.box.y + 30;
    if (base) g.drawImage(base, ix - 20, iy - 20, 40, 40);
    if (tur) g.drawImage(tur, ix - tur.width * 0.55, iy - tur.height * 0.55 - 3, tur.width * 1.1, tur.height * 1.1);

    // название + уровень
    Draw.text(g, d.name.toUpperCase(), ix + 30, p.box.y + 18, { size: 15, align: 'left' });
    // звёздочки уровня
    for (let i = 0; i < 3; i++) {
      Draw.star(g, ix + 34 + i * 17, p.box.y + 36, 7, i < tower.level, i < tower.level ? 1 : 0.35);
    }

    // статы (две строки справа)
    const stats = towerStats(tower).slice(0, 2);
    const sx = p.box.x + p.box.w - 14;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let i = 0; i < stats.length; i++) {
      const yy = p.box.y + 18 + i * 17;
      g.font = `700 11px ${FONT_HUD}`;
      g.fillStyle = '#9fd0ff';
      g.fillText(stats[i][0], sx - 46, yy);
      g.font = `900 12px ${FONT_HUD}`;
      g.fillStyle = '#ffffff';
      g.fillText(stats[i][1], sx, yy);
    }
    g.textAlign = 'left';

    // кнопки
    Draw.button(g, p.upgrade, { size: 13 });
    Draw.button(g, p.sell, { size: 13 });
    Draw.button(g, p.target, { size: 13 });
    Draw.roundButton(g, Object.assign(p.close, { ring: 'rgba(255,255,255,0.2)' }));
  }
}

/* ------------------------------ хелперы -------------------------------- */

function hitRect(r, x, y) {
  return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function hitRound(r, x, y) {
  if (!r) return false;
  const cx = r.x + r.r2, cy = r.y + r.r2;
  return Math.hypot(x - cx, y - cy) <= r.r2 + 4;
}

export function targetLabel(mode) {
  switch (mode) {
    case TARGET_MODE.LAST: return 'последний';
    case TARGET_MODE.STRONGEST: return 'сильный';
    case TARGET_MODE.WEAKEST: return 'слабый';
    case TARGET_MODE.CLOSEST: return 'ближний';
    case TARGET_MODE.FIRST:
    default: return 'первый';
  }
}

/** Краткие статы башни для панели */
export function towerStats(tower) {
  const d = tower.def;
  const out = [];
  if (d.dps) out.push(['DPS', fmtNum(tower.dpsRef)]);
  else out.push(['Урон', fmtNum(tower.damage)]);
  out.push(['Радиус', (tower.range / 40).toFixed(1) + ' кл']);
  if (d.slow) out.push(['Замедл.', Math.round(tower.slow * 100) + '%']);
  if (d.splash) out.push(['Сплэш', (tower.splash / 40).toFixed(1) + ' кл']);
  if (d.chain) out.push(['Цепь', tower.chain + ' цели']);
  out.push(['Цели', d.targets === 'both' ? 'земля+воздух' : 'только земля']);
  return out.slice(0, 4);
}

export default GameHud;
