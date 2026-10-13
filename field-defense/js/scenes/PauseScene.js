/* ==========================================================================
   PauseScene.js — оверлей паузы поверх GameScene.
   Симуляция снизу заморожена (speed = 0), сцена прозрачная: сначала
   рисуется игровая сцена, затем затемнение и панель.
   ========================================================================== */

import { Scene } from './Scene.js';
import { GameScene } from './GameScene.js';
import { MenuScene } from './MenuScene.js';
import { MapSelectScene } from './MapSelectScene.js';
import { Draw, hit } from '../utils/Draw.js';

export class PauseScene extends Scene {
  constructor(game, params = {}) {
    super(game);
    this.transparent = true;
    this.speed = 0;            // нижняя сцена не обновляется
    this.scene = params.scene;
    this.auto = !!params.auto; // пауза из-за сворачивания браузера
    this.anim = 0;
    this.buttons = {};
    this.pressed = null;
  }

  enter() {
    this.layout();
    if (this.scene) this.scene.simPaused = true;
    this.game.audio?.play('ui');
  }

  exit() {
    if (this.scene) this.scene.simPaused = false;
  }

  layout() {
    const w = this.viewW, h = this.viewH;
    const s = this.game.safe;
    const pw = Math.min(420, w - 32);
    const ph = Math.min(340, h - 24);
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;
    const bw = pw - 48;
    const bh = 50;
    let by = py + 74;

    this.panelBox = { x: px, y: py, w: pw, h: ph };
    this.buttons.resume = { x: px + 24, y: by, w: bw, h: bh, label: 'ПРОДОЛЖИТЬ', icon: 'icon.play', accent: true };
    by += bh + 12;
    this.buttons.restart = { x: px + 24, y: by, w: bw, h: bh, label: 'НАЧАТЬ ЗАНОВО', icon: 'icon.restart' };
    by += bh + 12;
    this.buttons.menu = { x: px + 24, y: by, w: bw, h: bh, label: 'ВЫБОР КАРТЫ', icon: 'icon.home' };
    by += bh + 18;

    // настройки звука — две компактные кнопки в ряд
    const sw = (bw - 10) / 2;
    this.buttons.sound = { x: px + 24, y: by, w: sw, h: 44, label: '', icon: 'icon.sound' };
    this.buttons.music = { x: px + 34 + sw, y: by, w: sw, h: 44, label: '', icon: 'icon.sound' };

    void s;
  }

  resize() { this.layout(); }

  update(dt) {
    this.anim = Math.min(1, this.anim + dt * 5);
  }

  render(g) {
    const w = this.viewW, h = this.viewH;
    // затемнение
    g.save();
    g.globalAlpha = 0.62 * this.anim;
    g.fillStyle = '#05080f';
    g.fillRect(0, 0, w, h);
    g.restore();

    const k = 0.86 + 0.14 * this.anim;
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(k, k);
    g.translate(-w / 2, -h / 2);

    const p = this.panelBox;
    Draw.panel(g, p.x, p.y, p.w, p.h, 20);
    Draw.text(g, this.auto ? 'ПАУЗА' : 'ПАУЗА', w / 2, p.y + 36, { size: 26, align: 'center', color: '#ffd23f' });

    // текущая статистика боя
    if (this.scene) {
      const eco = this.scene.economy;
      const wv = this.scene.waves;
      const info = `Волна ${wv.wave}   •   Убито ${eco.kills}   •   Пропущено ${eco.leaks}`;
      Draw.text(g, info, w / 2, p.y + 58, { size: 12, align: 'center', color: '#9fd0ff', weight: 700 });
    }

    Draw.button(g, Object.assign(this.buttons.resume, { pressed: this.pressed === 'resume' }));
    Draw.button(g, Object.assign(this.buttons.restart, { pressed: this.pressed === 'restart' }));
    Draw.button(g, Object.assign(this.buttons.menu, { pressed: this.pressed === 'menu' }));

    // звук / музыка
    const st = this.game.save.settings;
    const sb = this.buttons.sound;
    sb.icon = st.muted ? 'icon.mute' : 'icon.sound';
    sb.label = st.muted ? 'Звук выкл' : 'Звук вкл';
    sb.size = 13;
    Draw.button(g, Object.assign(sb, { pressed: this.pressed === 'sound' }));

    const mb = this.buttons.music;
    mb.icon = st.musicVolume > 0 ? 'icon.sound' : 'icon.mute';
    mb.label = st.musicVolume > 0 ? 'Музыка вкл' : 'Музыка выкл';
    mb.size = 13;
    Draw.button(g, Object.assign(mb, { pressed: this.pressed === 'music' }));

    Draw.text(g, 'Жесты: тап — строить, два пальца — зум, свайп — двигать карту',
      w / 2, p.y + p.h - 16, { size: 11, align: 'center', color: 'rgba(234,241,255,0.5)', weight: 700, stroke: false });

    g.restore();
  }

  onTap(x, y) {
    const b = this.buttons;
    if (hit(b.resume, x, y)) { this.game.audio?.play('ui'); this.game.popScene(); return; }
    if (hit(b.restart, x, y)) {
      this.game.audio?.play('ui');
      this.game.replaceScene(new GameScene(this.game, {
        mapId: this.scene?.mapId || 'grasslands',
        endless: this.scene?.endless
      }));
      return;
    }
    if (hit(b.menu, x, y)) {
      this.game.audio?.play('ui');
      this.game.replaceScene(new MapSelectScene(this.game));
      return;
    }
    if (hit(b.sound, x, y)) {
      const st = this.game.save.settings;
      st.muted = !st.muted;
      this.game.save.save();
      this.game.audio?.setMuted(st.muted);
      if (!st.muted) this.game.audio?.play('ui');
      return;
    }
    if (hit(b.music, x, y)) {
      const st = this.game.save.settings;
      st.musicVolume = st.musicVolume > 0 ? 0 : 0.35;
      this.game.save.save();
      this.game.audio?.setVolumes(st.soundVolume, st.musicVolume);
      this.game.audio?.play('ui');
      return;
    }
    // тап вне панели — тоже выход из паузы
    if (!hit(this.panelBox, x, y)) this.game.popScene();
  }

  onDown(x, y) {
    const b = this.buttons;
    this.pressed = Object.keys(b).find((k) => hit(b[k], x, y)) || null;
  }

  onUp() { this.pressed = null; }

  onKey(key) {
    if (key === 'Escape' || key === 'p') this.game.popScene();
  }
}

export default PauseScene;
