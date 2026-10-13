/* ==========================================================================
   tests/bundle.mjs — smoke-проверка собранного dist/index.html.

   Зачем: модульные тесты не заметят, если новый файл забыли добавить в ORDER
   сборщика. Здесь мы берём именно единый офлайн-файл, достаём из него inline
   script, запускаем его в DOM/Canvas-моке и убеждаемся, что игра реально
   стартует (а не только проходит синтаксическую проверку node --check).

   Перед запуском нужен свежий бандл: node build.mjs
   ========================================================================== */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupDom, stats } from './dom-mock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist', 'index.html');

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.log(`  ✘ ${name} ${extra}`); }
}

console.log('\nСобранный single-file бандл: запуск в headless-окружении');
ok(existsSync(DIST), 'dist/index.html существует (перед тестом: node build.mjs)');
if (!existsSync(DIST)) {
  console.log(`\nПройдено: ${passed}   Провалено: ${failed}`);
  process.exit(1);
}

const html = readFileSync(DIST, 'utf8');
ok(!/<script[^>]+type="module"/.test(html), 'в бандле нет ES-module script (иначе file:// не заработает)');
ok(!/^\s*import\s/m.test(html) && !/^\s*export\s/m.test(html), 'в бандле не осталось import/export');

const m = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
ok(!!m, 'inline script найден в dist/index.html');
if (!m) process.exit(1);

for (const name of ['Зелёная долина', 'Песчаный карьер', 'Расколотый кратер', 'Мёртвый город']) {
  ok(html.includes(name), `карта в бандле: ${name}`);
}
for (const name of ['Пиро', 'Лазер', 'Связка', 'Улей', 'Усилитель', 'Ядерная']) {
  ok(html.includes(name), `башня в бандле: ${name}`);
}

const env = setupDom({ width: 780, height: 360, dpr: 2, coarsePointer: true });
let game = null;
try {
  // Запускаем бандл как обычный браузерный скрипт в текущем глобальном окружении.
  eval(m[1]);
  game = globalThis.window.__game || null;
  ok(!!game, 'бандл создал window.__game');
} catch (e) {
  ok(false, 'бандл запускается без исключений', `→ ${e.message}`);
}

if (game) {
  try {
    env.runFrames(90, 16.7);
    ok(true, '90 кадров бандла без исключений');
    ok(!!game.topScene, `первая сцена активна: ${game.topScene?.constructor?.name || 'unknown'}`);
    ok(stats.ctxCalls > 1000, `Canvas2D вызовов из бандла: ${stats.ctxCalls}`);
    ok(stats.unknownCtx.size === 0, 'незнакомых методов Canvas2D нет');
  } catch (e) {
    ok(false, '90 кадров бандла без исключений', `→ ${e.message}`);
  }
}

console.log('\n========================================================');
console.log(`Пройдено: ${passed}   Провалено: ${failed}`);
if (failed) process.exit(1);
console.log('Собранный dist/index.html реально стартует ✔');
