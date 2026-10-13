/* ==========================================================================
   GameOverScene.js — экран победы/поражения (прозрачный оверлей).
   Показывает звёзды рейтинга, статистику боя и начисленные монеты,
   предлагает переиграть, выбрать карту или выйти в меню.
   ========================================================================== */

import { Scene } from './Scene.js';
import { GameScene } from './GameScene.js';
import { MapSelectScene } from './MapSelectScene.js';
import { MenuScene } from './MenuScene.js';
import { Draw, hit } from '../utils/Draw.js';
import { clamp } from '../utils/MathUtil.js';

export class GameOverScene extends Scene {
  constructor(game, params = {}) {
    super(game);
    this.transparent = true;
    this.speed = 0;
    this.p = params;
    this.anim = 0;
    this.starAnim = [0, 0, 0];
    this.buttons = {};
    this.pressed = null;
    this.confetti = [];
  }

  enter() {
    this.layout();
    if (this.p.won) this._makeConfetti();
  }

  _makeConfetti() {
    for (let i = 0; i < 70; i++) {
      this.confetti.push({
        x: Math.random() * this.viewW,
        y: -20 - Math.random() * this.viewH * 0.6,
        vy: 60 + Math.random() * 140,
        vx: (Math.random() - 0.5) * 40,
        r: 2 + Math.random() * 4,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 8,
        c: ['#ffd23f', '#4fd1ff', '#6ee36e', '#ff8a5a', '#ffffff'][(Math.random() * 5) | 0]
      });
    }
  }

  layout() {
    const w = this.viewW, h = this.viewH;
    const pw = Math.min(440, w - 28);
    const ph = Math.min(360, h - 20);
    const px = (w - pw) / 2, py = (h - ph) / 2;
    this.panelBox = { x: px, y: py, w: pw, h: ph };

    const bw = (pw - 24 * 2 - 12 * 2) / 3;
    const bh = 48;
    const by = py + ph - bh - 18;
    this.buttons.retry = { x: px + 24, y: by, w: bw, h: bh, label: 'ЕЩЁ РАЗ', icon: 'icon.restart', accent: true };
    this.buttons.maps = { x: px + 24 + bw + 12, y: by, w: bw, h: bh, label: 'КАРТЫ', icon: 'icon.home' };
    this.buttons.menu = { x: px + 24 + (bw + 12) * 2, y: by, w: bw, h: bh, label: 'МЕНЮ', icon: 'icon.gear' };
  }

  resize() { this.layout(); }

  update(dt) {
    this.anim = clamp(this.anim + dt * 3.4, 0, 1);
    const stars = this.p.stars || 0;
    for (let i = 0; i < 3; i++) {
      const target = i < stars ? 1 : 0;
      const delay = 0.25 + i * 0.22;
      if (this.anim > delay && this.starAnim[i] < target) {
        const prev = this.starAnim[i];
        this.starAnim[i] = clamp((this.anim - delay) * 4, 0, 1);
        if (prev === 0 && target === 1) this.game.audio?.play('upgrade');
      }
    }
    for (const c of this.confetti) {
      c.y += c.vy * dt;
      c.x += c.vx * dt;
      c.rot += c.vr * dt;
      if (c.y > this.viewH + 20) {
        c.y = -20;
        c.x = Math.random() * this.viewW;
      }
    }
  }

  render(g) {
    const w = this.viewW, h = this.viewH;
    const p = this.p;

    g.save();
    g.globalAlpha = 0.72 * this.anim;
    g.fillStyle = p.won ? '#04121a' : '#12060a';
    g.fillRect(0, 0, w, h);
    g.restore();

    // конфетти при победе
    if (p.won) {
      g.save();
      g.globalAlpha = 0.9 * this.anim;
      for (const c of this.confetti) {
        g.save();
        g.translate(c.x, c.y);
        g.rotate(c.rot);
        g.fillStyle = c.c;
        g.fillRect(-c.r, -c.r * 0.5, c.r * 2, c.r);
        g.restore();
      }
      g.restore();
    }

    const k = 0.9 + 0.1 * this.anim;
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(k, k);
    g.translate(-w / 2, -h / 2);

    const box = this.panelBox;
    Draw.panel(g, box.x, box.y, box.w, box.h, 22);

    // заголовок
    const title = p.won ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ';
    Draw.text(g, title, w / 2, box.y + 40, {
      size: 34, align: 'center', color: p.won ? '#ffd23f' : '#ff6b6b'
    });
    Draw.text(g, p.won ? 'Все волны отбиты, база устояла' : 'База пала — враги прорвались',
      w / 2, box.y + 64, { size: 13, align: 'center', color: '#9fd0ff', weight: 700 });

    // звёзды
    const starY = box.y + 100;
    for (let i = 0; i < 3; i++) {
      const a = this.starAnim[i];
      const s = 20 * (0.4 + 0.6 * a) + (a >= 1 ? Math.sin(this.anim * 6 + i) * 0.8 : 0);
      Draw.star(g, w / 2 + (i - 1) * 52, starY, s, i < (p.stars || 0), clamp(a * 1.4, 0, 1));
    }

    // статистика
    const rows = [
      ['Карта', mapName(p.mapId)],
      ['Волна', String(p.wave || 0)],
      ['Убито врагов', String(p.kills || 0)],
      ['Пропущено', String(p.leaks || 0)],
      ['Очки', String(Math.round(p.score || 0))]
    ];
    let ry = starY + 38;
    g.save();
    for (const [k1, v1] of rows) {
      Draw.text(g, k1, box.x + 34, ry, { size: 13, align: 'left', color: '#9fd0ff', weight: 700, stroke: false });
      Draw.text(g, v1, box.x + box.w - 34, ry, { size: 14, align: 'right', color: '#ffffff', stroke: false });
      ry += 21;
    }
    g.restore();

    // монеты
    if (p.coins > 0) {
      const cy = ry + 6;
      Draw.icon(g, 'icon.coin', w / 2 - 34, cy, 22);
      Draw.text(g, `+${p.coins} монет`, w / 2 + 6, cy, {
        size: 17, align: 'left', color: '#ffd23f', stroke: false
      });
    }

    Draw.button(g, Object.assign(this.buttons.retry, { pressed: this.pressed === 'retry' }));
    Draw.button(g, Object.assign(this.buttons.maps, { pressed: this.pressed === 'maps' }));
    Draw.button(g, Object.assign(this.buttons.menu, { pressed: this.pressed === 'menu' }));

    g.restore();
  }

  onTap(x, y) {
    const b = this.buttons;
    if (hit(b.retry, x, y)) {
      this.game.audio?.play('ui');
      this.game.replaceScene(new GameScene(this.game, {
        mapId: this.p.mapId, endless: this.p.endless
      }));
      return;
    }
    if (hit(b.maps, x, y)) {
      this.game.audio?.play('ui');
      this.game.replaceScene(new MapSelectScene(this.game));
      return;
    }
    if (hit(b.menu, x, y)) {
      this.game.audio?.play('ui');
      this.game.replaceScene(new MenuScene(this.game));
    }
  }

  onDown(x, y) {
    const b = this.buttons;
    this.pressed = Object.keys(b).find((k) => hit(b[k], x, y)) || null;
  }

  onUp() { this.pressed = null; }
  onKey(key) { if (key === 'Enter' || key === ' ') this.onTap(this.buttons.retry.x + 4, this.buttons.retry.y + 4); }
}

function mapName(id) {
  const names = { grasslands: 'Зелёная долина', desert: 'Песчаный карьер' };
  return names[id] || id;
}

export default GameOverScene;
