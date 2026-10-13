/* ==========================================================================
   MapData.js — реестр карт и порядок их открытия.
   Карта N открывается после прохождения карты N-1 (хотя бы 1 звезда).
   ========================================================================== */

import { map_grasslands } from './map_grasslands.js';
import { map_desert } from './map_desert.js';

/** Порядок карт в меню выбора */
export const MAP_ORDER = ['grasslands', 'desert'];

export const MAPS = {
  grasslands: map_grasslands,
  desert: map_desert
};

export function getMap(id) {
  return MAPS[id] || MAPS[MAP_ORDER[0]];
}

/** Карта, которая открывается после указанной (или null) */
export function nextMapId(id) {
  const i = MAP_ORDER.indexOf(id);
  if (i < 0 || i >= MAP_ORDER.length - 1) return null;
  return MAP_ORDER[i + 1];
}

/** Сколько всего карт */
export function mapCount() { return MAP_ORDER.length; }

export default { MAPS, MAP_ORDER, getMap, nextMapId, mapCount };
