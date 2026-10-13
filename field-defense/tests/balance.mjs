/* ==========================================================================
   tests/balance.mjs — прогон полного боя «авто-игроком» без браузера.

   Бот играет по простой жадной стратегии (как новичок):
     • в перерыве тратит деньги на башни у дороги (приоритет — у поворотов,
       где враг дольше под огнём) и на апгрейды до 3 уровня;
     • вызывает волну досрочно, если деньги уже потрачены (ради бонуса);
     • ставит ракетные башни, когда появляются вертолёты.

   Показывает, проходима ли карта и где баланс «плывёт».

   Запуск: node tests/balance.mjs [карта]
   ========================================================================== */

import { setupDom } from './dom-mock.mjs';

setupDom({ width: 780, height: 360, dpr: 2 });

const { GameScene } = await import('../js/scenes/GameScene.js');
const { Camera } = await import('../js/utils/Camera.js');
const { SaveSystem } = await import('../js/systems/SaveSystem.js');
const { CONFIG } = await import('../js/utils/Constants.js');
const { TOWER_DEFS } = await import('../js/data/TowerData.js');
const { MAP_ORDER } = await import('../js/maps/MapData.js');

const MAP = process.argv[2] || 'grasslands';
const MAX_SECONDS = 40 * 60;   // ограничение прогона

function makeGame(mapId) {
  const save = new SaveSystem();
  // Имитируем нормальную прогрессию: к моменту открытия карты игрок уже
  // прошёл предыдущие и накопил звёзды, которыми открываются новые башни.
  const idx = Math.max(0, MAP_ORDER.indexOf(mapId));
  save.data.mapStars = {};
  for (let i = 0; i < idx; i++) save.data.mapStars[MAP_ORDER[i]] = 3;
  save.syncUnlocks(TOWER_DEFS);

  return {
    viewW: 780, viewH: 360, dpr: 2,
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    camera: new Camera(),
    save,
    audio: null, debug: false, debugGrid: false, time: 0,
    pushScene() {}, replaceScene() {}, popScene() { return null; },
    nextMapAfter() { return null; }, mapCountTotal() { return MAP_ORDER.length; },
    setDebug() {}
  };
}

/** Клетки текущих маршрутов от всех входов к выходу */
function routeCellSet(scene) {
  const g = scene.grid;
  const set = new Set();
  for (const e of g.entries) {
    const route = scene.path.routeFrom(g.idx(e.cx, e.cy));
    if (route) for (const idx of route) set.add(idx);
  }
  if (!set.size) for (const idx of g.pathCells) set.add(idx);
  return set;
}

/**
 * Сколько клеток текущего маршрута рядом с (cx, cy) — чем больше, тем лучше место.
 * На maze-картах даём бонус клетке прямо на маршруте: башня там не только стреляет,
 * но и заставляет врагов огибать её, удлиняя путь.
 */
function spotScore(scene, cx, cy, routeSet) {
  const g = scene.grid;
  let score = routeSet.has(g.idx(cx, cy)) ? 4 : 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (!g.inBounds(nx, ny)) continue;
      if (routeSet.has(g.idx(nx, ny))) score += (Math.abs(dx) + Math.abs(dy) <= 1) ? 3 : 1;
    }
  }
  return score;
}

function bestSpot(scene) {
  const g = scene.grid;
  const routeSet = routeCellSet(scene);
  let best = null, bs = -1;
  for (let cy = 0; cy < g.rows; cy++) {
    for (let cx = 0; cx < g.cols; cx++) {
      if (!scene.canBuildAt(cx, cy)) continue;
      const s = spotScore(scene, cx, cy, routeSet);
      if (s > bs) { bs = s; best = [cx, cy]; }
    }
  }
  return best && bs > 0 ? best : null;
}

/** Что купить на имеющиеся деньги (из фактически открытых прогрессом башен) */
function chooseTower(scene) {
  const money = scene.economy.money;
  const air = scene.enemies.some((e) => e.flying) || scene.waves.wave >= 5;
  const options = scene.availableTowers().filter((d) => d.cost <= money);
  if (!options.length) return null;
  const byId = Object.create(null);
  for (const d of options) byId[d.id] = d;

  if (air && byId.missile && Math.random() < 0.45) return byId.missile;
  if (byId.nuke && scene.waves.wave >= 8 && Math.random() < 0.16) return byId.nuke;
  if (byId.flame && Math.random() < 0.20) return byId.flame;
  if (byId.hive && Math.random() < 0.20) return byId.hive;
  if (byId.laser && Math.random() < 0.20) return byId.laser;
  if (byId.tesla && Math.random() < 0.28) return byId.tesla;
  if (byId.glue && Math.random() < 0.14) return byId.glue;
  // самая дорогая из доступных — обычно выгоднее
  return options.sort((a, b) => b.cost - a.cost)[0];
}

function botAct(scene) {
  // 1) апгрейд: если есть башни ниже 3 уровня и хватает денег
  const upgradable = scene.towers.filter((t) => t.level < 3);
  if (upgradable.length && Math.random() < 0.55) {
    const t = upgradable.sort((a, b) => b.damageDealt - a.damageDealt)[0];
    const cost = t.def.upCost[t.level - 1];
    if (scene.economy.money >= cost) {
      scene.selectTower(t);
      scene.doUpgrade();
      return;
    }
  }
  // 2) постройка
  const def = chooseTower(scene);
  const spot = bestSpot(scene);
  if (def && spot) scene.buildTower(spot[0], spot[1], def.id);
}

function run(mapId) {
  const game = makeGame(mapId);
  const scene = new GameScene(game, { mapId });
  scene.enter();
  game.camera.resize(game.viewW, game.viewH, scene.worldW, scene.worldH);

  const dt = CONFIG.FIXED_DT;
  let actedAt = -1;
  let seconds = 0;
  const t0 = Date.now();

  while (scene.state === 'playing' && seconds < MAX_SECONDS) {
    scene.update(dt);
    seconds += dt;

    // бот принимает решение 4 раза в секунду
    const slot = Math.floor(seconds * 4);
    if (slot !== actedAt) {
      actedAt = slot;
      botAct(scene);
    }

    // досрочный вызов волны, когда деньги потрачены
    if (scene.waves.state === 'break' && scene.waves.breakTimer < 6 && scene.economy.money < 20) {
      scene.sendNextWave();
    }
    // и сразу, если бот уже всё построил и долго ждёт
    if (scene.waves.state === 'break' && scene.waves.breakTimer < 1.5) scene.sendNextWave();
  }

  const ms = Date.now() - t0;
  const eco = scene.economy;
  const lvl = [0, 0, 0, 0];
  for (const t of scene.towers) lvl[t.level - 1]++;
  const dps = scene.towers.reduce((a, t) => a + (t.dpsRef || 0), 0);

  console.log(`\n=== ${mapId} ===`);
  console.log(`  итог            : ${scene.state === 'won' ? 'ПОБЕДА' : scene.state === 'lost' ? 'ПОРАЖЕНИЕ' : 'таймаут'}`);
  console.log(`  волна           : ${scene.waves.wave} / ${scene.waves.totalWaves}`);
  console.log(`  жизни           : ${eco.lives}/${eco.maxLives}   протечек: ${eco.leaks}`);
  console.log(`  убийств         : ${eco.kills}   заработано: $${Math.round(eco.earned)}   потрачено: $${Math.round(eco.spent)}`);
  console.log(`  башен           : ${scene.towers.length}  (L1 ${lvl[0]}, L2 ${lvl[1]}, L3 ${lvl[2]})  суммарный DPS ≈ ${Math.round(dps)}`);
  console.log(`  очки            : ${Math.round(eco.score)}`);
  console.log(`  звёзды          : ${scene.result?.stars ?? '-'}`);
  console.log(`  время прогона   : ${(seconds).toFixed(0)} с игрового времени за ${ms} мс реального`);

  // контроль: HP врагов на последней волне vs DPS защиты
  const lastWave = scene.waves.wave;
  const hpScale = Math.pow(CONFIG.HP_SCALE_PER_WAVE, lastWave - 1);
  console.log(`  скейл HP на волне ${lastWave}: ×${hpScale.toFixed(2)}`);

  return scene;
}

for (const id of (process.argv[2] ? [process.argv[2]] : MAP_ORDER)) {
  run(id);
}
