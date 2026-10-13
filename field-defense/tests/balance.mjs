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

function makeGame() {
  return {
    viewW: 780, viewH: 360, dpr: 2,
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    camera: new Camera(),
    save: new SaveSystem(),
    audio: null, debug: false, debugGrid: false, time: 0,
    pushScene() {}, replaceScene() {}, popScene() { return null; },
    nextMapAfter() { return null; }, mapCountTotal() { return MAP_ORDER.length; },
    setDebug() {}
  };
}

/** Сколько клеток дороги рядом с (cx, cy) — чем больше, тем лучше место */
function spotScore(scene, cx, cy) {
  const g = scene.grid;
  let score = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const t = g.tileAt(cx + dx, cy + dy);
      if (t === 1 || t === 4 || t === 5) score += (Math.abs(dx) + Math.abs(dy) <= 1) ? 3 : 1;
    }
  }
  return score;
}

function bestSpot(scene) {
  const g = scene.grid;
  let best = null, bs = -1;
  for (let cy = 0; cy < g.rows; cy++) {
    for (let cx = 0; cx < g.cols; cx++) {
      if (!scene.canBuildAt(cx, cy)) continue;
      const s = spotScore(scene, cx, cy);
      if (s > bs) { bs = s; best = [cx, cy]; }
    }
  }
  return best && bs > 0 ? best : null;
}

/** Что купить на имеющиеся деньги */
function chooseTower(scene) {
  const money = scene.economy.money;
  const air = scene.enemies.some((e) => e.flying) || scene.waves.wave >= 5;
  const options = ['gatling', 'glue', 'missile', 'tesla']
    .map((id) => TOWER_DEFS[id])
    .filter((d) => scene.isTowerAvailable(d.id) && d.cost <= money);
  if (!options.length) return null;
  if (air && money >= TOWER_DEFS.missile.cost && Math.random() < 0.55) return TOWER_DEFS.missile;
  if (money >= TOWER_DEFS.tesla.cost && Math.random() < 0.45) return TOWER_DEFS.tesla;
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
  const game = makeGame();
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
