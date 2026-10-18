/* ============================================================
   TERRAIN / 01 — procedural topographic field
   A finite, metric heightfield. Everything downstream (slope
   classification, settlement placement, building foundations)
   reads from this single source of truth.
   ============================================================ */
(function (global) {
  'use strict';

  const T1 = global.T1;

  class TerrainField {
    constructor(options) {
      options = options || {};
      this.seed = (options.seed === undefined ? 1207 : options.seed) >>> 0;
      this.relief = options.relief === undefined ? T1.DEFAULTS.relief : options.relief;
      this.width = T1.SITE_WIDTH;
      this.depth = T1.SITE_DEPTH;
      this.segments = options.segments || 160;
      this.n = this.segments + 1;
      this.cellX = this.width / this.segments;
      this.cellZ = this.depth / this.segments;
      this.metersPerUnit = T1.METERS_PER_UNIT;
      this.baseElevation = T1.BASE_ELEVATION;
      this.contourIntervalM = 5;
      this.majorEvery = 5;
      this.peak = { x: 0, z: 0, h: 0 };
      this.generate();
    }

    /* ---------- synthetic mountain ---------- */
    generate() {
      const n = this.n;
      const seg = this.segments;
      const count = n * n;
      const seed = this.seed >>> 0;
      const noise = T1.createNoise(seed);
      const rng = T1.mulberry32((seed ^ 0xA57F31D3) >>> 0);

      const phase = rng() * Math.PI * 2;
      const rot = (rng() - 0.5) * 1.05;
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      const offsetX = (rng() - 0.5) * 8.0;
      const offsetZ = (rng() - 0.5) * 8.0;
      const valleyBias = (rng() - 0.5) * 0.18;

      const raw = new Float32Array(count);
      let rawMin = Infinity;
      let rawMax = -Infinity;

      for (let j = 0; j < n; j++) {
        const v = (j / seg) * 2 - 1;
        for (let i = 0; i < n; i++) {
          const u = (i / seg) * 2 - 1;

          // Rotate the field so successive seeds produce different massifs.
          const ux = u * cr - v * sr;
          const vz = u * sr + v * cr;

          const nx = ux * 1.52 + offsetX * 0.11;
          const nz = vz * 1.52 + offsetZ * 0.11;

          // Domain warp gives the ridges a geologically plausible drift.
          const wx = T1.fbm(noise, nx * 1.18 + 19.7, nz * 1.18 - 4.1, 3, 2.04, 0.52) * 0.52;
          const wz = T1.fbm(noise, nx * 1.18 - 7.4, nz * 1.18 + 12.9, 3, 2.04, 0.52) * 0.52;

          const broad = T1.fbm(noise, nx * 0.58 + wx + 2.6, nz * 0.58 + wz - 1.4, 5, 2.02, 0.5);
          const ridge = T1.ridged(noise, nx * 0.98 + wx * 1.1, nz * 0.98 + wz * 1.1, 5, 2.06, 0.51);
          const macro = T1.ridged(noise, nx * 0.31 + 7.2, nz * 0.31 - 4.6, 3, 2.1, 0.56);
          const detail = T1.fbm(noise, nx * 3.8, nz * 3.8, 3, 2.1, 0.47);

          let h = broad * 0.38 + ridge * 0.47 + macro * 0.20 + detail * 0.045;
          h += ux * 0.035 - vz * 0.022;

          // A meandering valley gives the settlement a legible spine.
          const valleyCentre = valleyBias + 0.22 * Math.sin(vz * 2.18 + phase) +
            0.055 * Math.sin(vz * 5.27 + phase * 0.63);
          const valleyDist = (ux - valleyCentre) / 0.175;
          const valley = Math.exp(-valleyDist * valleyDist);
          const terraceBand = 0.5 + 0.5 * Math.cos(vz * 3.4 + phase);
          h -= valley * (0.24 + terraceBand * 0.045);

          // A wider bowl near the valley floor opens up room for a hamlet.
          const basin = Math.exp(-(
            ((ux - valleyCentre) * (ux - valleyCentre)) / 0.17 +
            ((vz - 0.02) * (vz - 0.02)) / 0.36
          ));
          h -= basin * 0.075;

          // Contain the model: edge shelves keep the slab & section legible.
          const edgeX = T1.smoothstep(0, 0.13, 1 - Math.abs(u));
          const edgeZ = T1.smoothstep(0, 0.13, 1 - Math.abs(v));
          const edge = edgeX * edgeZ;
          h = h * (0.79 + edge * 0.21) - (1 - edge) * 0.06;

          raw[j * n + i] = h;
          if (h < rawMin) rawMin = h;
          if (h > rawMax) rawMax = h;
        }
      }

      // Normalise the raw field, then do one conservative smoothing pass.
      const norm = new Float32Array(count);
      const inv = 1 / Math.max(0.00001, rawMax - rawMin);
      for (let k = 0; k < count; k++) norm[k] = (raw[k] - rawMin) * inv;

      const smooth = new Float32Array(count);
      const centreW = 0.52;
      const sideW = 0.09;
      const diagW = 0.0325;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const id = j * n + i;
          if (i === 0 || i === n - 1 || j === 0 || j === n - 1) {
            smooth[id] = norm[id];
            continue;
          }
          const c = norm[id];
          const l = norm[id - 1];
          const r = norm[id + 1];
          const up = norm[id - n];
          const dn = norm[id + n];
          const tl = norm[id - n - 1];
          const tr = norm[id - n + 1];
          const bl = norm[id + n - 1];
          const br = norm[id + n + 1];
          smooth[id] = c * centreW +
            (l + r + up + dn) * sideW +
            (tl + tr + bl + br) * diagW;
        }
      }

      let smoothMin = Infinity;
      let smoothMax = -Infinity;
      for (let k = 0; k < count; k++) {
        if (smooth[k] < smoothMin) smoothMin = smooth[k];
        if (smooth[k] > smoothMax) smoothMax = smooth[k];
      }
      const smoothInv = 1 / Math.max(0.00001, smoothMax - smoothMin);

      // Interpret relief as total vertical range in metres. 1 world unit = 10 m.
      const spanWorld = 4.1 + this.relief * 8.8;
      let heights = new Float32Array(count);

      // A gentle low-frequency bias opens the valley floors while preserving
      // the summit ridges. Two small separably-blurred passes remove noisy
      // micro-slopes so the resulting slopes are believable at plot scale.
      for (let k = 0; k < count; k++) {
        const t = T1.clamp((smooth[k] - smoothMin) * smoothInv, 0, 1);
        const shaped = Math.pow(t, 1.58);
        heights[k] = shaped * spanWorld;
      }

      const kernel = [1, 4, 6, 4, 1];
      const kernelNorm = 16;
      for (let pass = 0; pass < 2; pass++) {
        const horizontal = new Float32Array(count);
        const vertical = new Float32Array(count);
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            let sum = 0;
            for (let k = -2; k <= 2; k++) {
              const ii = Math.max(0, Math.min(n - 1, i + k));
              sum += heights[j * n + ii] * kernel[k + 2];
            }
            horizontal[j * n + i] = sum / kernelNorm;
          }
        }
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            let sum = 0;
            for (let k = -2; k <= 2; k++) {
              const jj = Math.max(0, Math.min(n - 1, j + k));
              sum += horizontal[jj * n + i] * kernel[k + 2];
            }
            vertical[j * n + i] = sum / kernelNorm;
          }
        }
        heights = vertical;
      }

      // Re-establish the requested vertical range after blurring so that the
      // relief readout, the model height and the slope calculation stay in sync.
      let blurMin = Infinity;
      let blurMax = -Infinity;
      for (let k = 0; k < count; k++) {
        if (heights[k] < blurMin) blurMin = heights[k];
        if (heights[k] > blurMax) blurMax = heights[k];
      }
      const blurRange = Math.max(0.0001, blurMax - blurMin);
      const normalized = new Float32Array(count);
      let peakH = -Infinity;
      let peakX = 0;
      let peakZ = 0;
      for (let j = 0; j < n; j++) {
        const z = -this.depth / 2 + j * this.cellZ;
        for (let i = 0; i < n; i++) {
          const h = (heights[j * n + i] - blurMin) / blurRange * spanWorld;
          heights[j * n + i] = h;
          normalized[j * n + i] = h / spanWorld;
          if (h > peakH) {
            peakH = h;
            peakX = -this.width / 2 + i * this.cellX;
            peakZ = z;
          }
        }
      }

      this.heights = heights;
      this.normalized = normalized;
      this.minHeight = 0;
      this.maxHeight = spanWorld;
      this.spanWorld = spanWorld;
      this.spanM = spanWorld * this.metersPerUnit;
      this.peak = { x: peakX, z: peakZ, h: peakH };

      this.computeSlopeData();
      this.contourIntervalM = T1.niceInterval(this.spanM / 25);
      this.contourInterval = this.contourIntervalM / this.metersPerUnit;
      return this;
    }

    /* ---------- raster slope analysis ---------- */
    computeSlopeData() {
      const n = this.n;
      const h = this.heights;
      const slopes = new Float32Array(n * n);
      const gx = new Float32Array(n * n);
      const gz = new Float32Array(n * n);
      const cell = this.cellX;

      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const i0 = i === 0 ? 0 : i - 1;
          const i1 = i === n - 1 ? n - 1 : i + 1;
          const j0 = j === 0 ? 0 : j - 1;
          const j1 = j === n - 1 ? n - 1 : j + 1;
          const dx = (h[j * n + i1] - h[j * n + i0]) / ((i1 - i0) * cell);
          const dz = (h[j1 * n + i] - h[j0 * n + i]) / ((j1 - j0) * cell);
          gx[j * n + i] = dx;
          gz[j * n + i] = dz;
          slopes[j * n + i] = Math.atan(Math.sqrt(dx * dx + dz * dz)) * 180 / Math.PI;
        }
      }

      this.slopes = slopes;
      this.gradX = gx;
      this.gradZ = gz;
      return slopes;
    }

    sampleHeight(x, z) {
      const fx = (x + this.width / 2) / this.cellX;
      const fz = (z + this.depth / 2) / this.cellZ;
      const cx = T1.clamp(fx, 0, this.segments);
      const cz = T1.clamp(fz, 0, this.segments);
      const i0 = Math.floor(cx);
      const j0 = Math.floor(cz);
      const i1 = Math.min(this.segments, i0 + 1);
      const j1 = Math.min(this.segments, j0 + 1);
      const tx = cx - i0;
      const tz = cz - j0;
      const n = this.n;
      const h = this.heights;
      const h00 = h[j0 * n + i0];
      const h10 = h[j0 * n + i1];
      const h01 = h[j1 * n + i0];
      const h11 = h[j1 * n + i1];
      return T1.lerp(T1.lerp(h00, h10, tx), T1.lerp(h01, h11, tx), tz);
    }

    sampleNormal(x, z, radius) {
      radius = radius || 0.45;
      const hL = this.sampleHeight(x - radius, z);
      const hR = this.sampleHeight(x + radius, z);
      const hD = this.sampleHeight(x, z - radius);
      const hU = this.sampleHeight(x, z + radius);
      const dx = (hR - hL) / (radius * 2);
      const dz = (hU - hD) / (radius * 2);
      const len = Math.sqrt(dx * dx + 1 + dz * dz);
      return { x: -dx / len, y: 1 / len, z: -dz / len };
    }

    gradientAt(x, z, radius) {
      radius = radius || 0.5;
      const hL = this.sampleHeight(x - radius, z);
      const hR = this.sampleHeight(x + radius, z);
      const hD = this.sampleHeight(x, z - radius);
      const hU = this.sampleHeight(x, z + radius);
      return {
        x: (hR - hL) / (radius * 2),
        z: (hU - hD) / (radius * 2)
      };
    }

    slopeAt(x, z, radius) {
      const g = this.gradientAt(x, z, radius);
      return Math.atan(Math.sqrt(g.x * g.x + g.z * g.z)) * 180 / Math.PI;
    }

    sampleSlope(x, z, radius) {
      return this.slopeAt(x, z, radius);
    }

    elevationAt(x, z) {
      return this.baseElevation + this.sampleHeight(x, z) * this.metersPerUnit;
    }

    getPeakElevation() {
      return this.baseElevation + this.maxHeight * this.metersPerUnit;
    }

    getLowElevation() {
      return this.baseElevation + this.minHeight * this.metersPerUnit;
    }

    getSlopeStats(threshold) {
      const n = this.n;
      const slopes = this.slopes;
      const margin = Math.round(2.3 / this.cellX);
      let sum = 0;
      let max = 0;
      let count = 0;
      let buildable = 0;
      let steep = 0;
      for (let j = margin; j < n - margin; j++) {
        for (let i = margin; i < n - margin; i++) {
          const s = slopes[j * n + i];
          sum += s;
          if (s > max) max = s;
          if (s <= threshold) buildable++;
          if (s > 32) steep++;
          count++;
        }
      }
      return {
        mean: count ? sum / count : 0,
        max: max,
        buildablePct: count ? (buildable / count) * 100 : 0,
        steepPct: count ? (steep / count) * 100 : 0,
        count: count
      };
    }

    getProfile(z, samples) {
      samples = samples || 92;
      const points = [];
      for (let i = 0; i < samples; i++) {
        const t = i / (samples - 1);
        const x = T1.lerp(-this.width / 2, this.width / 2, t);
        const h = this.sampleHeight(x, z || 0);
        points.push({
          t: t,
          x: x,
          h: h,
          elevation: this.baseElevation + h * this.metersPerUnit
        });
      }
      return points;
    }

    /* ---------- marching-squares contours ---------- */
    extractContours() {
      const n = this.n;
      const h = this.heights;
      const levels = [];
      const interval = this.contourInterval;
      let level = interval;
      let levelIndex = 1;
      while (level < this.maxHeight - interval * 0.08) {
        levels.push({
          value: level,
          valueM: level * this.metersPerUnit,
          major: levelIndex % this.majorEvery === 0,
          index: levelIndex
        });
        levelIndex++;
        level += interval;
      }

      const minor = [];
      const major = [];
      const halfW = this.width / 2;
      const halfD = this.depth / 2;

      function edgePoint(ax, az, ah, bx, bz, bh, lv) {
        const denom = bh - ah;
        const t = Math.abs(denom) < 1e-9 ? 0.5 : (lv - ah) / denom;
        return [ax + (bx - ax) * t, az + (bz - az) * t];
      }

      for (let j = 0; j < this.segments; j++) {
        const z0 = -halfD + j * this.cellZ;
        const z1 = z0 + this.cellZ;
        for (let i = 0; i < this.segments; i++) {
          const x0 = -halfW + i * this.cellX;
          const x1 = x0 + this.cellX;
          const h0 = h[j * n + i];
          const h1 = h[j * n + i + 1];
          const h2 = h[(j + 1) * n + i + 1];
          const h3 = h[(j + 1) * n + i];
          const cellMin = Math.min(h0, h1, h2, h3);
          const cellMax = Math.max(h0, h1, h2, h3);

          for (let li = 0; li < levels.length; li++) {
            const lv = levels[li].value;
            if (lv <= cellMin || lv >= cellMax) continue;

            const pts = [];

            // edge 0 — north
            if ((h0 - lv) * (h1 - lv) < 0) {
              const p = edgePoint(x0, z0, h0, x1, z0, h1, lv);
              pts.push(p);
            }
            // edge 1 — east
            if ((h1 - lv) * (h2 - lv) < 0) {
              const p = edgePoint(x1, z0, h1, x1, z1, h2, lv);
              pts.push(p);
            }
            // edge 2 — south
            if ((h2 - lv) * (h3 - lv) < 0) {
              const p = edgePoint(x1, z1, h2, x0, z1, h3, lv);
              pts.push(p);
            }
            // edge 3 — west
            if ((h3 - lv) * (h0 - lv) < 0) {
              const p = edgePoint(x0, z1, h3, x0, z0, h0, lv);
              pts.push(p);
            }

            const target = levels[li].major ? major : minor;
            const y = lv + (levels[li].major ? 0.066 : 0.055);

            if (pts.length === 2) {
              target.push(pts[0][0], y, pts[0][1], pts[1][0], y, pts[1][1]);
            } else if (pts.length === 4) {
              // A saddle: split the two contour strands through the cell.
              target.push(pts[0][0], y, pts[0][1], pts[1][0], y, pts[1][1]);
              target.push(pts[2][0], y, pts[2][1], pts[3][0], y, pts[3][1]);
            }
          }
        }
      }

      return {
        levels: levels,
        minor: new Float32Array(minor),
        major: new Float32Array(major),
        intervalM: this.contourIntervalM
      };
    }

    /**
     * Isoline of a specific slope threshold. This is the actual boundary
     * used to explain the buildable mask — not a decorative contour.
     */
    extractSlopeLimit(threshold) {
      const n = this.n;
      const slopes = this.slopes;
      const positions = [];
      const halfW = this.width / 2;
      const halfD = this.depth / 2;

      function pointOnEdge(ax, az, av, bx, bz, bv) {
        // av / bv are already (slope - threshold); solve for the zero crossing.
        const t = Math.abs(bv - av) < 1e-9 ? 0.5 : (0 - av) / (bv - av);
        return [ax + (bx - ax) * t, az + (bz - az) * t];
      }

      for (let j = 0; j < this.segments; j++) {
        const z0 = -halfD + j * this.cellZ;
        const z1 = z0 + this.cellZ;
        for (let i = 0; i < this.segments; i++) {
          const x0 = -halfW + i * this.cellX;
          const x1 = x0 + this.cellX;
          const v0 = slopes[j * n + i] - threshold;
          const v1 = slopes[j * n + i + 1] - threshold;
          const v2 = slopes[(j + 1) * n + i + 1] - threshold;
          const v3 = slopes[(j + 1) * n + i] - threshold;
          if ((v0 > 0 && v1 > 0 && v2 > 0 && v3 > 0) ||
              (v0 <= 0 && v1 <= 0 && v2 <= 0 && v3 <= 0)) continue;

          const pts = [];
          if ((v0 > 0) !== (v1 > 0)) pts.push(pointOnEdge(x0, z0, v0, x1, z0, v1));
          if ((v1 > 0) !== (v2 > 0)) pts.push(pointOnEdge(x1, z0, v1, x1, z1, v2));
          if ((v2 > 0) !== (v3 > 0)) pts.push(pointOnEdge(x1, z1, v2, x0, z1, v3));
          if ((v3 > 0) !== (v0 > 0)) pts.push(pointOnEdge(x0, z1, v3, x0, z0, v0));

          function pushPoint(pt) {
            positions.push(pt[0], this.sampleHeight(pt[0], pt[1]) + 0.095, pt[1]);
          }
          const self = this;
          if (pts.length === 2) {
            pushPoint.call(self, pts[0]);
            pushPoint.call(self, pts[1]);
          } else if (pts.length === 4) {
            pushPoint.call(self, pts[0]);
            pushPoint.call(self, pts[1]);
            pushPoint.call(self, pts[2]);
            pushPoint.call(self, pts[3]);
          }
        }
      }
      return new Float32Array(positions);
    }

    /**
     * Compact data packet for the profile drawing. Avoids exposing the
     * heightfield to the UI layer.
     */
    sectionData(units) {
      const profile = this.getProfile(0.15, 96);
      const ticks = [];
      if (units && units.length) {
        for (let i = 0; i < units.length; i++) {
          const u = units[i];
          if (Math.abs(u.z - 0.15) <= 2.2) {
            ticks.push({
              t: (u.x + this.width / 2) / this.width,
              top: this.sampleHeight(u.x, 0.15) + 0.14,
              id: u.id
            });
          }
        }
      }
      return { profile: profile, ticks: ticks };
    }
  }

  T1.TerrainField = TerrainField;
})(window);
