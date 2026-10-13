/* ==========================================================================
   MenuScene.js — главное меню.

   Фон — живая карта в демо-режиме (GameScene с флагом demo: башни строятся
   сами, волны идут бесконечно, ввод отключён), поверх неё затемнение,
   логотип и кнопки. Если демо по какой-то причине не запустилось —
   рисуется запасной градиентный фон.
   ========================================================================== */

import { Scene } from './Scene.js';
import { GameScene } from './GameScene.js';
import { MapSelectScene } from './MapSelectScene.js';
import { Draw, hit } from '../utils/Draw.js';
import { CONFIG } from '../utils/Constants.js';
import { clamp } from '../utils/MathUtil.js';

export class MenuScene extends Scene {
  constructor(game) {
    super(game);
    this.buttons = {};
    this.pressed = null;
    this.overlay = null;      // 'settings' | 'credits' | null
    this.anim = 0;
    this.demo = null;
    this.demoOk = false;
  }

  enter() {
    this.layout();
    this._startDemo();
    this.game.audio?.startMusic();
  }

  exit() {
    this.demo = null;
    this.demoOk = false;
  }

  _startDemo() {
    try {
      this.demo = new GameScene(this.game, { mapId: 'grasslands', demo: true });
      this.demo.enter();
      this.demoOk = true;
    } catch (e) {
      // запасной вариант — просто фон
      this.demo = null;
      this.demoOk = false;
      if (typeof console !== 'undefined') console.warn('[menu] demo failed:', e);
    }
  }

  resize(w, h) {
    this.layout();
    if (this.demo) this.demo.resize(w, h);
  }

  layout() {
    const w = this.viewW, h = this.viewH;
    const s = this.game.safe;
    const bw = Math.min(260, w * 0.42);
    const bh = 52;
    const gap = 12;
    const x = w - s.right - bw - Math.max(18, w * 0.06);
    let y = h / 2 - (bh * 3 + gap * 2) / 2 + 12;

    this.buttons.play = { x, y, w: bw, h: bh + 8, label: 'ИГРАТЬ', icon: 'icon.play', accent: true, size: 22 };
    y += bh + 8 + gap;
    this.buttons.maps = { x, y, w: bw, h: bh, label: 'ВЫБОР КАРТЫ', icon: 'icon.home' };
    y += bh + gap;
    this.buttons.settings = { x, y, w: bw, h: bh, label: 'НАСТРОЙКИ', icon: 'icon.gear' };
    y += bh + gap;
    this.buttons.credits = { x, y, w: bw, h: bh, label: 'ОБ ИГРЕ', icon: 'icon.skull' };

    // кнопки внутри оверлеев
    const pw = Math.min(420, w - 28);
    const ph = Math.min(330, h - 20);
    const px = (w - pw) / 2, py = (h - ph) / 2;
    this.overlayBox = { x: px, y: py, w: pw, h: ph };
    this.ovButtons = {
      close: { x: px + pw - 40, y: py + 8, r2: 15, icon: 'icon.close' },
      sound: { x: px + 24, y: py + 74, w: pw - 48, h: 48, label: '', icon: 'icon.sound' },
      music: { x: px + 24, y: py + 130, w: pw - 48, h: 48, label: '', icon: 'icon.sound' },
      fps: { x: px + 24, y: py + 186, w: pw - 48, h: 48, label: '', icon: 'icon.gear' },
      reset: { x: px + 24, y: py + 244, w: pw - 48, h: 44, label: 'СБРОСИТЬ ПРОГРЕСС', icon: 'icon.restart' }
    };
  }

  update(dt) {
    this.anim = Math.min(1, this.anim + dt * 2.2);
    if (this.demo) {
      try { this.demo.update(dt); } catch (e) { this.demoOk = false; }
    }
    if (!this.overlay) this.game.audio?.updateMusic(0.1);
  }

  render(g) {
    const w = this.viewW, h = this.viewH;
    const s = this.game.safe;

    // ---- фон ----
    if (this.demoOk && this.demo) {
      try { this.demo.render(g); } catch (e) { this.demoOk = false; }
    }
    if (!this.demoOk) {
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#1d3a5f');
      bg.addColorStop(0.6, '#16233f');
      bg.addColorStop(1, '#0a1020');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
    }

    // затемнение слева (под логотипом) и общее
    const lg = g.createLinearGradient(0, 0, w, 0);
    lg.addColorStop(0, 'rgba(5,9,20,0.82)');
    lg.addColorStop(0.55, 'rgba(5,9,20,0.35)');
    lg.addColorStop(1, 'rgba(5,9,20,0.62)');
    g.fillStyle = lg;
    g.fillRect(0, 0, w, h);

    // ---- логотип ----
    const logoSize = clamp(Math.min(w * 0.085, h * 0.17), 26, 54);
    const lx = s.left + Math.max(24, w * 0.06) + logoSize * 2.1;
    const ly = h * 0.3;
    g.save();
    g.globalAlpha = this.anim;
    Draw.logo(g, lx, ly, logoSize);
    g.restore();

    Draw.text(g, 'Tower Defense • построено на Canvas 2D, без единого файла ассетов',
      lx, ly + logoSize * 1.25, {
        size: clamp(logoSize * 0.24, 11, 15), align: 'center',
        color: 'rgba(207,228,255,0.75)', weight: 700
      });

    // ---- прогресс ----
    const save = this.game.save;
    const stars = save.totalStars();
    g.save();
    g.globalAlpha = this.anim;
    const py = ly + logoSize * 1.85;
    Draw.panel(g, lx - 120, py, 240, 40, 14, { fill: 'rgba(14,22,42,0.8)' });
    for (let i = 0; i < 3; i++) {
      Draw.star(g, lx - 78 + i * 20, py + 20, 9, i < Math.min(3, stars));
    }
    Draw.text(g, `${stars} / ${this.game.mapCountTotal() * 3}`, lx - 34, py + 21, {
      size: 13, align: 'left', color: '#cfe4ff', stroke: false
    });
    Draw.icon(g, 'icon.coin', lx + 44, py + 20, 20);
    Draw.text(g, String(save.data.totalCoins), lx + 58, py + 21, {
      size: 14, align: 'left', color: '#ffd23f', stroke: false
    });
    g.restore();

    // ---- кнопки ----
    for (const k of ['play', 'maps', 'settings', 'credits']) {
      const b = this.buttons[k];
      b.pressed = this.pressed === k;
      g.save();
      g.globalAlpha = this.anim;
      Draw.button(g, b);
      g.restore();
    }

    // версия
    Draw.text(g, 'v0.9 prototype', w - s.right - 12, h - s.bottom - 12, {
      size: 10, align: 'right', color: 'rgba(234,241,255,0.35)', weight: 700, stroke: false
    });

    // ---- оверлей ----
    if (this.overlay === 'settings') this._renderSettings(g);
    else if (this.overlay === 'credits') this._renderCredits(g);
  }

  _renderSettings(g) {
    const w = this.viewW, h = this.viewH;
    g.save();
    g.globalAlpha = 0.66;
    g.fillStyle = '#05080f';
    g.fillRect(0, 0, w, h);
    g.restore();

    const b = this.overlayBox;
    Draw.panel(g, b.x, b.y, b.w, b.h, 20);
    Draw.text(g, 'НАСТРОЙКИ', w / 2, b.y + 34, { size: 22, align: 'center', color: '#ffd23f' });

    const st = this.game.save.settings;
    const ob = this.ovButtons;

    ob.sound.label = st.muted ? 'ЗВУК: ВЫКЛ' : `ЗВУК: ${Math.round(st.soundVolume * 100)}%`;
    ob.sound.icon = st.muted ? 'icon.mute' : 'icon.sound';
    ob.sound.sub = 'тап — переключить';
    Draw.button(g, ob.sound, { size: 15 });

    ob.music.label = st.musicVolume > 0 ? 'МУЗЫКА: ВКЛ' : 'МУЗЫКА: ВЫКЛ';
    ob.music.icon = st.musicVolume > 0 ? 'icon.sound' : 'icon.mute';
    ob.music.sub = 'процедурный саундтрек';
    Draw.button(g, ob.music, { size: 15 });

    ob.fps.label = st.showFps ? 'СЧЁТЧИК FPS: ВКЛ' : 'СЧЁТЧИК FPS: ВЫКЛ';
    ob.fps.sub = 'отладочная информация';
    Draw.button(g, ob.fps, { size: 15 });

    ob.reset.sub = 'звёзды, монеты и открытые карты';
    Draw.button(g, ob.reset, { size: 14 });

    Draw.roundButton(g, Object.assign(ob.close, { ring: 'rgba(255,255,255,0.2)' }));
  }

  _renderCredits(g) {
    const w = this.viewW, h = this.viewH;
    g.save();
    g.globalAlpha = 0.66;
    g.fillStyle = '#05080f';
    g.fillRect(0, 0, w, h);
    g.restore();

    const b = this.overlayBox;
    Draw.panel(g, b.x, b.y, b.w, b.h, 20);
    Draw.text(g, 'ОБ ИГРЕ', w / 2, b.y + 34, { size: 22, align: 'center', color: '#ffd23f' });

    const lines = [
      'FIELD DEFENSE — оригинальная браузерная tower defense,',
      'сделанная в жанровой традиции классических TD-хитов.',
      '',
      '• Вся графика генерируется кодом на Canvas 2D — ни одного',
      '  файла картинок: тайлы, башни, юниты, эффекты и иконки.',
      '• Весь звук синтезируется Web Audio API: осцилляторы,',
      '  буфер шума, фильтры и огибающие. Файлов аудио тоже нет.',
      '• Гибридные карты: фиксированная дорога и лабиринт',
      '  (A* + flow field, пересчёт маршрута у всех врагов сразу).',
      '• Баланс башен опирается на публичные гайды жанра:',
      '  Gatling $5 / 35-70-105 DPS, Glue 40-60-75% замедления,',
      '  Missile $20, Tesla $70 / 700-1400-2100 DPS.',
      '',
      'Управление: тап по клетке — стройка, тап по башне — меню,',
      'свайп — панорама, щипок — зум, x1/x2/x3 — скорость боя.'
    ];
    let y = b.y + 62;
    for (const line of lines) {
      Draw.text(g, line, b.x + 22, y, {
        size: 11.5, align: 'left', color: line.startsWith('•') ? '#cfe4ff' : 'rgba(234,241,255,0.78)',
        weight: 700, stroke: false
      });
      y += 16;
    }
    Draw.roundButton(g, Object.assign(this.ovButtons.close, { ring: 'rgba(255,255,255,0.2)' }));
    void CONFIG;
  }

  /* -------------------------------- ввод -------------------------------- */

  onTap(x, y) {
    if (this.overlay) {
      const ob = this.ovButtons;
      const st = this.game.save.settings;
      if (hit(ob.close, x, y) || !hit(this.overlayBox, x, y)) {
        this.game.audio?.play('ui');
        this.overlay = null;
        return;
      }
      if (hit(ob.sound, x, y)) {
        st.muted = !st.muted;
        this.game.save.save();
        this.game.audio?.setMuted(st.muted);
        if (!st.muted) this.game.audio?.play('ui');
        return;
      }
      if (hit(ob.music, x, y)) {
        st.musicVolume = st.musicVolume > 0 ? 0 : 0.35;
        this.game.save.save();
        this.game.audio?.setVolumes(st.soundVolume, st.musicVolume);
        this.game.audio?.play('ui');
        return;
      }
      if (hit(ob.fps, x, y)) {
        st.showFps = !st.showFps;
        this.game.save.save();
        this.game.setDebug(st.showFps);
        this.game.audio?.play('ui');
        return;
      }
      if (hit(ob.reset, x, y)) {
        this.game.save.reset();
        this.game.audio?.play('sell');
        return;
      }
      return;
    }

    const b = this.buttons;
    if (hit(b.play, x, y) || hit(b.maps, x, y)) {
      this.game.audio?.play('build');
      this.game.replaceScene(new MapSelectScene(this.game));
      return;
    }
    if (hit(b.settings, x, y)) {
      this.game.audio?.play('ui');
      this.overlay = 'settings';
      return;
    }
    if (hit(b.credits, x, y)) {
      this.game.audio?.play('ui');
      this.overlay = 'credits';
    }
  }

  onDown(x, y) {
    if (this.overlay) return;
    const b = this.buttons;
    this.pressed = Object.keys(b).find((k) => hit(b[k], x, y)) || null;
  }

  onUp() { this.pressed = null; }

  onKey(key) {
    if (key === 'Escape' && this.overlay) { this.overlay = null; return; }
    if (key === 'Enter') {
      this.game.audio?.unlock();
      this.game.replaceScene(new MapSelectScene(this.game));
    }
  }
}

export default MenuScene;
