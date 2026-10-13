/* ==========================================================================
   build.mjs — сборка «одного файла».

   Берёт ES6-модули из js/, выстраивает их в порядке зависимостей,
   срезает import/export и склеивает в один inline-скрипт вместе с CSS.
   На выходе — dist/index.html: полностью автономный файл, который
   открывается даже с file:// и работает офлайн (никаких зависимостей).

   Запуск:  node build.mjs
   ========================================================================== */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));

/** Порядок модулей = порядок зависимостей (базовые классы раньше наследников) */
const ORDER = [
  'js/utils/Constants.js',
  'js/utils/MathUtil.js',
  'js/utils/Vector2.js',
  'js/utils/SpriteSheet.js',
  'js/utils/Camera.js',
  'js/utils/Draw.js',
  'js/utils/TouchInput.js',

  'js/data/TowerData.js',
  'js/data/EnemyData.js',

  'js/systems/ParticleSystem.js',
  'js/entities/Effect.js',
  'js/entities/Projectile.js',
  'js/entities/Tower.js',
  'js/entities/towers/GatlingTower.js',
  'js/entities/towers/GlueTower.js',
  'js/entities/towers/MissileTower.js',
  'js/entities/towers/TeslaTower.js',
  'js/entities/towers/FlameTower.js',
  'js/entities/towers/LaserTower.js',
  'js/entities/towers/HiveTower.js',
  'js/entities/towers/NukeTower.js',
  'js/entities/towers/index.js',
  'js/entities/Enemy.js',
  'js/entities/enemies/Soldier.js',
  'js/entities/enemies/FastRunner.js',
  'js/entities/enemies/Motorcycle.js',
  'js/entities/enemies/Helicopter.js',
  'js/entities/enemies/HeavyArmor.js',
  'js/entities/enemies/Transport.js',
  'js/entities/enemies/Boss.js',
  'js/entities/enemies/index.js',

  'js/systems/GridSystem.js',
  'js/systems/PathfindingSystem.js',
  'js/systems/CollisionSystem.js',
  'js/systems/AudioSystem.js',
  'js/systems/SaveSystem.js',
  'js/systems/EconomySystem.js',
  'js/systems/WaveSystem.js',
  'js/systems/UpgradeSystem.js',
  'js/systems/RenderSystem.js',

  'js/maps/map_grasslands.js',
  'js/maps/map_desert.js',
  'js/maps/map_magma.js',
  'js/maps/map_city.js',
  'js/maps/MapData.js',

  'js/scenes/Scene.js',
  'js/scenes/GameHud.js',
  'js/scenes/GameOverScene.js',
  'js/scenes/PauseScene.js',
  'js/scenes/MapSelectScene.js',
  'js/scenes/MenuScene.js',
  'js/scenes/GameScene.js',

  'js/game.js',
  'js/main.js'
];

/** Убирает import/export, оставляя чистый код в одном скоупе */
function strip(src, file) {
  const out = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // import ... from '...';  (однострочный)
    if (/^\s*import\s[^;]*from\s*['"][^'"]+['"]\s*;?\s*$/.test(line)) continue;
    // import '...';  (побочный эффект — файл уже включён в бандл)
    if (/^\s*import\s*['"][^'"]+['"]\s*;?\s*$/.test(line)) continue;
    // многострочный import { a,\n b } from '...'
    if (/^\s*import\s*\{?\s*$/.test(line) || /^\s*import\s*\{[^}]*$/.test(line)) {
      while (i < lines.length && !/from\s*['"][^'"]+['"]/.test(lines[i])) i++;
      continue;
    }
    // export { a, b };
    if (/^\s*export\s*\{[^}]*\}\s*;?\s*$/.test(line)) continue;
    if (/^\s*export\s*\{[^}]*$/.test(line)) {
      while (i < lines.length && !/\}/.test(lines[i])) i++;
      continue;
    }
    // export default X;
    line = line.replace(/^(\s*)export\s+default\s+/, '$1void ');
    // export const/let/var/class/function/async function
    line = line.replace(/^(\s*)export\s+(?=(const|let|var|class|function|async)\b)/, '$1');

    if (/^\s*export\b/.test(line)) {
      throw new Error(`[${file}] неподдерживаемый export: ${line.trim()}`);
    }
    out.push(line);
  }
  return out.join('\n');
}

function build() {
  const parts = [];
  parts.push('/* FIELD DEFENSE — single-file build. Сгенерировано build.mjs, не править вручную. */');

  for (const rel of ORDER) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) throw new Error('не найден модуль: ' + rel);
    const src = readFileSync(p, 'utf8');
    parts.push(`\n/* ==== ${rel} ==== */\n` + strip(src, rel));
  }

  const js = parts.join('\n');
  const css = readFileSync(join(ROOT, 'css/style.css'), 'utf8');

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#0a0f1e">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="description" content="FIELD DEFENSE — автономная браузерная tower defense игра: весь код, графика и звук в одном HTML-файле.">
<title>FIELD DEFENSE — Tower Defense</title>
<style>
${css}
</style>
</head>
<body>
  <div id="app">
    <canvas id="game"></canvas>
    <div id="debug"></div>
    <div class="overlay" id="rotate">
      <div class="rotate-icon"></div>
      <h1>Поверните телефон</h1>
      <p>Игра рассчитана на ландшафт: так карта и сенсорное управление работают лучше всего.</p>
    </div>
    <div class="overlay visible" id="boot">
      <h1>FIELD DEFENSE</h1>
      <div class="bar"><i></i></div>
      <p>Генерация графики и звука…</p>
    </div>
  </div>
<script>
(function () {
'use strict';
${js}
})();
</script>
</body>
</html>
`;

  const distDir = join(ROOT, 'dist');
  if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });
  const outFile = join(distDir, 'index.html');
  writeFileSync(outFile, html, 'utf8');

  // проверка синтаксиса собранного скрипта
  const tmp = join(distDir, '_check.mjs');
  writeFileSync(tmp, js, 'utf8');
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  } catch (e) {
    console.error('Синтаксическая ошибка в собранном бандле:\n' + (e.stderr?.toString() || e.message));
    process.exitCode = 1;
  } finally {
    if (existsSync(tmp)) execFileSync('rm', ['-f', tmp]);
  }

  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`✔ dist/index.html — ${kb} КБ, модулей: ${ORDER.length}`);
  return resolve(outFile);
}

build();
