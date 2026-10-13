/* ==========================================================================
   main.js — точка входа.

   Порядок:
     1) ждём DOM;
     2) создаём Game (canvas, ввод, звук, сохранения);
     3) решаем вопрос с ориентацией (подсказка «поверните телефон»);
     4) запускаем цикл и убираем загрузочный экран;
     5) регистрируем service worker для офлайн-работы (если отдаёмся по http).
   ========================================================================== */

import { Game } from './game.js';

function isTouch() {
  return typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
}

function updateRotateHint() {
  const el = document.getElementById('rotate');
  if (!el) return;
  const portrait = window.innerHeight > window.innerWidth;
  // подсказка нужна только на реальном телефоне в портретной ориентации
  el.classList.toggle('visible', portrait && isTouch() && window.innerWidth < 820);
}

function boot() {
  const canvas = document.getElementById('game');
  if (!canvas) return;

  const game = new Game(canvas);
  game.init();

  // отладочная плашка: ?debug=1 или клавиша F
  const params = new URLSearchParams(location.search);
  if (params.get('debug') === '1') game.setDebug(true);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F' || e.key === 'f') game.setDebug(!game.debug);
    if (e.key === 'd') game.camera.userZoom = game.camera.userZoom; // no-op, чтобы не оптимизировалось
  });

  updateRotateHint();
  window.addEventListener('resize', updateRotateHint);
  window.addEventListener('orientationchange', () => setTimeout(updateRotateHint, 250));

  game.start();

  // прячем загрузочный экран после первого кадра
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const boot = document.getElementById('boot');
      if (boot) {
        boot.style.transition = 'opacity .35s ease';
        boot.style.opacity = '0';
        setTimeout(() => boot.classList.remove('visible'), 360);
      }
    });
  });

  // офлайн-режим (работает только при отдаче по http/https, не с file://)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* не критично */ });
    });
  }

  // удобно для отладки в консоли
  window.__game = game;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
