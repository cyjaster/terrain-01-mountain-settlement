/* ============================================================
   TERRAIN / 01 — application shell
   Three.js scene, custom orbit rig, material / geometry builders,
   UI instrumentation, growth choreography and high-resolution export.
   ============================================================ */
(function (global) {
  'use strict';

  const T1 = global.T1;
  const THREE = global.THREE;

  /* ------------------------------------------------------------
     UI references
     ------------------------------------------------------------ */
  const ui = {
    app: document.getElementById('app'),
    stage: document.getElementById('stage'),
    canvas: document.getElementById('viewCanvas'),
    bootOverlay: document.getElementById('bootOverlay'),
    bootProgress: document.getElementById('bootProgress'),
    bootStep: document.getElementById('bootStep'),
    clock: document.getElementById('clockReadout'),

    statPeak: document.getElementById('statPeak'),
    statBuildable: document.getElementById('statBuildable'),
    statUnits: document.getElementById('statUnits'),
    statUnitsNote: document.getElementById('statUnitsNote'),
    statCoverage: document.getElementById('statCoverage'),
    profileSvg: document.getElementById('profileSvg'),
    sectionMax: document.getElementById('sectionMax'),
    sectionMid: document.getElementById('sectionMid'),
    sectionMin: document.getElementById('sectionMin'),
    sectionDatum: document.getElementById('sectionDatum'),
    analysisState: document.getElementById('analysisState'),
    legendSection: document.getElementById('legendSection'),
    slopeGradient: document.getElementById('slopeGradient'),
    legendClasses: document.getElementById('legendClasses'),
    thresholdMarker: document.getElementById('thresholdMarker'),
    buildLimitLabel: document.getElementById('buildLimitLabel'),
    terrainSeedLabel: document.getElementById('terrainSeedLabel'),
    footerStatus: document.getElementById('footerStatus'),
    footerCoords: document.getElementById('footerCoords'),

    viewModeLabel: document.getElementById('viewModeLabel'),
    analysisIndicator: document.getElementById('analysisIndicator'),
    viewButtons: Array.from(document.querySelectorAll('.view-btn')),
    btnOrbit: document.getElementById('btnOrbit'),
    btnResetView: document.getElementById('btnResetView'),

    peakTag: document.getElementById('peakTag'),
    peakTagValue: document.getElementById('peakTagValue'),
    selectionTag: document.getElementById('selectionTag'),
    selectionTagValue: document.getElementById('selectionTagValue'),
    hoverTip: document.getElementById('hoverTip'),
    hoverCode: document.getElementById('hoverCode'),
    hoverMeta: document.getElementById('hoverMeta'),

    selectionCard: document.getElementById('selectionCard'),
    selectedCode: document.getElementById('selectedCode'),
    selectedType: document.getElementById('selectedType'),
    selectedStatus: document.getElementById('selectedStatus'),
    selectedElevation: document.getElementById('selectedElevation'),
    selectedSlope: document.getElementById('selectedSlope'),
    selectedFloors: document.getElementById('selectedFloors'),
    selectedCut: document.getElementById('selectedCut'),
    selectedArea: document.getElementById('selectedArea'),
    selectedHeight: document.getElementById('selectedHeight'),
    btnClearSelection: document.getElementById('btnClearSelection'),

    growthMeter: document.getElementById('growthMeter'),
    growthCount: document.getElementById('growthCount'),
    growthFill: document.getElementById('growthFill'),
    compassNeedle: document.getElementById('compassNeedle'),
    coordX: document.getElementById('coordX'),
    coordZ: document.getElementById('coordZ'),
    coordH: document.getElementById('coordH'),
    scaleLine: document.querySelector('.scale-line'),
    scaleLabel: document.getElementById('scaleLabel'),
    scaleCaption: document.querySelector('.scale-caption'),

    reliefRange: document.getElementById('reliefRange'),
    reliefValue: document.getElementById('reliefValue'),
    reliefMeters: document.getElementById('reliefMeters'),
    slopeRange: document.getElementById('slopeRange'),
    slopeValue: document.getElementById('slopeValue'),
    slopeFoot: document.getElementById('slopeFoot'),
    spacingRange: document.getElementById('spacingRange'),
    spacingValue: document.getElementById('spacingValue'),
    countRange: document.getElementById('countRange'),
    countValue: document.getElementById('countValue'),
    countFoot: document.getElementById('countFoot'),
    densityRange: document.getElementById('densityRange'),
    densityValue: document.getElementById('densityValue'),
    btnRebuild: document.getElementById('btnRebuild'),
    btnAnalyze: document.getElementById('btnAnalyze'),
    analyzeLabel: document.getElementById('analyzeLabel'),
    analyzeSub: document.getElementById('analyzeSub'),
    analyzeState: document.getElementById('analyzeState'),
    btnGenerate: document.getElementById('btnGenerate'),
    btnRemix: document.getElementById('btnRemix'),
    btnExport: document.getElementById('btnExport'),
    btnInfo: document.getElementById('btnInfo'),
    infoDialog: document.getElementById('infoDialog'),
    btnCloseInfo: document.getElementById('btnCloseInfo'),
    readBuildable: document.getElementById('readBuildable'),
    readBuildableBar: document.getElementById('readBuildableBar'),
    readUnits: document.getElementById('readUnits'),
    readMeanSlope: document.getElementById('readMeanSlope'),
    readLinks: document.getElementById('readLinks'),
    readSeed: document.getElementById('readSeed'),

    toast: document.getElementById('toast'),
    liveStatus: document.getElementById('liveStatus'),
    webglFallback: document.getElementById('webglFallback')
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCompact = window.matchMedia('(max-width: 760px)').matches;

  /* ------------------------------------------------------------
     Initial state / URL overrides
     ------------------------------------------------------------ */
  const qp = new URLSearchParams(global.location.search);

  function readSeedParam(name, fallback) {
    const raw = qp.get(name);
    if (raw === null || raw === '') return fallback;
    const parsed = Number.parseInt(raw, raw.toLowerCase().indexOf('0x') === 0 ? 16 : 10);
    return Number.isFinite(parsed) && parsed >= 0 && parsed < 65536 ? parsed : fallback;
  }

  function readNumberParam(name, fallback) {
    const raw = qp.get(name);
    if (raw === null || raw === '') return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const initialTerrainSeed = readSeedParam('terrain', 8537);
  const initialLayoutSeed = readSeedParam('layout', 512);

  const state = {
    terrainSeed: initialTerrainSeed,
    layoutSeed: initialLayoutSeed,
    relief: T1.clamp(readNumberParam('relief', T1.DEFAULTS.relief), 0.38, 1.62),
    maxSlope: T1.clamp(Math.round(readNumberParam('slope', T1.DEFAULTS.maxSlope)), 9, 42),
    spacingM: T1.clamp(Math.round(readNumberParam('spacing', T1.DEFAULTS.spacing * 10)), 16, 54),
    count: T1.clamp(Math.round(readNumberParam('count', T1.DEFAULTS.count)), 8, 110),
    density: T1.clamp(readNumberParam('density', T1.DEFAULTS.density), 0.05, 1),

    terrain: null,
    plan: null,
    terrainGroup: null,
    buildingRoot: null,
    network: null,
    networkMaterial: null,
    selectionRoot: null,
    terrainMesh: null,
    slopeMesh: null,
    slopeMaterial: null,
    slopePlane: null,
    limitLine: null,
    pointerMarker: null,

    selectedIndex: -1,
    hoveredIndex: -1,
    analysis: false,
    analysisScan: null,
    analysisFade: null,
    autoOrbit: false,
    view: 'axo',
    ready: false,
    busy: false,
    exporting: false,
    buildToken: 0,
    buildTimer: null,
    growth: null,
    growthHideTimer: null,
    lastBuildMs: 0,
    lastScaleInfo: { meters: 100, px: 84 },
    scaleCache: 0,
    overlayCache: 0,
    clockTimer: null,
    toastTimer: null,
    hoverRayAt: 0,
    pointerMoveRaf: null,
    devicePixelRatioCap: isCompact ? 1.5 : 1.9,
    enterAt: 0
  };

  /* ------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------ */
  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { resolve(); });
    });
  }

  function fmtSignedMeters(value, decimals) {
    const d = decimals === undefined ? 1 : decimals;
    const abs = Math.abs(value).toFixed(d).padStart(d > 0 ? 5 : 3, '0');
    return (value < 0 ? '−' : '+') + abs;
  }

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  function setHTML(el, value) {
    if (el) el.innerHTML = value;
  }

  function setBusy(busy) {
    state.busy = busy;
    ui.app.classList.toggle('is-computing', busy);
    ui.stage.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (busy) {
      ui.footerStatus.textContent = 'SOLVING / 正在求解坡度与间距约束';
      ui.viewModeLabel.textContent = 'COMPUTING';
    }
  }

  function showToast(message, timeout) {
    if (!ui.toast) return;
    clearTimeout(state.toastTimer);
    ui.toast.textContent = message;
    ui.toast.hidden = false;
    // Restart the entrance animation.
    ui.toast.style.animation = 'none';
    void ui.toast.offsetWidth;
    ui.toast.style.animation = '';
    state.toastTimer = setTimeout(function () {
      ui.toast.hidden = true;
    }, timeout || 3200);
  }

  function randomSeed(exclude) {
    let next = 0;
    if (global.crypto && global.crypto.getRandomValues) {
      const arr = new Uint16Array(1);
      global.crypto.getRandomValues(arr);
      next = arr[0];
    } else {
      next = Math.floor(Math.random() * 65536);
    }
    next = next % 65536;
    if (next === exclude) next = (next + 1) % 65536;
    return next;
  }

  function constraintsSnapshot() {
    return {
      maxSlope: state.maxSlope,
      spacing: state.spacingM / 10,
      count: state.count,
      density: state.density
    };
  }

  function updateRangeFill(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    const pct = T1.clamp((value - min) / (max - min), 0, 1) * 100;
    input.style.setProperty('--fill', pct.toFixed(2) + '%');
  }

  function syncSliders() {
    ui.reliefRange.value = String(state.relief);
    ui.slopeRange.value = String(state.maxSlope);
    ui.spacingRange.value = String(state.spacingM);
    ui.countRange.value = String(state.count);
    ui.densityRange.value = String(state.density);
    [ui.reliefRange, ui.slopeRange, ui.spacingRange, ui.countRange, ui.densityRange].forEach(updateRangeFill);

    ui.reliefValue.textContent = state.relief.toFixed(2);
    ui.slopeValue.textContent = String(state.maxSlope);
    ui.spacingValue.textContent = String(state.spacingM);
    ui.countValue.textContent = String(state.count);
    ui.densityValue.textContent = state.density.toFixed(2);

    ui.reliefRange.setAttribute('aria-valuetext', '起伏强度 ' + state.relief.toFixed(2));
    ui.slopeRange.setAttribute('aria-valuetext', '最大允许坡度 ' + state.maxSlope + ' 度');
    ui.spacingRange.setAttribute('aria-valuetext', '建筑最小中心间距 ' + state.spacingM + ' 米');
    ui.countRange.setAttribute('aria-valuetext', '目标建筑数量 ' + state.count + ' 栋');
    ui.densityRange.setAttribute('aria-valuetext', '聚落密度 ' + state.density.toFixed(2));

    const estimatedSpan = 4.1 + state.relief * 8.8;
    if (state.terrain && Math.abs(state.terrain.relief - state.relief) < 0.001) {
      ui.reliefMeters.textContent = 'ΔH ' + Math.round(state.terrain.spanM) + ' M';
    } else {
      ui.reliefMeters.textContent = 'ΔH ≈ ' + Math.round(estimatedSpan * 10) + ' M';
    }

    ui.buildLimitLabel.textContent = state.maxSlope + '°';
    ui.thresholdMarker.style.left = (T1.clamp(state.maxSlope / 50, 0, 1) * 100).toFixed(2) + '%';
  }

  /* ------------------------------------------------------------
     Renderer / scene
     ------------------------------------------------------------ */
  let scene;
  let camera;
  let renderer;
  let orbit;
  let sun;
  let root;
  let materials;
  let unitBox;
  let unitEdges;
  let edgeMaterial;
  let raycaster;
  let ndc;
  let resizeObserver;
  let clock;
  let lastFrameTime = 0;

  const VIEW_PRESETS = {
    axo: { theta: -0.72, phi: 1.145, targetY: 4.1, label: 'AXO', fitFactor: 0.94 },
    plan: { theta: 0.0, phi: 0.105, targetY: 1.4, label: 'PLAN', fitFactor: 0.79 },
    north: { theta: 0.0, phi: 1.185, targetY: 4.1, label: 'NORTH', fitFactor: 0.95 }
  };

  const materialSpecs = {
    terrain: { color: 0xffffff, roughness: 0.93, metalness: 0.012, vertexColors: true },
    side: { color: 0xc6bdac, roughness: 0.9, metalness: 0.005 },
    base: { color: 0xb3aa98, roughness: 0.92, metalness: 0.01 },
    foot: { color: 0x9b9281, roughness: 0.94, metalness: 0.0 },
    building: { color: 0xfbf7ed, roughness: 0.68, metalness: 0.006 },
    buildingSecondary: { color: 0xded8ca, roughness: 0.8, metalness: 0.004 },
    roof: { color: 0xeee8da, roughness: 0.62, metalness: 0.012 },
    foundation: { color: 0xbfb6a5, roughness: 0.92, metalness: 0.002 },
    cap: { color: 0xd3ccbd, roughness: 0.86, metalness: 0.006 },
    window: { color: 0x30312c, roughness: 0.48, metalness: 0.025 },
    accent: { color: 0xcf3a1e, roughness: 0.68, metalness: 0.008 },
    wall: { color: 0xd9d1c2, roughness: 0.9, metalness: 0.002 }
  };

  const NETWORK_OPACITY = 0.5;

  function createMaterials() {
    const mats = {};
    Object.keys(materialSpecs).forEach(function (key) {
      mats[key] = new THREE.MeshStandardMaterial(materialSpecs[key]);
    });
    mats.building.side = THREE.FrontSide;
    mats.glass = new THREE.MeshStandardMaterial({
      color: 0x3f4039,
      roughness: 0.4,
      metalness: 0.03
    });
    return mats;
  }

  function setupRendererAndScene() {
    if (!THREE) {
      throw new Error('THREE.js was not found.');
    }

    if (THREE.ColorManagement && 'legacyMode' in THREE.ColorManagement) {
      THREE.ColorManagement.legacyMode = false;
    }

    renderer = new THREE.WebGLRenderer({
      canvas: ui.canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, state.devicePixelRatioCap));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.localClippingEnabled = true;

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xf2f0e8, 120, 204);

    camera = new THREE.PerspectiveCamera(29, 1, 0.1, 500);
    camera.position.set(-50, 55, 78);

    root = new THREE.Group();
    root.name = 'terrain-lab-root';
    scene.add(root);

    materials = createMaterials();
    unitBox = new THREE.BoxGeometry(1, 1, 1);
    unitEdges = new THREE.EdgesGeometry(unitBox);
    edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x2d2b25,
      transparent: true,
      opacity: 0.4,
      depthWrite: false
    });

    // Lighting: lower warm sun + restrained fill for long architectural shadows.
    const hemi = new THREE.HemisphereLight(0xfffcf2, 0x968d7d, 0.62);
    scene.add(hemi);

    sun = new THREE.DirectionalLight(0xfff0d3, 2.34);
    sun.position.set(-31, 32, 23);
    sun.castShadow = true;
    sun.shadow.mapSize.set(isCompact ? 1024 : 2048, isCompact ? 1024 : 2048);
    sun.shadow.camera.left = -34;
    sun.shadow.camera.right = 34;
    sun.shadow.camera.top = 34;
    sun.shadow.camera.bottom = -34;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.042;
    sun.target.position.set(0, 2, 0);
    scene.add(sun);
    scene.add(sun.target);

    const fill = new THREE.DirectionalLight(0xfff8ed, 0.26);
    fill.position.set(32, 18, -34);
    scene.add(fill);

    // Selection / pointer helpers live above terrain.
    state.selectionRoot = new THREE.Group();
    state.selectionRoot.name = 'selection-helper';
    root.add(state.selectionRoot);

    state.pointerMarker = makePointerMarker();
    root.add(state.pointerMarker);

    raycaster = new THREE.Raycaster();
    ndc = new THREE.Vector2();

    orbit = new OrbitRig(camera, ui.canvas, {
      onInteract: handleCameraInteract,
      onTap: handleCanvasTap
    });

    resizeRenderer();
    if (global.ResizeObserver) {
      resizeObserver = new ResizeObserver(function () {
        resizeRenderer();
      });
      resizeObserver.observe(ui.stage);
    } else {
      global.addEventListener('resize', resizeRenderer);
    }

    clock = new THREE.Clock();
  }

  function resizeRenderer() {
    if (!renderer || !camera) return;
    const w = Math.max(1, ui.stage.clientWidth);
    const h = Math.max(1, ui.stage.clientHeight);
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, state.devicePixelRatioCap));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (state.ready && state.view !== 'free' && !state.autoOrbit) {
      const preset = VIEW_PRESETS[state.view];
      if (preset) {
        const aspectChange = Math.abs(camera.aspect - (state.lastAspect || camera.aspect));
        if (state.lastAspect && (aspectChange > 0.16 || aspectChange / state.lastAspect > 0.18)) {
          const fit = computeFitRadius(preset.theta, preset.phi, preset.targetY) * (preset.fitFactor || 1);
          orbit.setRadius(fit, false);
        }
      }
    }
    state.lastAspect = camera.aspect;
    updateOverlayPositions(true);
    updateScaleBar(true);
  }

  /* ------------------------------------------------------------
     Camera rig
     ------------------------------------------------------------ */
  class OrbitRig {
    constructor(cam, dom, options) {
      this.camera = cam;
      this.dom = dom;
      this.onInteract = options && options.onInteract;
      this.onTap = options && options.onTap;

      this.theta = -0.69;
      this.phi = 1.005;
      this.radius = 105;
      this.target = new THREE.Vector3(0, 3.2, 0);

      this.goalTheta = this.theta;
      this.goalPhi = this.phi;
      this.goalRadius = this.radius;
      this.goalTarget = this.target.clone();

      this.autoOrbit = false;
      this.autoOrbitSpeed = 0.045;
      this.dragging = false;
      this.mode = null;
      this.pointers = new Map();
      this.lastX = 0;
      this.lastY = 0;
      this.totalMoved = 0;
      this.startX = 0;
      this.startY = 0;
      this.startButton = 0;
      this.gesture = null;
      this.interactionNotified = false;

      this._onPointerDown = this._onPointerDown.bind(this);
      this._onPointerMove = this._onPointerMove.bind(this);
      this._onPointerUp = this._onPointerUp.bind(this);
      this._onWheel = this._onWheel.bind(this);
      this._onContext = function (e) { e.preventDefault(); };

      dom.addEventListener('pointerdown', this._onPointerDown);
      dom.addEventListener('pointermove', this._onPointerMove);
      dom.addEventListener('pointerup', this._onPointerUp);
      dom.addEventListener('pointercancel', this._onPointerUp);
      dom.addEventListener('wheel', this._onWheel, { passive: false });
      dom.addEventListener('contextmenu', this._onContext);

      this.update(0);
    }

    _notifyInteraction() {
      if (!this.interactionNotified) {
        this.interactionNotified = true;
        if (this.onInteract) this.onInteract();
      }
    }

    _onPointerDown(e) {
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      if (this.pointers.size === 0) {
        this.interactionNotified = false;
        this.totalMoved = 0;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.startButton = e.button;
      }

      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        this.dom.setPointerCapture(e.pointerId);
      } catch (err) {
        // Pointer capture is optional.
      }

      if (this.pointers.size === 1) {
        this.mode = (e.button === 1 || e.button === 2 || e.shiftKey) ? 'pan' : 'rotate';
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.dragging = true;
        this.dom.classList.add('is-dragging');
        this.dom.classList.remove('is-hovering');
      } else if (this.pointers.size === 2) {
        const pts = Array.from(this.pointers.values());
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        this.gesture = {
          distance: Math.max(1, Math.hypot(dx, dy)),
          centreX: (pts[0].x + pts[1].x) / 2,
          centreY: (pts[0].y + pts[1].y) / 2,
          startRadius: this.goalRadius
        };
        this.mode = 'gesture';
      }

      e.preventDefault();
    }

    _onPointerMove(e) {
      if (!this.pointers.has(e.pointerId)) return;
      const point = this.pointers.get(e.pointerId);
      point.x = e.clientX;
      point.y = e.clientY;

      if (this.pointers.size >= 2) {
        const pts = Array.from(this.pointers.values()).slice(0, 2);
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const cx = (pts[0].x + pts[1].x) / 2;
        const cy = (pts[0].y + pts[1].y) / 2;
        if (!this.gesture) {
          this.gesture = {
            distance: dist,
            centreX: cx,
            centreY: cy,
            startRadius: this.goalRadius
          };
        }
        this.goalRadius = T1.clamp(this.gesture.startRadius * this.gesture.distance / dist, this.minRadius || 32, this.maxRadius || 190);
        this.panScene(cx - this.gesture.centreX, cy - this.gesture.centreY);
        this.gesture.centreX = cx;
        this.gesture.centreY = cy;
        this.totalMoved += Math.abs(dist - this.gesture.distance) + Math.abs(cx - this.lastX) + Math.abs(cy - this.lastY);
        this.lastX = cx;
        this.lastY = cy;
        this._notifyInteraction();
        e.preventDefault();
        return;
      }

      if (this.mode === 'gesture') this.mode = 'rotate';
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.totalMoved += Math.abs(dx) + Math.abs(dy);

      if (Math.abs(dx) + Math.abs(dy) > 0.3) {
        if (this.mode === 'pan') {
          this.panScene(dx, dy);
        } else {
          this.goalTheta -= dx * 0.0052;
          this.goalPhi = T1.clamp(this.goalPhi - dy * 0.0042, 0.075, 1.43);
        }
        this._notifyInteraction();
      }
      e.preventDefault();
    }

    _onPointerUp(e) {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      try {
        this.dom.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore.
      }

      const wasTap = this.totalMoved < 5 && this.startButton === 0 && this.mode !== 'pan';
      if (this.pointers.size === 0) {
        this.dragging = false;
        this.dom.classList.remove('is-dragging');
        this.gesture = null;
        const tapMode = this.mode;
        this.mode = null;
        if (wasTap && tapMode !== 'gesture' && this.onTap) {
          this.onTap(e);
        }
      } else if (this.pointers.size === 1) {
        const remaining = Array.from(this.pointers.values())[0];
        this.lastX = remaining.x;
        this.lastY = remaining.y;
        this.gesture = null;
        this.mode = 'rotate';
      }
    }

    _onWheel(e) {
      e.preventDefault();
      const delta = T1.clamp(e.deltaY, -120, 120);
      this.goalRadius = T1.clamp(this.goalRadius * Math.exp(delta * 0.00155), 31, 190);
      this._notifyInteraction();
    }

    panScene(dx, dy) {
      const wpp = (2 * this.goalRadius * Math.tan((this.camera.fov * Math.PI / 180) / 2)) /
        Math.max(1, this.dom.clientHeight);
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
      this.goalTarget.addScaledVector(right, -dx * wpp);
      this.goalTarget.addScaledVector(up, dy * wpp);
      this.goalTarget.x = T1.clamp(this.goalTarget.x, -25, 25);
      this.goalTarget.z = T1.clamp(this.goalTarget.z, -25, 25);
      this.goalTarget.y = T1.clamp(this.goalTarget.y, -4, 19);
    }

    setGoal(theta, phi, radius, target, animate) {
      this.goalTheta = theta;
      this.goalPhi = T1.clamp(phi, 0.075, 1.43);
      this.goalRadius = radius;
      if (target) this.goalTarget.copy(target);
      if (!animate) {
        this.theta = this.goalTheta;
        this.phi = this.goalPhi;
        this.radius = this.goalRadius;
        this.target.copy(this.goalTarget);
      }
    }

    snap(theta, phi, radius, target) {
      this.theta = this.goalTheta = theta;
      this.phi = this.goalPhi = T1.clamp(phi, 0.075, 1.43);
      this.radius = this.goalRadius = radius;
      if (target) {
        this.target.copy(target);
        this.goalTarget.copy(target);
      }
      this.update(0);
    }

    setRadius(radius, animate) {
      this.goalRadius = radius;
      if (!animate) this.radius = radius;
    }

    nudge(dTheta, dPhi, zoomFactor) {
      this.goalTheta += dTheta;
      this.goalPhi = T1.clamp(this.goalPhi + dPhi, 0.075, 1.43);
      if (zoomFactor) {
        this.goalRadius = T1.clamp(this.goalRadius * zoomFactor, 31, 190);
      }
      this._notifyInteraction();
    }

    update(dt) {
      const dtc = Math.min(dt || 0, 0.08);
      if (this.autoOrbit && !this.dragging) {
        this.goalTheta += this.autoOrbitSpeed * dtc;
      }
      const damp = 1 - Math.exp(-9.5 * dtc);
      this.theta += (this.goalTheta - this.theta) * (dtc === 0 ? 1 : damp);
      this.phi += (this.goalPhi - this.phi) * (dtc === 0 ? 1 : damp);
      this.radius += (this.goalRadius - this.radius) * (dtc === 0 ? 1 : damp);
      this.target.lerp(this.goalTarget, dtc === 0 ? 1 : damp);

      const sinPhi = Math.sin(this.phi);
      this.camera.position.set(
        this.target.x + this.radius * sinPhi * Math.sin(this.theta),
        this.target.y + this.radius * Math.cos(this.phi),
        this.target.z + this.radius * sinPhi * Math.cos(this.theta)
      );
      this.camera.lookAt(this.target);
      this.camera.updateMatrixWorld();
    }

    getElevation() {
      return 90 - this.phi * 180 / Math.PI;
    }

    getAzimuth() {
      let a = (this.theta * 180 / Math.PI) % 360;
      if (a < 0) a += 360;
      return a;
    }
  }

  OrbitRig.prototype.minRadius = 31;
  OrbitRig.prototype.maxRadius = 190;

  /* ------------------------------------------------------------
     Camera views + fit
     ------------------------------------------------------------ */
  function computeFitRadius(theta, phi, targetY) {
    if (!camera) return 105;
    const proxy = new THREE.PerspectiveCamera(camera.fov, camera.aspect, 0.1, 800);
    const target = new THREE.Vector3(0, targetY, 0);
    const points = [];
    const t = state.terrain;
    const halfW = T1.SITE_WIDTH / 2 + 0.8;
    const halfD = T1.SITE_DEPTH / 2 + 0.8;
    const bottom = -3.55;
    const top = t ? t.maxHeight + 5.2 : 18;
    const xs = [-halfW, halfW];
    const zs = [-halfD, halfD];
    const ys = [bottom, top];

    for (let xi = 0; xi < 2; xi++) {
      for (let zi = 0; zi < 2; zi++) {
        for (let yi = 0; yi < 2; yi++) {
          points.push(new THREE.Vector3(xs[xi], ys[yi], zs[zi]));
        }
      }
    }
    if (t) {
      points.push(new THREE.Vector3(t.peak.x, t.peak.h, t.peak.z));
      points.push(new THREE.Vector3(0, 0, 0));
    }

    let lo = 35;
    let hi = 190;
    const maxX = 0.9;
    const maxY = 0.79;

    for (let iter = 0; iter < 26; iter++) {
      const mid = (lo + hi) / 2;
      const sinPhi = Math.sin(phi);
      proxy.position.set(
        target.x + mid * sinPhi * Math.sin(theta),
        target.y + mid * Math.cos(phi),
        target.z + mid * sinPhi * Math.cos(theta)
      );
      proxy.lookAt(target);
      proxy.updateMatrixWorld();
      proxy.updateProjectionMatrix();

      let fits = true;
      for (let k = 0; k < points.length; k++) {
        const p = points[k].clone().project(proxy);
        if (Math.abs(p.x) > maxX || Math.abs(p.y) > maxY || p.z > 1) {
          fits = false;
          break;
        }
      }
      if (fits) hi = mid;
      else lo = mid;
    }
    return T1.clamp(Math.round(hi * 10) / 10, 45, 180);
  }

  function setViewPreset(name, options) {
    options = options || {};
    const preset = VIEW_PRESETS[name];
    if (!preset) return;
    state.view = name;
    state.autoOrbit = false;
    if (orbit) orbit.autoOrbit = false;
    ui.btnOrbit.setAttribute('aria-pressed', 'false');
    const fit = computeFitRadius(preset.theta, preset.phi, preset.targetY) * (preset.fitFactor || 1);
    const target = new THREE.Vector3(0, preset.targetY, 0);
    if (orbit) {
      if (options.initial) {
        orbit.snap(
          preset.theta - 0.06,
          preset.phi + 0.035,
          fit * 1.1,
          target
        );
      }
      orbit.setGoal(preset.theta, preset.phi, fit, target, !options.immediate);
      if (options.immediate) {
        orbit.snap(preset.theta, preset.phi, fit, target);
      }
    }
    updateViewButtons();
    updateCameraReadout(true);
  }

  function updateViewButtons() {
    ui.viewButtons.forEach(function (btn) {
      const on = btn.dataset.view === state.view;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function handleCameraInteract() {
    const wasView = state.view;
    state.view = 'free';
    state.autoOrbit = false;
    if (orbit) orbit.autoOrbit = false;
    ui.btnOrbit.setAttribute('aria-pressed', 'false');
    if (wasView !== 'free' || document.querySelector('.view-btn.is-active')) {
      updateViewButtons();
    }
    updateCameraReadout(true);
  }

  function updateCameraReadout(force) {
    if (!orbit || !ui.viewModeLabel) return;
    if (state.busy) {
      ui.viewModeLabel.textContent = 'COMPUTING';
      return;
    }
    const el = Math.round(orbit.getElevation());
    let prefix = 'FREE';
    if (state.autoOrbit) prefix = 'AUTO ORBIT';
    else if (VIEW_PRESETS[state.view]) prefix = VIEW_PRESETS[state.view].label;
    const text = prefix + ' / ' + el + '°';
    if (force || ui.viewModeLabel.textContent !== text) {
      ui.viewModeLabel.textContent = text;
    }
  }

  function handleOrbitToggle() {
    state.autoOrbit = !state.autoOrbit;
    ui.btnOrbit.setAttribute('aria-pressed', state.autoOrbit ? 'true' : 'false');
    if (orbit) orbit.autoOrbit = state.autoOrbit;
    if (state.autoOrbit) {
      state.view = 'free';
      updateViewButtons();
    }
    updateCameraReadout(true);
    showToast(state.autoOrbit ? 'AUTO ORBIT / 自动环视开启' : 'AUTO ORBIT / 自动环视关闭', 1700);
  }

  /* ------------------------------------------------------------
     Terrain visuals
     ------------------------------------------------------------ */
  function disposeObject(rootObj) {
    if (!rootObj) return;
    const keep = new Set([unitBox, unitEdges, edgeMaterial, state.slopeMaterial]);
    if (materials) {
      Object.keys(materials).forEach(function (key) { keep.add(materials[key]); });
    }
    rootObj.traverse(function (child) {
      if (child.geometry && !keep.has(child.geometry)) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(function (mat) {
          if (mat && !keep.has(mat)) {
            if (mat.map) mat.map.dispose();
            mat.dispose();
          }
        });
      }
    });
    if (rootObj.parent) rootObj.parent.remove(rootObj);
  }

  function makeTerrainGeometry(terrain) {
    const n = terrain.n;
    const count = n * n;
    const positions = new Float32Array(count * 3);
    const baseColors = new Float32Array(count * 3);
    const slopeColors = new Float32Array(count * 3);
    const indices = new Uint32Array(terrain.segments * terrain.segments * 6);
    const color = new THREE.Color();
    const lowTint = new THREE.Color(0xd6cdbc);
    const highTint = new THREE.Color(0xf0eadc);
    const vertexColor = new THREE.Color();
    const halfW = terrain.width / 2;
    const halfD = terrain.depth / 2;

    for (let j = 0; j < n; j++) {
      const z = -halfD + j * terrain.cellZ;
      for (let i = 0; i < n; i++) {
        const id = j * n + i;
        const x = -halfW + i * terrain.cellX;
        const h = terrain.heights[id];
        positions[id * 3] = x;
        positions[id * 3 + 1] = h;
        positions[id * 3 + 2] = z;

        // A quiet elevation tint gives the plaster-like terrain some depth
        // before the slope overlay or the contour system is switched on.
        const elevationT = T1.smoothstep(0.015, 0.98, terrain.normalized[id]);
        vertexColor.copy(lowTint).lerp(highTint, elevationT);
        baseColors[id * 3] = vertexColor.r;
        baseColors[id * 3 + 1] = vertexColor.g;
        baseColors[id * 3 + 2] = vertexColor.b;

        const rgb = T1.slopeRgb(terrain.slopes[id]);
        color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace || 'srgb');
        slopeColors[id * 3] = color.r;
        slopeColors[id * 3 + 1] = color.g;
        slopeColors[id * 3 + 2] = color.b;
      }
    }

    let ptr = 0;
    for (let j = 0; j < terrain.segments; j++) {
      for (let i = 0; i < terrain.segments; i++) {
        const a = j * n + i;
        const b = a + 1;
        const c = (j + 1) * n + i;
        const d = c + 1;
        indices[ptr++] = a;
        indices[ptr++] = c;
        indices[ptr++] = b;
        indices[ptr++] = b;
        indices[ptr++] = c;
        indices[ptr++] = d;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(baseColors, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    // Bake a restrained cartographic hillshade into the slope overlay. Keeping
    // it unlit makes slope classes legible and stable, like a GIS plate.
    const normals = geo.getAttribute('normal');
    const sunDir = new THREE.Vector3(-0.52, 0.68, 0.42).normalize();
    for (let k = 0; k < count; k++) {
      const nx = normals.getX(k);
      const ny = normals.getY(k);
      const nz = normals.getZ(k);
      const lambert = Math.max(0, nx * sunDir.x + ny * sunDir.y + nz * sunDir.z);
      const shade = 0.66 + 0.41 * lambert;
      slopeColors[k * 3] = Math.min(1, slopeColors[k * 3] * shade);
      slopeColors[k * 3 + 1] = Math.min(1, slopeColors[k * 3 + 1] * shade);
      slopeColors[k * 3 + 2] = Math.min(1, slopeColors[k * 3 + 2] * shade);
    }

    geo.userData.slopeColors = slopeColors;
    return geo;
  }

  function makeGridSegments(terrain) {
    const positions = [];
    const step = 2.4;
    const sampleStep = 0.7;
    const halfW = terrain.width / 2;
    const halfD = terrain.depth / 2;

    for (let x = -halfW; x <= halfW + 0.001; x += step) {
      let prevZ = -halfD;
      let prevH = terrain.sampleHeight(x, prevZ) + 0.024;
      for (let z = -halfD + sampleStep; z <= halfD + 0.001; z += sampleStep) {
        const h = terrain.sampleHeight(x, z) + 0.024;
        positions.push(x, prevH, prevZ, x, h, z);
        prevZ = z;
        prevH = h;
      }
    }
    for (let z = -halfD; z <= halfD + 0.001; z += step) {
      let prevX = -halfW;
      let prevH = terrain.sampleHeight(prevX, z) + 0.024;
      for (let x = -halfW + sampleStep; x <= halfW + 0.001; x += sampleStep) {
        const h = terrain.sampleHeight(x, z) + 0.024;
        positions.push(prevX, prevH, z, x, h, z);
        prevX = x;
        prevH = h;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }

  function makeSideWallGeometry(terrain) {
    const n = terrain.n;
    const bottom = -3.04;
    const halfW = terrain.width / 2;
    const halfD = terrain.depth / 2;
    const positions = [];
    const normals = [];
    const indices = [];
    let vertexOffset = 0;

    function addWall(topPoints, nx, nz) {
      const start = vertexOffset;
      const count = topPoints.length;
      for (let i = 0; i < count; i++) {
        const p = topPoints[i];
        positions.push(p[0], p[1], p[2]);
        positions.push(p[0], bottom, p[2]);
        normals.push(nx, 0, nz, nx, 0, nz);
      }
      for (let i = 0; i < count - 1; i++) {
        const a = start + i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, c, b, c, d, b);
      }
      vertexOffset += count * 2;
    }

    // north: x increasing, outward normal -Z
    let top = [];
    for (let i = 0; i < n; i++) {
      top.push([-halfW + i * terrain.cellX, terrain.heights[i], -halfD]);
    }
    addWall(top, 0, -1);

    // south: x decreasing, outward normal +Z
    top = [];
    for (let i = n - 1; i >= 0; i--) {
      top.push([-halfW + i * terrain.cellX, terrain.heights[(n - 1) * n + i], halfD]);
    }
    addWall(top, 0, 1);

    // east: z increasing, outward normal +X
    top = [];
    for (let j = 0; j < n; j++) {
      top.push([halfW, terrain.heights[j * n + (n - 1)], -halfD + j * terrain.cellZ]);
    }
    addWall(top, 1, 0);

    // west: z decreasing, outward normal -X
    top = [];
    for (let j = n - 1; j >= 0; j--) {
      top.push([-halfW, terrain.heights[j * n], -halfD + j * terrain.cellZ]);
    }
    addWall(top, -1, 0);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
  }

  function makeSectionSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 96, 96);
    ctx.fillStyle = 'rgba(248,246,240,0.82)';
    ctx.beginPath();
    ctx.arc(48, 48, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,65,56,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#403c33';
    ctx.font = '600 34px Consolas, "Cascadia Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 48, 51);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.6, 1.6, 1);
    sprite.renderOrder = 5;
    return sprite;
  }

  function addSectionDrawing(parent, terrain) {
    const zSection = 0.15;
    const halfW = terrain.width / 2;
    const points = [];
    const samples = 150;
    for (let i = 0; i < samples; i++) {
      const x = T1.lerp(-halfW + 0.4, halfW - 0.4, i / (samples - 1));
      points.push(new THREE.Vector3(x, terrain.sampleHeight(x, zSection) + 0.082, zSection));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineDashedMaterial({
        color: 0x4b463d,
        transparent: true,
        opacity: 0.58,
        dashSize: 0.19,
        gapSize: 0.15,
        depthWrite: false
      })
    );
    line.computeLineDistances();
    line.renderOrder = 4;
    parent.add(line);

    const ends = [-halfW + 0.4, halfW - 0.4];
    ends.forEach(function (x, index) {
      const y = terrain.sampleHeight(x, zSection) + 0.07;
      const tickGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y + 0.02, zSection - 0.42),
        new THREE.Vector3(x, y + 0.02, zSection + 0.42)
      ]);
      const tick = new THREE.Line(tickGeo, new THREE.LineBasicMaterial({
        color: 0x585349,
        transparent: true,
        opacity: 0.58
      }));
      parent.add(tick);
      const label = makeSectionSprite(index === 0 ? 'A' : "A'");
      label.position.set(x + (index === 0 ? 0.8 : -0.8), y + 0.95, zSection);
      parent.add(label);
    });
  }

  function makeBoundaryLoop(terrain) {
    const points = [];
    const n = terrain.n;
    const halfW = terrain.width / 2;
    const halfD = terrain.depth / 2;
    for (let i = 0; i < n; i++) {
      points.push(new THREE.Vector3(-halfW + i * terrain.cellX, terrain.heights[i] + 0.042, -halfD));
    }
    for (let j = 1; j < n; j++) {
      points.push(new THREE.Vector3(halfW, terrain.heights[j * n + (n - 1)] + 0.042, -halfD + j * terrain.cellZ));
    }
    for (let i = n - 2; i >= 0; i--) {
      points.push(new THREE.Vector3(-halfW + i * terrain.cellX, terrain.heights[(n - 1) * n + i] + 0.042, halfD));
    }
    for (let j = n - 2; j >= 0; j--) {
      points.push(new THREE.Vector3(-halfW, terrain.heights[j * n] + 0.042, -halfD + j * terrain.cellZ));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }

  function buildTerrainScene(terrain) {
    if (state.terrainGroup) {
      disposeObject(state.terrainGroup);
      state.terrainGroup = null;
    }

    const group = new THREE.Group();
    group.name = 'terrain';
    state.terrainGroup = group;
    state.limitLine = null;

    const geometry = makeTerrainGeometry(terrain);
    const mesh = new THREE.Mesh(geometry, materials.terrain);
    mesh.name = 'terrain-base';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    state.terrainMesh = mesh;

    const slopeGeometry = geometry.clone();
    slopeGeometry.setAttribute('color', new THREE.BufferAttribute(geometry.userData.slopeColors, 3));

    state.slopeMaterial = state.slopeMaterial || new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    state.slopePlane = state.slopePlane || new THREE.Plane(new THREE.Vector3(1, 0, 0), -40);
    state.slopeMaterial.clippingPlanes = [state.slopePlane];
    state.slopeMaterial.clipShadows = false;

    const slope = new THREE.Mesh(slopeGeometry, state.slopeMaterial);
    slope.name = 'slope-overlay';
    slope.position.y = 0.012;
    slope.receiveShadow = false;
    slope.castShadow = false;
    slope.renderOrder = 2;
    slope.visible = state.analysis;
    group.add(slope);
    state.slopeMesh = slope;

    if (state.analysis) {
      state.slopeMaterial.opacity = 1;
      state.slopePlane.constant = terrain.width / 2 + 3;
    }

    const contours = terrain.extractContours();
    terrain.contourData = contours;

    const minorMat = new THREE.LineBasicMaterial({
      color: 0x6b665b,
      transparent: true,
      opacity: 0.43,
      depthWrite: false
    });
    const majorMat = new THREE.LineBasicMaterial({
      color: 0x3d3931,
      transparent: true,
      opacity: 0.78,
      depthWrite: false
    });

    if (contours.minor.length) {
      const minorGeo = new THREE.BufferGeometry();
      minorGeo.setAttribute('position', new THREE.BufferAttribute(contours.minor, 3));
      const minor = new THREE.LineSegments(minorGeo, minorMat);
      minor.renderOrder = 3;
      group.add(minor);
    }
    if (contours.major.length) {
      const majorGeo = new THREE.BufferGeometry();
      majorGeo.setAttribute('position', new THREE.BufferAttribute(contours.major, 3));
      const major = new THREE.LineSegments(majorGeo, majorMat);
      major.renderOrder = 3;
      group.add(major);
    }

    const gridGeo = makeGridSegments(terrain);
    const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({
      color: 0x8c8677,
      transparent: true,
      opacity: 0.15,
      depthWrite: false
    }));
    grid.renderOrder = 1;
    group.add(grid);

    const boundary = new THREE.LineLoop(makeBoundaryLoop(terrain), new THREE.LineBasicMaterial({
      color: 0x5b574e,
      transparent: true,
      opacity: 0.38
    }));
    group.add(boundary);

    addSectionDrawing(group, terrain);

    const walls = new THREE.Mesh(makeSideWallGeometry(terrain), materials.side);
    walls.name = 'terrain-section-walls';
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(terrain.width + 0.8, 0.27, terrain.depth + 0.8),
      materials.base
    );
    base.position.y = -3.175;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(terrain.width + 1.15, 0.11, terrain.depth + 1.15),
      materials.foot
    );
    foot.position.y = -3.36;
    foot.castShadow = true;
    foot.receiveShadow = true;
    group.add(foot);

    // Survey dashes around the physical model base.
    const baseOutlinePoints = [
      new THREE.Vector3(-terrain.width / 2 - 0.6, -3.29, -terrain.depth / 2 - 0.6),
      new THREE.Vector3(terrain.width / 2 + 0.6, -3.29, -terrain.depth / 2 - 0.6),
      new THREE.Vector3(terrain.width / 2 + 0.6, -3.29, terrain.depth / 2 + 0.6),
      new THREE.Vector3(-terrain.width / 2 - 0.6, -3.29, terrain.depth / 2 + 0.6)
    ];
    const baseLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(baseOutlinePoints),
      new THREE.LineBasicMaterial({ color: 0x817b6e, transparent: true, opacity: 0.32 })
    );
    group.add(baseLine);

    root.add(group);
    updateAnalysisUI();

    if (state.plan) {
      // Terrain has changed under an active plan; the plan will be rebuilt
      // immediately afterwards, so no stale visual markers should linger.
      clearSelection();
    }
  }

  /* ------------------------------------------------------------
     Building models
     ------------------------------------------------------------ */
  function addBox(parent, dims, pos, material, castsShadow, receivesShadow, outline) {
    const mesh = new THREE.Mesh(unitBox, material);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.scale.set(dims.w, dims.h, dims.d);
    mesh.castShadow = castsShadow !== false;
    mesh.receiveShadow = receivesShadow !== false;
    parent.add(mesh);

    if (outline) {
      const edges = new THREE.LineSegments(unitEdges, edgeMaterial);
      edges.position.copy(mesh.position);
      edges.scale.copy(mesh.scale).multiplyScalar(1.006);
      edges.renderOrder = 3;
      parent.add(edges);
    }
    return mesh;
  }

  function buildBuildingModels(plan) {
    if (state.buildingRoot) {
      root.remove(state.buildingRoot);
      state.buildingRoot = null;
    }
    const groupRoot = new THREE.Group();
    groupRoot.name = 'settlement';
    state.buildingRoot = groupRoot;
    state.buildingObjects = [];
    if (renderer) renderer.shadowMap.needsUpdate = true;

    const geometry = unitBox;

    plan.sites.forEach(function (site, index) {
      const group = new THREE.Group();
      group.name = site.id;
      group.position.set(site.x, site.baseBottom, site.z);
      group.rotation.y = site.rotation;
      group.userData.site = site;
      group.userData.index = index;
      group.userData.isBuilding = true;
      group.userData.growthDelay = 0;
      group.visible = false;

      const foundation = addBox(
        group,
        { w: site.foundation.w, h: site.foundation.h, d: site.foundation.d },
        { x: 0, y: site.foundation.h / 2, z: 0 },
        materials.foundation,
        true,
        true,
        true
      );
      foundation.userData.buildingIndex = index;

      const cap = addBox(
        group,
        { w: site.cap.w, h: site.cap.h, d: site.cap.d },
        { x: 0, y: site.foundation.h + site.cap.h / 2, z: 0 },
        materials.cap,
        true,
        true
      );
      cap.userData.buildingIndex = index;

      site.volumes.forEach(function (volume) {
        let mat = materials.building;
        if (volume.kind === 'secondary') mat = materials.buildingSecondary;
        if (volume.kind === 'wall') mat = materials.wall;
        const mesh = addBox(
          group,
          { w: volume.w, h: volume.h, d: volume.d },
          { x: volume.x, y: volume.y + volume.h / 2, z: volume.z },
          mat,
          true,
          true,
          true
        );
        mesh.userData.buildingIndex = index;
      });

      site.roofs.forEach(function (roof) {
        const mesh = addBox(
          group,
          { w: roof.w, h: roof.h, d: roof.d },
          { x: roof.x, y: roof.y, z: roof.z },
          materials.roof,
          true,
          true,
          true
        );
        mesh.userData.buildingIndex = index;
      });

      site.windows.forEach(function (win) {
        const mesh = addBox(
          group,
          { w: win.w, h: win.h, d: win.d },
          { x: win.x, y: win.y + win.h / 2, z: win.z },
          materials.glass,
          false,
          false
        );
        mesh.userData.buildingIndex = index;
      });

      site.accents.forEach(function (accent) {
        const mesh = addBox(
          group,
          { w: accent.w, h: accent.h, d: accent.d },
          { x: accent.x, y: accent.y + accent.h / 2, z: accent.z },
          materials.accent,
          true,
          true
        );
        mesh.userData.buildingIndex = index;
      });

      if (site.fixtures) {
        const fixture = site.fixtures;
        const mesh = addBox(
          group,
          { w: fixture.w, h: fixture.h, d: fixture.d },
          { x: fixture.x, y: fixture.y + fixture.h / 2, z: fixture.z },
          materials.accent,
          true,
          true
        );
        mesh.userData.buildingIndex = index;
      }

      groupRoot.add(group);
      state.buildingObjects.push({
        group: group,
        site: site,
        index: index
      });
    });

    state.buildingRoot = groupRoot;
    root.add(groupRoot);
    state.buildingPickRoot = groupRoot;
    applyGrowthPose(state.buildingObjects, 0);
  }

  function buildNetwork(plan) {
    if (state.network) {
      disposeObject(state.network);
      state.network = null;
    }
    if (!plan.links.positions || !plan.links.positions.length) return;

    // Turn the MST line segments into narrow terrain-following ribbons.
    // A one-pixel WebGL line vanishes at overview distance; the ribbon keeps
    // the access topology legible without becoming a decorative overlay.
    const src = plan.links.positions;
    const positions = [];
    const halfWidth = 0.075;
    for (let i = 0; i < src.length; i += 6) {
      const x0 = src[i];
      const y0 = src[i + 1] + 0.025;
      const z0 = src[i + 2];
      const x1 = src[i + 3];
      const y1 = src[i + 4] + 0.025;
      const z1 = src[i + 5];
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.max(0.0001, Math.sqrt(dx * dx + dz * dz));
      const nx = -dz / len * halfWidth;
      const nz = dx / len * halfWidth;
      // Two triangles for this path segment.
      positions.push(
        x0 + nx, y0, z0 + nz,
        x0 - nx, y0, z0 - nz,
        x1 + nx, y1, z1 + nz,
        x1 + nx, y1, z1 + nz,
        x0 - nx, y0, z0 - nz,
        x1 - nx, y1, z1 - nz
      );
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeBoundingSphere();
    state.networkMaterial = new THREE.MeshBasicMaterial({
      color: 0xc65330,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    });
    const mesh = new THREE.Mesh(geo, state.networkMaterial);
    mesh.name = 'settlement-links';
    mesh.renderOrder = 5;
    state.network = mesh;
    root.add(mesh);
  }

  function applyGrowthPose(objects, elapsed) {
    if (!objects) return;
    const total = objects.length;
    if (!total) return;
    const staggerTotal = Math.min(1.72, 0.035 * total);
    const delayStep = total > 1 ? staggerTotal / (total - 1) : 0;
    let finished = 0;
    let started = 0;

    for (let i = 0; i < total; i++) {
      const obj = objects[i];
      const delay = 0.12 + i * delayStep;
      const local = T1.clamp((elapsed - delay) / 0.66, 0, 1);
      const eased = T1.easeOutQuint(local);
      const scale = 0.0015 + eased * 0.9985;
      obj.group.scale.y = scale;
      obj.group.visible = local > 0;
      if (local > 0.08) started++;
      if (local >= 1) finished++;
    }
    if (renderer) renderer.shadowMap.needsUpdate = true;

    return { finished: finished, started: started, total: total };
  }

  function startGrowth(options) {
    options = options || {};
    clearTimeout(state.growthHideTimer);
    ui.growthMeter.hidden = true;
    ui.growthMeter.classList.remove('is-complete');

    if (!state.buildingObjects || !state.buildingObjects.length) {
      state.growth = null;
      if (state.networkMaterial) state.networkMaterial.opacity = NETWORK_OPACITY;
      return;
    }

    const startDelay = reducedMotion ? 0 : (options.initial ? 620 : 120);

    if (reducedMotion) {
      state.buildingObjects.forEach(function (obj) {
        obj.group.visible = true;
        obj.group.scale.y = 1;
      });
      if (state.networkMaterial) state.networkMaterial.opacity = NETWORK_OPACITY;
      if (renderer) renderer.shadowMap.needsUpdate = true;
      state.growth = null;
      updateGrowthReadout(1, 1, state.buildingObjects.length);
      ui.footerStatus.textContent = buildFooterSummary();
      return;
    }

    state.growth = {
      start: performance.now() + startDelay,
      objects: state.buildingObjects,
      total: state.buildingObjects.length,
      lastDisplayed: -1,
      initial: !!options.initial
    };
    if (state.networkMaterial) state.networkMaterial.opacity = 0;
    ui.growthMeter.hidden = false;
    ui.growthFill.style.width = '0%';
    ui.growthCount.textContent = '00 / ' + T1.pad(state.growth.total, 2);
    updateGrowthReadout(0, 0, state.growth.total);
  }

  function updateGrowth(now) {
    if (!state.growth) return;
    const elapsed = Math.max(0, (now - state.growth.start) / 1000);
    const result = applyGrowthPose(state.growth.objects, elapsed);
    if (!result) return;

    const progress = T1.clamp(result.finished / result.total, 0, 1);
    ui.growthFill.style.width = (progress * 100).toFixed(1) + '%';
    const displayUnits = progress >= 1 ? result.total : result.started;
    if (displayUnits !== state.growth.lastDisplayed) {
      state.growth.lastDisplayed = displayUnits;
      ui.growthCount.textContent = T1.pad(displayUnits, 2) + ' / ' + T1.pad(result.total, 2);
    }
    updateGrowthReadout(result.started, result.finished, result.total);

    if (state.networkMaterial) {
      state.networkMaterial.opacity = T1.smoothstep(0.24, 0.9, progress) * NETWORK_OPACITY;
    }

    const staggerTotal = Math.min(1.72, 0.035 * result.total);
    const delayStep = result.total > 1 ? staggerTotal / (result.total - 1) : 0;
    const lastFinish = 0.12 + (result.total - 1) * delayStep + 0.66;

    if (progress >= 1 && elapsed >= lastFinish - 0.01) {
      state.growth.objects.forEach(function (obj) {
        obj.group.scale.y = 1;
        obj.group.visible = true;
      });
      if (state.networkMaterial) state.networkMaterial.opacity = NETWORK_OPACITY;
      state.growth = null;
      if (renderer) renderer.shadowMap.needsUpdate = true;
      ui.footerStatus.textContent = buildFooterSummary();
      ui.growthMeter.classList.add('is-complete');
      state.growthHideTimer = setTimeout(function () {
        if (!state.growth) ui.growthMeter.hidden = true;
      }, 700);
      setLiveStatus('聚落生长完成。');
    }
  }

  function updateGrowthReadout(started, finished, total) {
    if (!total) {
      setText(ui.liveStatus, '当前约束下没有可落位建筑。');
      return;
    }
    if (finished >= total) {
      setLiveStatus('聚落生长完成，共 ' + total + ' 栋建筑。');
    }
  }

  function buildFooterSummary() {
    if (!state.plan) return 'RULE-BASED SITING / 坡度—间距—生长';
    const placed = state.plan.sites.length;
    const requested = state.plan.requested;
    const limited = placed < requested ? ' / CONSTRAINT LIMIT' : '';
    return 'RULE-BASED SITING / ' + placed + '—' + requested + ' UNITS' + limited + ' / ' + state.lastBuildMs + ' MS';
  }

  /* ------------------------------------------------------------
     Selection + pointer annotations
     ------------------------------------------------------------ */
  function clearSelectionVisuals() {
    if (!state.selectionRoot) return;
    while (state.selectionRoot.children.length) {
      const child = state.selectionRoot.children.pop();
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(function (mat) { mat.dispose(); });
        } else {
          child.material.dispose();
        }
      }
    }
  }

  function clearSelection(updateUIOnly) {
    state.selectedIndex = -1;
    clearSelectionVisuals();
    ui.selectionCard.hidden = true;
    ui.selectionTag.hidden = true;
    if (!updateUIOnly) setLiveStatus('已清除建筑选择。');
  }

  function selectBuilding(index) {
    if (!state.plan || !state.plan.sites[index]) return;
    const site = state.plan.sites[index];
    state.selectedIndex = index;
    if (state.selectionRoot) {
      clearSelectionVisuals();
      const ringRadius = Math.max(site.padW, site.padD) * 0.63 + 0.22;
      const points = [];
      const segments = 64;
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const x = site.x + Math.cos(a) * ringRadius;
        const z = site.z + Math.sin(a) * ringRadius;
        points.push(new THREE.Vector3(x, state.terrain.sampleHeight(x, z) + 0.09, z));
      }
      const ringGeo = new THREE.BufferGeometry().setFromPoints(points);
      const ring = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({
        color: 0xd63c20,
        transparent: true,
        opacity: 0.95,
        depthTest: true
      }));
      ring.renderOrder = 7;
      state.selectionRoot.add(ring);

      // A tiny cross on the terrace cap gives the selection a survey feel.
      const crossSize = Math.max(site.padW, site.padD) * 0.42;
      const crossY = site.baseBottom + site.foundation.h + site.cap.h + 0.03;
      const crossPositions = [
        site.x - crossSize, crossY, site.z, site.x - crossSize * 0.35, crossY, site.z,
        site.x + crossSize * 0.35, crossY, site.z, site.x + crossSize, crossY, site.z,
        site.x, crossY, site.z - crossSize, site.x, crossY, site.z - crossSize * 0.35,
        site.x, crossY, site.z + crossSize * 0.35, site.x, crossY, site.z + crossSize
      ];
      const crossGeo = new THREE.BufferGeometry();
      crossGeo.setAttribute('position', new THREE.Float32BufferAttribute(crossPositions, 3));
      const cross = new THREE.LineSegments(crossGeo, new THREE.LineBasicMaterial({
        color: 0xd63c20,
        transparent: true,
        opacity: 0.72,
        depthTest: false
      }));
      cross.renderOrder = 8;
      state.selectionRoot.add(cross);
    }

    ui.selectionCard.hidden = false;
    ui.selectedCode.textContent = site.id;
    ui.selectedType.textContent = site.typeLabel + ' / ' + site.typeEn;
    ui.selectedStatus.textContent = 'ON CONTOUR';
    ui.selectedElevation.textContent = '+' + T1.fmtInt(site.elevationM) + ' M';
    ui.selectedSlope.textContent = T1.fmt1(site.slope) + '°';
    ui.selectedFloors.textContent = String(site.floors);
    ui.selectedCut.textContent = T1.fmt1(site.cutFillM) + ' M';
    ui.selectedArea.textContent = T1.fmtInt(site.footprintM2) + ' M²';
    ui.selectedHeight.textContent = T1.fmt1(site.heightM) + ' M';
    ui.selectionTagValue.textContent = site.id + ' / +' + T1.fmtInt(site.elevationM) + 'M';
    ui.selectionTag.hidden = false;
    setLiveStatus('已选择 ' + site.id + '，' + site.typeLabel + '，海拔 ' + T1.fmtInt(site.elevationM) + ' 米。');
  }

  function makePointerMarker() {
    const group = new THREE.Group();
    group.name = 'terrain-pointer';
    group.visible = false;
    const material = new THREE.LineBasicMaterial({
      color: 0xd63c20,
      transparent: true,
      opacity: 0.82,
      depthTest: false
    });
    const points = [];
    const segments = 40;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16));
    }
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material);
    ring.renderOrder = 20;
    group.add(ring);

    const crossGeo = new THREE.BufferGeometry();
    crossGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.30, 0, 0, -0.21, 0, 0,
      0.21, 0, 0, 0.30, 0, 0,
      0, 0, -0.30, 0, 0, -0.21,
      0, 0, 0.21, 0, 0, 0.30
    ], 3));
    const cross = new THREE.LineSegments(crossGeo, material);
    cross.renderOrder = 20;
    group.add(cross);
    return group;
  }

  function getPointerNdc(clientX, clientY) {
    const rect = ui.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    return { x: x, y: y };
  }

  function pickAt(clientX, clientY) {
    if (!state.terrain || !state.buildingRoot) return { terrain: null, building: null };
    const p = getPointerNdc(clientX, clientY);
    ndc.set(p.x, p.y);
    raycaster.setFromCamera(ndc, camera);

    let buildingHit = null;
    if (state.buildingObjects && state.buildingObjects.length) {
      const hits = raycaster.intersectObjects(state.buildingRoot.children, true);
      for (let i = 0; i < hits.length; i++) {
        const idx = hits[i].object.userData.buildingIndex;
        const obj = idx !== undefined ? state.buildingObjects[idx] : null;
        if (obj && obj.group.visible && obj.group.scale.y > 0.25) {
          buildingHit = { index: idx, point: hits[i].point, distance: hits[i].distance };
          break;
        }
      }
    }

    let terrainHit = null;
    const terrainHits = raycaster.intersectObject(state.terrainMesh, false);
    if (terrainHits.length) terrainHit = terrainHits[0];

    if (buildingHit && terrainHit && terrainHit.distance + 0.08 < buildingHit.distance) {
      buildingHit = null;
    }

    return { terrain: terrainHit, building: buildingHit };
  }

  function updatePointer(event) {
    if (!state.ready || state.busy) return;
    if (orbit && orbit.dragging) {
      hideHover();
      return;
    }
    const now = performance.now();
    if (now - state.hoverRayAt < 58) return;
    state.hoverRayAt = now;

    const result = pickAt(event.clientX, event.clientY);
    const rect = ui.stage.getBoundingClientRect();
    if (result.building) {
      const site = state.plan.sites[result.building.index];
      state.hoveredIndex = result.building.index;
      ui.canvas.classList.add('is-hovering');
      state.pointerMarker.visible = false;
      setCoordinates(site.x, site.z, site.elevationM);
      if (state.selectedIndex === result.building.index) {
        ui.hoverTip.hidden = true;
        return;
      }
      ui.hoverCode.textContent = site.id;
      ui.hoverMeta.textContent = '+' + T1.fmtInt(site.elevationM) + ' M / ' +
        T1.fmt1(site.slope) + '° / ' + site.typeEn;
      ui.hoverTip.hidden = false;
      ui.hoverTip.style.left = (event.clientX - rect.left) + 'px';
      ui.hoverTip.style.top = (event.clientY - rect.top) + 'px';
      return;
    }

    state.hoveredIndex = -1;
    ui.canvas.classList.remove('is-hovering');
    hideHover(true);
    if (result.terrain) {
      const point = result.terrain.point;
      const normal = state.terrain.sampleNormal(point.x, point.z, 0.5);
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(normal.x, normal.y, normal.z)
      );
      state.pointerMarker.position.set(point.x, point.y + 0.065, point.z);
      state.pointerMarker.quaternion.copy(quat);
      state.pointerMarker.visible = true;
      setCoordinates(point.x, point.z, state.terrain.elevationAt(point.x, point.z));
    } else {
      state.pointerMarker.visible = false;
    }
  }

  function hideHover(keepCoordinates) {
    ui.hoverTip.hidden = true;
    ui.canvas.classList.remove('is-hovering');
    if (state.pointerMarker) state.pointerMarker.visible = false;
    state.hoveredIndex = -1;
    if (!keepCoordinates) {
      setCoordinates(0, 0, state.terrain ? state.terrain.elevationAt(0, 0) : T1.BASE_ELEVATION);
    }
  }

  function setCoordinates(x, z, elevation) {
    if (!ui.coordX) return;
    setText(ui.coordX, fmtSignedMeters(x * T1.METERS_PER_UNIT, 1));
    setText(ui.coordZ, fmtSignedMeters(z * T1.METERS_PER_UNIT, 1));
    setText(ui.coordH, '+' + T1.fmtInt(elevation) + ' M');
  }

  function handleCanvasTap(event) {
    if (!state.ready || state.busy) return;
    const result = pickAt(event.clientX, event.clientY);
    hideHover(true);
    if (result.building) {
      selectBuilding(result.building.index);
      updateOverlayPositions(true);
    } else {
      clearSelection();
    }
  }

  /* ------------------------------------------------------------
     Analysis mode
     ------------------------------------------------------------ */
  function updateAnalysisUI() {
    ui.legendSection.classList.toggle('is-on', state.analysis);
    ui.legendSection.classList.toggle('is-off', !state.analysis);
    ui.btnAnalyze.classList.toggle('is-active', state.analysis);
    ui.btnAnalyze.setAttribute('aria-pressed', state.analysis ? 'true' : 'false');
    ui.analyzeLabel.textContent = state.analysis ? '关闭分析' : '坡度分析';
    ui.analyzeSub.textContent = state.analysis ? 'HIDE ANALYSIS' : 'ANALYSE SLOPE';
    ui.analyzeState.textContent = state.analysis ? 'ON' : 'OFF';
    ui.analysisState.textContent = state.analysis ? 'ANALYSIS / ON' : 'ANALYSIS / OFF';
    ui.analysisIndicator.hidden = !state.analysis;
  }

  function rebuildSlopeLimitLine() {
    if (!state.terrainGroup || !state.terrain) return;
    if (state.limitLine) {
      disposeObject(state.limitLine);
      state.limitLine = null;
    }
    const positions = state.terrain.extractSlopeLimit(state.maxSlope);
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0xd63c20,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    const line = new THREE.LineSegments(geometry, material);
    line.name = 'slope-limit-isoline';
    line.renderOrder = 6;
    line.visible = state.analysis;
    state.terrainGroup.add(line);
    state.limitLine = line;
    if (state.analysis) {
      material.opacity = 0.92;
    }
  }

  function toggleAnalysis() {
    state.analysis = !state.analysis;
    clearTimeout(state.analysisFadeTimer);
    if (state.analysis) {
      updateAnalysisUI();
      if (state.slopeMesh && state.slopePlane) {
        state.slopeMesh.visible = true;
        state.slopeMaterial.opacity = 0;
        state.analysisFade = null;
        state.slopePlane.constant = -state.terrain.width / 2 - 2;
        state.analysisScan = {
          start: performance.now(),
          duration: reducedMotion ? 1 : 1100,
          from: -state.terrain.width / 2 - 2,
          to: state.terrain.width / 2 + 2
        };
      }
      if (state.limitLine) {
        state.limitLine.visible = true;
        state.limitLine.material.opacity = 0;
      }
      setLiveStatus('坡度分析已开启。颜色表示地表坡度，红线为最大允许坡度的建设上限。');
      showToast('SLOPE ANALYSIS / 坡度分析已叠加 · 红线为 ' + state.maxSlope + '° 建设上限', 2300);
    } else {
      updateAnalysisUI();
      if (state.slopeMesh) {
        state.analysisScan = null;
        state.analysisFade = {
          start: performance.now(),
          duration: reducedMotion ? 1 : 260,
          from: state.slopeMaterial.opacity
        };
      }
      if (state.limitLine) {
        state.limitLine.visible = false;
      }
      setLiveStatus('坡度分析已关闭。');
    }
  }

  function updateAnalysis(now) {
    if (!state.slopeMesh || !state.slopePlane || !state.slopeMaterial) return;

    if (state.analysisScan) {
      const elapsed = now - state.analysisScan.start;
      const t = T1.clamp(elapsed / state.analysisScan.duration, 0, 1);
      const eased = T1.easeInOutCubic(t);
      state.slopePlane.constant = T1.lerp(state.analysisScan.from, state.analysisScan.to, eased);
      state.slopeMaterial.opacity = Math.min(1, elapsed / 130);
      if (state.limitLine) {
        state.limitLine.visible = true;
        state.limitLine.material.opacity = T1.smoothstep(0.16, 0.62, t) * 0.92;
      }
      if (t >= 1) {
        state.slopePlane.constant = state.analysisScan.to;
        state.slopeMaterial.opacity = 1;
        if (state.limitLine) state.limitLine.material.opacity = 0.92;
        state.analysisScan = null;
      }
    } else if (state.analysisFade) {
      const t = T1.clamp((now - state.analysisFade.start) / state.analysisFade.duration, 0, 1);
      state.slopeMaterial.opacity = T1.lerp(state.analysisFade.from, 0, t);
      if (t >= 1) {
        state.slopeOverlayHidden = true;
        if (state.slopeMesh) state.slopeMesh.visible = false;
        state.analysisFade = null;
      }
    }
  }

  /* ------------------------------------------------------------
     UI updates
     ------------------------------------------------------------ */
  function buildLegendClasses() {
    ui.legendClasses.innerHTML = T1.SLOPE_CLASSES.map(function (c) {
      const mid = c.max === 90 ? 40 : (c.min + c.max) / 2;
      const color = T1.slopeHex(mid);
      return '<span class="legend-class"><i style="background:' + color + '"></i>' +
        '<span>' + c.label + '</span><em>' + c.note + '</em></span>';
    }).join('');
  }

  function updateUIAfterBuild() {
    if (!state.terrain || !state.plan) return;
    const t = state.terrain;
    const plan = state.plan;
    const m = plan.metrics;
    const requested = plan.requested;
    const placed = plan.sites.length;
    const peakElevation = t.getPeakElevation();
    const limited = placed < requested;

    setText(ui.statPeak, T1.fmtInt(peakElevation));
    setText(ui.statBuildable, T1.fmt1(m.buildablePct));
    setText(ui.statUnits, String(placed));
    setText(ui.statUnitsNote, limited ? '/ ' + requested + ' · LIMIT' : '/ ' + requested);
    setText(ui.statCoverage, m.coveragePct < 10 ? T1.fmt1(m.coveragePct) : T1.fmtInt(m.coveragePct));
    setText(ui.slopeFoot, 'BUILDABLE ' + T1.fmt1(m.buildablePct) + '%');
    setText(ui.countFoot, limited ? placed + ' / ' + requested + ' PLACED' : 'TARGET');
    setText(ui.readBuildable, T1.fmt1(m.buildablePct) + ' %');
    setText(ui.readUnits, placed + ' / ' + requested + (limited ? ' · LIMIT' : ''));
    setText(ui.readMeanSlope, T1.fmt1(m.meanBuildingSlope) + '°');
    setText(ui.readLinks, T1.fmtInt(m.pathLengthM) + ' M');
    setText(ui.readSeed, T1.seedLabel(state.layoutSeed));
    setText(ui.terrainSeedLabel, 'TERRAIN ' + T1.seedLabel(state.terrainSeed));
    setText(ui.reliefMeters, 'ΔH ' + Math.round(t.spanM) + ' M');
    setText(ui.footerStatus, buildFooterSummary());
    setText(ui.buildLimitLabel, state.maxSlope + '°');
    ui.thresholdMarker.style.left = (T1.clamp(state.maxSlope / 50, 0, 1) * 100).toFixed(2) + '%';
    ui.readBuildableBar.style.width = T1.clamp(m.buildablePct, 0, 100).toFixed(1) + '%';
    ui.peakTagValue.textContent = '+' + T1.fmtInt(peakElevation) + ' M';

    if (ui.footerCoords) {
      ui.footerCoords.textContent = T1.seedLabel(t.seed) + ' / ' + T1.seedLabel(state.layoutSeed);
    }

    renderProfile();
    updateCameraReadout(true);
    updateScaleBar(true);
    updateOverlayPositions(true);
    if (!isCompact) {
      ui.selectionCard.hidden = state.selectedIndex < 0;
    }
  }

  function renderProfile() {
    if (!state.terrain || !ui.profileSvg) return;
    const t = state.terrain;
    const zSection = 0.15;
    const samples = 100;
    const width = 260;
    const height = 92;
    const topPad = 7;
    const bottomPad = 10;
    const elevations = [];
    for (let i = 0; i < samples; i++) {
      const x = T1.lerp(-t.width / 2, t.width / 2, i / (samples - 1));
      elevations.push({
        x: x,
        elevation: t.elevationAt(x, zSection)
      });
    }
    let minE = Infinity;
    let maxE = -Infinity;
    for (let i = 0; i < elevations.length; i++) {
      minE = Math.min(minE, elevations[i].elevation);
      maxE = Math.max(maxE, elevations[i].elevation);
    }
    const pad = Math.max(6, (maxE - minE) * 0.07);
    const chartMin = Math.floor(minE - pad);
    const chartMax = Math.ceil(maxE + pad);
    const span = Math.max(1, chartMax - chartMin);
    const xFor = function (n) { return 2 + n * (width - 4); };
    const yFor = function (elev) {
      return topPad + (1 - (elev - chartMin) / span) * (height - topPad - bottomPad);
    };

    let line = '';
    for (let i = 0; i < elevations.length; i++) {
      const x = xFor(i / (elevations.length - 1));
      const y = yFor(elevations[i].elevation);
      line += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
    }
    const area = line + 'L' + (width - 2).toFixed(1) + ' ' + (height - bottomPad).toFixed(1) +
      ' L2 ' + (height - bottomPad).toFixed(1) + ' Z';

    let ticks = '';
    if (state.plan) {
      const inSection = state.plan.sites.filter(function (site) {
        return Math.abs(site.z - zSection) <= 2.1;
      }).sort(function (a, b) { return a.x - b.x; });
      // Keep the section legible by limiting the number of red unit ticks.
      const stride = Math.max(1, Math.ceil(inSection.length / 9));
      const chosen = inSection.filter(function (_, idx) { return idx % stride === 0; });
      chosen.forEach(function (site) {
        const tx = xFor((site.x + t.width / 2) / t.width);
        const sectionGround = t.elevationAt(site.x, zSection);
        const baseY = yFor(sectionGround);
        const roofY = yFor(sectionGround + site.heightM + Math.min(3, site.foundationH * 10));
        const topY = T1.clamp(Math.min(baseY - 2, roofY), topPad + 2, height - bottomPad);
        ticks += '<line x1="' + tx.toFixed(1) + '" y1="' + topY.toFixed(1) +
          '" x2="' + tx.toFixed(1) + '" y2="' + baseY.toFixed(1) +
          '" stroke="#d63c20" stroke-width="0.8" vector-effect="non-scaling-stroke"/>' +
          '<rect x="' + (tx - 1).toFixed(1) + '" y="' + (topY - 1.5).toFixed(1) +
          '" width="2" height="2" fill="#d63c20"/>';
      });
    }

    const markup =
      '<path d="' + area + '" fill="#d9d3c5" fill-opacity="0.62" stroke="none"></path>' +
      '<path d="' + line + '" fill="none" stroke="#38362f" stroke-width="0.9" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>' +
      '<path d="M2 ' + (height - bottomPad) + ' L' + (width - 2) + ' ' + (height - bottomPad) + '" stroke="#8c877b" stroke-width="0.55" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"></path>' +
      ticks;

    ui.profileSvg.innerHTML = markup;
    setText(ui.sectionMax, '+' + T1.fmtInt(chartMax));
    setText(ui.sectionMid, '+' + T1.fmtInt((chartMin + chartMax) / 2));
    setText(ui.sectionMin, '+' + T1.fmtInt(chartMin));

    let inSectionCount = 0;
    if (state.plan) {
      inSectionCount = state.plan.sites.filter(function (site) {
        return Math.abs(site.z - zSection) <= 2.1;
      }).length;
    }
    setText(ui.sectionDatum, 'DATUM +1,264 M · ' + inSectionCount + ' U CUT');
  }

  function updateOverlayPositions(force) {
    if (!state.ready || !camera || !orbit) return;
    const now = performance.now();
    if (!force && now - state.overlayCache < 42) return;
    state.overlayCache = now;

    const stageW = ui.stage.clientWidth;
    const stageH = ui.stage.clientHeight;
    const topSafe = 92;
    const bottomSafe = 58;

    function project(vec) {
      const p = vec.clone().project(camera);
      return {
        x: (p.x * 0.5 + 0.5) * stageW,
        y: (-p.y * 0.5 + 0.5) * stageH,
        visible: p.z > -1 && p.z < 1
      };
    }

    // Peak annotation.
    if (state.terrain) {
      const p = project(new THREE.Vector3(state.terrain.peak.x, state.terrain.peak.h + 0.4, state.terrain.peak.z));
      const show = p.visible && p.x > 24 && p.x < stageW - 24 && p.y > topSafe && p.y < stageH - bottomSafe;
      ui.peakTag.hidden = !show;
      if (show) {
        ui.peakTag.style.left = p.x.toFixed(1) + 'px';
        ui.peakTag.style.top = p.y.toFixed(1) + 'px';
      }
    } else {
      ui.peakTag.hidden = true;
    }

    // Selected building annotation.
    if (state.selectedIndex >= 0 && state.plan && state.plan.sites[state.selectedIndex]) {
      const site = state.plan.sites[state.selectedIndex];
      const obj = state.buildingObjects && state.buildingObjects[state.selectedIndex];
      const yScale = obj ? obj.group.scale.y : 1;
      const topY = site.baseBottom + (site.foundation.h + site.cap.h + site.bodyHeight + 0.35) * yScale;
      const p = project(new THREE.Vector3(site.x, topY, site.z));
      const show = p.visible && p.x > 34 && p.x < stageW - 34 && p.y > topSafe && p.y < stageH - bottomSafe;
      ui.selectionTag.hidden = !show;
      if (show) {
        ui.selectionTag.style.left = p.x.toFixed(1) + 'px';
        ui.selectionTag.style.top = p.y.toFixed(1) + 'px';
      }
    } else {
      ui.selectionTag.hidden = true;
    }

    // Compass heading, projected into screen space.
    if (ui.compassNeedle) {
      const centre = project(new THREE.Vector3(0, 2, 0));
      const north = project(new THREE.Vector3(0, 2, -10));
      const angle = Math.atan2(north.x - centre.x, -(north.y - centre.y)) * 180 / Math.PI;
      ui.compassNeedle.setAttribute('transform', 'rotate(' + angle.toFixed(2) + ' 26 26)');
    }

    updateCameraReadout(force);
    updateScaleBar(force);
  }

  function updateScaleBar(force) {
    if (!orbit || !ui.scaleLine) return;
    const now = performance.now();
    if (!force && now - state.scaleCache < 120) return;
    state.scaleCache = now;
    const height = Math.max(1, ui.stage.clientHeight);
    const distance = orbit.radius;
    const worldPerPixel = (2 * distance * Math.tan((camera.fov * Math.PI / 180) / 2)) / height;
    const metersPerPixel = worldPerPixel * T1.METERS_PER_UNIT;
    const options = [10, 20, 25, 50, 100, 200, 250, 500, 1000];
    let best = options[3];
    let bestScore = Infinity;
    for (let i = 0; i < options.length; i++) {
      const px = options[i] / metersPerPixel;
      if (px < 38 || px > 155) continue;
      const score = Math.abs(px - 86);
      if (score < bestScore) {
        bestScore = score;
        best = options[i];
      }
    }
    if (bestScore === Infinity) {
      best = options.reduce(function (acc, value) {
        const px = value / metersPerPixel;
        return Math.abs(px - 80) < Math.abs((acc / metersPerPixel) - 80) ? value : acc;
      }, options[0]);
    }
    const pxWidth = T1.clamp(best / metersPerPixel, 30, 150);
    state.lastScaleInfo = { meters: best, px: pxWidth };
    ui.scaleLine.style.width = pxWidth.toFixed(1) + 'px';
    ui.scaleLabel.textContent = best + ' M';
    if (ui.scaleCaption) ui.scaleCaption.textContent = 'APPROX.';
  }

  function setBootProgress(percent, stepText) {
    if (ui.bootProgress) ui.bootProgress.style.width = T1.clamp(percent, 4, 100) + '%';
    if (ui.bootStep && stepText) ui.bootStep.textContent = stepText;
  }

  function hideBoot() {
    if (!ui.bootOverlay) return;
    setBootProgress(100, '03 / 03');
    setTimeout(function () {
      ui.bootOverlay.classList.add('is-hidden');
      state.enterAt = performance.now();
      setLiveStatus('三维场地已就绪。调整参数，观察聚落生长。');
    }, 360);
  }

  function setLiveStatus(message) {
    if (ui.liveStatus) ui.liveStatus.textContent = message;
  }

  /* ------------------------------------------------------------
     Build orchestration
     ------------------------------------------------------------ */
  function queueBuild(options) {
    options = options || {};
    if (!state.ready) options.initial = true;
    const delay = options.delay === undefined ? 150 : options.delay;

    if (options.newTerrain) {
      state.terrainSeed = randomSeed(state.terrainSeed);
      state.layoutSeed = randomSeed(state.layoutSeed);
    } else if (options.newLayout) {
      state.layoutSeed = randomSeed(state.layoutSeed);
    }

    state.buildToken++;
    const token = state.buildToken;
    clearTimeout(state.buildTimer);
    setText(ui.terrainSeedLabel, 'TERRAIN ' + T1.seedLabel(state.terrainSeed));
    setText(ui.readSeed, T1.seedLabel(state.layoutSeed));

    state.buildTimer = setTimeout(function () {
      runBuild(token, options);
    }, delay);
  }

  async function runBuild(token, options) {
    options = options || {};
    if (token !== state.buildToken) return;
    if (!state.ready) {
      setBootProgress(18, '01 / 03');
    }
    setBusy(true);
    state.growth = null;
    clearTimeout(state.growthHideTimer);
    if (ui.growthMeter) {
      ui.growthMeter.hidden = true;
      ui.growthMeter.classList.remove('is-complete');
    }
    if (state.networkMaterial) state.networkMaterial.opacity = 0;
    await nextFrame();
    if (token !== state.buildToken) return;
    const startedAt = performance.now();
    const initial = !!options.initial;
    const needsTerrain = initial || options.terrain || !state.terrain;

    try {
      const constraints = constraintsSnapshot();
      const seed = state.terrainSeed;
      const layoutSeed = state.layoutSeed;
      const relief = state.relief;
      let terrain = state.terrain;

      if (needsTerrain) {
        if (initial) setBootProgress(28, '01 / 03 · FIELD');
        await nextFrame();
        if (token !== state.buildToken) return;
        terrain = new T1.TerrainField({ seed: seed, relief: relief });
        state.terrain = terrain;
        buildTerrainScene(terrain);
        if (initial) {
          setBootProgress(57, '02 / 03 · SLOPE');
          setViewPreset('axo', { initial: !reducedMotion, immediate: reducedMotion });
        }
        await nextFrame();
        if (token !== state.buildToken) return;
      }

      if (initial) setBootProgress(72, '02 / 03 · SITE');
      await nextFrame();
      if (token !== state.buildToken) return;

      const plan = T1.planSettlement(terrain, constraints, layoutSeed);
      state.plan = plan;
      state.layoutSeed = layoutSeed;
      state.terrainSeed = seed;
      buildBuildingModels(plan);
      buildNetwork(plan);
      clearSelection(true);
      state.analysisFade = null;
      state.analysisScan = null;

      rebuildSlopeLimitLine();
      if (state.analysis) {
        if (state.slopeMesh) {
          state.slopeMesh.visible = true;
          state.slopeMaterial.opacity = 1;
          state.slopePlane.constant = terrain.width / 2 + 3;
        }
        if (state.limitLine) {
          state.limitLine.visible = true;
          state.limitLine.material.opacity = 0.92;
        }
      } else if (state.slopeMesh) {
        state.slopeMesh.visible = false;
        state.slopeMaterial.opacity = 0;
        if (state.limitLine) state.limitLine.visible = false;
      }
      updateAnalysisUI();

      if (initial) setBootProgress(90, '03 / 03 · SETTLE');

      // Allow the boot overlay to paint the final step before the heavy
      // geometry has to reach the screen.
      await nextFrame();
      if (token !== state.buildToken) return;

      state.ready = true;
      state.lastBuildMs = Math.max(1, Math.round(performance.now() - startedAt));
      updateUIAfterBuild();
      setCoordinates(0, 0, terrain.elevationAt(0, 0));
      setBusy(false);
      updateCameraReadout(true);
      startGrowth({ initial: initial });
      if (renderer) renderer.shadowMap.needsUpdate = true;

      if (state.network) {
        // Make sure links become visible even if reduced motion is on.
        if (reducedMotion && state.networkMaterial) state.networkMaterial.opacity = NETWORK_OPACITY;
      }

      if (initial) {
        hideBoot();
      }

      setLiveStatus('地形已求解：' + plan.sites.length + ' 栋建筑，坡度约束 ' +
        state.maxSlope + ' 度，最小间距 ' + state.spacingM + ' 米。');
      updateOverlayPositions(true);
    } catch (err) {
      console.error('TERRAIN / 01 build error', err);
      setBusy(false);
      if (ui.bootOverlay) {
        setBootProgress(100, 'ERROR');
        ui.bootOverlay.classList.add('is-hidden');
      }
      showToast('计算失败 / BUILD ERROR: ' + (err && err.message ? err.message : err), 6000);
      setLiveStatus('计算失败，请尝试重新生成。');
    }
  }

  function initialBuild() {
    queueBuild({ initial: true, delay: 40, terrain: true });
  }

  /* ------------------------------------------------------------
     Export
     ------------------------------------------------------------ */
  function drawTrackedText(ctx, text, x, y, tracking) {
    if (!tracking) {
      ctx.fillText(text, x, y);
      return;
    }
    let cursor = x;
    for (let i = 0; i < text.length; i++) {
      ctx.fillText(text[i], cursor, y);
      cursor += ctx.measureText(text[i]).width + tracking;
    }
  }

  function exportHighResolution() {
    if (state.exporting) return;
    if (!state.ready) {
      showToast('EXPORT / 地形尚未就绪，请稍候', 1800);
      return;
    }
    if (state.busy) {
      showToast('EXPORT / 聚落计算中，请稍候再导出', 2200);
      return;
    }
    state.exporting = true;
    const btn = ui.btnExport;
    const oldHTML = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('is-exporting');
    btn.innerHTML = '<span><b>RENDERING</b><small>生成高清图像</small></span><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4 9h10M9 4v10"/></svg>';
    showToast('EXPORT / 正在合成高分辨率图像…', 2600);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        try {
          const cssW = Math.max(1, ui.stage.clientWidth);
          const cssH = Math.max(1, ui.stage.clientHeight);
          const scale = Math.min(3.2, 3400 / cssW, 3400 / cssH);
          const outW = Math.max(1400, Math.round(cssW * scale));
          const outH = Math.max(1000, Math.round(cssH * scale));
          const oldPR = renderer.getPixelRatio();
          const oldAspect = camera.aspect;
          const savedMarker = state.pointerMarker ? state.pointerMarker.visible : false;
          if (state.pointerMarker) state.pointerMarker.visible = false;

          renderer.setPixelRatio(1);
          renderer.setSize(outW, outH, false);
          camera.aspect = outW / outH;
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);

          const comp = document.createElement('canvas');
          comp.width = outW;
          comp.height = outH;
          const ctx = comp.getContext('2d');
          const bg = '#f2f0e9';
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, outW, outH);

          // Fine survey grid to match the instrument surface.
          ctx.strokeStyle = 'rgba(22,22,19,0.035)';
          ctx.lineWidth = Math.max(1, outW / 2400);
          const grid = outW / 26;
          ctx.beginPath();
          for (let x = 0; x <= outW; x += grid) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, outH);
          }
          for (let y = 0; y <= outH; y += grid) {
            ctx.moveTo(0, y);
            ctx.lineTo(outW, y);
          }
          ctx.stroke();

          // Radial light behind the rendered model.
          const light = ctx.createRadialGradient(outW * 0.5, outH * 0.45, 0, outW * 0.5, outH * 0.45, outW * 0.6);
          light.addColorStop(0, 'rgba(255,255,252,0.66)');
          light.addColorStop(0.55, 'rgba(255,255,252,0.17)');
          light.addColorStop(1, 'rgba(255,255,252,0)');
          ctx.fillStyle = light;
          ctx.fillRect(0, 0, outW, outH);

          ctx.drawImage(renderer.domElement, 0, 0, outW, outH);

          const pad = Math.round(outW * 0.038);
          const topBand = Math.round(outH * 0.135);
          const bottomBand = Math.round(outH * 0.135);
          const ink = '#161613';
          const muted = '#726d61';
          const accent = '#d63c20';
          const sans = '"Arial Narrow", "Helvetica Neue", Arial, "Microsoft YaHei", sans-serif';
          const mono = 'Consolas, "SFMono-Regular", "Cascadia Mono", monospace';

          ctx.fillStyle = 'rgba(242,240,233,0.93)';
          ctx.fillRect(0, 0, outW, topBand);
          ctx.fillRect(0, outH - bottomBand, outW, bottomBand);
          ctx.strokeStyle = 'rgba(22,22,19,0.2)';
          ctx.lineWidth = Math.max(1, outW / 2600);
          ctx.beginPath();
          ctx.moveTo(0, topBand);
          ctx.lineTo(outW, topBand);
          ctx.moveTo(0, outH - bottomBand);
          ctx.lineTo(outW, outH - bottomBand);
          ctx.stroke();

          // Small red registration mark.
          ctx.fillStyle = accent;
          const square = Math.max(9, outW * 0.0072);
          ctx.fillRect(pad, pad * 0.56, square, square);

          ctx.fillStyle = ink;
          ctx.font = '600 ' + Math.round(outW * 0.024) + 'px ' + sans;
          drawTrackedText(ctx, 'TERRAIN / 01', pad + square + outW * 0.010, pad * 0.56 + square * 1.03, outW * 0.00135);
          ctx.fillStyle = muted;
          ctx.font = Math.round(outW * 0.0095) + 'px ' + sans;
          ctx.fillText('山地聚落生长实验室  /  MOUNTAIN SETTLEMENT GROWTH LABORATORY', pad, pad * 0.56 + square * 1.03 + outW * 0.0225);

          ctx.textAlign = 'right';
          ctx.fillStyle = ink;
          ctx.font = '500 ' + Math.round(outW * 0.0086) + 'px ' + mono;
          ctx.fillText('PROTOCOL T/01  ·  TERRAIN SYNTHESIS UNIT', outW - pad, pad * 0.72);
          ctx.fillStyle = muted;
          ctx.font = Math.round(outW * 0.0077) + 'px ' + mono;
          ctx.fillText('TERRAIN ' + T1.seedLabel(state.terrainSeed) + '  /  LAYOUT ' + T1.seedLabel(state.layoutSeed) +
            '  /  SLOPE LIMIT ' + state.maxSlope + '°', outW - pad, pad * 0.72 + outW * 0.016);
          if (state.analysis) {
            const analysisLabel = 'SLOPE ANALYSIS  ·  ' + state.maxSlope + '° LIMIT ISOLINE';
            ctx.fillStyle = accent;
            ctx.font = '600 ' + Math.round(outW * 0.0075) + 'px ' + mono;
            ctx.fillText(analysisLabel, outW - pad, pad * 0.72 + outW * 0.030);
            ctx.strokeStyle = accent;
            ctx.lineWidth = Math.max(1, outW / 2600);
            const tw = ctx.measureText(analysisLabel).width;
            ctx.beginPath();
            ctx.moveTo(outW - pad - tw, pad * 0.72 + outW * 0.036);
            ctx.lineTo(outW - pad, pad * 0.72 + outW * 0.036);
            ctx.stroke();
          }
          ctx.textAlign = 'left';

          const footerY = outH - bottomBand + outH * 0.042;
          ctx.strokeStyle = accent;
          ctx.lineWidth = Math.max(1, outW / 2200);
          ctx.beginPath();
          ctx.moveTo(pad, footerY - outH * 0.015);
          ctx.lineTo(pad + outW * 0.060, footerY - outH * 0.015);
          ctx.stroke();
          ctx.fillStyle = ink;
          ctx.font = '600 ' + Math.round(outW * 0.009) + 'px ' + mono;
          ctx.fillText('TERRAIN / 01', pad, footerY + outH * 0.007);
          ctx.fillStyle = muted;
          ctx.font = Math.round(outW * 0.0076) + 'px ' + mono;
          ctx.fillText('GENERATIVE SETTLEMENT STUDY  /  480 × 480 M  /  DATUM +1,264 M', pad, footerY + outH * 0.024);

          const placed = state.plan ? state.plan.sites.length : 0;
          const requested = state.plan ? state.plan.requested : state.count;
          const stats = [
            ['UNITS', placed + ' / ' + requested],
            ['BUILDABLE', state.plan ? T1.fmt1(state.plan.metrics.buildablePct) + '%' : '—'],
            ['AVG SLOPE', state.plan ? T1.fmt1(state.plan.metrics.meanBuildingSlope) + '°' : '—'],
            ['LINK', state.plan ? T1.fmtInt(state.plan.metrics.pathLengthM) + ' M' : '—']
          ];
          ctx.textAlign = 'right';
          let statX = outW - pad;
          const statY = footerY + outH * 0.006;
          for (let i = stats.length - 1; i >= 0; i--) {
            ctx.fillStyle = muted;
            ctx.font = Math.round(outW * 0.0069) + 'px ' + mono;
            ctx.fillText(stats[i][0], statX, statY - outH * 0.003);
            ctx.fillStyle = ink;
            ctx.font = Math.round(outW * 0.009) + 'px ' + mono;
            ctx.fillText(stats[i][1], statX, statY + outH * 0.014);
            statX -= outW * 0.125;
          }

          // Dynamic scale bar.
          const scaleInfo = state.lastScaleInfo;
          const exportScale = outW / cssW;
          ctx.textAlign = 'left';
          ctx.fillStyle = muted;
          ctx.font = Math.round(outW * 0.0073) + 'px ' + mono;
          const barPx = Math.min(outW * 0.16, scaleInfo.px * exportScale);
          const barX = outW * 0.5 - barPx / 2;
          const barY = outH - bottomBand * 0.37;
          ctx.fillText('SCALE / ' + scaleInfo.meters + ' M', barX, barY - outH * 0.014);
          ctx.strokeStyle = ink;
          ctx.lineWidth = Math.max(1, outW / 2600);
          ctx.beginPath();
          ctx.moveTo(barX, barY);
          ctx.lineTo(barX + barPx, barY);
          ctx.moveTo(barX, barY - 7);
          ctx.lineTo(barX, barY + 5);
          ctx.moveTo(barX + barPx, barY - 7);
          ctx.lineTo(barX + barPx, barY + 5);
          ctx.stroke();

          ctx.textAlign = 'right';
          ctx.fillStyle = muted;
          ctx.font = Math.round(outW * 0.0068) + 'px ' + mono;
          ctx.fillText('EXPORTED ' + new Date().toISOString().slice(0, 10) + '  /  ' + outW + ' × ' + outH, outW - pad, outH - pad * 0.35);

          // Restore the live viewport before the browser paints again.
          renderer.setPixelRatio(oldPR);
          renderer.setSize(cssW, cssH, false);
          camera.aspect = oldAspect;
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          if (state.pointerMarker) state.pointerMarker.visible = savedMarker;

          const fileName = 'TERRAIN-01_' + T1.seedLabel(state.terrainSeed) + '_' +
            T1.seedLabel(state.layoutSeed) + '_' + outW + 'x' + outH + '.png';

          if (comp.toBlob) {
            comp.toBlob(function (blob) {
              if (!blob) {
                finishExport(oldHTML, false);
                return;
              }
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = fileName;
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
              finishExport(oldHTML, true, outW + ' × ' + outH);
            }, 'image/png');
          } else {
            const a = document.createElement('a');
            a.href = comp.toDataURL('image/png');
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            finishExport(oldHTML, true, outW + ' × ' + outH);
          }
        } catch (err) {
          console.error('TERRAIN / 01 export error', err);
          if (renderer) {
            const w = Math.max(1, ui.stage.clientWidth);
            const h = Math.max(1, ui.stage.clientHeight);
            renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, state.devicePixelRatioCap));
            renderer.setSize(w, h, false);
            if (camera) {
              camera.aspect = w / h;
              camera.updateProjectionMatrix();
            }
          }
          finishExport(oldHTML, false);
        }
      });
    });
  }

  function finishExport(oldHTML, success, dimensions) {
    state.exporting = false;
    ui.btnExport.disabled = false;
    ui.btnExport.classList.remove('is-exporting');
    ui.btnExport.innerHTML = oldHTML;
    if (success) {
      showToast('EXPORT COMPLETE / 高清图像已导出 · ' + dimensions + ' PX', 3800);
    } else {
      showToast('EXPORT FAILED / 图像导出失败，请重试', 4200);
    }
  }

  /* ------------------------------------------------------------
     Events / controls
     ------------------------------------------------------------ */
  function bindUI() {
    buildLegendClasses();
    if (ui.slopeGradient) ui.slopeGradient.style.background = T1.slopeGradientCss('90deg');
    syncSliders();

    // Keep the range readouts honest without waiting for a frame.
    ui.reliefRange.addEventListener('input', function () {
      state.relief = Number(ui.reliefRange.value);
      updateRangeFill(ui.reliefRange);
      ui.reliefValue.textContent = state.relief.toFixed(2);
      ui.reliefRange.setAttribute('aria-valuetext', '起伏强度 ' + state.relief.toFixed(2));
      ui.reliefMeters.textContent = 'ΔH ≈ ' + Math.round((4.1 + state.relief * 8.8) * 10) + ' M';
      queueBuild({ terrain: true, delay: 280 });
    });

    ui.slopeRange.addEventListener('input', function () {
      state.maxSlope = Number(ui.slopeRange.value);
      updateRangeFill(ui.slopeRange);
      ui.slopeValue.textContent = String(state.maxSlope);
      ui.slopeRange.setAttribute('aria-valuetext', '最大允许坡度 ' + state.maxSlope + ' 度');
      ui.buildLimitLabel.textContent = state.maxSlope + '°';
      ui.thresholdMarker.style.left = (T1.clamp(state.maxSlope / 50, 0, 1) * 100).toFixed(2) + '%';
      queueBuild({ terrain: false, delay: 170 });
    });

    ui.spacingRange.addEventListener('input', function () {
      state.spacingM = Number(ui.spacingRange.value);
      updateRangeFill(ui.spacingRange);
      ui.spacingValue.textContent = String(state.spacingM);
      ui.spacingRange.setAttribute('aria-valuetext', '建筑最小中心间距 ' + state.spacingM + ' 米');
      queueBuild({ terrain: false, delay: 170 });
    });

    ui.countRange.addEventListener('input', function () {
      state.count = Number(ui.countRange.value);
      updateRangeFill(ui.countRange);
      ui.countValue.textContent = String(state.count);
      ui.countRange.setAttribute('aria-valuetext', '目标建筑数量 ' + state.count + ' 栋');
      queueBuild({ terrain: false, delay: 170 });
    });

    ui.densityRange.addEventListener('input', function () {
      state.density = Number(ui.densityRange.value);
      updateRangeFill(ui.densityRange);
      ui.densityValue.textContent = state.density.toFixed(2);
      ui.densityRange.setAttribute('aria-valuetext', '聚落密度 ' + state.density.toFixed(2));
      queueBuild({ terrain: false, delay: 170 });
    });

    [ui.reliefRange, ui.slopeRange, ui.spacingRange, ui.countRange, ui.densityRange].forEach(function (input) {
      input.addEventListener('change', function () {
        syncSliders();
      });
    });

    ui.btnRebuild.addEventListener('click', function () {
      queueBuild({ newTerrain: true, terrain: true, delay: 0 });
      showToast('NEW TERRAIN / 正在生成新的山体', 2100);
    });

    ui.btnAnalyze.addEventListener('click', toggleAnalysis);

    ui.btnGenerate.addEventListener('click', function () {
      queueBuild({ terrain: false, delay: 0, animate: true });
      showToast('GENERATE / 正在重算聚落布局', 1800);
    });

    ui.btnRemix.addEventListener('click', function () {
      queueBuild({ newLayout: true, terrain: false, delay: 0 });
      showToast('REMIX / 正在重组聚落布局', 2000);
    });

    ui.btnExport.addEventListener('click', exportHighResolution);

    ui.btnClearSelection.addEventListener('click', function () {
      clearSelection();
    });

    ui.viewButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        setViewPreset(btn.dataset.view, { immediate: false });
        showToast(btn.dataset.view === 'plan' ? 'PLAN VIEW / 平面视角' :
          btn.dataset.view === 'north' ? 'NORTH VIEW / 北向视角' :
          'AXONOMETRIC VIEW / 轴测视角', 1500);
      });
    });

    ui.btnResetView.addEventListener('click', function () {
      setViewPreset('axo', { immediate: false });
      showToast('VIEW RESET / 视角已复位', 1500);
    });

    ui.btnOrbit.addEventListener('click', handleOrbitToggle);

    ui.btnInfo.addEventListener('click', function () {
      if (ui.infoDialog && ui.infoDialog.showModal) ui.infoDialog.showModal();
    });
    ui.btnCloseInfo.addEventListener('click', function () {
      ui.infoDialog.close();
    });
    ui.infoDialog.addEventListener('click', function (event) {
      if (event.target !== ui.infoDialog) return;
      const rect = ui.infoDialog.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) ui.infoDialog.close();
    });

    ui.canvas.addEventListener('pointerdown', function () {
      hideHover(true);
      if (state.pointerMarker) state.pointerMarker.visible = false;
    });

    ui.canvas.addEventListener('pointermove', function (event) {
      if (state.pointerMoveRaf) return;
      state.pointerMoveRaf = requestAnimationFrame(function () {
        state.pointerMoveRaf = null;
        updatePointer(event);
      });
    });

    ui.canvas.addEventListener('pointerleave', function () {
      if (orbit && orbit.dragging) return;
      hideHover();
    });

    ui.canvas.addEventListener('keydown', function (event) {
      if (!orbit) return;
      const step = event.shiftKey ? 0.16 : 0.06;
      if (event.key === 'ArrowLeft') {
        orbit.nudge(step, 0, 1);
        event.preventDefault();
      } else if (event.key === 'ArrowRight') {
        orbit.nudge(-step, 0, 1);
        event.preventDefault();
      } else if (event.key === 'ArrowUp') {
        orbit.nudge(0, -step * 0.65, 1);
        event.preventDefault();
      } else if (event.key === 'ArrowDown') {
        orbit.nudge(0, step * 0.65, 1);
        event.preventDefault();
      } else if (event.key === '+' || event.key === '=') {
        orbit.nudge(0, 0, 0.9);
        event.preventDefault();
      } else if (event.key === '-' || event.key === '_') {
        orbit.nudge(0, 0, 1.1);
        event.preventDefault();
      } else if (event.key === '0') {
        setViewPreset('axo', { immediate: false });
        event.preventDefault();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.defaultPrevented) return;
      if (ui.infoDialog && ui.infoDialog.open) return;
      const tag = (event.target && event.target.tagName ? event.target.tagName : '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' ||
        (event.target && event.target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'a') {
        toggleAnalysis();
        event.preventDefault();
      } else if (key === 'r') {
        ui.btnRemix.click();
        event.preventDefault();
      } else if (key === 'g') {
        ui.btnGenerate.click();
        event.preventDefault();
      } else if (key === 'e') {
        if (!state.exporting) exportHighResolution();
        event.preventDefault();
      } else if (key === '1') {
        setViewPreset('axo', { immediate: false });
        event.preventDefault();
      } else if (key === '2') {
        setViewPreset('plan', { immediate: false });
        event.preventDefault();
      } else if (key === '3') {
        setViewPreset('north', { immediate: false });
        event.preventDefault();
      } else if (key === 'o') {
        handleOrbitToggle();
        event.preventDefault();
      } else if (event.key === 'Escape') {
        if (state.selectedIndex >= 0) clearSelection();
        else hideHover();
      }
    });

    updateAnalysisUI();
    updateViewButtons();
  }

  /* ------------------------------------------------------------
     Clock + render loop
     ------------------------------------------------------------ */
  function startClock() {
    const update = function () {
      const now = new Date();
      const time = now.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      if (ui.clock) ui.clock.textContent = time;
      if (ui.clock) ui.clock.setAttribute('datetime', now.toISOString());
    };
    update();
    state.clockTimer = setInterval(update, 1000);
  }

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const delta = lastFrameTime ? (now - lastFrameTime) / 1000 : 0;
    lastFrameTime = now;

    if (orbit) orbit.update(delta);
    if (state.growth) updateGrowth(now);
    if (state.analysisScan || state.analysisFade) updateAnalysis(now);
    updateOverlayPositions(false);

    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  /* ------------------------------------------------------------
     Boot
     ------------------------------------------------------------ */
  async function init() {
    bindUI();
    startClock();
    updateAnalysisUI();
    ui.footerStatus.textContent = 'INITIALISING / 初始化实验仪器';
    setBootProgress(6, '00 / 03');

    if (!THREE) {
      showWebGLFailure('Three.js 未加载。请检查 vendor/three.min.js 是否存在。');
      return;
    }

    try {
      setupRendererAndScene();
    } catch (err) {
      console.error('TERRAIN / 01 renderer error', err);
      showWebGLFailure('无法启动 WebGL 三维渲染。请启用硬件加速后重试。');
      return;
    }

    // Expose a small, read-only-flavoured hook for curious designers/devs.
    global.TERRAIN_01 = {
      get state() { return state; },
      get terrain() { return state.terrain; },
      get plan() { return state.plan; },
      get orbit() { return orbit; },
      get camera() { return camera; },
      setView: setViewPreset,
      focusSite: function (index, radius) {
        if (!state.plan || !state.plan.sites[index]) return false;
        const site = state.plan.sites[index];
        orbit.goalTarget.set(site.x, site.baseBottom + 1.2, site.z);
        orbit.goalRadius = radius || 14;
        orbit.goalTheta = -0.78;
        orbit.goalPhi = 1.12;
        return true;
      },
      rebuild: function () { queueBuild({ terrain: false, newLayout: true, delay: 0 }); },
      exportImage: exportHighResolution
    };

    animate();

    await nextFrame();
    await nextFrame();
    initialBuild();
  }

  function showWebGLFailure(message) {
    if (ui.bootOverlay) ui.bootOverlay.classList.add('is-hidden');
    ui.webglFallback.hidden = false;
    const p = ui.webglFallback.querySelector('p');
    if (p && message) p.textContent = message;
    setLiveStatus(message || '无法启动 WebGL。');
    setBusy(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
