# Fieldrunners

Репозиторий с браузерной tower-defense игрой в духе классических мобильных TD
(оригинальный проект: своя графика, свои названия, свои карты).

## Что внутри

**[`field-defense/`](field-defense/)** — играбельный прототип «Field Defense».

- HTML5 Canvas + vanilla JS (ES6-модули), **ноль внешних зависимостей**: ни npm-пакетов,
  ни CDN, ни файлов изображений и звука.
- Вся графика генерируется кодом (`SpriteSheet.js`), весь звук синтезируется Web Audio API.
- Mobile first: Samsung Galaxy A56 (6.7", 1080×2340, 120 Гц), ландшафт, управление пальцем,
  safe-area, `devicePixelRatio`, блокировка ориентации.
- Работает офлайн: service worker + единый собранный файл `dist/index.html`, открывающийся с `file://`.

Содержание: 4 карты (фиксированные маршруты, maze, карта с двумя входами и финальный
городской maze), 8 башен × 3 уровня (Gatling, Glue, Missile, Tesla, Пиро, Лазер, Улей и
Ядерная мортира), 7 типов врагов (пехота, бегун, мотоцикл, вертолёт, бронетехника,
транспорт с десантом, босс), 20 волн + бесконечный режим, экономика, жизни, звёзды,
разблокировка башен за суммарные звёзды, пауза, скорость ×1/×2/×3, радиальное меню
постройки, улучшение/продажа, режимы прицеливания, частицы и эффекты, сохранение
прогресса в LocalStorage.

## Быстрый старт

```bash
cd field-defense
node tools/serve.mjs 8080     # дев-сервер, открыть http://localhost:8080/
node build.mjs                # собрать единый офлайн-файл dist/index.html
```

## Тесты

Тесты идут на чистом Node (v22) без зависимостей — собственные моки DOM и Canvas2D
гоняют реальный код игры:

```bash
cd field-defense
npm test                      # build + sim + render + boot + bundle (212 проверок)
node tests/sim.mjs            # 99 проверок логики (сетка, A*, волны, экономика, урон, новые башни)
node tests/render.mjs         # 61 проверка отрисовки (спрайты, фон, HUD на 5 экранах)
node tests/boot.mjs           # 35 интеграционных (загрузка, ввод, полный игровой цикл)
node tests/bundle.mjs         # 17 проверок: собранный dist/index.html реально стартует
node tests/balance.mjs        # бот-автоигрок: прогон 20 волн на всех 4 картах
```

Итог: **212/212 проверок зелёные**, симуляция ~0.15 мс/кадр при 60 башнях и 180 врагах.

Подробности — в [`field-defense/README.md`](field-defense/README.md): архитектура, управление,
таблицы баланса и список мест, где крутить сложность.

## Структура репозитория

```
field-defense/
├── index.html          точка входа (модульная версия для дев-сервера)
├── css/style.css       оверлеи загрузки, «поверните телефон», debug-панель
├── js/
│   ├── game.js         ядро: стек сцен, фиксированный шаг 1/60, FPS
│   ├── main.js         boot: canvas, ввод, safe-area, регистрация SW
│   ├── scenes/         Menu, MapSelect, Game, Pause, GameOver, GameHud
│   ├── entities/       Tower, Enemy, Projectile, Effect + towers/, enemies/
│   ├── systems/        Grid, Pathfinding, Wave, Economy, Upgrade, Collision,
│   │                   Particle, Audio, Save, Render
│   ├── maps/           данные карт (сетки, пути, декор)
│   ├── data/           балансные числа башен и врагов
│   └── utils/          Constants, MathUtil, Vector2, SpriteSheet, Camera, TouchInput, Draw
├── sw.js               service worker (офлайн-кэш)
├── build.mjs           сборщик единого dist/index.html
├── tools/serve.mjs     статический dev-сервер на 0.0.0.0
├── tests/              симуляция, рендер, интеграция, баланс
└── dist/index.html     собранный самодостаточный файл
```

Комментарии в коде — на русском языке.
