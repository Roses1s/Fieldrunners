/* ==========================================================================
   tests/boot.mjs — проверка настоящего пути запуска и ввода:
   main.js-логика → Game → стек сцен → TouchInput → тапы по экрану.

   Всё на заглушках DOM из dom-mock.mjs: canvas создаётся, кадры
   requestAnimationFrame проигрываются вручную, «пальцы» — синтетические
   pointer-события. Так ловятся ошибки, которые в браузере выглядели бы
   как чёрный экран.

   Запуск: node tests/boot.mjs
   ========================================================================== */

import { setupDom, dispatch, dispatchGlobal, stats, makeContext2D } from './dom-mock.mjs';

const env = setupDom({ width: 780, height: 360, dpr: 2.6 });

const { Game } = await import('../js/game.js');
const { GameScene } = await import('../js/scenes/GameScene.js');
const { MenuScene } = await import('../js/scenes/MenuScene.js');
const { MapSelectScene } = await import('../js/scenes/MapSelectScene.js');
const { PauseScene } = await import('../js/scenes/PauseScene.js');
const { CONFIG } = await import('../js/utils/Constants.js');

let passed = 0, failed = 0;
const errors = [];

function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; errors.push(name); console.log(`  ✘ ${name} ${extra}`); }
}
function section(t) { console.log(`\n${t}`); }

/** Живые тапы разделены во времени: иначе TouchInput честно считает их дабл-тапом */
const settle = () => new Promise((r) => setTimeout(r, 330));
function safe(name, fn) {
  try { fn(); ok(true, name); return true; }
  catch (e) { ok(false, name, `→ ${e.message}\n     ${(e.stack || '').split('\n')[1] || ''}`); return false; }
}

/* ================================ ТЕСТЫ ================================= */

section('1. Загрузка: Game.init() и первые кадры');
let G;
safe('Game.init() + старт цикла', () => {
  G = new Game(env.gameCanvas);
  G.init();
  G.start();
  env.runFrames(10);
  if (!(G.topScene instanceof MenuScene)) throw new Error('стартовая сцена не MenuScene');
});
ok(stats.ctxCalls > 1000, `за 10 кадров сделано ${stats.ctxCalls} вызовов контекста`);
ok(G.dpr === CONFIG.MAX_DPR, `DPR ограничен до ${G.dpr} (у A56 было 2.6)`);
ok(G.viewW === 780 && G.viewH === 360, `размер вьюпорта ${G.viewW}×${G.viewH}`);

section('2. Ввод: тап по меню ведёт на выбор карты');
safe('тап по кнопке «ИГРАТЬ»', () => {
  const b = G.topScene.buttons.play;
  dispatch(env.gameCanvas, 'pointerdown', { clientX: b.x + b.w / 2, clientY: b.y + b.h / 2, pointerId: 1 });
  dispatch(env.gameCanvas, 'pointerup', { clientX: b.x + b.w / 2, clientY: b.y + b.h / 2, pointerId: 1 });
  env.runFrames(2);
  if (!(G.topScene instanceof MapSelectScene)) throw new Error('сцена не сменилась на MapSelectScene');
});

safe('тап по «ИГРАТЬ» на карте → бой', () => {
  const ms = G.topScene;
  const b = ms.playBtn;
  dispatch(env.gameCanvas, 'pointerdown', { clientX: b.x + b.w / 2, clientY: b.y + b.h / 2, pointerId: 1 });
  dispatch(env.gameCanvas, 'pointerup', { clientX: b.x + b.w / 2, clientY: b.y + b.h / 2, pointerId: 1 });
  env.runFrames(2);
  if (!(G.topScene instanceof GameScene)) throw new Error('не запустилась игровая сцена');
});

section('3. Бой: тапы строят башню через радиальное меню');
const scene = G.topScene;
safe('200 кадров боя без исключений', () => {
  scene.economy.money = 500;
  env.runFrames(200);
});
ok(scene.waves.wave === 0, `до старта первой волны идёт отсчёт (${scene.waves.wave})`);
ok(scene.waves.state === 'break' && scene.waves.breakTimer > 0, 'сцена в состоянии перерыва');

// запускаем первую волну и ждём её
safe('первая волна приходит и враги доходят до башен', () => {
  scene.waves.breakTimer = 0.2;
  env.runFrames(60 * 12);
  if (scene.waves.wave < 1) throw new Error('волна не стартовала');
});
ok(scene.waves.wave >= 1, `волна запустилась: ${scene.waves.wave}`);

/** Тап по мировой клетке: переводим мировые координаты в экранные */
async function tapCell(cx, cy) {
  await settle();
  const s = scene.camera.worldToScreen(scene.grid.centerX(cx), scene.grid.centerY(cy), { x: 0, y: 0 });
  dispatch(env.gameCanvas, 'pointerdown', { clientX: s.x, clientY: s.y, pointerId: 1 });
  dispatch(env.gameCanvas, 'pointerup', { clientX: s.x, clientY: s.y, pointerId: 1 });
  env.runFrames(1);
  return s;
}

let buildCell = null;
await (async () => {
  try {
  // ищем клетку рядом с дорогой, где точно можно строить
  const g = scene.grid;
  outer:
  for (const idx of g.pathCells) {
    const cx = idx % g.cols, cy = (idx / g.cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!scene.canBuildAt(nx, ny)) continue;
      const s = await tapCell(nx, ny);
      // клетка должна быть на экране
      if (s.x < 4 || s.y < 4 || s.x > G.viewW - 4 || s.y > G.viewH - 4) continue;
      if (!scene.hud.radial) continue;
      buildCell = [nx, ny];
      break outer;
    }
  }
    if (!buildCell) throw new Error('не нашли клетку для тапа на экране');
    ok(scene.hud.radial.items.length === 4, `в меню ${scene.hud.radial.items.length} башни`);
    ok(true, 'тап по свободной клетке открывает радиальное меню');
  } catch (e) {
    ok(false, 'тап по свободной клетке открывает радиальное меню', `→ ${e.message}`);
  }
})();

await (async () => {
  try {
    const before = scene.towers.length;
    const it = scene.hud.radial.items.find((i) => i.def.id === 'gatling');
    dispatch(env.gameCanvas, 'pointerdown', { clientX: it.x, clientY: it.y, pointerId: 1 });
    dispatch(env.gameCanvas, 'pointerup', { clientX: it.x, clientY: it.y, pointerId: 1 });
    env.runFrames(2);
    if (scene.towers.length !== before + 1) throw new Error('башня не построилась');
    if (scene.hud.radial) throw new Error('меню не закрылось после постройки');
    ok(true, 'тап по иконке гатлинга строит башню');
  } catch (e) { ok(false, 'тап по иконке гатлинга строит башню', `→ ${e.message}`); }
})();

await (async () => {
  try {
    scene.economy.money = 500;
    // быстрый тап-тап по свободной клетке = мгновенная постройка последней башни
    const g = scene.grid;
    let spot = null;
    for (const idx of g.pathCells) {
      const cx = idx % g.cols, cy = (idx / g.cols) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (scene.canBuildAt(cx + dx, cy + dy)) { spot = [cx + dx, cy + dy]; break; }
      }
      if (spot) break;
    }
    await settle();
    const s = scene.camera.worldToScreen(scene.grid.centerX(spot[0]), scene.grid.centerY(spot[1]), { x: 0, y: 0 });
    for (let i = 0; i < 2; i++) {
      dispatch(env.gameCanvas, 'pointerdown', { clientX: s.x, clientY: s.y, pointerId: 1 });
      dispatch(env.gameCanvas, 'pointerup', { clientX: s.x, clientY: s.y, pointerId: 1 });
    }
    env.runFrames(2);
    if (!scene.grid.towerAt(spot[0], spot[1])) throw new Error('дабл-тап не построил башню');
    if (scene.hud.radial) throw new Error('после дабл-тапа меню должно остаться закрытым');
    ok(true, 'дабл-тап строит башню мгновенно (без меню)');
  } catch (e) { ok(false, 'дабл-тап строит башню мгновенно (без меню)', `→ ${e.message}`); }
})();

await (async () => {
  try {
    const t = scene.towers[0];
    await tapCell(t.cx, t.cy);
    if (scene.selectedTower !== t) throw new Error('башня не выделилась');
    env.runFrames(1);
    if (!scene.hud.panel) throw new Error('панель не появилась');
    ok(true, 'тап по башне открывает панель улучшения');
  } catch (e) { ok(false, 'тап по башне открывает панель улучшения', `→ ${e.message}`); }
})();

safe('кнопка «УЛУЧШИТЬ» повышает уровень', () => {
  scene.economy.money = 500;
  scene.hud.update(0.016);
  const b = scene.hud.panel.upgrade;
  const lvl = scene.selectedTower.level;
  dispatch(env.gameCanvas, 'pointerdown', { clientX: b.x + b.w / 2, clientY: b.y + b.h / 2, pointerId: 1 });
  dispatch(env.gameCanvas, 'pointerup', { clientX: b.x + b.w / 2, clientY: b.y + b.h / 2, pointerId: 1 });
  env.runFrames(1);
  if (scene.selectedTower.level !== lvl + 1) throw new Error('уровень не повысился');
});

safe('кнопка «ПРОДАТЬ» возвращает 75%', () => {
  const t = scene.selectedTower;
  const money = scene.economy.money;
  const expect = Math.floor(t.invested * CONFIG.SELL_RATIO);
  scene.hud.update(0.016);
  const b = scene.hud.panel.sell;
  dispatch(env.gameCanvas, 'pointerdown', { clientX: b.x + b.w / 2, clientY: b.y + b.h / 2, pointerId: 1 });
  dispatch(env.gameCanvas, 'pointerup', { clientX: b.x + b.w / 2, clientY: b.y + b.h / 2, pointerId: 1 });
  env.runFrames(1);
  if (scene.economy.money !== money + expect) throw new Error(`вернулось ${scene.economy.money - money} вместо ${expect}`);
  if (scene.towers.includes(t)) throw new Error('башня не удалена');
});

section('4. Жесты: драг панорамирует, pinch зумит');
safe('drag двигает камеру', () => {
  const cam = scene.camera;
  cam.setUserZoom(2);
  const x0 = cam.x, y0 = cam.y;
  dispatch(env.gameCanvas, 'pointerdown', { clientX: 400, clientY: 200, pointerId: 1 });
  dispatch(env.gameCanvas, 'pointermove', { clientX: 380, clientY: 190, pointerId: 1 });
  dispatch(env.gameCanvas, 'pointermove', { clientX: 340, clientY: 170, pointerId: 1 });
  dispatch(env.gameCanvas, 'pointerup', { clientX: 340, clientY: 170, pointerId: 1 });
  env.runFrames(1);
  if (cam.x === x0 && cam.y === y0) throw new Error('камера не сдвинулась');
  // за пределы карты не уезжаем
  if (cam.x < -1 || cam.y < -1) throw new Error('камера вышла за границы');
  cam.setUserZoom(1);
});

safe('pinch двумя пальцами меняет зум', () => {
  const cam = scene.camera;
  const z0 = cam.zoom;
  dispatch(env.gameCanvas, 'pointerdown', { clientX: 300, clientY: 180, pointerId: 1 });
  dispatch(env.gameCanvas, 'pointerdown', { clientX: 400, clientY: 180, pointerId: 2 });
  dispatch(env.gameCanvas, 'pointermove', { clientX: 260, clientY: 180, pointerId: 1 });
  dispatch(env.gameCanvas, 'pointermove', { clientX: 440, clientY: 180, pointerId: 2 });
  dispatch(env.gameCanvas, 'pointerup', { clientX: 260, clientY: 180, pointerId: 1 });
  dispatch(env.gameCanvas, 'pointerup', { clientX: 440, clientY: 180, pointerId: 2 });
  env.runFrames(1);
  if (Math.abs(cam.zoom - z0) < 1e-6) throw new Error('зум не изменился');
  if (cam.zoom < z0) throw new Error('разведение пальцев должно приближать');
  cam.setUserZoom(1);
});

safe('колесо мыши тоже зумит (десктоп)', () => {
  const cam = scene.camera;
  const z0 = cam.zoom;
  dispatch(env.gameCanvas, 'wheel', { clientX: 390, clientY: 180, deltaY: -120 });
  env.runFrames(1);
  if (cam.zoom <= z0) throw new Error('колесо не приблизило');
  cam.setUserZoom(1);
});

section('5. Кнопки HUD: волна, скорость, пауза');
await settle();
safe('кнопка «СЛЕДУЮЩАЯ ВОЛНА»', () => {
  scene.waves.state = 'break';
  scene.waves.breakTimer = 12;
  const w0 = scene.waves.wave;
  const b = scene.hud.buttons.nextWave;
  dispatch(env.gameCanvas, 'pointerdown', { clientX: b.x + b.w / 2, clientY: b.y + b.h / 2, pointerId: 1 });
  dispatch(env.gameCanvas, 'pointerup', { clientX: b.x + b.w / 2, clientY: b.y + b.h / 2, pointerId: 1 });
  env.runFrames(1);
  if (scene.waves.wave !== w0 + 1) throw new Error('волна не стартовала');
});

await settle();
safe('переключение скорости x1 → x2 → x3 → x1', () => {
  const seq = [];
  const b = scene.hud.buttons.speed;
  for (let i = 0; i < 3; i++) {
    dispatch(env.gameCanvas, 'pointerdown', { clientX: b.x + b.r2, clientY: b.y + b.r2, pointerId: 1 });
    dispatch(env.gameCanvas, 'pointerup', { clientX: b.x + b.r2, clientY: b.y + b.r2, pointerId: 1 });
    env.runFrames(1);
    seq.push(scene.gameSpeed);
  }
  if (seq.join(',') !== '2,3,1') throw new Error('последовательность: ' + seq.join(','));
});

await settle();
safe('кнопка паузы открывает PauseScene и замораживает симуляцию', () => {
  const b = scene.hud.buttons.pause;
  dispatch(env.gameCanvas, 'pointerdown', { clientX: b.x + b.r2, clientY: b.y + b.r2, pointerId: 1 });
  dispatch(env.gameCanvas, 'pointerup', { clientX: b.x + b.r2, clientY: b.y + b.r2, pointerId: 1 });
  env.runFrames(1);
  if (!(G.topScene instanceof PauseScene)) throw new Error('пауза не открылась');
  const t0 = scene.time;
  const kills0 = scene.economy.kills;
  env.runFrames(60);
  if (scene.time !== t0) throw new Error('симуляция не заморожена');
  void kills0;
});

await settle();
safe('«ПРОДОЛЖИТЬ» возвращает в бой', () => {
  const p = G.topScene;
  const b = p.buttons.resume;
  dispatch(env.gameCanvas, 'pointerdown', { clientX: b.x + b.w / 2, clientY: b.y + b.h / 2, pointerId: 1 });
  dispatch(env.gameCanvas, 'pointerup', { clientX: b.x + b.w / 2, clientY: b.y + b.h / 2, pointerId: 1 });
  env.runFrames(1);
  if (G.topScene !== scene) throw new Error('не вернулись в игровую сцену');
  const t0 = scene.time;
  env.runFrames(30);
  if (scene.time === t0) throw new Error('симуляция не возобновилась');
});

section('6. Сворачивание вкладки ставит бой на паузу');
safe('visibilitychange → авто-пауза', () => {
  Object.defineProperty(globalThis.document, 'hidden', { value: true, configurable: true });
  dispatchGlobal('document', 'visibilitychange', {});
  env.runFrames(5);
  if (!(G.topScene instanceof PauseScene)) throw new Error('авто-пауза не сработала');
  Object.defineProperty(globalThis.document, 'hidden', { value: false, configurable: true });
  dispatchGlobal('document', 'visibilitychange', {});
  env.runFrames(2);
  if (G.paused) throw new Error('игра не снята с паузы после возврата');
  // игрок нажимает «Продолжить»
  const b = G.topScene.buttons.resume;
  dispatch(env.gameCanvas, 'pointerdown', { clientX: b.x + b.w / 2, clientY: b.y + b.h / 2, pointerId: 1 });
  dispatch(env.gameCanvas, 'pointerup', { clientX: b.x + b.w / 2, clientY: b.y + b.h / 2, pointerId: 1 });
  env.runFrames(1);
  if (G.topScene !== scene) throw new Error('не вернулись в бой после авто-паузы');
});

section('7. Смена ориентации/размера окна');
safe('resize пересчитывает камеру и HUD', () => {
  globalThis.window.innerWidth = 360;
  globalThis.window.innerHeight = 780;
  dispatchGlobal('window', 'resize', {});
  env.runFrames(3);
  if (G.viewW !== 360 || G.viewH !== 780) throw new Error('размер не обновился');
  const nw = scene.hud.buttons.nextWave;
  if (nw.x < 0 || nw.x + nw.w > 361) {
    throw new Error('кнопка волны вылезла за экран в портрете');
  }
  globalThis.window.innerWidth = 780;
  globalThis.window.innerHeight = 360;
  dispatchGlobal('window', 'resize', {});
  env.runFrames(3);
});

section('8. Долгий бой: 60 секунд на скорости x3');
safe('стабильность на длинной дистанции', () => {
  scene.gameSpeed = 3;
  scene.speed = 3;
  scene.economy.money = 100000;
  // достраиваем защиту
  const g = scene.grid;
  let built = 0;
  for (const idx of g.pathCells) {
    const cx = idx % g.cols, cy = (idx / g.cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!scene.canBuildAt(cx + dx, cy + dy)) continue;
      if (scene.buildTower(cx + dx, cy + dy, ['gatling', 'missile', 'glue', 'tesla'][built % 4])) built++;
      if (built >= 16) break;
    }
    if (built >= 16) break;
  }
  const t0 = Date.now();
  env.runFrames(60 * 60 / 3);   // 60 секунд игры по 3 шага на кадр
  const ms = Date.now() - t0;
  ok(scene.waves.wave >= 2, `волн пройдено за прогон: ${scene.waves.wave}`);
  ok(scene.economy.kills > 0, `убийств: ${scene.economy.kills}`);
  ok(ms < 20000, `время прогона: ${ms} мс`);
  console.log(`  · башен ${scene.towers.length}, врагов ${scene.enemies.length}, снарядов ${scene.projectiles.count}, частиц ${scene.particles.count}`);
});

section('9. Память: пулы не растут бесконечно');
ok(scene.projectiles.pool.length === CONFIG.PROJECTILE_POOL, 'пул снарядов фиксирован');
ok(scene.particles.x.length === CONFIG.PARTICLE_POOL, 'пул частиц фиксирован');
ok(scene.effects.pool.length === CONFIG.EFFECT_POOL, 'пул эффектов фиксирован');
ok(scene.enemies.length < 400, `врагов в памяти: ${scene.enemies.length}`);

/* --------------------------------- итог --------------------------------- */

console.log(`\n${'='.repeat(56)}`);
console.log(`Вызовов контекста: ${stats.ctxCalls}, событий ввода: ${stats.eventsDispatched}`);
if (stats.unknownCtx.size) {
  console.log('⚠ Незнакомые вызовы Canvas2D:');
  for (const [k, v] of stats.unknownCtx) console.log(`   • ${k} (${v}×)`);
}
console.log(`Пройдено: ${passed}   Провалено: ${failed}`);
if (failed) {
  console.log('\nПровалы:');
  for (const e of errors) console.log('  • ' + e);
  process.exit(1);
}
console.log('Загрузка, ввод и весь игровой цикл работают ✔');
