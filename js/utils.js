/* ============================================================
   TERRAIN / 01 — shared utilities
   Deterministic randomness, value fields, colour + number helpers.
   No external dependencies.
   ============================================================ */
(function (global) {
  'use strict';

  const T1 = global.T1 = global.T1 || {};

  /* ---------- numeric helpers ---------- */
  T1.clamp = function (v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  };

  T1.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  T1.inverseLerp = function (a, b, v) {
    return a === b ? 0 : (v - a) / (b - a);
  };

  T1.smoothstep = function (a, b, v) {
    const t = T1.clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  T1.easeOutCubic = function (t) {
    return 1 - Math.pow(1 - t, 3);
  };

  T1.easeOutQuint = function (t) {
    return 1 - Math.pow(1 - t, 5);
  };

  T1.easeInOutCubic = function (t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  T1.pad = function (n, width) {
    return String(n).padStart(width, '0');
  };

  T1.fmtInt = function (n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  T1.fmt1 = function (n) {
    return (Math.round(n * 10) / 10).toFixed(1);
  };

  /* ---------- deterministic random ---------- */
  T1.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  T1.hashSeed = function (str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  T1.seedLabel = function (seed) {
    return 'T1-' + (seed >>> 0).toString(16).toUpperCase().padStart(4, '0');
  };

  /* ---------- seeded Perlin field ---------- */
  function buildPermutation(seed) {
    const rnd = T1.mulberry32((seed ^ 0x9E3779B9) >>> 0);
    const base = new Uint8Array(256);
    for (let i = 0; i < 256; i++) base[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = base[i];
      base[i] = base[j];
      base[j] = tmp;
    }
    const p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) p[i] = base[i & 255];
    return p;
  }

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function grad2(hash, x, y) {
    switch (hash & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }

  T1.createNoise = function (seed) {
    const p = buildPermutation(seed);
    return function noise(x, y) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const X = xi & 255;
      const Y = yi & 255;
      const xf = x - xi;
      const yf = y - yi;
      const u = fade(xf);
      const v = fade(yf);

      const aa = p[p[X] + Y];
      const ab = p[p[X] + Y + 1];
      const ba = p[p[X + 1] + Y];
      const bb = p[p[X + 1] + Y + 1];

      const n00 = grad2(aa, xf, yf);
      const n10 = grad2(ba, xf - 1, yf);
      const n01 = grad2(ab, xf, yf - 1);
      const n11 = grad2(bb, xf - 1, yf - 1);

      const nx0 = T1.lerp(n00, n10, u);
      const nx1 = T1.lerp(n01, n11, u);
      return T1.lerp(nx0, nx1, v) * 1.45;
    };
  };

  T1.fbm = function (noise, x, y, octaves, lacunarity, gain) {
    octaves = octaves || 5;
    lacunarity = lacunarity || 2.02;
    gain = gain === undefined ? 0.5 : gain;
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise(x * freq + i * 17.17, y * freq - i * 9.31) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };

  T1.ridged = function (noise, x, y, octaves, lacunarity, gain) {
    octaves = octaves || 4;
    lacunarity = lacunarity || 2.05;
    gain = gain === undefined ? 0.5 : gain;
    let sum = 0;
    let amp = 0.55;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      let n = 1 - Math.abs(noise(x * freq + 31.4 + i * 8.7, y * freq - 12.9 - i * 5.3));
      n *= n;
      sum += n * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };

  /* ---------- palette ---------- */
  T1.SLOPE_STOPS = [
    { deg: 0,  color: '#efede5' },
    { deg: 9,  color: '#e2e1d5' },
    { deg: 17, color: '#cfd1bd' },
    { deg: 24, color: '#d5c4a4' },
    { deg: 32, color: '#d7a97e' },
    { deg: 42, color: '#c27250' },
    { deg: 56, color: '#8b3828' }
  ];

  T1.SLOPE_CLASSES = [
    { min: 0,  max: 9,  label: '0—9°',  note: '缓坡' },
    { min: 9,  max: 17, label: '9—17°', note: '微坡' },
    { min: 17, max: 24, label: '17—24°', note: '中坡' },
    { min: 24, max: 32, label: '24—32°', note: '陡坡' },
    { min: 32, max: 90, label: '32°+',  note: '极陡' }
  ];

  T1.hexToRgb = function (hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16)
    ];
  };

  T1.rgbToHex = function (r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      return T1.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    }).join('');
  };

  T1.slopeRgb = function (deg) {
    const stops = T1.SLOPE_STOPS;
    if (deg <= stops[0].deg) return T1.hexToRgb(stops[0].color);
    if (deg >= stops[stops.length - 1].deg) return T1.hexToRgb(stops[stops.length - 1].color);
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (deg >= a.deg && deg <= b.deg) {
        const t = (deg - a.deg) / (b.deg - a.deg);
        const ca = T1.hexToRgb(a.color);
        const cb = T1.hexToRgb(b.color);
        return [
          T1.lerp(ca[0], cb[0], t),
          T1.lerp(ca[1], cb[1], t),
          T1.lerp(ca[2], cb[2], t)
        ];
      }
    }
    return T1.hexToRgb(stops[stops.length - 1].color);
  };

  T1.slopeHex = function (deg) {
    const rgb = T1.slopeRgb(deg);
    return T1.rgbToHex(rgb[0], rgb[1], rgb[2]);
  };

  T1.slopeGradientCss = function (angle) {
    const stops = T1.SLOPE_STOPS.map(function (s) {
      return s.color + ' ' + Math.round(T1.clamp(s.deg / 50, 0, 1) * 100) + '%';
    });
    return 'linear-gradient(' + (angle || '90deg') + ', ' + stops.join(', ') + ')';
  };

  /* Pick a clean contour interval in metres. */
  T1.niceInterval = function (raw) {
    if (!isFinite(raw) || raw <= 0) return 5;
    const exp = Math.floor(Math.log10(raw));
    const base = Math.pow(10, exp);
    const n = raw / base;
    let snapped;
    if (n <= 1) snapped = 1;
    else if (n <= 2) snapped = 2;
    else if (n <= 2.5) snapped = 2.5;
    else if (n <= 5) snapped = 5;
    else snapped = 10;
    return snapped * base;
  };

  /* ---------- generic DOM helpers ---------- */
  T1.qs = function (sel, root) {
    return (root || document).querySelector(sel);
  };

  T1.qsa = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  T1.setClass = function (el, name, on) {
    if (!el) return;
    el.classList.toggle(name, !!on);
  };

  /* ---------- global constants ---------- */
  T1.METERS_PER_UNIT = 10;
  T1.BASE_ELEVATION = 1264;
  T1.SITE_WIDTH = 48;
  T1.SITE_DEPTH = 48;
  T1.SITE_AREA_HA = (T1.SITE_WIDTH * T1.METERS_PER_UNIT * T1.SITE_DEPTH * T1.METERS_PER_UNIT) / 10000;
  T1.DEFAULTS = {
    relief: 0.92,
    maxSlope: 24,
    spacing: 2.6,
    count: 46,
    density: 0.58
  };
})(window);
