/* ==========================================================================
   SaveSystem.js — сохранение прогресса в localStorage.

   Структура:
   {
     v: 1,
     unlockedMaps: ['grasslands', ...],
     mapStars:  { grasslands: 3, ... },
     mapBest:   { grasslands: { wave: 20, score: 12345 } },
     totalCoins: 120,
     totalKills: 4321,
     unlockedTowers: ['gatling','glue','missile','tesla'],
     settings: { soundVolume, musicVolume, gameSpeed, muted, showFps }
   }
   Всё обёрнуто в try/catch: в приватном режиме браузеров хранилище
   может быть недоступно — игра при этом остаётся играбельной.
   ========================================================================== */

import { SAVE_KEY } from '../utils/Constants.js';

const DEFAULTS = () => ({
  v: 1,
  unlockedMaps: ['grasslands'],
  mapStars: {},
  mapBest: {},
  totalCoins: 0,
  totalKills: 0,
  unlockedTowers: ['gatling', 'glue', 'missile'],
  settings: {
    soundVolume: 0.8,
    musicVolume: 0.35,
    gameSpeed: 1,
    muted: false,
    showFps: false
  }
});

export class SaveSystem {
  constructor() {
    this.data = DEFAULTS();
    this.available = true;
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return this.data;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return this.data;
      const d = DEFAULTS();
      // аккуратное слияние, чтобы старая/битая запись не ломала игру
      this.data = {
        v: d.v,
        unlockedMaps: Array.isArray(parsed.unlockedMaps) && parsed.unlockedMaps.length
          ? parsed.unlockedMaps : d.unlockedMaps,
        mapStars: (parsed.mapStars && typeof parsed.mapStars === 'object') ? parsed.mapStars : {},
        mapBest: (parsed.mapBest && typeof parsed.mapBest === 'object') ? parsed.mapBest : {},
        totalCoins: Number(parsed.totalCoins) || 0,
        totalKills: Number(parsed.totalKills) || 0,
        unlockedTowers: Array.isArray(parsed.unlockedTowers) && parsed.unlockedTowers.length
          ? parsed.unlockedTowers : d.unlockedTowers,
        settings: Object.assign({}, d.settings, parsed.settings || {})
      };
      return this.data;
    } catch (e) {
      this.available = false;
      return this.data;
    }
  }

  save() {
    if (!this.available) return false;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
      return true;
    } catch (e) {
      this.available = false;
      return false;
    }
  }

  reset() {
    this.data = DEFAULTS();
    this.save();
  }

  /* ------------------------------ карты -------------------------------- */

  isMapUnlocked(id) { return this.data.unlockedMaps.includes(id); }

  unlockMap(id) {
    if (!this.data.unlockedMaps.includes(id)) {
      this.data.unlockedMaps.push(id);
      this.save();
      return true;
    }
    return false;
  }

  stars(id) { return this.data.mapStars[id] || 0; }
  totalStars() {
    return Object.values(this.data.mapStars).reduce((a, b) => a + b, 0);
  }

  /** Записать результат: звёзды только улучшаются, рекорд — максимум */
  recordResult(id, stars, wave, score, coins) {
    const prev = this.data.mapStars[id] || 0;
    if (stars > prev) this.data.mapStars[id] = stars;
    const b = this.data.mapBest[id] || { wave: 0, score: 0 };
    this.data.mapBest[id] = {
      wave: Math.max(b.wave || 0, wave || 0),
      score: Math.max(b.score || 0, score || 0)
    };
    if (coins > 0) this.data.totalCoins += coins;
    this.save();
    return this.data.mapStars[id];
  }

  addKills(n) {
    this.data.totalKills += n;
    this.save();
  }

  /* ------------------------------ башни -------------------------------- */

  isTowerUnlocked(id) { return this.data.unlockedTowers.includes(id); }

  /**
   * Синхронизация разблокировок: открыть все башни, чей порог по звёздам достигнут.
   * Вызывается при загрузке сохранения и после каждой записи результата, поэтому
   * игрок получает башню сразу, как только накопил звёзды (без отдельного экрана магазина).
   * Возвращает список только что открытых id — им можно показать тост.
   */
  syncUnlocks(defs) {
    const stars = this.totalStars();
    const fresh = [];
    for (const id of Object.keys(defs)) {
      const d = defs[id];
      const need = d.unlock || 0;
      if (need <= 0) continue;
      if (stars < need) continue;
      if (this.data.unlockedTowers.includes(id)) continue;
      this.data.unlockedTowers.push(id);
      fresh.push(id);
    }
    if (fresh.length) this.save();
    return fresh;
  }

  unlockTower(id) {
    if (!this.data.unlockedTowers.includes(id)) {
      this.data.unlockedTowers.push(id);
      this.save();
      return true;
    }
    return false;
  }

  /* ----------------------------- настройки ------------------------------ */

  get settings() { return this.data.settings; }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
  }

  addCoins(n) {
    this.data.totalCoins = Math.max(0, this.data.totalCoins + n);
    this.save();
  }
}

export default SaveSystem;
