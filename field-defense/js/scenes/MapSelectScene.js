/* ==========================================================================
   MapSelectScene.js — выбор карты.
   Горизонтальная лента карточек: процедурное превью карты, название,
   звёзды, рекорд, замок для неоткрытых. Отдельная кнопка — бесконечный режим.
   ========================================================================== */

import { Scene } from './Scene.js';
import { GameScene } from './GameScene.js';
import { MenuScene } from './MenuScene.js';
import { Draw, hit } from '../utils/Draw.js';
import { Sprites } from '../utils/SpriteSheet.js';
import { MAP_ORDER, MAPS, getMap } from '../maps/MapData.js';
import { CONFIG, DIFFICULTIES, DIFFICULTY_ORDER } from '../utils/Constants.js';
import { clamp } from '../utils/MathUtil.js';

export class MapSelectScene extends Scene {
  constructor(game) {
    super(game);
    this.scroll = 0;
    this.targetScroll = 0;
    this.vel = 0;
    this.cards = [];
    this.pressed = null;
    this.buttons = {};
    this.anim = 0;
    this.difficulty = DIFFICULTIES[game.save?.settings?.difficulty] ? game.save.settings.difficulty : 'tough';
    this.diffBtns = [];
  }

  enter() {
    this.layout();
    // по умолчанию выбираем первую ещё не пройденную открытую карту
    this.selected = this._defaultSelected();
    this._centerOn(this.selected, true);
  }

  resize() {
    this.layout();
    this._centerOn(this.selected, true);
  }

  _defaultSelected() {
    const save = this.game.save;
    let idx = MAP_ORDER.findIndex((id) => save.isMapUnlocked(id) && !save.stars(id));
    if (idx < 0) idx = MAP_ORDER.findIndex((id) => save.isMapUnlocked(id));
    if (idx < 0) idx = 0;
    return idx;
  }

  layout() {
    const w = this.viewW, h = this.viewH;
    const s = this.game.safe;
    this.buttons.back = { x: s.left + 10, y: s.top + 10, r2: 21, icon: 'icon.home' };

    // карточки
    const cardW = clamp(Math.min(w * 0.34, 250), 150, 250);
    const cardH = clamp(h - s.top - s.bottom - 108, 150, 300);
    const gap = 18;
    const total = MAP_ORDER.length * (cardW + gap) - gap;
    this.cardW = cardW;
    this.cardH = cardH;
    this.gap = gap;
    this.cards = MAP_ORDER.map((id, i) => ({
      id,
      x: i * (cardW + gap),
      y: s.top + 62,
      w: cardW,
      h: cardH
    }));
    this.contentW = total;
    this.maxScroll = Math.max(0, total - (w - 40));
    this.scroll = clamp(this.scroll, 0, this.maxScroll);
    this.playBtn = {
      x: w / 2 - 130, y: h - s.bottom - 58, w: 122, h: 48,
      label: 'ИГРАТЬ', icon: 'icon.play', accent: true
    };
    this.endlessBtn = {
      x: w / 2 + 8, y: h - s.bottom - 58, w: 122, h: 48,
      label: 'БЕСКОНЕЧНО', icon: 'icon.wave'
    };
    // ряд сложности: три кнопки над запуском
    const dbw = 86, dbh = 34, dgap = 8;
    const dTotal = dbw * 3 + dgap * 2;
    this.diffBtns = DIFFICULTY_ORDER.map((key, i) => ({
      key,
      x: w / 2 - dTotal / 2 + i * (dbw + dgap),
      y: h - s.bottom - 58 - dbh - 10,
      w: dbw, h: dbh,
      label: DIFFICULTIES[key].name
    }));
    this.selected = clamp(this.selected ?? 0, 0, MAP_ORDER.length - 1);
  }

  update(dt) {
    this.anim = Math.min(1, this.anim + dt * 3);
    if (this.dragging) {
      this.targetScroll = this.scroll;
      return;
    }
    // инерция после броска
    if (Math.abs(this.vel) > 2) {
      this.targetScroll = clamp(this.targetScroll + this.vel * dt, 0, this.maxScroll);
      this.vel *= Math.exp(-5 * dt);
      // во время инерции выбираем карточку под центром
      this.selected = this._nearestToCenter();
    } else {
      this.vel = 0;
      this.targetScroll = this._scrollForIndex(this.selected);
    }
    // плавный доезд к выбранной карточке
    const k = Math.min(1, dt * 11);
    this.scroll += (this.targetScroll - this.scroll) * k;
    if (Math.abs(this.targetScroll - this.scroll) < 0.4) this.scroll = this.targetScroll;
    this.scroll = clamp(this.scroll, 0, this.maxScroll);
  }

  _scrollForIndex(i) {
    const c = this.cards[clamp(i, 0, this.cards.length - 1)];
    if (!c) return 0;
    return clamp(c.x + c.w / 2 - (this.viewW - 40) / 2, 0, this.maxScroll);
  }

  _nearestToCenter() {
    const center = this.scroll + (this.viewW - 40) / 2;
    let best = 0, bd = Infinity;
    this.cards.forEach((c, i) => {
      const d = Math.abs(c.x + c.w / 2 - center);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  render(g) {
    const w = this.viewW, h = this.viewH;
    const s = this.game.safe;

    // фон
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#16233f');
    bg.addColorStop(1, '#0a1020');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // декоративные «холмы»
    g.save();
    g.globalAlpha = 0.16;
    for (let i = 0; i < 3; i++) {
      g.fillStyle = ['#4fd1ff', '#6ee36e', '#ffd23f'][i];
      g.beginPath();
      g.ellipse(w * (0.2 + i * 0.3), h * 1.05, w * 0.42, h * 0.42, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    Draw.text(g, 'ВЫБОР КАРТЫ', w / 2, s.top + 32, { size: 24, align: 'center', color: '#ffd23f' });
    Draw.text(g, `Звёзд собрано: ${this.game.save.totalStars()}   •   Монет: ${this.game.save.data.totalCoins}`,
      w / 2, s.top + 52, { size: 12, align: 'center', color: '#9fd0ff', weight: 700 });

    // лента карточек
    g.save();
    g.translate(20 - this.scroll, 0);
    this.cards.forEach((c, i) => {
      if (c.x - this.scroll > w + 40 || c.x - this.scroll + c.w < -40) return;
      this._renderCard(g, c, i, i === this.selected);
    });
    g.restore();

    // индикаторы прокрутки
    if (this.maxScroll > 0) {
      const n = this.cards.length;
      for (let i = 0; i < n; i++) {
        const dx = w / 2 + (i - (n - 1) / 2) * 16;
        g.beginPath();
        g.arc(dx, this.cards[0].y + this.cardH + 16, i === this.selected ? 5 : 3.4, 0, Math.PI * 2);
        g.fillStyle = i === this.selected ? '#ffd23f' : 'rgba(255,255,255,0.3)';
        g.fill();
      }
    }

    // кнопки запуска
    const id = MAP_ORDER[this.selected];
    const unlocked = this.game.save.isMapUnlocked(id);
    this.playBtn.enabled = unlocked;
    this.playBtn.sub = unlocked ? '' : 'закрыто';
    this.endlessBtn.enabled = unlocked && (this.game.save.stars(id) || 0) > 0;
    this.endlessBtn.sub = this.endlessBtn.enabled ? '' : 'нужна 1 звезда';
    Draw.button(g, Object.assign(this.playBtn, { pressed: this.pressed === 'play' }));
    Draw.button(g, Object.assign(this.endlessBtn, { pressed: this.pressed === 'endless' }));
    for (const b of this.diffBtns) {
      Draw.button(g, Object.assign({}, b, {
        accent: b.key === this.difficulty,
        pressed: this.pressed === 'diff:' + b.key
      }));
    }

    Draw.roundButton(g, Object.assign(this.buttons.back, { pressed: this.pressed === 'back' }));
  }

  _renderCard(g, c, index, selected) {
    const def = getMap(c.id);
    const save = this.game.save;
    const unlocked = save.isMapUnlocked(c.id);
    const stars = save.stars(c.id);
    const best = save.data.mapBest[c.id];

    g.save();
    // лёгкий «подскок» выбранной карточки
    const lift = selected ? -6 : 0;
    g.translate(0, lift);

    Draw.panel(g, c.x, c.y, c.w, c.h, 16, {
      fill: selected ? 'rgba(30,44,78,0.95)' : 'rgba(20,29,54,0.9)',
      strokeColor: selected ? 'rgba(255,210,63,0.85)' : CONFIG.UI.panelStroke,
      lineWidth: selected ? 3 : 2
    });

    // превью карты
    const pw = c.w - 20, ph = Math.min(c.h * 0.46, 130);
    const px = c.x + 10, py = c.y + 10;
    g.save();
    g.beginPath();
    g.rect(px, py, pw, ph);
    g.clip();
    drawMapPreview(g, def, px, py, pw, ph);
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.lineWidth = 2;
    g.strokeRect(px, py, pw, ph);

    // название
    Draw.text(g, def.name.toUpperCase(), c.x + c.w / 2, py + ph + 22, {
      size: clamp(c.w * 0.075, 13, 17), align: 'center'
    });
    Draw.text(g, `${def.cols}×${def.rows}  •  ${def.maze ? 'лабиринт' : 'путь фикс.'}`,
      c.x + c.w / 2, py + ph + 40, { size: 11, align: 'center', color: '#9fd0ff', weight: 700, stroke: false });

    // звёзды
    const sy = py + ph + 62;
    for (let i = 0; i < 3; i++) {
      Draw.star(g, c.x + c.w / 2 + (i - 1) * 26, sy, 11, i < stars, 1);
    }

    // рекорд
    if (best && best.wave) {
      Draw.text(g, `рекорд: волна ${best.wave}  •  ${Math.round(best.score)} очк.`,
        c.x + c.w / 2, c.y + c.h - 14, { size: 10, align: 'center', color: 'rgba(234,241,255,0.55)', weight: 700, stroke: false });
    }

    // замок
    if (!unlocked) {
      g.fillStyle = 'rgba(6,10,20,0.72)';
      g.fillRect(c.x, c.y, c.w, c.h);
      const img = Sprites.get('icon.lock');
      const isz = 40;
      if (img) g.drawImage(img, c.x + c.w / 2 - isz / 2, c.y + c.h / 2 - isz / 2 - 10, isz, isz);
      Draw.text(g, 'ПРОЙДИТЕ ПРЕДЫДУЩУЮ', c.x + c.w / 2, c.y + c.h / 2 + 26, {
        size: 11, align: 'center', color: '#cfe4ff', weight: 700
      });
    }
    g.restore();
    void index;
  }

  /* -------------------------------- ввод -------------------------------- */

  onTap(x, y) {
    if (hit(this.buttons.back, x, y)) {
      this.game.audio?.play('ui');
      this.game.replaceScene(new MenuScene(this.game));
      return;
    }
    for (const b of this.diffBtns) {
      if (hit(b, x, y)) {
        this.difficulty = b.key;
        this.game.save?.setSetting?.('difficulty', b.key);
        this.game.audio?.play('ui');
        return;
      }
    }
    if (hit(this.playBtn, x, y)) { this._start(false); return; }
    if (hit(this.endlessBtn, x, y)) { this._start(true); return; }

    // тап по карточке — выбрать/прокрутить
    const cx = x - 20 + this.scroll;
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i];
      if (cx >= c.x && cx <= c.x + c.w && y >= c.y && y <= c.y + c.h + 8) {
        if (i !== this.selected) {
          this.selected = i;
          this._centerOn(i);
          this.game.audio?.play('ui');
        } else {
          this._start(false);
        }
        return;
      }
    }
  }

  _start(endless) {
    const id = MAP_ORDER[this.selected];
    if (!this.game.save.isMapUnlocked(id)) {
      this.game.audio?.play('deny');
      return;
    }
    if (endless && !(this.game.save.stars(id) > 0)) {
      this.game.audio?.play('deny');
      return;
    }
    this.game.audio?.play('build');
    this.game.replaceScene(new GameScene(this.game, { mapId: id, endless, difficulty: this.difficulty }));
  }

  _centerOn(i, instant = false) {
    this.selected = clamp(i, 0, this.cards.length - 1);
    this.targetScroll = this._scrollForIndex(this.selected);
    if (instant) this.scroll = this.targetScroll;
    this.vel = 0;
  }

  onDown(x, y) {
    const diffHit = this.diffBtns.find((b) => hit(b, x, y));
    this.pressed =
      hit(this.buttons.back, x, y) ? 'back'
        : hit(this.playBtn, x, y) ? 'play'
          : hit(this.endlessBtn, x, y) ? 'endless'
            : diffHit ? 'diff:' + diffHit.key : null;
    this.dragging = true;
    this.dragX = x;
    this.vel = 0;
  }

  onDrag(dx) {
    if (!this.dragging) return;
    this.scroll = clamp(this.scroll - dx, 0, this.maxScroll);
    this.vel = -dx * 60;
  }

  onDragEnd() {
    this.dragging = false;
    // «магнитим» ближайшую карточку к центру
    this._centerOn(this._nearestToCenter());
  }
  onUp() { this.pressed = null; }

  onPinch() { /* зум на экране выбора карты не нужен */ }

  onKey(key) {
    if (key === 'ArrowRight' && this.selected < this.cards.length - 1) { this.selected++; this._centerOn(this.selected); }
    if (key === 'ArrowLeft' && this.selected > 0) { this.selected--; this._centerOn(this.selected); }
    if (key === 'Enter') this._start(false);
    if (key === 'Escape') this.game.replaceScene(new MenuScene(this.game));
  }
}

/* ==========================================================================
   Процедурное превью карты (миниатюра для карточки выбора)
   ========================================================================== */

export function drawMapPreview(g, def, x, y, w, h) {
  const pal = CONFIG.PALETTES[def.biome] || CONFIG.PALETTES.grass;
  const cw = w / def.cols, ch = h / def.rows;

  // земля
  g.fillStyle = pal.ground[0];
  g.fillRect(x, y, w, h);
  for (let i = 0; i < def.cols * def.rows * 0.35; i++) {
    g.fillStyle = pal.ground[(Math.random() * pal.ground.length) | 0];
    g.globalAlpha = 0.5;
    const px = x + Math.random() * w, py = y + Math.random() * h;
    g.fillRect(px, py, cw * 0.8, ch * 0.8);
  }
  g.globalAlpha = 1;

  // зоны
  for (const z of (def.zones || [])) {
    g.fillStyle = z.kind === 'water' ? '#2f8fc8' : (z.kind === 'lava' ? '#ff6a1f' : '#8d8f98');
    g.fillRect(x + z.x * cw, y + z.y * ch, z.w * cw, z.h * ch);
  }

  // дорога
  if (def.path && def.path.length) {
    g.beginPath();
    g.moveTo(x + (def.path[0][0] + 0.5) * cw, y + (def.path[0][1] + 0.5) * ch);
    for (let i = 1; i < def.path.length; i++) {
      g.lineTo(x + (def.path[i][0] + 0.5) * cw, y + (def.path[i][1] + 0.5) * ch);
    }
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.strokeStyle = pal.pathEdge;
    g.lineWidth = Math.min(cw, ch) * 1.05;
    g.stroke();
    g.strokeStyle = pal.path;
    g.lineWidth = Math.min(cw, ch) * 0.82;
    g.stroke();
  } else {
    // maze-карта: пунктир «как пойдут враги»
    g.setLineDash([4, 4]);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 2;
    const e0 = def.entries[0], e1 = def.exits[0];
    g.beginPath();
    g.moveTo(x + (e0[0] + 0.5) * cw, y + (e0[1] + 0.5) * ch);
    g.lineTo(x + (e1[0] + 0.5) * cw, y + (e1[1] + 0.5) * ch);
    g.stroke();
    g.setLineDash([]);
  }

  // декор точками
  for (const d of (def.decor || [])) {
    g.fillStyle = d.type === 'rock' ? '#9a9aa2' : (def.biome === 'desert' ? '#3f9e4a' : '#2f7a34');
    g.beginPath();
    g.arc(x + (d.cx + 0.5) * cw, y + (d.cy + 0.5) * ch, Math.min(cw, ch) * 0.3, 0, Math.PI * 2);
    g.fill();
  }

  // вход / выход
  for (const e of (def.entries || [])) {
    g.fillStyle = '#ff5a5a';
    g.beginPath();
    g.arc(x + (e[0] + 0.5) * cw, y + (e[1] + 0.5) * ch, Math.min(cw, ch) * 0.42, 0, Math.PI * 2);
    g.fill();
  }
  for (const e of (def.exits || [])) {
    g.fillStyle = '#6ee36e';
    g.beginPath();
    g.arc(x + (e[0] + 0.5) * cw, y + (e[1] + 0.5) * ch, Math.min(cw, ch) * 0.42, 0, Math.PI * 2);
    g.fill();
  }

  // виньетка
  const vg = g.createLinearGradient(x, y, x, y + h);
  vg.addColorStop(0, 'rgba(0,0,0,0.18)');
  vg.addColorStop(0.5, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.2)');
  g.fillStyle = vg;
  g.fillRect(x, y, w, h);
}

export default MapSelectScene;
void MAPS;
