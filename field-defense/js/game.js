/* ==========================================================================
   Game.js — ядро: canvas, игровой цикл с фиксированным шагом, стек сцен,
   ввод, звук, сохранения, адаптация под экран и DPR.

   Цикл:
     • requestAnimationFrame → накапливаем реальное время
     • логика обновляется фиксированными шагами 1/60 с (детерминизм)
     • множитель скорости x1/x2/x3 просто «наматывает» время быстрее
     • рендер — один раз за кадр, независимо от числа шагов
   ========================================================================== */

import { CONFIG } from './utils/Constants.js';
import { TOWER_DEFS } from './data/TowerData.js';
import { Camera } from './utils/Camera.js';
import { TouchInput } from './utils/TouchInput.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { SaveSystem } from './systems/SaveSystem.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { PauseScene } from './scenes/PauseScene.js';
import { clamp } from './utils/MathUtil.js';
import { mapCount, nextMapId } from './maps/MapData.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.scenes = [];
    this.camera = new Camera();
    this.save = new SaveSystem();
    this.audio = new AudioSystem();
    this.input = new TouchInput(canvas);

    this.viewW = 1;
    this.viewH = 1;
    this.dpr = 1;
    this.safe = { top: 0, right: 0, bottom: 0, left: 0 };

    this.acc = 0;
    this.lastTs = 0;
    this.time = 0;
    this.frames = 0;
    this.fps = 60;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    this.debug = false;
    this.debugGrid = false;
    this.paused = false;          // вкладка скрыта
    this.frameDiv = 1;            // «батарейный» режим: рендер каждый N-й кадр
    this.gestureArmed = false;
    this.booted = false;
  }

  /* ------------------------------- старт ------------------------------- */

  init() {
    this.measureSafeAreas();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 220));

    // звук разблокируется только после жеста пользователя
    const unlock = () => {
      this.audio.unlock();
      const st = this.save.settings;
      this.audio.setVolumes(st.soundVolume, st.musicVolume);
      this.audio.setMuted(st.muted);
      this.tryLockOrientation();
      if (!this.gestureArmed) {
        this.gestureArmed = true;
      }
    };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });

    // пауза при сворачивании вкладки
    document.addEventListener('visibilitychange', () => this.onVisibility());

    this.setDebug(!!this.save.settings.showFps);
    // открыть башни, порог по звёздам которых уже достигнут (после загрузки сохранения)
    this.save.syncUnlocks(TOWER_DEFS);
    this.replaceScene(new MenuScene(this));
    this.booted = true;
    return this;
  }

  /** Читаем safe-area-inset через probe-элемент (вырез камеры и т.п.) */
  measureSafeAreas() {
    if (typeof document === 'undefined') return;
    try {
      const d = document.createElement('div');
      d.style.cssText = [
        'position:fixed', 'left:0', 'top:0', 'width:0', 'height:0',
        'pointer-events:none', 'visibility:hidden',
        'padding-top:env(safe-area-inset-top,0px)',
        'padding-right:env(safe-area-inset-right,0px)',
        'padding-bottom:env(safe-area-inset-bottom,0px)',
        'padding-left:env(safe-area-inset-left,0px)'
      ].join(';');
      document.body.appendChild(d);
      const cs = getComputedStyle(d);
      const px = (v) => parseFloat(v) || 0;
      this.safe = {
        top: px(cs.paddingTop),
        right: px(cs.paddingRight),
        bottom: px(cs.paddingBottom),
        left: px(cs.paddingLeft)
      };
      document.body.removeChild(d);
    } catch (e) {
      this.safe = { top: 0, right: 0, bottom: 0, left: 0 };
    }
  }

  /** Пробуем залочить ландшафт (сработает только в fullscreen на Android) */
  tryLockOrientation() {
    try {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      const ori = screen.orientation;
      if (ori && typeof ori.lock === 'function' && document.fullscreenElement) {
        ori.lock('landscape').catch(() => { /* не критично */ });
      } else if (req && window.matchMedia('(pointer: coarse)').matches && !document.fullscreenElement) {
        const p = req.call(el);
        if (p && p.then) {
          p.then(() => {
            if (ori && ori.lock) ori.lock('landscape').catch(() => {});
          }).catch(() => {});
        }
      }
    } catch (e) { /* ignore */ }
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.dpr = clamp(window.devicePixelRatio || 1, 1, CONFIG.MAX_DPR);
    this.viewW = w;
    this.viewH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    // пересчитываем раскладку у всех сцен стека: под оверлеем паузы
    // игровая сцена тоже должна получить новый размер экрана
    for (const s of this.scenes) s.resize?.(w, h);
  }

  onVisibility() {
    if (document.hidden) {
      this.paused = true;
      const top = this.topScene;
      if (top instanceof GameScene && !top.demo) {
        // авто-пауза, чтобы волны не шли без игрока
        if (!(this.scenes[this.scenes.length - 1] instanceof PauseScene)) {
          this.pushScene(new PauseScene(this, { scene: top, auto: true }));
        }
      }
      if (this.audio.ready && this.audio.ctx.state === 'running') {
        this.audio.ctx.suspend();
      }
    } else {
      this.paused = false;
      this.lastTs = 0;
      if (this.audio.ready && this.audio.ctx.state === 'suspended') {
        this.audio.ctx.resume();
      }
    }
  }

  setDebug(on) {
    this.debug = !!on;
    const el = typeof document !== 'undefined' ? document.getElementById('debug') : null;
    if (el) el.classList.toggle('visible', this.debug);
  }

  /* ------------------------------- сцены ------------------------------- */

  get topScene() { return this.scenes[this.scenes.length - 1] || null; }

  pushScene(scene) {
    this.scenes.push(scene);
    this.input.setTarget(scene);
    scene.enter?.();
    return scene;
  }

  replaceScene(scene) {
    const old = this.scenes.pop();
    old?.exit?.();
    this.scenes.length = 0;
    this.scenes.push(scene);
    this.input.setTarget(scene);
    scene.enter?.();
    return scene;
  }

  popScene() {
    const s = this.scenes.pop();
    s?.exit?.();
    const top = this.topScene;
    if (top) this.input.setTarget(top);
    return top;
  }

  nextMapAfter(id) { return nextMapId(id); }
  mapCountTotal() { return mapCount(); }

  /* ----------------------------- игровой цикл --------------------------- */

  start() {
    this.lastTs = 0;
    const step = (ts) => {
      this.raf = requestAnimationFrame(step);
      this.frame(ts);
    };
    this.raf = requestAnimationFrame(step);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  frame(ts) {
    // ---- время кадра ----
    if (!this.lastTs) this.lastTs = ts;
    let frameTime = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    if (frameTime > 0.25) frameTime = 0.25;      // защита от «спирали смерти»
    if (frameTime < 0) frameTime = 0;

    // ---- FPS ----
    this.fpsAcc += frameTime;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      this._updateDebug();
    }

    // ---- «батарейный» режим: 30 FPS, если пользователь давно не трогал экран
    const idle = this.input.idleSeconds() > CONFIG.IDLE_DELAY;
    const top = this.topScene;
    const busy = top instanceof GameScene && !top.demo && top.enemies?.length > 0;
    this.frameDiv = (idle && !busy) ? 2 : 1;
    this.frames++;
    const shouldRender = (this.frames % this.frameDiv) === 0;

    // ---- логика (фиксированный шаг) ----
    if (!this.paused && top) {
      const speed = clamp(top.speed ?? 1, 0, 4);
      if (speed > 0) {
        this.acc += frameTime * speed;
        const dt = CONFIG.FIXED_DT;
        let steps = 0;
        const maxSteps = CONFIG.MAX_STEPS_PER_FRAME * Math.max(1, speed);
        while (this.acc >= dt && steps < maxSteps) {
          top.update(dt);
          this.acc -= dt;
          steps++;
          this.time += dt;
        }
        if (steps >= maxSteps) this.acc = 0;
        this.lastSteps = steps;          // для отладочной плашки
      } else {
        // сцена на паузе — время всё равно идёт (для анимаций оверлея)
        top.update(frameTime);
        this.time += frameTime;
      }
    }

    // ---- рендер ----
    const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    if (shouldRender) this.render();
    const t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    // скользящее среднее стоимости кадра (логика + рендер) — для отладки
    this.frameMs = this.frameMs ? this.frameMs * 0.9 + (t1 - t0) * 0.1 : (t1 - t0);
  }

  render() {
    const g = this.ctx;
    const dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0a0f1e';
    g.fillRect(0, 0, this.viewW, this.viewH);

    // находим нижнюю «непрозрачную» сцену и рисуем от неё вверх
    let start = this.scenes.length - 1;
    while (start > 0 && this.scenes[start].transparent) start--;
    for (let i = start; i < this.scenes.length; i++) {
      const s = this.scenes[i];
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      try {
        s.render(g);
      } catch (e) {
        if (typeof console !== 'undefined') console.error('[render]', e);
      }
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _updateDebug() {
    if (!this.debug) return;
    const el = typeof document !== 'undefined' ? document.getElementById('debug') : null;
    if (!el) return;
    const top = this.topScene;
    const parts = [
      `FPS ${this.fps.toFixed(0)}`,
      `zoom ${this.camera.zoom.toFixed(2)}`,
      `scene ${top?.constructor?.name || '-'}`,
      `frame ${(this.frameMs || 0).toFixed(2)} ms`,
      `steps ${this.lastSteps || 0}/${CONFIG.MAX_STEPS_PER_FRAME * Math.max(1, top?.gameSpeed || 1)}`
    ];
    if (this.debugGrid) parts.push('grid ON (G — выключить)');
    if (top instanceof GameScene) {
      parts.push(`enemies ${top.enemies.length}`);
      parts.push(`towers ${top.towers.length}`);
      parts.push(`proj ${top.projectiles.count}`);
      parts.push(`parts ${top.particles.count}`);
      parts.push(`fx ${top.effects.count}`);
      parts.push(`wave ${top.waves.wave} ${top.waves.state}`);
      parts.push(`speed x${top.gameSpeed}`);
      parts.push(`path v${top.path.version}`);
    }
    el.textContent = parts.join('\n');
  }
}

export default Game;
