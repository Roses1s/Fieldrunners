/* ==========================================================================
   WaveSystem.js — система волн.

   Формат группы спавна:
     { type, count, interval, delay, entry, hpMul, armorMul, speedMul }

   Волна = 1..5 групп. Между волнами пауза (CONFIG.WAVE_BREAK_TIME) либо
   ручной вызов кнопкой «Следующая волна» с бонусом за досрочный старт.
   Каждые 10 волн — босс + эскорт. В бесконечном режиме сложность растёт
   по тем же формулам без ограничения номера волны.
   ========================================================================== */

import { CONFIG } from '../utils/Constants.js';
import { ENEMY_DEFS, WAVE_MIX } from '../data/EnemyData.js';
import { clamp, randRange, makeRng } from '../utils/MathUtil.js';

export const WAVE_STATE = {
  BREAK: 'break',       // отсчёт до следующей волны
  SPAWNING: 'spawning', // идёт спавн групп
  FIGHTING: 'fighting', // все заспавнены, ждём зачистки
  DONE: 'done'          // карта пройдена
};

export class WaveSystem {
  /**
   * @param {object} game  — контекст игры (нужен game.spawnEnemy, game.grid)
   * @param {object} mapDef
   */
  constructor(game, mapDef) {
    this.game = game;
    this.mapDef = mapDef;
    this.totalWaves = mapDef.waves || CONFIG.TOTAL_WAVES;
    this.endless = !!mapDef.endless;

    this.wave = 0;                       // номер текущей/последней запущенной волны
    this.state = WAVE_STATE.BREAK;
    this.breakTime = mapDef.firstBreak || 22;
    this.breakTimer = this.breakTime;
    this.groups = [];                    // активные группы текущей волны
    this.spawnedInWave = 0;
    this.killedInWave = 0;
    this.leakedInWave = 0;
    this.waveStartAt = 0;
    this.elapsed = 0;
    this.rng = makeRng(mapDef.seed || 12345);
    this.difficulty = mapDef.difficulty || 1;
    this.onWaveStart = null;             // колбэки
    this.onWaveCleared = null;
    this.pending = [];                   // очередь спавна {t, type, entry, ...}
  }

  get alive() { return this.game.enemies.length; }

  /** Есть ли ещё волны */
  get hasNext() { return this.endless || this.wave < this.totalWaves; }

  /** Номер следующей волны */
  get nextWave() { return this.wave + 1; }

  /** Текущая волна — боссовая? */
  isBossWave(n = this.wave) { return n > 0 && n % 10 === 0; }

  /* ------------------------- генерация состава -------------------------- */

  /**
   * Собрать состав волны n (массив групп).
   * Использует WAVE_MIX (веса по диапазонам волн) + ручные оверрайды карты.
   */
  buildWave(n) {
    const map = this.mapDef;
    // Ручной сценарий карты имеет приоритет
    if (map.waveOverrides && map.waveOverrides[n]) {
      return map.waveOverrides[n].map((g) => Object.assign({}, g));
    }

    const rng = this.rng;
    const diff = this.difficulty;
    const groups = [];

    // базовая численность растёт с волной
    let budget = (5 + n * 1.95) * diff;
    if (this.endless && n > this.totalWaves) budget *= 1 + (n - this.totalWaves) * 0.06;

    // Доступные типы на этой волне
    const pool = WAVE_MIX
      .filter(([type, w, from, to]) => n >= from && n <= to && ENEMY_DEFS[type] && w > 0)
      .filter(([type]) => !(map.banTypes || []).includes(type));

    if (!pool.length) pool.push(['soldier', 1, 1, 99]);

    // Нормируем веса
    let totalW = 0;
    for (const [, w] of pool) totalW += w;

    const groupCount = clamp(1 + Math.floor(n / 4), 1, 5);
    const perGroup = budget / groupCount;

    for (let gi = 0; gi < groupCount; gi++) {
      // выбираем тип группы «рулеткой»
      let r = rng() * totalW;
      let type = pool[0][0];
      for (const [t, w] of pool) {
        r -= w;
        if (r <= 0) { type = t; break; }
      }
      const def = ENEMY_DEFS[type];
      // «стоимость» юнита в бюджете — тяжёлые появляются реже, но пачками меньше
      const unitCost = type === 'tank' ? 5 : type === 'transport' ? 6 : type === 'copter' ? 3 : type === 'biker' ? 2.2 : 1;
      const count = clamp(Math.round(perGroup / unitCost), 1, 26);
      const entry = map.entries.length > 1 ? (gi % map.entries.length) | 0 : 0;

      groups.push({
        type,
        count,
        interval: clamp(randRange(0.34, 0.62) * (def.speed > 70 ? 1.25 : 1), 0.2, 1.2),
        delay: gi === 0 ? 0 : gi * randRange(1.6, 3.4),
        entry,
        hpMul: 1,
        armorMul: 1,
        speedMul: 1
      });
    }

    // Босс каждые 10 волн
    if (this.isBossWave(n)) {
      const bossIndex = Math.floor(n / 10);
      groups.unshift({
        type: 'boss',
        count: bossIndex,
        interval: 4.5,
        delay: 0.5,
        entry: 0,
        hpMul: bossIndex,          // HP 500 * номер босса (плюс общий скейл волны)
        armorMul: 1,
        speedMul: 1,
        isBoss: true
      });
      // эскорт к боссу
      groups.push({
        type: n >= 20 ? 'tank' : 'soldier',
        count: Math.round(6 + n * 0.6),
        interval: 0.4,
        delay: 6,
        entry: map.entries.length > 1 ? 1 : 0,
        hpMul: 1, armorMul: 1, speedMul: 1
      });
    }

    return groups;
  }

  /* ----------------------------- запуск -------------------------------- */

  /** Запустить следующую волну немедленно (кнопка «Next Wave») */
  sendNow() {
    if (this.state === WAVE_STATE.DONE) return 0;
    if (this.state !== WAVE_STATE.BREAK) return 0;
    const bonus = this.earlyBonus();
    this._startWave();
    return bonus;
  }

  /** Бонус за досрочный вызов: оставшиеся секунды * 0.5 монет */
  earlyBonus() {
    return Math.max(0, Math.floor(this.breakTimer * CONFIG.EARLY_SEND_RATIO));
  }

  _startWave() {
    this.wave++;
    this.groups = this.buildWave(this.wave);
    this.pending = [];
    this.spawnedInWave = 0;
    this.killedInWave = 0;
    this.leakedInWave = 0;
    this.waveStartAt = this.elapsed;
    this.state = WAVE_STATE.SPAWNING;

    // Разворачиваем группы в плоскую очередь спавна
    for (const gr of this.groups) {
      for (let i = 0; i < gr.count; i++) {
        this.pending.push({
          t: gr.delay + i * gr.interval,
          type: gr.type,
          entry: gr.entry | 0,
          hpMul: gr.hpMul || 1,
          armorMul: gr.armorMul || 1,
          speedMul: gr.speedMul || 1,
          isBoss: !!gr.isBoss,
          wave: this.wave
        });
      }
    }
    this.pending.sort((a, b) => a.t - b.t);
    this.spawnClock = 0;

    this.onWaveStart?.(this.wave);
  }

  /* ------------------------------ апдейт ------------------------------- */

  update(dt) {
    this.elapsed += dt;

    if (this.state === WAVE_STATE.BREAK) {
      this.breakTimer -= dt;
      if (this.breakTimer <= 0) {
        if (!this.hasNext) {
          this.state = WAVE_STATE.DONE;
          this.onWaveCleared?.(this.wave, true);
        } else {
          this._startWave();
        }
      }
      return;
    }

    if (this.state === WAVE_STATE.SPAWNING) {
      this.spawnClock += dt;
      while (this.pending.length && this.pending[0].t <= this.spawnClock) {
        const p = this.pending.shift();
        this.game.spawnEnemy(p);
        this.spawnedInWave++;
      }
      if (!this.pending.length) this.state = WAVE_STATE.FIGHTING;
    }

    if (this.state === WAVE_STATE.FIGHTING) {
      if (this.game.enemies.length === 0) {
        // волна зачищена
        this.game.onWaveCleared(this.wave);
        if (!this.hasNext) {
          this.state = WAVE_STATE.DONE;
        } else {
          this.state = WAVE_STATE.BREAK;
          this.breakTime = CONFIG.WAVE_BREAK_TIME;
          this.breakTimer = this.breakTime;
        }
      }
    }
  }

  /** Прогресс текущей волны 0..1 (для полоски в HUD) */
  progress() {
    if (this.state === WAVE_STATE.BREAK) return 0;
    const total = this.spawnedInWave + this.pending.length;
    if (!total) return 1;
    return clamp(this.killedInWave / Math.max(1, total), 0, 1);
  }

  /** Сводка для HUD */
  hudInfo() {
    return {
      wave: this.wave,
      total: this.totalWaves,
      state: this.state,
      timer: Math.max(0, this.breakTimer),
      alive: this.game.enemies.length,
      progress: this.progress(),
      boss: this.isBossWave(this.wave) || (this.state !== WAVE_STATE.BREAK && this.isBossWave(this.nextWave)),
      nextBoss: this.isBossWave(this.nextWave),
      earlyBonus: this.earlyBonus()
    };
  }

  onEnemyKilled() { this.killedInWave++; }
  onEnemyLeaked() { this.leakedInWave++; this.killedInWave++; }
}

export default WaveSystem;
