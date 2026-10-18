/* ============================================================
   TERRAIN / 01 — settlement engine
   Rule-based siting:
   1. sample candidate plots on a jittered grid,
   2. reject plots whose local maximum slope exceeds the limit,
   3. score orientation, shelter, solar exposure and elevation band,
   4. grow the settlement greedily while enforcing centre spacing
      and a density-dependent clustering bias,
   5. align each building with the local contour and cut a level
      foundation from the actual corner samples.
   ============================================================ */
(function (global) {
  'use strict';

  const T1 = global.T1;

  const TYPE_INFO = {
    court:    { label: '庭院', en: 'COURTYARD' },
    tower:    { label: '塔楼', en: 'TOWER' },
    terrace:  { label: '台地', en: 'TERRACE' },
    longhouse:{ label: '长屋', en: 'LONGHOUSE' }
  };

  function clamp01(v) {
    return T1.clamp(v, 0, 1);
  }

  /* ------------------------------------------------------------
     Candidate plots
     ------------------------------------------------------------ */
  function buildCandidates(terrain, constraints, layoutSeed) {
    const slopeLimit = constraints.maxSlope;
    const rng = T1.mulberry32(((layoutSeed >>> 0) ^ (terrain.seed >>> 0) ^ 0x7F4A7C15) >>> 0);
    const step = 3;
    const inset = 2.25;
    const candidates = [];
    const marginCells = Math.ceil(inset / terrain.cellX);

    for (let j = marginCells; j < terrain.segments - marginCells; j += step) {
      const z = -terrain.depth / 2 + j * terrain.cellZ +
        (rng() - 0.5) * terrain.cellZ * step * 0.56;
      for (let i = marginCells; i < terrain.segments - marginCells; i += step) {
        const x = -terrain.width / 2 + i * terrain.cellX +
          (rng() - 0.5) * terrain.cellX * step * 0.56;

        const h = terrain.sampleHeight(x, z);
        const slope = terrain.sampleSlope(x, z, 0.52);
        if (slope > slopeLimit) continue;

        // A building occupies a finite pad: require its immediate
        // neighbourhood to respect the same slope threshold.
        const s1 = terrain.sampleSlope(x + 0.52, z, 0.34);
        const s2 = terrain.sampleSlope(x - 0.52, z, 0.34);
        const s3 = terrain.sampleSlope(x, z + 0.52, 0.34);
        const s4 = terrain.sampleSlope(x, z - 0.52, 0.34);
        const localMax = Math.max(slope, s1, s2, s3, s4);
        if (localMax > slopeLimit + 1.15) continue;

        const g = terrain.gradientAt(x, z, 0.85);
        const gLen = Math.sqrt(g.x * g.x + g.z * g.z) || 0.000001;
        const downhillZ = -g.z / gLen;
        const solar = clamp01(0.5 - 0.5 * (-downhillZ));

        const hL = terrain.sampleHeight(x - 1.15, z);
        const hR = terrain.sampleHeight(x + 1.15, z);
        const hD = terrain.sampleHeight(x, z - 1.15);
        const hU = terrain.sampleHeight(x, z + 1.15);
        const exposure = h - (hL + hR + hD + hU) / 4;
        const shelter = clamp01(0.55 - exposure * 1.7);

        const normH = (h - terrain.minHeight) / Math.max(0.0001, terrain.spanWorld);
        const midBand = clamp01(1 - Math.abs(normH - 0.45) / 0.63);
        const flatness = clamp01(1 - slope / slopeLimit);
        const jitter = rng();

        const baseScore =
          flatness * 0.48 +
          shelter * 0.17 +
          solar * 0.13 +
          midBand * 0.14 +
          jitter * 0.08;

        candidates.push({
          x: x,
          z: z,
          h: h,
          normH: normH,
          slope: slope,
          localMax: localMax,
          shelter: shelter,
          solar: solar,
          jitter: jitter,
          baseScore: baseScore,
          layoutNoise: rng()
        });
      }
    }

    return candidates;
  }

  /* ------------------------------------------------------------
     Greedy settlement growth with spacing + density bias
     ------------------------------------------------------------ */
  function chooseSites(candidates, constraints, layoutSeed) {
    const target = Math.max(0, Math.round(constraints.count));
    const spacing = constraints.spacing; // world units
    const density = clamp01(constraints.density);
    const selected = [];
    const chosen = new Uint8Array(candidates.length);

    if (!candidates.length || target === 0) {
      return { selected: selected, limited: target > 0, candidates: candidates.length };
    }

    let founderIndex = -1;
    let founderScore = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const score = c.baseScore - Math.abs(c.normH - 0.43) * 0.16 + c.layoutNoise * 0.02;
      if (score > founderScore) {
        founderScore = score;
        founderIndex = i;
      }
    }

    chosen[founderIndex] = 1;
    selected.push(candidates[founderIndex]);

    const clusterScale = 1.15 + density * 5.2;
    const dispersionStrength = (1 - density) * 0.075;

    while (selected.length < target) {
      let bestIndex = -1;
      let bestScore = -Infinity;

      for (let i = 0; i < candidates.length; i++) {
        if (chosen[i]) continue;
        const c = candidates[i];
        let nearest = Infinity;
        let blocked = false;

        for (let k = 0; k < selected.length; k++) {
          const s = selected[k];
          const dx = c.x - s.x;
          const dz = c.z - s.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < spacing * spacing) {
            blocked = true;
            break;
          }
          if (d2 < nearest) nearest = d2;
        }
        if (blocked) continue;

        nearest = Math.sqrt(nearest);
        const beyondSpacing = Math.max(0, nearest - spacing);
        const attraction = Math.exp(-beyondSpacing / clusterScale);
        const dispersion = Math.exp(-nearest / (2.2 + spacing * 1.4));
        const clustering = density * 0.33 * attraction - dispersionStrength * dispersion;

        // A small deterministic preference tied to the layout seed keeps
        // successive REMIXes visibly different without making them random noise.
        const choiceNoise = 0.045 * c.layoutNoise + 0.012 * c.jitter;

        const score = c.baseScore + clustering + choiceNoise;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }

      if (bestIndex === -1) break;
      chosen[bestIndex] = 1;
      selected.push(candidates[bestIndex]);
    }

    return {
      selected: selected,
      limited: selected.length < target,
      candidates: candidates.length
    };
  }

  /* ------------------------------------------------------------
     Building programme
     ------------------------------------------------------------ */
  function pushVolume(list, w, d, h, x, z, y, kind) {
    const volume = {
      w: w,
      d: d,
      h: h,
      x: x,
      z: z || 0,
      y: y,
      kind: kind || 'primary'
    };
    list.push(volume);
    return volume;
  }

  function pushRoof(roofs, volume, overhang) {
    overhang = overhang === undefined ? 0.075 : overhang;
    roofs.push({
      w: volume.w + overhang * 2,
      d: volume.d + overhang * 2,
      h: 0.072,
      x: volume.x,
      z: volume.z,
      y: volume.y + volume.h + 0.036,
      kind: 'roof'
    });
  }

  function programBuilding(site, terrain, constraints, layoutSeed, index) {
    const seedInput = terrain.seed + ':' + layoutSeed + ':' + index + ':' +
      site.x.toFixed(3) + ':' + site.z.toFixed(3);
    const rng = T1.mulberry32(T1.hashSeed(seedInput));
    const steepness = clamp01(site.slope / Math.max(8, constraints.maxSlope));

    let type;
    const typeRoll = rng();
    if (steepness > 0.58) {
      type = typeRoll < 0.40 ? 'terrace' : typeRoll < 0.70 ? 'tower' : typeRoll < 0.87 ? 'court' : 'longhouse';
    } else {
      type = typeRoll < 0.24 ? 'tower' : typeRoll < 0.54 ? 'court' : typeRoll < 0.82 ? 'terrace' : 'longhouse';
    }

    const compact = T1.lerp(1.0, 0.86, steepness);
    let W;
    let D;
    const floorH = 0.34;
    let floorCount;

    if (type === 'tower') {
      W = (1.10 + rng() * 0.40) * compact;
      D = (0.94 + rng() * 0.34) * compact;
      floorCount = 6 + Math.floor(rng() * 4);
    } else if (type === 'longhouse') {
      W = (2.10 + rng() * 0.80) * compact;
      D = (0.76 + rng() * 0.32) * compact;
      floorCount = 3 + Math.floor(rng() * 2);
    } else if (type === 'court') {
      W = (1.55 + rng() * 0.55) * compact;
      D = (1.18 + rng() * 0.40) * compact;
      floorCount = 4 + Math.floor(rng() * 3);
    } else {
      W = (1.40 + rng() * 0.50) * compact;
      D = (1.02 + rng() * 0.38) * compact;
      floorCount = 4 + Math.floor(rng() * 3);
    }

    const bodyH = floorCount * floorH;

    // Align the long façade with the contour; put the glazed face downhill.
    const g = terrain.gradientAt(site.x, site.z, 0.8);
    const gLen = Math.sqrt(g.x * g.x + g.z * g.z) || 0.0001;
    const tangentX = -g.z / gLen;
    const tangentZ = g.x / gLen;
    let rotation = Math.atan2(-tangentZ, tangentX);
    rotation += (rng() - 0.5) * 0.20;

    const downX = -g.x / gLen;
    const downZ = -g.z / gLen;
    const localZx = Math.sin(rotation);
    const localZz = Math.cos(rotation);
    if (localZx * downX + localZz * downZ < 0) rotation += Math.PI;

    // Sample the actual terrace pad (slightly wider than the building).
    const padW = W + 0.36;
    const padD = D + 0.36;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const sampleOffsets = [
      [1, 1], [-1, 1], [1, -1], [-1, -1],
      [0, 1], [0, -1], [1, 0], [-1, 0], [0, 0]
    ];
    let terrMin = Infinity;
    let terrMax = -Infinity;
    for (let k = 0; k < sampleOffsets.length; k++) {
      const lx = sampleOffsets[k][0] * padW / 2;
      const lz = sampleOffsets[k][1] * padD / 2;
      const wx = site.x + cos * lx + sin * lz;
      const wz = site.z - sin * lx + cos * lz;
      const hh = terrain.sampleHeight(wx, wz);
      if (hh < terrMin) terrMin = hh;
      if (hh > terrMax) terrMax = hh;
    }

    const baseBottom = terrMin - 0.26;
    const foundationTop = terrMax + 0.19;
    const foundationH = foundationTop - baseBottom;
    // Group origins sit at baseBottom; floorY must stay LOCAL to the group.
    // Using the world-space foundationTop here would lift every building by
    // roughly its terrain elevation — the cause of the earlier “floating” look.
    const floorY = foundationH + 0.06; // local floor plane / terrace cap top
    const volumes = [];
    const roofs = [];
    const windows = [];
    const accents = [];
    let fixtures = null;

    if (type === 'tower') {
      const podiumH = Math.min(0.46, bodyH * 0.24);
      const towerH = bodyH;
      const towerW = W * 0.54;
      const towerD = D * 0.56;
      pushVolume(volumes, W * 0.96, D * 0.9, podiumH, 0, 0, floorY, 'secondary');
      const tower = pushVolume(
        volumes,
        towerW,
        towerD,
        towerH,
        W * (rng() - 0.5) * 0.12,
        -D * 0.06,
        floorY + podiumH,
        'primary'
      );
      pushRoof(roofs, volumes[0], 0.06);
      pushRoof(roofs, tower, 0.075);
      windows.push({
        w: Math.min(0.15, towerW * 0.25),
        d: 0.022,
        h: towerH * 0.62,
        x: tower.x + towerW * 0.26,
        y: tower.y + towerH * 0.26,
        z: tower.z + towerD / 2 + 0.012
      });
      windows.push({
        w: towerW * 0.32,
        d: 0.02,
        h: 0.045,
        x: tower.x - towerW * 0.16,
        y: tower.y + towerH * 0.19,
        z: tower.z + towerD / 2 + 0.012
      });
      if (rng() < 0.38) {
        accents.push({
          w: 0.105,
          d: 0.055,
          h: towerH * 0.80,
          x: tower.x + towerW * 0.38,
          y: tower.y + towerH * 0.10,
          z: tower.z + towerD / 2 + 0.018,
          kind: 'core'
        });
      }
      if (rng() < 0.5) {
        fixtures = {
          w: 0.014,
          d: 0.014,
          h: 0.42 + rng() * 0.34,
          x: tower.x - towerW * 0.25,
          y: tower.y + towerH,
          z: tower.z - towerD * 0.18,
          kind: 'mast'
        };
      }
    } else if (type === 'court') {
      const wingAH = bodyH * (0.72 + rng() * 0.16);
      const wingBH = bodyH * (0.82 + rng() * 0.14);
      const wingAD = D * 0.34;
      const wingAW = W * (0.90 + rng() * 0.07);
      const wingBD = D * (0.66 + rng() * 0.10);
      const wingBW = W * 0.31;
      const volA = pushVolume(
        volumes,
        wingAW,
        wingAD,
        wingAH,
        0,
        -D * 0.30,
        floorY,
        'primary'
      );
      const volB = pushVolume(
        volumes,
        wingBW,
        wingBD,
        wingBH,
        -W * 0.33,
        D * 0.06,
        floorY,
        'secondary'
      );
      pushRoof(roofs, volA, 0.075);
      pushRoof(roofs, volB, 0.07);
      // A low garden wall closes the courtyard composition.
      pushVolume(volumes, W * 0.44, 0.065, 0.18, W * 0.21, D * 0.30, floorY, 'wall');
      windows.push({
        w: Math.min(0.55, wingAW * 0.42),
        d: 0.022,
        h: Math.min(0.20, wingAH * 0.34),
        x: volA.x + wingAW * 0.08,
        y: volA.y + wingAH * 0.44,
        z: volA.z + wingAD / 2 + 0.012
      });
      windows.push({
        w: 0.02,
        d: Math.min(0.32, wingBD * 0.5),
        h: Math.min(0.28, wingBH * 0.35),
        x: volB.x + wingBW / 2 + 0.011,
        y: volB.y + wingBH * 0.46,
        z: volB.z - wingBD * 0.10
      });
      if (rng() < 0.45) {
        accents.push({
          w: wingBW * 0.92,
          d: 0.055,
          h: 0.12,
          x: volB.x,
          y: volB.y + wingBH - 0.08,
          z: volB.z + wingBD / 2 + 0.026,
          kind: 'lintel'
        });
      }
    } else if (type === 'terrace') {
      const lowerH = bodyH * (0.50 + rng() * 0.10);
      const upperH = bodyH - lowerH;
      const lower = pushVolume(
        volumes,
        W * 0.92,
        D * 0.84,
        lowerH,
        -W * 0.03,
        D * 0.04,
        floorY,
        'primary'
      );
      const upper = pushVolume(
        volumes,
        W * 0.59,
        D * 0.56,
        upperH,
        W * 0.14,
        -D * 0.15,
        floorY + lowerH,
        'secondary'
      );
      pushRoof(roofs, lower, 0.065);
      pushRoof(roofs, upper, 0.07);
      windows.push({
        w: Math.min(0.42, W * 0.30),
        d: 0.022,
        h: Math.min(0.18, lowerH * 0.50),
        x: lower.x - W * 0.14,
        y: lower.y + lowerH * 0.42,
        z: lower.z + (D * 0.84) / 2 + 0.012
      });
      windows.push({
        w: Math.min(0.12, upper.w * 0.3),
        d: 0.022,
        h: Math.min(0.30, upperH * 0.52),
        x: upper.x + upper.w * 0.28,
        y: upper.y + upperH * 0.24,
        z: upper.z + upper.d / 2 + 0.012
      });
      if (rng() < 0.42) {
        accents.push({
          w: 0.14,
          d: 0.07,
          h: lowerH * 0.60,
          x: lower.x - lower.w * 0.40,
          y: lower.y + lowerH * 0.18,
          z: lower.z + lower.d / 2 + 0.02,
          kind: 'core'
        });
      }
    } else {
      const hA = bodyH * (0.82 + rng() * 0.16);
      const hB = bodyH * (0.60 + rng() * 0.18);
      const wA = W * 0.52;
      const wB = W * 0.37;
      const volA = pushVolume(
        volumes,
        wA,
        D,
        hA,
        -W * 0.25,
        0,
        floorY,
        'primary'
      );
      const volB = pushVolume(
        volumes,
        wB,
        D * 0.84,
        hB,
        W * 0.26,
        D * 0.035,
        floorY + (hA - hB) * 0.55,
        'secondary'
      );
      pushRoof(roofs, volA, 0.065);
      pushRoof(roofs, volB, 0.075);
      windows.push({
        w: Math.min(0.46, wA * 0.52),
        d: 0.022,
        h: Math.min(0.16, hA * 0.28),
        x: volA.x,
        y: volA.y + hA * 0.48,
        z: volA.z + D / 2 + 0.012
      });
      windows.push({
        w: Math.min(0.28, wB * 0.54),
        d: 0.022,
        h: Math.min(0.22, hB * 0.40),
        x: volB.x,
        y: volB.y + hB * 0.40,
        z: volB.z + (D * 0.84) / 2 + 0.012
      });
      if (rng() < 0.36) {
        accents.push({
          w: 0.18,
          d: 0.16,
          h: 0.16 + rng() * 0.14,
          x: volA.x + wA * 0.25,
          y: volA.y + hA,
          z: volA.z - D * 0.18,
          kind: 'chimney'
        });
      }
    }

    // Add two quieter glazing bands to every significant mass. These catch
    // the low sun and make the white volumes legible at overview distance.
    volumes.forEach(function (volume) {
      if (volume.kind === 'wall' || volume.h < 0.38) return;
      windows.push({
        w: Math.min(volume.w * 0.58, 0.92),
        d: 0.022,
        h: Math.min(0.075, volume.h * 0.16),
        x: volume.x,
        y: volume.y + volume.h * 0.66,
        z: volume.z + volume.d / 2 + 0.012
      });
      windows.push({
        w: 0.022,
        d: Math.min(volume.d * 0.48, 0.64),
        h: Math.min(0.09, volume.h * 0.18),
        x: volume.x + volume.w / 2 + 0.012,
        y: volume.y + volume.h * 0.36,
        z: volume.z - volume.d * 0.13
      });
    });

    // Dark entrances ground every composition at human scale.
    const tallest = volumes.reduce(function (best, v) {
      return (!best || v.h > best.h) ? v : best;
    }, null);
    if (tallest) {
      windows.push({
        w: Math.min(0.15, tallest.w * 0.24),
        d: 0.018,
        h: Math.min(0.28, tallest.h * 0.26),
        x: tallest.x - tallest.w * 0.32,
        y: tallest.y,
        z: tallest.z + tallest.d / 2 + 0.012
      });
    }

    // A small belvedere canopy on a share of the long, horizontal roofs.
    if ((type === 'longhouse' || type === 'terrace') && rng() < 0.46) {
      const awning = volumes[volumes.length - 1];
      roofs.push({
        w: Math.min(0.5, awning.w * 0.45),
        d: Math.min(0.32, awning.d * 0.42),
        h: 0.045,
        x: awning.x + awning.w * 0.22,
        z: awning.z + awning.d / 2 - 0.10,
        y: awning.y + awning.h + 0.075,
        kind: 'canopy'
      });
    }

    const top = volumes.reduce(function (m, v) { return Math.max(m, v.y + v.h); }, floorY);
    const accent = accents.length > 0;
    const info = TYPE_INFO[type];

    return {
      id: 'U-' + T1.pad(index + 1, 3),
      index: index,
      type: type,
      typeLabel: info.label,
      typeEn: info.en,
      x: site.x,
      z: site.z,
      y: baseBottom,
      groundY: terrMin,
      axis: { x: cos, z: -sin },
      rotation: rotation,
      footprintW: W,
      footprintD: D,
      padW: padW,
      padD: padD,
      footprintM2: W * D * T1.METERS_PER_UNIT * T1.METERS_PER_UNIT,
      slope: site.slope,
      localMaxSlope: site.localMax,
      elevationM: terrain.baseElevation + site.h * T1.METERS_PER_UNIT,
      terrainMin: terrMin,
      terrainMax: terrMax,
      baseBottom: baseBottom,
      foundationTop: foundationTop,
      foundationH: foundationH,
      foundation: {
        w: padW,
        d: padD,
        h: foundationH
      },
      cap: {
        w: W + 0.18,
        d: D + 0.18,
        h: 0.06
      },
      floorY: floorY,
      volumes: volumes,
      roofs: roofs,
      windows: windows,
      accents: accents,
      fixtures: fixtures,
      accent: accent,
      floors: floorCount,
      bodyHeight: top - floorY,
      heightM: (top - floorY) * T1.METERS_PER_UNIT,
      cutFillM: (terrMax - terrMin) * T1.METERS_PER_UNIT,
      seed: seedInput,
      quality: clamp01(site.baseScore)
    };
  }

  /* ------------------------------------------------------------
     Path topology — a minimum spanning tree, then terrain-following
     segments. Prim is plenty fast for < 120 nodes and keeps the
     infrastructure logic honest rather than ornamental.
     ------------------------------------------------------------ */
  function buildLinks(sites, terrain) {
    if (sites.length < 2) {
      return { positions: new Float32Array(0), lengthM: 0, edgeCount: 0 };
    }

    const n = sites.length;
    const visited = new Uint8Array(n);
    const best = new Float64Array(n);
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      best[i] = Infinity;
      parent[i] = -1;
    }
    visited[0] = 1;
    best[0] = 0;

    for (let i = 1; i < n; i++) {
      best[i] = Math.pow(sites[i].x - sites[0].x, 2) +
        Math.pow(sites[i].z - sites[0].z, 2) +
        Math.pow((sites[i].terrainMin - sites[0].terrainMin) * 2.2, 2);
      parent[i] = 0;
    }

    const edges = [];
    for (let step = 1; step < n; step++) {
      let pick = -1;
      let pickCost = Infinity;
      for (let i = 0; i < n; i++) {
        if (!visited[i] && best[i] < pickCost) {
          pickCost = best[i];
          pick = i;
        }
      }
      if (pick === -1) break;
      visited[pick] = 1;
      edges.push([parent[pick], pick]);

      for (let i = 0; i < n; i++) {
        if (visited[i]) continue;
        const dx = sites[i].x - sites[pick].x;
        const dz = sites[i].z - sites[pick].z;
        const dy = (sites[i].terrainMin - sites[pick].terrainMin) * 2.2;
        const cost = dx * dx + dz * dz + dy * dy;
        if (cost < best[i]) {
          best[i] = cost;
          parent[i] = pick;
        }
      }
    }

    const positions = [];
    let lengthM = 0;
    for (let e = 0; e < edges.length; e++) {
      const a = sites[edges[e][0]];
      const b = sites[edges[e][1]];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const planar = Math.sqrt(dx * dx + dz * dz);
      const steps = Math.max(3, Math.ceil(planar / 0.85));
      let prevX = 0;
      let prevY = 0;
      let prevZ = 0;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = a.x + dx * t;
        const z = a.z + dz * t;
        // A slight lateral drift suggests a path that settles into contours.
        const drift = Math.sin(t * Math.PI) * Math.sin((e + 1) * 1.73) * 0.09;
        const px = x - (dz / Math.max(0.0001, planar)) * drift;
        const pz = z + (dx / Math.max(0.0001, planar)) * drift;
        const y = terrain.sampleHeight(px, pz) + 0.055;
        if (s > 0) {
          positions.push(prevX, prevY, prevZ, px, y, pz);
          lengthM += Math.sqrt(
            (px - prevX) * (px - prevX) +
            (y - prevY) * (y - prevY) +
            (pz - prevZ) * (pz - prevZ)
          ) * T1.METERS_PER_UNIT;
        }
        prevX = px;
        prevY = y;
        prevZ = pz;
      }
    }

    return {
      positions: new Float32Array(positions),
      lengthM: lengthM,
      edgeCount: edges.length
    };
  }

  /* ------------------------------------------------------------
     Public planner
     ------------------------------------------------------------ */
  function planSettlement(terrain, constraints, layoutSeed) {
    const candidates = buildCandidates(terrain, constraints, layoutSeed);
    const siteResult = chooseSites(candidates, constraints, layoutSeed);
    const sites = [];

    for (let i = 0; i < siteResult.selected.length; i++) {
      const site = siteResult.selected[i];
      sites.push(programBuilding(site, terrain, constraints, layoutSeed, i));
    }

    const links = buildLinks(sites, terrain);
    let coverageM2 = 0;
    let meanSlope = 0;
    let quality = 0;
    for (let i = 0; i < sites.length; i++) {
      coverageM2 += sites[i].footprintM2;
      meanSlope += sites[i].slope;
      quality += sites[i].quality;
    }
    meanSlope = sites.length ? meanSlope / sites.length : 0;
    quality = sites.length ? quality / sites.length : 0;

    const slopeStats = terrain.getSlopeStats(constraints.maxSlope);
    const siteAreaM2 = T1.SITE_WIDTH * T1.METERS_PER_UNIT *
      T1.SITE_DEPTH * T1.METERS_PER_UNIT;

    return {
      sites: sites,
      links: links,
      requested: Math.round(constraints.count),
      limited: siteResult.limited,
      candidates: candidates.length,
      metrics: {
        coveragePct: (coverageM2 / siteAreaM2) * 100,
        coverageM2: coverageM2,
        meanBuildingSlope: meanSlope,
        quality: quality,
        buildablePct: slopeStats.buildablePct,
        meanTerrainSlope: slopeStats.mean,
        pathLengthM: links.lengthM,
        pathEdges: links.edgeCount
      },
      seedLabel: T1.seedLabel(layoutSeed)
    };
  }

  T1.planSettlement = planSettlement;
  T1.BUILDING_TYPES = TYPE_INFO;
})(window);
