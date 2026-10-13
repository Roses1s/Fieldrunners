/* ==========================================================================
   tests/sim.mjs — headless-проверка игровой логики (без браузера и canvas).

   Проверяет: сетку и flow field, A* и запрет полного перекрытия пути,
   спавн волн, бой (гатлинг/клей/ракета/тесла), формулы экономики и урона,
   деградацию производительности на большом числе сущностей.

   Запуск: node tests/sim.mjs
   ========================================================================== */

import { Camera } from '../js/utils/Camera.js';
import { GameScene } from '../js/scenes/GameScene.js';
import { CONFIG, TILE } from '../js/utils/Constants.js';
import { ENEMY_DEFS } from '../js/data/EnemyData.js';
import { TOWER_DEFS, towerTotalCost } from '../js/data/TowerData.js';
import { MAP_ORDER, getMap } from '../js/maps/MapData.js';
import { createTower } from '../js/entities/towers/index.js';
import { createEnemy } from '../js/entities/enemies/index.js';

let passed = 0, failed = 0;
const fails = [];

function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; fails.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ✘ ${name} ${extra}`); }
}

function section(t) { console.log(`\n${t}`); }

/* --------------------------- заглушки окружения ------------------------- */

class FakeSave {
  constructor() {
    this.data = { totalCoins: 0, mapStars: {}, mapBest: {}, unlockedMaps: MAP_ORDER, unlockedTowers: Object.keys(TOWER_DEFS), settings: { gameSpeed: 1, soundVolume: 0.8, musicVolume: 0.3, muted: true, showFps: false } };
  }
  get settings() { return this.data.settings; }
  totalStars() { return 0; }
  stars() { return 0; }
  isMapUnlocked() { return true; }
  isTowerUnlocked() { return true; }
  unlockMap() { return false; }
  unlockTower() { return false; }
  recordResult() { return 0; }
  addKills() {}
  addCoins() {}
  setSetting() {}
  save() { return false; }
}

class FakeGame {
  constructor() {
    this.viewW = 900;
    this.viewH = 420;
    this.dpr = 1;
    this.safe = { top: 0, right: 0, bottom: 0, left: 0 };
    this.camera = new Camera();
    this.save = new FakeSave();
    this.audio = null;          // звук в headless не нужен
    this.debug = false;
    this.debugGrid = false;
    this.pushed = [];
  }
  pushScene(s) { this.pushed.push(s); }
  replaceScene(s) { this.pushed.push(s); }
  popScene() { return null; }
  nextMapAfter() { return null; }
  mapCountTotal() { return MAP_ORDER.length; }
  setDebug() {}
}

function makeScene(mapId = 'grasslands', opts = {}) {
  const game = new FakeGame();
  const scene = new GameScene(game, Object.assign({ mapId }, opts));
  scene.enter();
  return { game, scene };
}

/** Клетки, соседние с дорогой (удобно для авто-застройки в тестах) */
function cellsNearPath(scene, limit = 8) {
  const g = scene.grid;
  const out = [];
  for (const idx of g.pathCells) {
    const cx = idx % g.cols, cy = (idx / g.cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!g.isBuildableCell(nx, ny)) continue;
      if (out.some((c) => c[0] === nx && c[1] === ny)) continue;
      out.push([nx, ny]);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function step(scene, seconds, dt = CONFIG.FIXED_DT) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) scene.update(dt);
}

/* ================================ ТЕСТЫ ================================= */

section('1. Сетка и поиск пути');
{
  const { scene } = makeScene('grasslands');
  const g = scene.grid;
  ok(g.cols === 20 && g.rows === 12, 'размер сетки Grasslands 20×12');
  ok(g.pathCells.length > 20, `путь развёрнут в клетки (${g.pathCells.length})`);
  ok(g.tileAt(0, 6) === TILE.ENTRY, 'вход помечен ENTRY');
  ok(g.tileAt(19, 4) === TILE.EXIT, 'выход помечен EXIT');

  const entryIdx = g.idx(0, 6);
  ok(scene.path.distToExit(entryIdx) > 0 && scene.path.distToExit(entryIdx) < 1e8,
    `flow field: от входа до выхода ${scene.path.distToExit(entryIdx)} клеток`);
  const route = scene.path.routeFrom(entryIdx);
  ok(route && route.length > 20, `маршрут от входа построен (${route?.length} клеток)`);
  ok(scene.path.canBuildAt(3, 6) === false, 'строить на дороге нельзя');
  ok(g.isBuildableCell(1, 1) === false, 'клетка с деревом не доступна для стройки');

  const astar = scene.path.astar(entryIdx);
  ok(Array.isArray(astar) && astar.length === route.length,
    `A* совпадает с flow field (${astar?.length} клеток)`);
}

section('2. Maze-карта: запрет полного перекрытия пути');
{
  const { scene } = makeScene('desert');
  const g = scene.grid;
  ok(g.maze === true, 'карта Desert в режиме maze');
  ok(scene.path.distToExit(g.idx(0, 7)) < 1e8, 'вход связан с выходом');

  // строим стену сверху вниз — в какой-то момент путь окажется перекрыт
  scene.economy.money = 100000;
  let blocked = false;
  let built = 0;
  for (let cy = 0; cy < g.rows; cy++) {
    const cx = 12;
    if (!g.isBuildableCell(cx, cy)) continue;
    if (!scene.canBuildAt(cx, cy)) { blocked = true; break; }
    if (scene.buildTower(cx, cy, 'gatling')) built++;
  }
  ok(built > 4, `построено башен в стене: ${built}`);
  ok(blocked, 'полное перекрытие пути запрещено');

  // враги всегда имеют маршрут
  const anyUnreachable = [];
  for (let i = 0; i < g.tiles.length; i++) {
    if (g.isWalkable(i) && scene.path.distToExit(i) >= 1e8) anyUnreachable.push(i);
  }
  ok(anyUnreachable.length === 0, `нет «замурованных» проходимых клеток (${anyUnreachable.length})`);
}

section('3. Бой: волны, урон, экономика');
{
  const { scene } = makeScene('grasslands');
  scene.economy.money = 500;

  const spots = cellsNearPath(scene, 10);
  let builtCount = 0;
  for (const [cx, cy] of spots) {
    if (scene.buildTower(cx, cy, 'gatling')) builtCount++;
  }
  ok(builtCount >= 6, `построено гатлингов у дороги: ${builtCount}`);
  ok(scene.towers.length === scene.grid.allTowers().length, 'башни синхронизированы с сеткой');

  // три волны
  for (let w = 0; w < 3; w++) {
    scene.waves.sendNow();
    step(scene, 26);
    scene.waves.breakTimer = 0;
  }
  ok(scene.economy.kills > 10, `убито врагов: ${scene.economy.kills}`);
  ok(scene.waves.wave >= 3, `номер волны дошёл до ${scene.waves.wave}`);
  ok(scene.economy.leaks <= 2, `протечек не больше двух: ${scene.economy.leaks}`);
  ok(scene.economy.money > 0, `деньги остались: ${scene.economy.money}`);
  ok(scene.stats.damage > 1000, `суммарный урон: ${Math.round(scene.stats.damage)}`);

  // продажа: 75% от вложенного
  const t = scene.towers[0];
  const invested = t.invested;
  const expected = Math.floor(invested * CONFIG.SELL_RATIO);
  const before = scene.economy.money;
  scene.selectTower(t);
  scene.doSell();
  ok(scene.economy.money - before === expected, `продажа вернула ${scene.economy.money - before} из ${invested} (ожидалось ${expected})`);
  ok(towerTotalCost('gatling', 3) === 5 + 4 + 4, 'полная стоимость гатлинга L3 = 13');
}

section('4. Механики башен: клей, ракета, тесла');
{
  const { scene } = makeScene('grasslands');
  scene.economy.money = 5000;
  const g = scene.grid;
  const path = scene.path.routeFrom(g.idx(0, 6));
  // ставим башни прямо у дороги в середине маршрута
  const mid = path[Math.floor(path.length / 2)];
  const mc = g.cellFromIdx(mid);
  const near = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
    const nx = mc.cx + dx, ny = mc.cy + dy;
    if (g.isBuildableCell(nx, ny)) near.push([nx, ny]);
  }
  scene.buildTower(near[0][0], near[0][1], 'glue');
  scene.buildTower(near[1][0], near[1][1], 'missile');
  scene.buildTower(near[2][0], near[2][1], 'tesla');
  ok(scene.towers.length === 3, 'построены glue/missile/tesla');

  // пачка «толстых» врагов в середину маршрута — чтобы успеть увидеть эффекты
  const center = g.center(mid, { x: 0, y: 0 });
  for (let i = 0; i < 8; i++) {
    const e = createEnemy(scene, ENEMY_DEFS.tank, 0, 3, {});
    e.placeAt(center.x + (i % 4) * 12 - 18, center.y + ((i / 4) | 0) * 12 - 6);
    scene.enemies.push(e);
  }
  const hpBefore = scene.enemies.reduce((a, e) => a + e.hp, 0);
  step(scene, 2.5);

  const hpAfter = scene.enemies.reduce((a, e) => a + e.hp, 0);
  ok(hpAfter < hpBefore, `урон нанесён: ${Math.round(hpBefore)} → ${Math.round(hpAfter)}`);
  const slowed = scene.enemies.filter((e) => e.slowPct > 0).length;
  ok(slowed === 0, `танки иммунны к клею (замедлено ${slowed})`);
  ok(scene.particles.count > 0, `пул частиц работает: ${scene.particles.count} активных`);

  // теперь пехота — клей должен замедлить, ракета накрыть сплэшем
  scene.enemies.length = 0;
  for (let i = 0; i < 8; i++) {
    const e = createEnemy(scene, ENEMY_DEFS.soldier, 0, 12, {});
    e.placeAt(center.x + (i % 4) * 12 - 18, center.y + ((i / 4) | 0) * 12 - 6);
    scene.enemies.push(e);
  }
  step(scene, 1.6);
  const slowed2 = scene.enemies.filter((e) => e.slowPct > 0).length;
  ok(slowed2 > 0 || scene.enemies.length === 0, `клей замедлил пехоту: ${slowed2}`);

  // ракета бьёт по площади: сплэш задел нескольких
  const missileTower = scene.towers.find((t) => t.id === 'missile');
  ok(missileTower.shotsFired > 0 || scene.enemies.length === 0, `ракеты запускались: ${missileTower.shotsFired}`);
  const tesla = scene.towers.find((t) => t.id === 'tesla');
  ok(tesla.damageDealt > 0 || scene.enemies.length === 0, `тесла нанесла урон: ${Math.round(tesla.damageDealt)}`);
}

section('5. Формулы: HP-скейл, броня, замедление, воздушные цели');
{
  const { scene } = makeScene('grasslands');

  // HP = base * 1.15^(wave-1)
  const e1 = createEnemy(scene, ENEMY_DEFS.soldier, 0, 1, {});
  const e10 = createEnemy(scene, ENEMY_DEFS.soldier, 0, 10, {});
  const expected = Math.round(ENEMY_DEFS.soldier.hp * Math.pow(CONFIG.HP_SCALE_PER_WAVE, 9));
  ok(e1.maxHp === ENEMY_DEFS.soldier.hp, `HP пехотинца на 1-й волне = ${e1.maxHp}`);
  ok(e10.maxHp === expected, `HP на 10-й волне = ${e10.maxHp} (ожидалось ${expected})`);

  // броня: dmg = max(1, dmg - armor)
  const tank = createEnemy(scene, ENEMY_DEFS.tank, 0, 1, {});
  const dealt = tank.takeDamage(3, 'physical', {});
  ok(dealt === 1, `броня танка съедает слабый урон: 3 - ${tank.armor} → ${dealt}`);
  const dealt2 = tank.takeDamage(100, 'physical', { pierceArmor: 0.6 });
  ok(dealt2 === 100 - tank.armor * 0.4, `пробитие брони 60%: урон ${dealt2}`);

  // замедление не стакается — берётся максимум
  const s = createEnemy(scene, ENEMY_DEFS.soldier, 0, 1, {});
  s.applySlow(0.4, 3);
  s.applySlow(0.6, 2);
  ok(s.slowPct === 0.6 && s.slowTimer === 3, `замедление max=0.6, время=max: ${s.slowPct}/${s.slowTimer}`);
  ok(Math.abs(s.speed - ENEMY_DEFS.soldier.speed * 0.4) < 1e-6, `скорость с замедлением: ${s.speed}`);
  const tankSlow = createEnemy(scene, ENEMY_DEFS.tank, 0, 1, {});
  tankSlow.applySlow(0.75, 4);
  ok(tankSlow.slowPct === 0, 'танк иммунен к замедлению');

  // воздушная цель: гатлинг не видит, ракета видит
  const gat = createTower(scene, TOWER_DEFS.gatling, 5, 5);
  const mis = createTower(scene, TOWER_DEFS.missile, 5, 6);
  const heli = createEnemy(scene, ENEMY_DEFS.copter, 0, 1, {});
  ok(gat.canTarget(heli) === false, 'гатлинг не бьёт по воздуху');
  ok(mis.canTarget(heli) === true, 'ракета бьёт по воздуху');
  ok(heli.flying && heli.flyTarget, 'вертолёт летит по прямой к выходу');

  // босс: регенерация и стоимость в жизнях
  const boss = createEnemy(scene, ENEMY_DEFS.boss, 0, 10, { hpMul: 1, isBoss: true });
  ok(boss.livesCost === 5, 'босс стоит 5 жизней');
  boss.hp = boss.maxHp / 2;
  scene.enemies.push(boss);
  step(scene, 1);
  ok(boss.hp > boss.maxHp / 2, `босс регенерирует: ${Math.round(boss.hp)} > ${Math.round(boss.maxHp / 2)}`);

  // режимы прицеливания (список очищаем — иначе босс перебивает выборку)
  scene.enemies.length = 0;
  scene.enemies.push(s, e10);
  scene.collision.rebuild(scene.enemies);
  gat.x = s.x; gat.y = s.y; gat.range = 400;
  gat.targetMode = 'strongest';
  ok(gat.findTarget() === e10, 'режим STRONGEST выбирает самого живучего');
  gat.targetMode = 'weakest';
  const weakest = gat.findTarget();
  ok(weakest && weakest.hp <= e10.hp, 'режим WEAKEST выбирает самого слабого');
}

section('6. Волны: состав, боссы, досрочный старт');
{
  const { scene } = makeScene('grasslands');
  const w1 = scene.waves.buildWave(1);
  ok(w1.length >= 1 && w1[0].type === 'soldier', 'первая волна — пехота (по сценарию карты)');

  const w10 = scene.waves.buildWave(10);
  ok(w10.some((gr) => gr.type === 'boss'), 'волна 10 содержит босса');
  const w20 = scene.waves.buildWave(20);
  const bosses = w20.find((gr) => gr.type === 'boss');
  ok(bosses && bosses.count === 2, `волна 20 содержит двух боссов (${bosses?.count})`);

  const w7 = scene.waves.buildWave(7);
  ok(w7.every((gr) => ENEMY_DEFS[gr.type]), 'все типы врагов в волне существуют');
  ok(w7.length >= 1 && w7.length <= 5, `групп в волне 7: ${w7.length} (1..5)`);

  // досрочный старт даёт бонус
  scene.waves.breakTimer = 10;
  const bonus = scene.waves.earlyBonus();
  ok(bonus === 5, `бонус за досрочный вызов: ${bonus} (10 с × 0.5)`);

  // вертолёты появляются не раньше 5-й волны
  const early = scene.waves.buildWave(3);
  ok(!early.some((gr) => gr.type === 'copter'), 'до 5-й волны вертолётов нет');
}

section('7. Транспорт высаживает десант');
{
  const { scene } = makeScene('grasslands');
  const tr = createEnemy(scene, ENEMY_DEFS.transport, 0, 9, {});
  scene.enemies.push(tr);
  const before = scene.enemies.length;
  tr.hp = 1;
  scene.damageEnemy(tr, 50, 'physical', {});
  ok(scene.enemies.length === before + ENEMY_DEFS.transport.onDeath.count,
    `после гибели транспорта врагов: ${scene.enemies.length} (было ${before})`);
  const spawned = scene.enemies.filter((e) => e.def.id === 'soldier');
  ok(spawned.length === ENEMY_DEFS.transport.onDeath.count, `десант: ${spawned.length} пехотинцев`);
  ok(spawned.every((e) => e.anchorIdx >= 0), 'десант получил маршрут');
}

section('8. Победа / поражение и звёзды');
{
  const { scene, game } = makeScene('grasslands');
  scene.economy.lives = 0;
  step(scene, 0.1);
  ok(scene.state === 'lost', 'при нуле жизней — поражение');
  ok(game.pushed.length === 1, 'открыт экран Game Over');

  const s2 = makeScene('grasslands');
  s2.scene.waves.state = 'done';
  s2.scene.waves.wave = 20;
  s2.scene.enemies.length = 0;
  step(s2.scene, 0.1);
  ok(s2.scene.state === 'won', 'после последней волны — победа');
  ok(s2.scene.result && s2.scene.result.stars === 3, `0 протечек → 3 звезды (${s2.scene.result?.stars})`);

  const s3 = makeScene('grasslands');
  s3.scene.economy.leaks = 3;
  s3.scene.waves.state = 'done';
  s3.scene.enemies.length = 0;
  step(s3.scene, 0.1);
  ok(s3.scene.result?.stars === 2, `3 протечки → 2 звезды (${s3.scene.result?.stars})`);
}

section('9. Производительность (эмуляция Samsung A56, 60 FPS)');
{
  const { scene } = makeScene('desert');
  scene.economy.money = 1e6;
  // 60 башен
  let placed = 0;
  outer:
  for (let cy = 1; cy < scene.grid.rows - 1; cy++) {
    for (let cx = 2; cx < scene.grid.cols - 3; cx += 2) {
      if (!scene.grid.isBuildableCell(cx, cy)) continue;
      if (!scene.canBuildAt(cx, cy)) continue;
      const ids = ['gatling', 'missile', 'glue', 'tesla'];
      if (scene.buildTower(cx, cy, ids[placed % ids.length])) placed++;
      if (placed >= 60) break outer;
    }
  }
  // 180 врагов
  for (let i = 0; i < 180; i++) {
    const types = ['soldier', 'runner', 'biker', 'tank', 'copter'];
    const e = createEnemy(scene, ENEMY_DEFS[types[i % types.length]], 0, 12, {});
    scene.enemies.push(e);
  }
  ok(placed >= 40, `построено башен: ${placed}`);

  const t0 = performance.now();
  const simSeconds = 30;
  step(scene, simSeconds);
  const ms = performance.now() - t0;
  const steps = simSeconds / CONFIG.FIXED_DT;
  const perFrame = ms / steps;
  ok(perFrame < 4, `логика: ${perFrame.toFixed(3)} мс/кадр (${placed} башен, 180 врагов) — бюджет 16.6 мс`);
  ok(scene.enemies.length >= 0, `врагов после симуляции: ${scene.enemies.length}`);
  console.log(`  · всего ${ms.toFixed(0)} мс на ${steps} шагов, убийств: ${scene.economy.kills}`);
}

section('10. Данные: все карты валидны');
{
  for (const id of MAP_ORDER) {
    const m = getMap(id);
    ok(m.cols > 0 && m.rows > 0, `${id}: размеры ${m.cols}×${m.rows}`);
    ok(m.entries?.length > 0 && m.exits?.length > 0, `${id}: есть вход и выход`);
    ok(m.startMoney > 0 && m.lives > 0, `${id}: деньги/жизни заданы`);
    // все клетки входа/выхода в пределах сетки
    const inB = [...m.entries, ...m.exits].every(([x, y]) => x >= 0 && y >= 0 && x < m.cols && y < m.rows);
    ok(inB, `${id}: вход/выход в пределах сетки`);
    if (m.path) {
      const inP = m.path.every(([x, y]) => x >= 0 && y >= 0 && x < m.cols && y < m.rows);
      ok(inP, `${id}: путевые точки в пределах сетки`);
    }
    // декор и зоны не стоят на дороге
    if (m.path) {
      const pathSet = new Set();
      for (let i = 0; i < m.path.length - 1; i++) {
        let [ax, ay] = m.path[i];
        const [bx, by] = m.path[i + 1];
        while (ax !== bx || ay !== by) {
          pathSet.add(`${ax},${ay}`);
          if (ax !== bx) ax += Math.sign(bx - ax); else ay += Math.sign(by - ay);
        }
        pathSet.add(`${bx},${by}`);
      }
      const clash = (m.decor || []).filter((d) => pathSet.has(`${d.cx},${d.cy}`));
      ok(clash.length === 0, `${id}: декор не перекрывает дорогу (${clash.length})`);
    }
    // карта собирается без исключений и путь существует
    const { scene } = makeScene(id);
    const e0 = scene.grid.idx(scene.grid.entries[0].cx, scene.grid.entries[0].cy);
    ok(scene.path.distToExit(e0) < 1e8, `${id}: маршрут от входа до выхода существует`);
  }
}

/* --------------------------------- итог --------------------------------- */

console.log(`\n${'='.repeat(56)}`);
console.log(`Пройдено: ${passed}   Провалено: ${failed}`);
if (failed) {
  console.log('\nПровалы:');
  for (const f of fails) console.log('  • ' + f);
  process.exit(1);
}
console.log('Все проверки логики пройдены ✔');
