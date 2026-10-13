/* ==========================================================================
   AudioSystem.js — весь звук синтезируется Web Audio API.
   Никаких аудиофайлов: осцилляторы + буфер белого шума + фильтры + огибающие.

   Особенности:
     • AudioContext создаётся лениво после первого жеста (требование iOS/Android)
     • лимитер (DynamicsCompressor) спасает от клиппинга при десятках голосов
     • voice cap + минимальный интервал повтора — пулемёт из 10 башен не рвёт звук
     • процедурная музыка: секвенсор с lookahead-планированием
   ========================================================================== */

import { clamp, randRange, pick } from '../utils/MathUtil.js';

const VOICE_CAP = 26;              // максимум одновременно звучащих голосов
const MIN_INTERVAL = {             // сек между повторами одного и того же звука
  shot: 0.028, missile: 0.06, zap: 0.05, glue: 0.07, flame: 0.09,
  laser: 0.12, bee: 0.1, kill: 0.03, explosion: 0.05
};

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.enabled = true;
    this.sfxVolume = 0.8;
    this.musicVolume = 0.35;
    this.muted = false;
    this.voices = 0;
    this._last = {};             // время последнего проигрывания по именам
    this._noise = null;
    this.music = { playing: false, step: 0, nextTime: 0, bpm: 92 };
  }

  /* ----------------------------- инициализация -------------------------- */

  /** Вызывать из обработчика пользовательского жеста */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (e) {
      this.enabled = false;
      return;
    }

    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 1;

    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 8;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;

    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.musicVolume;

    this.sfxBus.connect(this.comp);
    this.musicBus.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(c.destination);

    // буфер белого шума (1 с) — переиспользуется всеми шумовыми эффектами
    const len = Math.floor(c.sampleRate * 1);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;

    this.ready = true;
    if (c.state === 'suspended') c.resume();
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  setVolumes(sfx, music) {
    this.sfxVolume = clamp(sfx, 0, 1);
    this.musicVolume = clamp(music, 0, 1);
    if (this.ready) {
      this.sfxBus.gain.setTargetAtTime(this.sfxVolume, this.t, 0.02);
      this.musicBus.gain.setTargetAtTime(this.musicVolume, this.t, 0.05);
    }
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.ready) this.master.gain.setTargetAtTime(m ? 0 : 1, this.t, 0.03);
  }

  /* ------------------------------- базовые ------------------------------ */

  _ok(name, priority = 1) {
    if (!this.ready || !this.enabled || this.muted) return false;
    const now = this.t;
    const min = MIN_INTERVAL[name] || 0;
    if (min && this._last[name] !== undefined && now - this._last[name] < min) return false;
    if (this.voices > VOICE_CAP && priority < 2) return false;
    this._last[name] = now;
    return true;
  }

  _track(node, dur) {
    this.voices++;
    const stop = () => { this.voices = Math.max(0, this.voices - 1); };
    setTimeout(stop, dur * 1000 + 30);
    return node;
  }

  _tone(o) {
    // o: {type, f0, f1, t, dur, gain, bus, attack, curve}
    const c = this.ctx;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    const t0 = o.t ?? this.t;
    const dur = o.dur ?? 0.2;
    osc.frequency.setValueAtTime(Math.max(1, o.f0), t0);
    if (o.f1 !== undefined && o.f1 !== o.f0) {
      if (o.exp !== false) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + dur);
      else osc.frequency.linearRampToValueAtTime(Math.max(1, o.f1), t0 + dur);
    }
    const peak = o.gain ?? 0.25;
    const atk = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = o.filter;
      f.frequency.value = o.fc ?? 1000;
      f.Q.value = o.q ?? 1;
      g.connect(f);
      f.connect(o.bus || this.sfxBus);
    } else {
      g.connect(o.bus || this.sfxBus);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    this._track(osc, dur);
    return osc;
  }

  _noiseHit(o) {
    // o: {t, dur, gain, filter, fc, q, fc1, sweep, bus}
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    src.playbackRate.value = o.rate ?? 1;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    const t0 = o.t ?? this.t;
    const dur = o.dur ?? 0.15;
    f.frequency.setValueAtTime(o.fc ?? 1200, t0);
    if (o.fc1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.fc1), t0 + dur);
    f.Q.value = o.q ?? 1;
    const g = c.createGain();
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(o.bus || this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    this._track(src, dur);
    return src;
  }

  /* ------------------------------- звуки -------------------------------- */

  play(name, opts = {}) {
    if (!this._ok(name, opts.priority || 1)) return;
    const fn = SFX[name];
    if (fn) fn(this, opts);
  }

  /* ------------------------------- музыка ------------------------------- */

  startMusic() {
    if (!this.ready || this.music.playing) return;
    this.music.playing = true;
    this.music.nextTime = this.t + 0.1;
    this.music.step = 0;
  }

  stopMusic() { this.music.playing = false; }

  /** Планируем ноты вперёд (вызывается из игрового цикла) */
  updateMusic(intense = 0) {
    if (!this.ready || !this.music.playing) return;
    const spb = 60 / this.music.bpm / 2; // восьмые
    const lookahead = 0.35;
    while (this.music.nextTime < this.t + lookahead) {
      this._scheduleStep(this.music.step, this.music.nextTime, intense);
      this.music.step = (this.music.step + 1) % 32;
      this.music.nextTime += spb;
    }
  }

  _scheduleStep(step, t, intense) {
    // Аккордовая прогрессия: Am – F – C – G (по 8 восьмых)
    const prog = [
      [220.0, 261.63, 329.63],  // Am
      [174.61, 220.0, 261.63],  // F
      [196.0, 246.94, 293.66],  // G (переставлено для плавности)
      [164.81, 196.0, 261.63]   // C/E
    ];
    const bar = (step >> 3) % 4;
    const s = step % 8;
    const chord = prog[bar];

    // пад: один раз в такт
    if (s === 0) {
      for (const f of chord) {
        this._tone({
          type: 'triangle', f0: f, f1: f, t, dur: 60 / this.music.bpm * 1.9,
          gain: 0.045 + intense * 0.012, attack: 0.35, bus: this.musicBus,
          filter: 'lowpass', fc: 900 + intense * 500, q: 0.6
        });
      }
    }
    // бас
    if (s === 0 || s === 3 || s === 6) {
      this._tone({
        type: 'sine', f0: chord[0] / 2, t, dur: 0.24,
        gain: 0.11 + intense * 0.03, bus: this.musicBus, attack: 0.008
      });
    }
    // лёгкий хэт на напряжённых волнах
    if (intense > 0.3 && (s % 2 === 1)) {
      this._noiseHit({
        t, dur: 0.045, gain: 0.028 * intense, filter: 'highpass',
        fc: 7000, bus: this.musicBus
      });
    }
    // редкая мелодическая нота
    if (s === 4 && Math.random() < 0.55) {
      const f = pick(chord) * 2;
      this._tone({
        type: 'square', f0: f, t: t + 0.01, dur: 0.16,
        gain: 0.022, bus: this.musicBus, filter: 'lowpass', fc: 2200, q: 0.7
      });
    }
  }
}

/* ============================ БИБЛИОТЕКА SFX ============================ */

const SFX = {
  // Пулемёт: короткий шумовой выстрел + щелчок
  shot(a, o) {
    const t = a.t + (o.delay || 0);
    a._noiseHit({ t, dur: 0.055, gain: 0.16, filter: 'bandpass', fc: randRange(1500, 2400), fc1: 700, q: 1.4 });
    a._tone({ type: 'square', f0: randRange(320, 420), f1: 90, t, dur: 0.045, gain: 0.06 });
  },

  // Ракета: свист с возрастающим тоном + шум двигателя
  missile(a, o) {
    const t = a.t + (o.delay || 0);
    a._tone({ type: 'sawtooth', f0: 300, f1: 1500, t, dur: 0.45, gain: 0.07, filter: 'bandpass', fc: 1400, q: 2 });
    a._noiseHit({ t, dur: 0.4, gain: 0.08, filter: 'highpass', fc: 900, fc1: 2600 });
  },

  // Взрыв: низкий boom + шумовой удар
  explosion(a, o) {
    const t = a.t + (o.delay || 0);
    const big = o.big ? 1.6 : 1;
    a._tone({ type: 'sine', f0: 150 * big, f1: 32, t, dur: 0.5 * big, gain: 0.42 });
    a._noiseHit({ t, dur: 0.4 * big, gain: 0.3, filter: 'lowpass', fc: 2400, fc1: 180, q: 0.8 });
    a._noiseHit({ t: t + 0.02, dur: 0.16, gain: 0.14, filter: 'highpass', fc: 3000 });
  },

  // Ядерный взрыв: глубоко и долго
  nuke(a) {
    const t = a.t;
    a._tone({ type: 'sine', f0: 90, f1: 22, t, dur: 1.6, gain: 0.6 });
    a._noiseHit({ t, dur: 1.4, gain: 0.4, filter: 'lowpass', fc: 3000, fc1: 90, q: 0.6 });
    a._tone({ type: 'sawtooth', f0: 400, f1: 60, t: t + 0.05, dur: 0.8, gain: 0.12, filter: 'lowpass', fc: 900 });
  },

  // Электрический разряд: высокочастотный треск
  zap(a, o) {
    const t = a.t + (o.delay || 0);
    for (let i = 0; i < 3; i++) {
      a._noiseHit({
        t: t + i * 0.022, dur: 0.05, gain: 0.16,
        filter: 'bandpass', fc: randRange(2600, 5200), q: 6
      });
    }
    a._tone({ type: 'square', f0: randRange(900, 1400), f1: randRange(220, 420), t, dur: 0.14, gain: 0.09 });
  },

  // Клей: «чпок» с падающим тоном
  glue(a) {
    const t = a.t;
    a._tone({ type: 'sine', f0: 520, f1: 130, t, dur: 0.2, gain: 0.16 });
    a._noiseHit({ t, dur: 0.12, gain: 0.08, filter: 'lowpass', fc: 900, fc1: 300 });
  },

  // Огнемёт: шипение фильтрованного шума
  flame(a) {
    const t = a.t;
    a._noiseHit({ t, dur: 0.34, gain: 0.14, filter: 'bandpass', fc: 700, fc1: 1800, q: 0.7 });
    a._tone({ type: 'sawtooth', f0: 90, f1: 60, t, dur: 0.3, gain: 0.05, filter: 'lowpass', fc: 400 });
  },

  // Лазер: непрерывный нарастающий тон
  laser(a) {
    const t = a.t;
    a._tone({ type: 'sawtooth', f0: 780, f1: 1250, t, dur: 0.22, gain: 0.07, filter: 'bandpass', fc: 1600, q: 3 });
  },

  // Пчёлы: жужжание
  bee(a) {
    const t = a.t;
    a._tone({ type: 'sawtooth', f0: randRange(180, 240), f1: randRange(150, 210), t, dur: 0.5, gain: 0.05, filter: 'bandpass', fc: 900, q: 4 });
    a._noiseHit({ t, dur: 0.45, gain: 0.03, filter: 'bandpass', fc: 2200, q: 8 });
  },

  // Постройка: механический звук с нарастающим тоном
  build(a) {
    const t = a.t;
    a._noiseHit({ t, dur: 0.09, gain: 0.18, filter: 'bandpass', fc: 400, fc1: 2200, q: 2 });
    a._tone({ type: 'square', f0: 180, f1: 620, t: t + 0.03, dur: 0.2, gain: 0.1 });
    a._tone({ type: 'triangle', f0: 620, f1: 930, t: t + 0.2, dur: 0.16, gain: 0.09 });
  },

  // Апгрейд: восходящий «динь»
  upgrade(a) {
    const t = a.t;
    [523, 659, 784, 1046].forEach((f, i) => {
      a._tone({ type: 'triangle', f0: f, t: t + i * 0.06, dur: 0.22, gain: 0.13 });
    });
  },

  // Продажа: звон монет
  sell(a) {
    const t = a.t;
    for (let i = 0; i < 5; i++) {
      a._tone({
        type: 'sine', f0: randRange(1500, 2600), t: t + i * 0.045,
        dur: 0.13, gain: 0.09
      });
    }
  },

  // Смерть врага: короткий pop
  kill(a, o) {
    const t = a.t + (o.delay || 0);
    a._tone({ type: 'triangle', f0: o.big ? 240 : randRange(420, 620), f1: o.big ? 60 : 120, t, dur: o.big ? 0.3 : 0.1, gain: o.big ? 0.3 : 0.12 });
    a._noiseHit({ t, dur: 0.08, gain: 0.09, filter: 'lowpass', fc: 1800, fc1: 400 });
  },

  // Потеря жизни: тревожный низкий тон
  leak(a) {
    const t = a.t;
    a._tone({ type: 'sawtooth', f0: 190, f1: 96, t, dur: 0.5, gain: 0.24, filter: 'lowpass', fc: 700, q: 3 });
    a._tone({ type: 'square', f0: 143, f1: 72, t: t + 0.06, dur: 0.5, gain: 0.14 });
  },

  // Клик интерфейса
  ui(a) {
    const t = a.t;
    a._tone({ type: 'sine', f0: 880, f1: 660, t, dur: 0.06, gain: 0.09 });
    a._noiseHit({ t, dur: 0.02, gain: 0.04, filter: 'highpass', fc: 3000 });
  },

  // Ошибка / нельзя построить
  deny(a) {
    const t = a.t;
    a._tone({ type: 'square', f0: 200, f1: 120, t, dur: 0.16, gain: 0.14, filter: 'lowpass', fc: 900 });
  },

  // Начало волны: горн
  horn(a) {
    const t = a.t;
    const notes = [294, 392, 494];
    notes.forEach((f, i) => {
      a._tone({ type: 'sawtooth', f0: f, t: t + i * 0.13, dur: 0.42, gain: 0.13, filter: 'lowpass', fc: 1400, q: 1.2 });
      a._tone({ type: 'triangle', f0: f * 2, t: t + i * 0.13, dur: 0.3, gain: 0.05 });
    });
    a._noiseHit({ t: t + 0.36, dur: 0.5, gain: 0.1, filter: 'bandpass', fc: 900, fc1: 300, q: 1 });
  },

  // Босс на подходе
  boss(a) {
    const t = a.t;
    a._tone({ type: 'sawtooth', f0: 70, f1: 48, t, dur: 1.4, gain: 0.32, filter: 'lowpass', fc: 320, q: 4 });
    a._tone({ type: 'square', f0: 104, f1: 78, t: t + 0.1, dur: 1.2, gain: 0.12, filter: 'lowpass', fc: 500 });
    for (let i = 0; i < 3; i++) {
      a._noiseHit({ t: t + i * 0.4, dur: 0.24, gain: 0.16, filter: 'lowpass', fc: 600, fc1: 120 });
    }
  },

  // Победа: фанфары мажорной последовательностью
  win(a) {
    const t = a.t;
    const seq = [523, 659, 784, 1046, 784, 1046, 1318];
    seq.forEach((f, i) => {
      a._tone({ type: 'triangle', f0: f, t: t + i * 0.14, dur: 0.42, gain: 0.2 });
      a._tone({ type: 'sine', f0: f / 2, t: t + i * 0.14, dur: 0.4, gain: 0.1 });
    });
    a._noiseHit({ t: t + 0.98, dur: 0.7, gain: 0.12, filter: 'highpass', fc: 4000 });
  },

  // Поражение: низкий мрачный тон
  lose(a) {
    const t = a.t;
    const seq = [392, 349, 294, 196];
    seq.forEach((f, i) => {
      a._tone({ type: 'sawtooth', f0: f, t: t + i * 0.34, dur: 0.8, gain: 0.16, filter: 'lowpass', fc: 700, q: 1.4 });
    });
    a._tone({ type: 'sine', f0: 65, f1: 40, t: t + 1.3, dur: 1.6, gain: 0.3 });
  }
};

export default AudioSystem;
