/* ==========================================================================
   tests/render.mjs — headless-проверка всего кода отрисовки.

   Браузера в песочнице нет, поэтому подменяем DOM и CanvasRenderingContext2D
   заглушками и прогоняем РЕАЛЬНЫЙ код: генерацию всех процедурных спрайтов,
   запекание фона карты, отрисовку башен/врагов/снарядов/эффектов, HUD,
   радиальное меню, панель башни и все экраны меню.

   Любой undefined-метод, опечатка или обращение к несуществующему спрайту
   превращаются в исключение — тест его ловит и показывает.

   Запуск: node tests/render.mjs
   ========================================================================== */

/* --------------------------- 1. мок DOM/Canvas -------------------------- */

const KNOWN_CTX = new Set([
  'save', 'restore', 'translate', 'rotate', 'scale', 'transform', 'setTransform',
  'resetTransform', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
  'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'rect', 'roundRect', 'fill',
  'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'drawImage',
  'fillText', 'strokeText', 'measureText', 'setLineDash', 'getLineDash',
  'createLinearGradient', 'createRadialGradient', 'createPattern', 'putImageData',
  'getImageData', 'createImageData', 'isPointInPath'
]);

const unknownCtx = new Map();     // имя -> сколько раз вызвали
let ctxCalls = 0;

function makeGradient() {
  return { addColorStop(offset, color) { void offset; void color; } };
}

function makeContext2D(canvas) {
  const target = {
    canvas,
    // состояние
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt',
    lineJoin: 'miter', miterLimit: 10, lineDashOffset: 0,
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
    direction: 'ltr', filter: 'none', imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
    shadowBlur: 0, shadowColor: 'transparent', shadowOffsetX: 0, shadowOffsetY: 0
  };

  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop !== 'string') return undefined;

      if (prop === 'measureText') {
        return (t) => ({ width: String(t).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      }
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return makeGradient;
      if (prop === 'getLineDash') return () => [];

      // любая остальная функция-заглушка, но запоминаем «незнакомые» имена
      return (...args) => {
        ctxCalls++;
        if (!KNOWN_CTX.has(prop)) unknownCtx.set(prop, (unknownCtx.get(prop) || 0) + 1);
        void args;
        return undefined;
      };
    },
    set(obj, prop, value) { obj[prop] = value; return true; }
  });
}

function makeCanvas(w = 300, h = 150) {
  const c = {
    width: w, height: h, style: {}, nodeName: 'CANVAS',
    clientWidth: w, clientHeight: h,
    getContext: (type) => (type === '2d' ? makeContext2D(c) : null),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h }),
    addEventListener() {}, removeEventListener() {},
    setPointerCapture() {}, releasePointerCapture() {},
    toDataURL: () => 'data:image/png;base64,'
  };
  return c;
}

const listeners = [];
globalThis.document = {
  readyState: 'complete',
  hidden: false,
  documentElement: { requestFullscreen: null, style: {} },
  body: { appendChild() {}, removeChild() {}, style: {} },
  createElement: (tag) => (tag === 'canvas' ? makeCanvas(1, 1) : {
    style: { cssText: '' }, classList: { toggle() {}, add() {}, remove() {} },
    textContent: '', appendChild() {}
  }),
  getElementById: (id) => (id === 'game' ? makeCanvas(900, 420) : {
    classList: { toggle() {}, add() {}, remove() {} }, style: {}, textContent: ''
  }),
  addEventListener: (t, f) => listeners.push([t, f]),
  removeEventListener() {},
  fullscreenElement: null
};

globalThis.getComputedStyle = () => ({
  paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px'
});

globalThis.window = {
  innerWidth: 900, innerHeight: 420, devicePixelRatio: 2.6,
  matchMedia: () => ({ matches: true }),
  addEventListener: (t, f) => listeners.push([t, f]),
  removeEventListener() {},
  requestAnimationFrame: () => 1,
  cancelAnimationFrame() {},
  AudioContext: undefined,
  location: { search: '', protocol: 'http:', href: 'http://localhost/' },
  localStorage: null
};

try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { serviceWorker: undefined, userAgent: 'node' },
    configurable: true, writable: true
  });
} catch (e) { /* в Node navigator только для чтения — не критично */ }
globalThis.location = globalThis.window.location;
globalThis.screen = { orientation: { lock: () => Promise.reject(new Error('n/a')) } };
globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
globalThis.cancelAnimationFrame = globalThis.window.cancelAnimationFrame;
globalThis.matchMedia = globalThis.window.matchMedia;
globalThis.localStorage = {
  _d: new Map(),
  getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
  setItem(k, v) { this._d.set(k, String(v)); },
  removeItem(k) { this._d.delete(k); }
};
globalThis.localStorage && (globalThis.window.localStorage = globalThis.localStorage);
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.URLSearchParams = URLSearchParams;

/* ------------------------- 2. динамический импорт ----------------------- */

const { Sprites } = await import('../js/utils/SpriteSheet.js');
const { Draw } = await import('../js/utils/Draw.js');
const { Camera } = await import('../js/utils/Camera.js');
const { CONFIG } = await import('../js/utils/Constants.js');
const { GameScene } = await import('../js/scenes/GameScene.js');
const { MenuScene } = await import('../js/scenes/MenuScene.js');
const { MapSelectScene } = await import('../js/scenes/MapSelectScene.js');
const { PauseScene } = await import('../js/scenes/PauseScene.js');
const { GameOverScene } = await import('../js/scenes/GameOverScene.js');
const hudMod = await import('../js/scenes/GameHud.js');
const { GameHud } = hudMod;
const { ENEMY_DEFS } = await import('../js/data/EnemyData.js');
const { TOWER_DEFS } = await import('../js/data/TowerData.js');
const { createEnemy } = await import('../js/entities/enemies/index.js');
const { createTower } = await import('../js/entities/towers/index.js');
const { MAP_ORDER } = await import('../js/maps/MapData.js');
const { SaveSystem } = await import('../js/systems/SaveSystem.js');

/* ------------------------------- 3. харнесс ----------------------------- */

let passed = 0, failed = 0;
const errors = [];

function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; errors.push(name); console.log(`  ✘ ${name} ${extra}`); }
}

function section(t) { console.log(`\n${t}`); }

/** Прогнать функцию и поймать исключение */
function safe(name, fn) {
  try { fn(); ok(true, name); return true; }
  catch (e) {
    ok(false, name, `→ ${e.message}\n     ${(e.stack || '').split('\n')[1] || ''}`);
    return false;
  }
}

class FakeSave extends SaveSystem {}

function makeGame() {
  return {
    viewW: 900, viewH: 420, dpr: 2,
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    camera: new Camera(),
    save: new FakeSave(),
    audio: null,
    debug: false, debugGrid: false, time: 0,
    pushScene() {}, replaceScene() {}, popScene() { return null; },
    nextMapAfter() { return null; }, mapCountTotal() { return MAP_ORDER.length; },
    setDebug() {}
  };
}

const ctx = makeContext2D(makeCanvas(900, 420));

/* ================================ ТЕСТЫ ================================= */

section('1. Процедурные спрайты: генерация всех ключей');
{
  const keys = [];
  for (const biome of ['grass', 'desert', 'lava', 'city']) {
    for (let v = 0; v < 4; v++) keys.push(`tile.${biome}.${v}`);
  }
  keys.push('tile.lavaPool');
  for (const d of ['tree', 'pine', 'bush', 'rock', 'flower', 'cactus', 'barrel',
    'building.0', 'building.1', 'building.2']) keys.push(`decor.${d}`);
  for (let l = 0; l < 3; l++) {
    keys.push(`tower.base.${l}`);
    for (const t of ['gatling', 'glue', 'missile', 'tesla']) keys.push(`tower.${t}.${l}`);
  }
  for (const e of Object.keys(ENEMY_DEFS)) keys.push(`enemy.${e}`);
  for (const p of ['bullet', 'missile', 'glue', 'bee']) keys.push(`proj.${p}`);
  for (const i of ['coin', 'heart', 'star', 'starEmpty', 'play', 'pause', 'ff', 'gear',
    'home', 'restart', 'sell', 'up', 'target', 'lock', 'sound', 'mute', 'close', 'wave', 'skull']) {
    keys.push(`icon.${i}`);
  }

  let missing = 0, generated = 0, totalPx = 0;
  for (const k of keys) {
    const v = Sprites.get(k);
    const list = Array.isArray(v) ? v : (v ? [v] : []);
    if (!list.length) { missing++; console.log(`     отсутствует спрайт: ${k}`); continue; }
    for (const img of list) {
      if (!img || !img.width || !img.height) { missing++; continue; }
      generated++;
      totalPx += img.width * img.height;
    }
  }
  ok(missing === 0, `сгенерировано спрайтов: ${generated} (пропущено ${missing})`);
  ok(totalPx > 50000, `суммарная площадь атласа: ${(totalPx / 1000).toFixed(0)}K px`);

  // силуэты для вспышки попадания
  let sil = 0;
  for (const e of Object.keys(ENEMY_DEFS)) {
    const frames = Sprites.getFrames(`enemy.${e}`);
    for (let f = 0; f < frames.length; f++) if (Sprites.getSilhouette(`enemy.${e}`, f)) sil++;
  }
  ok(sil > 20, `силуэтов для hit-flash: ${sil}`);
}

section('2. Запекание фона карты (offscreen) для всех биомов');
{
  for (const id of MAP_ORDER) {
    const game = makeGame();
    const scene = new GameScene(game, { mapId: id });
    safe(`${id}: enter + render`, () => {
      scene.enter();
      game.camera.resize(game.viewW, game.viewH, scene.worldW, scene.worldH);
      scene.render(ctx);
    });
    const bg = scene.renderer.bg;
    ok(bg && bg.width === scene.worldW * 2, `${id}: фон запечён ${bg?.width}×${bg?.height}`);
    // второй рендер не должен пересобирать фон
    const versionBefore = scene.renderer.bgVersion;
    scene.render(ctx);
    ok(scene.renderer.bgVersion === versionBefore, `${id}: фон не пересобирается без dirty-флага`);
  }
}

section('3. Игровая сцена: полный кадр с боем');
{
  const game = makeGame();
  const scene = new GameScene(game, { mapId: 'grasslands' });
  scene.enter();
  game.camera.resize(game.viewW, game.viewH, scene.worldW, scene.worldH);
  scene.economy.money = 900;

  // строим все четыре типа башен и прокачиваем одну до 3 уровня
  const spots = [];
  const g = scene.grid;
  for (const idx of g.pathCells) {
    const cx = idx % g.cols, cy = (idx / g.cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (g.isBuildableCell(cx + dx, cy + dy) && !spots.some((s) => s[0] === cx + dx && s[1] === cy + dy)) {
        spots.push([cx + dx, cy + dy]);
      }
    }
  }
  const ids = ['gatling', 'glue', 'missile', 'tesla'];
  for (let i = 0; i < 8 && i < spots.length; i++) {
    scene.buildTower(spots[i][0], spots[i][1], ids[i % ids.length]);
  }
  ok(scene.towers.length === 8, `построено башен: ${scene.towers.length}`);
  scene.towers[0].level = 3;
  scene.towers[0].applyLevel();

  // враги всех типов
  for (const id of Object.keys(ENEMY_DEFS)) {
    const e = createEnemy(scene, ENEMY_DEFS[id], 0, 8, {});
    scene.enemies.push(e);
  }
  // летящий снаряд каждого типа + эффекты
  const t0 = scene.towers[1];
  scene.projectiles.spawn({ type: 0, x: t0.x, y: t0.y, target: scene.enemies[0], damage: 5, speed: 400 });
  scene.projectiles.spawn({ type: 1, x: t0.x, y: t0.y, target: scene.enemies[1], damage: 40, splash: 40, speed: 200 });
  scene.projectiles.spawn({ type: 2, x: t0.x, y: t0.y, target: scene.enemies[2], slow: 0.5, slowTime: 2, speed: 260 });
  scene.projectiles.spawn({ type: 3, x: t0.x, y: t0.y, target: scene.enemies[0], damage: 5, speed: 160 });
  for (let f = 0; f <= 8; f++) scene.effects.spawn(f, { x: 200, y: 160, x2: 320, y2: 220, size: 30, size2: 80, life: 1 });
  scene.particles.burst(220, 180, { count: 40, colors: ['#fff', '#f80'], speed: [20, 120], life: [0.3, 1] });
  scene.particles.spawnText(240, 150, '+12', '#ffd23f');

  safe('кадр с боем (все типы врагов/снарядов/эффектов)', () => {
    for (let i = 0; i < 90; i++) {
      scene.update(CONFIG.FIXED_DT);
      scene.render(ctx);
    }
  });

  // выделение башни + панель + радиальное меню + hover
  safe('выделение башни и панель улучшений', () => {
    scene.selectTower(scene.towers[3]);
    scene.hud.update(0.1);
    scene.render(ctx);
    ok(!!scene.hud.panel, 'панель башни построена');
  });

  safe('радиальное меню стройки', () => {
    const s = game.camera.worldToScreen(scene.grid.centerX(2), scene.grid.centerY(2), { x: 0, y: 0 });
    scene.hud.openRadial(2, 2, s.x, s.y);
    scene.render(ctx);
    ok(scene.hud.radial.items.length === 4, `пунктов в меню: ${scene.hud.radial.items.length}`);
    // тап по иконке строит башню
    const it = scene.hud.radial.items[0];
    scene.hud.onTap(it.x, it.y);
    ok(scene.grid.towerAt(2, 2) !== null, 'тап по иконке построил башню');
  });

  safe('край экрана: меню не вылезает за границы', () => {
    scene.hud.openRadial(0, 0, 4, 4);
    const r = scene.hud.radial;
    ok(r.mx >= r.r && r.mx <= game.viewW - r.r, `центр меню внутри экрана: ${r.mx.toFixed(0)}`);
    scene.render(ctx);
    scene.hud.closeRadial();
  });

  safe('зум/панорама и hover-подсветка', () => {
    for (const z of [0.6, 1, 2, 2.6]) {
      game.camera.setUserZoom(z);
      game.camera.pan(120, -80);
      scene.onHover(game.viewW / 2, game.viewH / 2);
      scene.render(ctx);
    }
    game.camera.setUserZoom(1);
  });

  safe('состояние победы: экран Game Over', () => {
    scene.economy.leaks = 0;
    scene.waves.state = 'done';
    scene.enemies.length = 0;
    scene._finish(true);
    ok(scene.state === 'won', 'сцена перешла в won');
  });
}

section('4. Экраны меню и оверлеи');
{
  const game = makeGame();

  safe('MenuScene: enter + 60 кадров (демо-фон)', () => {
    const menu = new MenuScene(game);
    menu.enter();
    for (let i = 0; i < 60; i++) { menu.update(CONFIG.FIXED_DT); menu.render(ctx); }
    ok(menu.demoOk, 'демо-фон главного меню работает');
    // оверлеи
    menu.overlay = 'settings';
    menu.render(ctx);
    menu.overlay = 'credits';
    menu.render(ctx);
    menu.overlay = null;
    menu.exit();
  });

  safe('MapSelectScene: карточки, превью, скролл', () => {
    const ms = new MapSelectScene(game);
    ms.enter();
    for (let i = 0; i < 30; i++) { ms.update(CONFIG.FIXED_DT); ms.render(ctx); }
    ms.onDrag(-200, 0, 300, 200);
    ms.render(ctx);
    ms.onDragEnd();
    ok(ms.cards.length === MAP_ORDER.length, `карточек: ${ms.cards.length}`);
    ms.exit();
  });

  safe('PauseScene: панель и настройки', () => {
    const gs = new GameScene(game, { mapId: 'grasslands' });
    gs.enter();
    game.camera.resize(game.viewW, game.viewH, gs.worldW, gs.worldH);
    const ps = new PauseScene(game, { scene: gs });
    ps.enter();
    for (let i = 0; i < 20; i++) { ps.update(CONFIG.FIXED_DT); gs.render(ctx); ps.render(ctx); }
    ok(gs.simPaused === true, 'нижняя сцена на паузе');
    ps.exit();
    ok(gs.simPaused === false, 'пауза снята при выходе');
  });

  safe('GameOverScene: победа и поражение', () => {
    for (const won of [true, false]) {
      const go = new GameOverScene(game, {
        won, stars: won ? 3 : 0, coins: 88, wave: 20, score: 12345,
        kills: 400, leaks: won ? 0 : 20, mapId: 'grasslands'
      });
      go.enter();
      for (let i = 0; i < 90; i++) { go.update(CONFIG.FIXED_DT); go.render(ctx); }
    }
    ok(true, 'оба варианта отрисованы');
  });
}

section('5. HUD при разных размерах экрана');
{
  const sizes = [
    ['Samsung A56 ландшафт (780×360)', 780, 360],
    ['A56 с вырезом (740×360)', 740, 360],
    ['планшет 1024×768', 1024, 768],
    ['узкий 640×360', 640, 360],
    ['высокий 1280×420', 1280, 420]
  ];
  for (const [name, w, h] of sizes) {
    const game = makeGame();
    game.viewW = w; game.viewH = h;
    game.safe = { top: 8, right: 22, bottom: 8, left: 22 };
    const scene = new GameScene(game, { mapId: 'grasslands' });
    safe(`HUD ${name}`, () => {
      scene.enter();
      game.camera.resize(w, h, scene.worldW, scene.worldH);
      scene.hud.layout(w, h);
      const b = scene.hud.buttons;
      // все тач-цели не меньше 44 px и внутри экрана
      for (const k of ['money', 'lives', 'wave', 'nextWave']) {
        const r = b[k];
        if (!(r.x >= 0 && r.y >= 0 && r.x + r.w <= w + 1 && r.y + r.h <= h + 1)) {
          throw new Error(`${k} вне экрана: ${JSON.stringify(r)} при ${w}×${h}`);
        }
      }
      if (b.nextWave.h < 44) throw new Error('кнопка волны меньше 44px');
      for (let i = 0; i < 20; i++) { scene.update(CONFIG.FIXED_DT); scene.render(ctx); }
    });
    // панель башни не должна перекрывать кнопку волны и вылезать за экран
    safe(`раскладка панели башни ${name}`, () => {
      scene.economy.money = 500;
      const g = scene.grid;
      let spot = null;
      for (const idx of g.pathCells) {
        const cx = idx % g.cols, cy = (idx / g.cols) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (scene.canBuildAt(cx + dx, cy + dy)) { spot = [cx + dx, cy + dy]; break; }
        }
        if (spot) break;
      }
      if (!spot) throw new Error('нет клетки для постройки');
      scene.buildTower(spot[0], spot[1], 'gatling');
      scene.selectTower(scene.towers[0]);
      scene.hud.update(0.016);
      const tp = scene.hud.buttons.towerPanel;
      const nw = scene.hud.buttons.nextWave;
      if (tp.x < 0 || tp.x + tp.w > w + 1 || tp.y < 0 || tp.y + tp.h > h + 1) {
        throw new Error(`панель вне экрана: ${JSON.stringify({ x: tp.x, y: tp.y, w: tp.w, h: tp.h })} при ${w}×${h}`);
      }
      const overlap = !(nw.x + nw.w < tp.x || tp.x + tp.w < nw.x || nw.y + nw.h < tp.y || tp.y + tp.h < nw.y);
      if (overlap) throw new Error('панель башни перекрывает кнопку волны');
      const pb = scene.hud.panel;
      for (const k of ['upgrade', 'sell', 'target']) {
        const r = pb[k];
        if (r.w < 44 || r.h < 44) throw new Error(`кнопка ${k} меньше 44×44: ${r.w}×${r.h}`);
        if (r.x < tp.x || r.x + r.w > tp.x + tp.w + 1 || r.y + r.h > tp.y + tp.h + 1) {
          throw new Error(`кнопка ${k} вылезла из панели`);
        }
      }
      scene.render(ctx);
    });

    // масштаб карты вписан в экран
    const cam = game.camera;
    ok(cam.zoom * scene.worldW <= w + 2 && cam.zoom * scene.worldH <= h + 2,
      `${name}: карта вписана (zoom ${cam.zoom.toFixed(2)})`);
  }
}

section('6. Draw-примитивы и крайние значения');
{
  safe('Draw.button с длинными/пустыми подписями', () => {
    const cases = [
      { x: 0, y: 0, w: 40, h: 40, label: '' },
      { x: 0, y: 0, w: 300, h: 60, label: 'ОЧЕНЬ ДЛИННАЯ ПОДПИСЬ КНОПКИ', sub: 'и подзаголовок' },
      { x: 0, y: 0, w: 60, h: 60, icon: 'icon.play', enabled: false },
      { x: 0, y: 0, w: 60, h: 60, icon: 'icon.play', pressed: true, accent: true }
    ];
    for (const c of cases) Draw.button(ctx, c);
  });
  safe('Draw.bar при 0%, 50%, 100% и отрицательных значениях', () => {
    for (const v of [-1, 0, 0.5, 1, 2]) Draw.bar(ctx, 10, 10, 100, 8, v);
  });
  safe('Draw.logo и Draw.text', () => {
    Draw.logo(ctx, 200, 100, 40);
    Draw.text(ctx, 'тест', 10, 10, { size: 12, align: 'center' });
    Draw.star(ctx, 10, 10, 8, true);
    Draw.star(ctx, 30, 10, 8, false);
    Draw.panel(ctx, 0, 0, 50, 50, 10, { shadow: false });
  });
  safe('towerStats/targetLabel для всех башен и уровней', () => {
    const { towerStats, targetLabel } = hudMod;
    const game = makeGame();
    const scene = new GameScene(game, { mapId: 'grasslands' });
    scene.enter();
    let n = 0;
    for (const id of Object.keys(TOWER_DEFS)) {
      const t = createTower(scene, TOWER_DEFS[id], 1, 1);
      for (let lvl = 1; lvl <= 3; lvl++) {
        t.level = lvl;
        t.applyLevel();
        const stats = towerStats(t);
        if (!Array.isArray(stats) || stats.length < 3) throw new Error(`мало стат у ${id} L${lvl}`);
        for (const [k, v] of stats) {
          if (typeof k !== 'string' || typeof v !== 'string') throw new Error(`статы ${id} L${lvl}: не строки`);
        }
        n++;
      }
    }
    for (const m of ['first', 'last', 'strongest', 'weakest', 'closest']) {
      if (!targetLabel(m)) throw new Error('нет подписи режима ' + m);
    }
    ok(n === Object.keys(TOWER_DEFS).length * 3, `проверено комбинаций башня×уровень: ${n}`);
    void GameHud;
  });
}

/* --------------------------------- итог --------------------------------- */

console.log(`\n${'='.repeat(56)}`);
console.log(`Вызовов контекста: ${ctxCalls}`);
if (unknownCtx.size) {
  console.log('⚠ Незнакомые методы/свойства 2D-контекста:');
  for (const [k, v] of unknownCtx) console.log(`   • ${k} (${v}×)`);
} else {
  console.log('Незнакомых вызовов Canvas2D нет ✔');
}
console.log(`Пройдено: ${passed}   Провалено: ${failed}`);
if (failed) {
  console.log('\nПровалы:');
  for (const e of errors) console.log('  • ' + e);
  process.exit(1);
}
console.log('Весь код отрисовки работает без исключений ✔');
