/* ==========================================================================
   GameScene.js — основной геймплей.

   Сцена владеет всеми системами боя и является «контекстом» (game) для
   сущностей: башни, враги, снаряды и системы обращаются к ней за
   damageEnemy / spawnEnemy / particles / audio / camera и т.д.

   Управление (touch):
     • TAP по пустой клетке      → радиальное меню стройки
     • TAP по башне              → выделение: радиус + панель «улучшить/продать/цель»
     • DOUBLE-TAP по пустой      → быстрая стройка последней башни
     • DRAG                      → панорама карты
     • PINCH                     → зум 0.6x…2.6x
   ========================================================================== */

import { Scene } from './Scene.js';
import { GameHud } from './GameHud.js';
import { PauseScene } from './PauseScene.js';
import { GameOverScene } from './GameOverScene.js';

import { CONFIG, TILE, CELL } from '../utils/Constants.js';
import { clamp } from '../utils/MathUtil.js';

import { GridSystem } from '../systems/GridSystem.js';
import { PathfindingSystem } from '../systems/PathfindingSystem.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { ParticleSystem } from '../systems/ParticleSystem.js';
import { EconomySystem } from '../systems/EconomySystem.js';
import { WaveSystem, WAVE_STATE } from '../systems/WaveSystem.js';
import { UpgradeSystem } from '../systems/UpgradeSystem.js';
import { RenderSystem } from '../systems/RenderSystem.js';

import { ProjectilePool } from '../entities/Projectile.js';
import { EffectPool, FX } from '../entities/Effect.js';
import { createTower } from '../entities/towers/index.js';
import { createEnemy } from '../entities/enemies/index.js';

import { getMap } from '../maps/MapData.js';
import { TOWER_DEFS, PROTOTYPE_TOWERS } from '../data/TowerData.js';
import { ENEMY_DEFS } from '../data/EnemyData.js';

export class GameScene extends Scene {
  constructor(game, params = {}) {
    super(game);
    this.params = params;
    this.mapId = params.mapId || 'grasslands';
    this.endless = !!params.endless;
    this.demo = !!params.demo;
  }

  /* ============================== ЖИЗНЕННЫЙ ЦИКЛ ======================= */

  enter() {
    const G = this.game;
    this.mapDef = Object.assign({}, getMap(this.mapId));
    if (this.endless) {
      this.mapDef.endless = true;
      this.mapDef.waves = 9999;
    }

    // ---- мир ----
    this.grid = new GridSystem(this.mapDef);
    this.path = new PathfindingSystem(this.grid);
    this.worldW = this.grid.worldW;
    this.worldH = this.grid.worldH;

    // ---- системы ----
    this.collision = new CollisionSystem(this.worldW, this.worldH);
    this.particles = new ParticleSystem();
    this.effects = new EffectPool();
    this.projectiles = new ProjectilePool(this);
    this.economy = new EconomySystem(this, this.mapDef);
    this.waves = new WaveSystem(this, this.mapDef);
    this.upgrades = new UpgradeSystem(this);
    this.renderer = new RenderSystem(this);

    /** псевдоним для всплывающих текстов (используется EconomySystem) */
    this.texts = {
      spawn: (x, y, text, color, size, life) =>
        this.particles.spawnText(x, y, text, color, size, life)
    };

    // ---- сущности ----
    this.enemies = [];
    this.towers = [];
    this.selectedTower = null;
    this.hoverCell = null;
    this.buildMode = false;
    this.lastBuiltId = 'gatling';

    // ---- прогрессия ----
    this.hpScale = CONFIG.HP_SCALE_PER_WAVE * (this.mapDef.hpScale || 1);
    this.armorScale = CONFIG.ARMOR_SCALE_PER_WAVE;
    this.speedScale = this.mapDef.speedScale || 1;

    // ---- состояние ----
    this.state = 'playing';      // playing | won | lost
    this.gameSpeed = clamp(G.save.settings.gameSpeed || 1, 1, 3);
    this.speed = this.demo ? 1 : this.gameSpeed;
    this.simPaused = false;
    this.time = 0;
    this.stats = { kills: 0, built: 0, sold: 0, damage: 0, leaked: 0 };

    // ---- камера ----
    G.camera.resize(G.viewW, G.viewH, this.worldW, this.worldH);
    G.camera.setUserZoom(this.demo ? 1 : 1);

    // ---- HUD ----
    this.hud = new GameHud(this);
    this.hud.layout(G.viewW, G.viewH);

    // ---- колбэки волн ----
    this.waves.onWaveStart = (n) => this._onWaveStart(n);

    // ---- демо-режим для фона главного меню ----
    if (this.demo) this._setupDemo();

    G.audio?.startMusic();
  }

  exit() {
    this.enemies.length = 0;
    this.towers.length = 0;
    this.particles.clear();
    this.effects.clear();
    this.projectiles.clear();
  }

  resize(w, h) {
    this.game.camera.resize(w, h, this.worldW, this.worldH);
    this.hud.layout(w, h);
  }

  get audio() { return this.game.audio; }
  get camera() { return this.game.camera; }
  get save() { return this.game.save; }

  /* ================================ ДЕМО =============================== */

  /** Фон главного меню: карта играет сама, без ввода и без проигрыша */
  _setupDemo() {
    this.mapDef.endless = true;
    this.waves.endless = true;
    this.waves.totalWaves = 9999;
    this.economy.money = 400;
    const spots = this._demoSpots();
    for (const [id, cx, cy] of spots) {
      if (!this.grid.isBuildableCell(cx, cy)) continue;
      const def = TOWER_DEFS[id];
      if (!def) continue;
      const t = createTower(this, def, cx, cy);
      t.level = 3;
      t.invested = 200;
      t.applyLevel();
      t.buildAnim = 0;
      this.grid.placeTower(t);
      this.towers.push(t);
    }
    this.path.rebuild();
    this.waves.breakTimer = 1.5;
  }

  _demoSpots() {
    const g = this.grid;
    const out = [];
    // ставим башни вдоль дороги (или в центре для maze-карты)
    const ids = ['gatling', 'missile', 'glue', 'tesla', 'gatling', 'missile'];
    let k = 0;
    for (const cellIdx of g.pathCells) {
      const cx = cellIdx % g.cols, cy = (cellIdx / g.cols) | 0;
      const around = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
      for (const [ax, ay] of around) {
        if (!g.isBuildableCell(ax, ay)) continue;
        if (out.some((o) => o[1] === ax && o[2] === ay)) continue;
        if (k % 3 === 0) out.push([ids[(k / 3 | 0) % ids.length], ax, ay]);
        k++;
        if (out.length >= 9) return out;
      }
    }
    if (!out.length) {
      // maze-карта: стройка вокруг линии входа-выхода
      const midY = (g.rows / 2) | 0;
      for (let cx = 3; cx < g.cols - 4 && out.length < 8; cx += 3) {
        out.push([ids[out.length % ids.length], cx, midY - 2]);
        out.push([ids[(out.length + 2) % ids.length], cx, midY + 2]);
      }
    }
    return out;
  }

  /* ================================ АПДЕЙТ ============================= */

  update(dt) {
    this.time += dt;

    if (this.state !== 'playing') return;

    // 1) волны: спавн
    this.waves.update(dt);

    // 2) башни: прицеливание и выстрелы
    const towers = this.towers;
    for (let i = 0; i < towers.length; i++) towers[i].update(dt);

    // 3) враги: движение и статусы
    const enemies = this.enemies;
    for (let i = 0; i < enemies.length; i++) enemies[i].update(dt);

    // 4) уборка мёртвых (swap-pop, без аллокаций)
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (!enemies[i].alive) {
        enemies[i] = enemies[enemies.length - 1];
        enemies.pop();
      }
    }

    // 5) пространственный хэш — свежий для снарядов
    this.collision.rebuild(enemies);

    // 6) снаряды
    this.projectiles.update(dt);

    // 7) эффекты
    this.effects.update(dt);
    this.particles.update(dt);
    this.economy.update(dt);
    this.camera.update(dt);
    this.hud.update(dt);

    // 8) условия победы/поражения
    this._checkEnd();
  }

  _checkEnd() {
    if (this.demo) {
      // демо не заканчивается: жизни не кончаются, волны бесконечные
      if (this.economy.lives <= 3) this.economy.lives = this.economy.maxLives;
      return;
    }

    if (this.economy.gameOver) {
      this._finish(false);
      return;
    }

    if (!this.endless && this.waves.state === WAVE_STATE.DONE && this.enemies.length === 0) {
      this._finish(true);
    }
  }

  _finish(won) {
    if (this.state !== 'playing') return;
    this.state = won ? 'won' : 'lost';
    this.speed = 0;
    this.audio?.stopMusic();
    this.audio?.play(won ? 'win' : 'lose', { priority: 3 });

    // звёзды и награда
    const leaks = this.economy.leaks;
    let stars = 0;
    if (won) {
      stars = leaks <= CONFIG.STAR_PERFECT_MAX_LEAKS ? 3
        : leaks < CONFIG.STAR_GOOD_MAX_LEAKS ? 2 : 1;
    }
    const coins = Math.round(
      (won ? 20 : 4) + stars * 12 + this.waves.wave * 1.5 + this.economy.kills * 0.05
    );

    if (!this.demo) {
      this.save.addKills(this.economy.kills);
      const best = this.save.recordResult(this.mapId, stars, this.waves.wave, this.economy.score, coins);
      // открываем следующую карту
      if (won) {
        const next = this.game.nextMapAfter(this.mapId);
        if (next) this.save.unlockMap(next);
      }
      this.result = { won, stars, coins, leaks, best };
    }

    this.game.pushScene(new GameOverScene(this.game, {
      scene: this,
      won,
      stars,
      coins,
      wave: this.waves.wave,
      score: this.economy.score,
      kills: this.economy.kills,
      leaks,
      mapId: this.mapId,
      demo: this.demo
    }));
  }

  /* ============================== СПАВН ВРАГОВ ========================== */

  /** Вызывается WaveSystem для каждой записи очереди спавна */
  spawnEnemy(p) {
    const def = ENEMY_DEFS[p.type] || ENEMY_DEFS.soldier;
    const e = createEnemy(this, def, p.entry | 0, p.wave || this.waves.wave, {
      hpMul: p.hpMul, armorMul: p.armorMul, speedMul: p.speedMul, isBoss: p.isBoss
    });
    this.enemies.push(e);
    if (p.isBoss || def.isBoss) {
      this.audio?.play('boss', { priority: 3 });
      this.camera.shake(5, 0.5);
      this.texts.spawn(e.x, e.y - 40, '⚠ БОСС ⚠', '#ff6b6b', 20, 2);
    }
    return e;
  }

  /** Десант из транспорта: пачка врагов в точке гибели носителя */
  spawnSquad(o) {
    const def = ENEMY_DEFS[o.type] || ENEMY_DEFS.soldier;
    const n = o.count || 1;
    for (let i = 0; i < n; i++) {
      const e = createEnemy(this, def, 0, o.wave || this.waves.wave, {
        hpMul: 1, armorMul: 1, speedMul: 1
      });
      const a = (i / n) * Math.PI * 2;
      const r = (o.spread || 6) * (0.4 + (i % 3) * 0.3);
      e.placeAt(o.at.x + Math.cos(a) * r, o.at.y + Math.sin(a) * r * 0.6);
      e.spawnAnim = 0.6;
      this.enemies.push(e);
    }
    this.particles.burst(o.at.x, o.at.y, {
      count: 10, colors: ['#d8d8d8', '#ffd23f'], speed: [20, 70],
      life: [0.3, 0.6], size: [1.5, 3], gravity: 60
    });
  }

  /** Единая точка нанесения урона (башни, снаряды, DoT) */
  damageEnemy(e, amount, type = 'physical', o = {}) {
    if (!e || !e.alive) return 0;
    const dealt = e.takeDamage(amount, type, o);
    this.stats.damage += dealt;
    if (e.hp <= 0) e.die();
    return dealt;
  }

  onEnemyRemoved(e) {
    void e;
    if (this.selectedTower && this.selectedTower.target === e) this.selectedTower.target = null;
  }

  /* ================================ БАШНИ ============================== */

  /** Какие башни доступны игроку на этой карте */
  availableTowers() {
    const allowed = this.mapDef.towers || PROTOTYPE_TOWERS;
    return allowed
      .map((id) => TOWER_DEFS[id])
      .filter((d) => d && this.isTowerAvailable(d.id));
  }

  isTowerAvailable(id) {
    const def = TOWER_DEFS[id];
    if (!def) return false;
    // прототип: доступны все заявленные в PROTOTYPE_TOWERS
    if (PROTOTYPE_TOWERS.includes(id)) return true;
    // остальные — по сумме звёзд
    const stars = this.save.totalStars();
    return stars >= (def.unlock || 0) && this.save.isTowerUnlocked(id);
  }

  /** Клетка занята врагом (строить поверх нельзя) */
  isCellOccupied(cx, cy) {
    if (!this.grid.inBounds(cx, cy)) return true;
    const idx = this.grid.idx(cx, cy);
    const buf = [];
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive || e.flying) continue;
      e.occupiedCells(buf);
      for (let k = 0; k < buf.length; k++) if (buf[k] === idx) return true;
    }
    return false;
  }

  /** Причина, почему здесь нельзя строить (для подсказки) */
  buildBlockReason(cx, cy) {
    if (!this.grid.inBounds(cx, cy)) return 'Вне карты';
    const t = this.grid.tileAt(cx, cy);
    if (t === TILE.PATH) return 'На дороге';
    if (t === TILE.BLOCKED) return 'Занято';
    if (t === TILE.ENTRY || t === TILE.EXIT) return 'Нельзя';
    if (t === TILE.TOWER || this.grid.towerAt(cx, cy)) return 'Уже занято';
    if (this.isCellOccupied(cx, cy)) return 'Враг в клетке';
    return '';
  }

  canBuildAt(cx, cy) {
    if (!this.grid.isBuildableCell(cx, cy)) return false;
    if (this.isCellOccupied(cx, cy)) return false;
    // проверка связности: входы и все живые враги должны иметь путь к выходу
    const extra = this._srcBuf || (this._srcBuf = []);
    extra.length = 0;
    for (const e of this.enemies) {
      if (!e.alive || e.flying) continue;
      if (e.cellIdx >= 0) extra.push(e.cellIdx);
      if (e.anchorIdx >= 0) extra.push(e.anchorIdx);
    }
    return this.path.canBuildAt(cx, cy, extra);
  }

  buildTower(cx, cy, id) {
    const def = TOWER_DEFS[id];
    if (!def) return false;
    if (!this.isTowerAvailable(id)) {
      this.hud.toast('Башня ещё не открыта');
      this.audio?.play('deny');
      return false;
    }
    if (!this.canBuildAt(cx, cy)) {
      this.hud.toast(this.buildBlockReason(cx, cy) || 'Здесь нельзя строить');
      this.audio?.play('deny');
      return false;
    }
    if (!this.economy.spend(def.cost)) {
      this.hud.toast(`Нужно $${def.cost}`);
      this.audio?.play('deny');
      return false;
    }

    const t = createTower(this, def, cx, cy);
    this.grid.placeTower(t);
    this.towers.push(t);
    this.lastBuiltId = id;
    this.stats.built++;

    // путь пересчитывается — все враги сразу перестроятся
    this.path.rebuild();

    // эффект материализации
    const x = t.x, y = t.y;
    this.effects.spawn(FX.BUILD, { x, y, size: 22, size2: 62, life: 0.5, color: '#8ce8ff' });
    this.effects.spawn(FX.SHOCKWAVE, {
      x, y: y + 8, size: 4, size2: 34, life: 0.34, color: 'rgba(140,232,255,0.9)', width: 3
    });
    this.particles.burst(x, y + 8, {
      count: 16, colors: ['#8ce8ff', '#ffffff', '#4fd1ff'],
      speed: [20, 90], life: [0.3, 0.7], size: [1.2, 3], gravity: -40, drag: 2
    });
    this.audio?.play('build');

    if (!this.demo) this.selectTower(t);
    return true;
  }

  removeTower(tower) {
    const i = this.towers.indexOf(tower);
    if (i >= 0) {
      this.towers[i] = this.towers[this.towers.length - 1];
      this.towers.pop();
    }
    this.grid.removeTower(tower);
    if (this.selectedTower === tower) this.selectTower(null);
    this.path.rebuild();
    this.stats.sold++;
  }

  selectTower(tower) {
    if (this.selectedTower && this.selectedTower !== tower) this.selectedTower.selected = false;
    this.selectedTower = tower || null;
    if (tower) {
      tower.selected = true;
      this.hud.closeRadial();
      this.audio?.play('ui');
    }
  }

  doUpgrade() {
    const t = this.selectedTower;
    if (!t) return;
    if (!this.upgrades.canUpgrade(t)) {
      if (t.level >= 3) this.hud.toast('Максимальный уровень');
      else this.hud.toast(`Нужно $${this.upgrades.upgradeCost(t)}`);
      this.audio?.play('deny');
      return;
    }
    this.upgrades.upgrade(t);
  }

  doSell() {
    const t = this.selectedTower;
    if (!t) return;
    this.upgrades.sell(t);
  }

  doCycleTarget() {
    if (!this.selectedTower) return;
    this.upgrades.cycleTargetMode(this.selectedTower);
    this.hud.toast('Приоритет: ' + this.selectedTower.targetMode, '#cfe4ff');
  }

  /* ================================ ВОЛНЫ ============================== */

  _onWaveStart(n) {
    this.audio?.play('horn', { priority: 3 });
    this.camera.shake(1.5, 0.2);
    if (this.waves.isBossWave(n)) {
      this.texts.spawn(this.worldW / 2, this.worldH / 2, `ВОЛНА ${n}`, '#ff9b9b', 26, 2);
    } else {
      this.texts.spawn(this.worldW / 2, this.worldH / 2 - 20, `ВОЛНА ${n}`, '#ffd23f', 22, 1.4);
    }
  }

  onWaveCleared(wave) {
    const bonus = this.economy.waveBonus(wave);
    this.texts.spawn(this.worldW / 2, this.worldH / 2 + 16, `ВОЛНА ${wave} ОТБИТА  +$${bonus}`, '#6ee36e', 16, 1.6);
    this.audio?.play('upgrade');
    this.economy.score += 100 * wave;
  }

  sendNextWave() {
    if (this.demo) return;
    if (this.waves.state !== WAVE_STATE.BREAK || !this.waves.hasNext) {
      this.audio?.play('deny');
      return;
    }
    const bonus = this.waves.earlyBonus();
    if (bonus > 0) {
      this.economy.earlyBonus(bonus > 0 ? this.waves.breakTimer : 0);
      this.texts.spawn(this.worldW / 2, this.worldH / 2 - 40, `БЫСТРЫЙ СТАРТ +$${bonus}`, '#ffd23f', 16, 1.4);
    }
    this.waves.sendNow();
  }

  cycleSpeed() {
    const list = CONFIG.SPEEDS;
    const i = list.indexOf(this.gameSpeed);
    this.gameSpeed = list[(i + 1) % list.length];
    this.speed = this.gameSpeed;
    this.save.setSetting('gameSpeed', this.gameSpeed);
    this.audio?.play('ui');
  }

  openPause() {
    if (this.demo) return;
    this.game.pushScene(new PauseScene(this.game, { scene: this }));
  }

  restart() {
    this.game.replaceScene(new GameScene(this.game, {
      mapId: this.mapId, endless: this.endless
    }));
  }

  /* ================================ РЕНДЕР ============================= */

  render(g) {
    const cam = this.camera;
    const dpr = this.game.dpr;

    // ---- мир ----
    cam.applyTransform(g, dpr);
    this.renderer.render(g, cam);
    this.renderer.renderMarkers(g, this.time);

    // подсветка клетки под курсором/пальцем
    if (this.hoverCell && !this.demo) {
      const { cx, cy } = this.hoverCell;
      const ok = this.canBuildAt(cx, cy);
      const ghost = this.hud.radial ? null : (this.grid.isBuildableCell(cx, cy) ? this.lastBuiltId : null);
      if (ghost && TOWER_DEFS[ghost]) {
        this.renderer.renderGhost(g, TOWER_DEFS[ghost], cx, cy, ok);
      } else {
        this.renderer.renderCellHighlight(g, cx, cy, ok, ok ? '' : this.buildBlockReason(cx, cy));
      }
    }

    // выделенная башня — радиус и подсветка
    if (this.selectedTower) {
      const t = this.selectedTower;
      t.renderRange(g);
      g.save();
      g.strokeStyle = 'rgba(255,210,63,0.9)';
      g.lineWidth = 2.5;
      g.setLineDash([4, 4]);
      g.lineDashOffset = -this.time * 20;
      g.strokeRect(t.cx * CELL + 2, t.cy * CELL + 2, CELL - 4, CELL - 4);
      g.restore();
    }

    // маркер цели выбранной башни
    if (this.selectedTower?.target?.alive) {
      const t = this.selectedTower.target;
      g.save();
      g.strokeStyle = 'rgba(255,90,90,0.85)';
      g.lineWidth = 1.8;
      const r = t.radius + 5 + Math.sin(this.time * 8) * 1.2;
      g.beginPath();
      g.arc(t.x, t.y - t.altitude, r, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(t.x - r - 4, t.y - t.altitude); g.lineTo(t.x - r + 2, t.y - t.altitude);
      g.moveTo(t.x + r - 2, t.y - t.altitude); g.lineTo(t.x + r + 4, t.y - t.altitude);
      g.stroke();
      g.restore();
    }

    // ---- HUD (экранные координаты) ----
    cam.applyScreen(g, dpr);
    if (!this.demo) this.hud.render(g);
    else this._renderDemoVignette(g);
  }

  _renderDemoVignette(g) {
    const w = this.viewW, h = this.viewH;
    const lg = g.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, 'rgba(6,10,22,0.72)');
    lg.addColorStop(0.45, 'rgba(6,10,22,0.30)');
    lg.addColorStop(1, 'rgba(6,10,22,0.86)');
    g.fillStyle = lg;
    g.fillRect(0, 0, w, h);
  }

  /* ================================= ВВОД ============================== */

  onTap(x, y, count = 1) {
    if (this.demo || this.state !== 'playing') return;

    // 1) HUD
    if (this.hud.onTap(x, y, count)) return;

    // 2) мир
    const w = this.camera.screenToWorld(x, y, { x: 0, y: 0 });
    const cell = this.grid.cellFromWorld(w.x, w.y);
    if (!this.grid.inBounds(cell.cx, cell.cy)) {
      this.selectTower(null);
      return;
    }

    const tower = this.grid.towerAt(cell.cx, cell.cy);
    if (tower) {
      this.selectTower(tower === this.selectedTower ? null : tower);
      return;
    }

    // двойной тап — быстрая стройка последней башни
    if (count >= 2 && this.grid.isBuildableCell(cell.cx, cell.cy)) {
      const def = TOWER_DEFS[this.lastBuiltId] || TOWER_DEFS.gatling;
      if (this.economy.money >= def.cost && this.canBuildAt(cell.cx, cell.cy)) {
        this.buildTower(cell.cx, cell.cy, def.id);
        return;
      }
    }

    this.selectTower(null);

    if (this.grid.isBuildableCell(cell.cx, cell.cy)) {
      if (!this.canBuildAt(cell.cx, cell.cy)) {
        this.hud.toast('Нельзя полностью перекрыть путь');
        this.audio?.play('deny');
        return;
      }
      // центр меню — экранная позиция клетки
      const s = this.camera.worldToScreen(
        this.grid.centerX(cell.cx), this.grid.centerY(cell.cy), { x: 0, y: 0 }
      );
      this.hud.openRadial(cell.cx, cell.cy, s.x, s.y);
    } else {
      const reason = this.buildBlockReason(cell.cx, cell.cy);
      if (reason) this.hud.toast(reason);
    }
  }

  onDown(x, y) {
    if (this.demo) return;
    this.hud.onDown(x, y);
  }

  onUp(x, y) {
    this.hud.onUp(x, y);
    void x; void y;
  }

  onDragStart() {
    if (this.demo) return;
    this.hud.closeRadial();
    this.dragging = true;
  }

  onDrag(dx, dy) {
    if (this.demo) return;
    this.camera.pan(dx, dy);
  }

  onDragEnd() { this.dragging = false; }

  onPinch(k, cx, cy) {
    if (this.demo) return;
    this.camera.zoomAt(k, cx, cy);
  }

  onHover(x, y) {
    if (this.demo) return;
    const w = this.camera.screenToWorld(x, y, { x: 0, y: 0 });
    const cell = this.grid.cellFromWorld(w.x, w.y);
    if (this.grid.inBounds(cell.cx, cell.cy)) this.hoverCell = cell;
    else this.hoverCell = null;
  }

  onKey(key) {
    if (this.demo) return;
    switch (key) {
      case ' ': this.sendNextWave(); break;
      case 'Escape':
      case 'p': this.openPause(); break;
      case '1': this.gameSpeed = 1; this.speed = 1; break;
      case '2': this.gameSpeed = 2; this.speed = 2; break;
      case '3': this.gameSpeed = 3; this.speed = 3; break;
      case 'u': this.doUpgrade(); break;
      case 's': this.doSell(); break;
      case 't': this.doCycleTarget(); break;
      case 'g': this.game.debugGrid = !this.game.debugGrid; break;
      default: break;
    }
  }
}

export default GameScene;
