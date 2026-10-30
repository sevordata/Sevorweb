/* SEVOR Data — hero 3D: a sober, monochrome point-cloud globe with Argentina
   highlighted in celeste. Loaded as an ES module and initialised only after
   first paint (load + idle) and when the hero is on screen. Fewer points on
   small / low-power devices, a single static frame with prefers-reduced-motion,
   and the inline SVG map stays visible if WebGL or the CDN is unavailable.
   Continent outlines are stylised, not cartographic. */
const canvas = document.getElementById("hero-canvas");
const hero = document.querySelector(".hero");
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";

function fallback() {
  if (canvas) canvas.remove();
}

function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch (e) { return false; }
}

// [lon, lat] outlines
const ARGENTINA = [[-66.2,-21.8],[-64.3,-22.8],[-62.8,-22],[-62.3,-22.5],[-61,-23.8],[-59.5,-24.5],[-57.6,-25.3],[-55.8,-27.3],[-54.6,-25.6],[-53.7,-26.2],[-53.8,-27.1],[-55.7,-28],[-56.4,-28.9],[-57.6,-30.2],[-58.2,-32.4],[-58.4,-33.9],[-57.2,-35.3],[-56.7,-36.4],[-57.5,-38],[-59,-38.7],[-61.5,-39],[-62.3,-38.8],[-62.1,-39.6],[-62.3,-40.6],[-63.8,-41.1],[-65,-41],[-64.9,-42.2],[-63.6,-42.7],[-64.5,-42.9],[-65,-43.6],[-65.3,-44.6],[-66.5,-45],[-67.6,-46.4],[-66,-47],[-65.8,-47.8],[-67.6,-49.2],[-68.6,-50.2],[-69.1,-51.6],[-68.4,-52.3],[-69.5,-52.2],[-71.9,-52],[-72.3,-51],[-73.2,-49.8],[-72.5,-48],[-71.9,-46.8],[-71.7,-44.5],[-71.8,-42],[-71.4,-40],[-70.9,-38],[-70.4,-36.5],[-70,-33],[-69.8,-30],[-68.6,-28],[-68.3,-26],[-67.2,-24],[-67,-22.8]];
const TIERRA_DEL_FUEGO = [[-68.6,-52.6],[-68.6,-54.9],[-67,-54.9],[-65.2,-54.7],[-66.5,-53.8],[-68.3,-52.6]];
const LAND = [
  [[-80,10],[-75,11],[-62,11],[-52,5],[-35,-5],[-39,-15],[-41,-22],[-48,-26],[-53,-34],[-58,-38],[-62,-39],[-65,-42],[-67,-46],[-69,-51],[-68,-55],[-72,-53],[-75,-45],[-73,-37],[-71,-30],[-70,-18],[-76,-14],[-81,-5],[-80,1],[-78,7]],
  [[-168,66],[-160,71],[-140,70],[-125,70],[-95,72],[-80,73],[-65,62],[-60,55],[-53,47],[-66,44],[-70,41],[-76,35],[-81,31],[-80,25],[-83,29],[-90,30],[-97,27],[-97,21],[-90,21],[-87,16],[-83,10],[-79,8],[-84,9],[-92,14],[-105,20],[-110,23],[-117,32],[-124,40],[-124,48],[-132,55],[-145,60],[-155,58],[-165,60]],
  [[-55,60],[-43,60],[-20,70],[-20,80],[-40,83],[-65,80],[-58,75],[-52,68]],
  [[-10,36],[-9,43],[-2,44],[-5,48],[2,51],[8,54],[10,58],[5,62],[15,69],[28,71],[40,67],[60,69],[80,73],[105,78],[140,72],[170,70],[180,66],[170,60],[160,58],[155,52],[140,45],[130,42],[126,37],[122,30],[120,23],[110,20],[108,12],[104,9],[100,13],[98,8],[98,16],[92,22],[85,20],[80,13],[77,8],[73,18],[68,24],[58,23],[55,17],[44,12],[39,20],[34,28],[35,36],[27,37],[26,40],[23,37],[19,40],[13,45],[12,42],[16,38],[9,44],[3,43],[-5,36]],
  [[-17,21],[-16,28],[-10,30],[-6,36],[10,37],[11,33],[20,32],[30,31],[32,30],[34,28],[39,18],[43,12],[51,12],[50,2],[41,-3],[40,-10],[40,-16],[35,-24],[32,-28],[27,-34],[19,-35],[17,-29],[12,-17],[13,-8],[9,-1],[9,4],[4,6],[-8,4],[-13,8],[-17,14]],
  [[114,-22],[122,-18],[130,-12],[137,-12],[142,-11],[146,-19],[153,-25],[150,-37],[141,-38],[135,-35],[129,-32],[115,-34]],
  [[-5,50],[2,51],[-2,57],[-6,58],[-5,54]],
  [[130,31],[140,35],[142,40],[141,45],[139,40],[132,34]],
  [[109,1],[117,7],[119,1],[116,-4],[110,-3]],
  [[95,5],[106,-6],[103,-5],[98,1]],
  [[44,-25],[49,-12],[50,-16],[47,-25]],
  [[166,-46],[174,-41],[178,-38],[172,-34],[168,-46]]
];
function inPoly(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const isArgentina = (lon, lat) => inPoly(lon, lat, ARGENTINA) || inPoly(lon, lat, TIERRA_DEL_FUEGO);
const isLand = (lon, lat) => LAND.some(p => inPoly(lon, lat, p));

async function init() {
  if (!canvas || !webglOK()) return fallback();
  let THREE;
  try { THREE = await import(THREE_URL); } catch (e) { return fallback(); }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = window.matchMedia("(max-width: 760px)").matches || (navigator.hardwareConcurrency || 8) <= 4;
  const DPR = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch (e) { return fallback(); }
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
  camera.position.set(0, 0, 7.1);

  const C_LAND = new THREE.Color("#737a84");
  const C_SEA = new THREE.Color("#c4c8cd");
  const C_AR = new THREE.Color("#1d5c93");
  const C_PAPER = new THREE.Color("#f6f6f3");

  function dotTexture() {
    const s = 64, c = document.createElement("canvas");
    c.width = c.height = s;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2); g.fill();
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  }
  const sprite = dotTexture();

  const R = 2;
  const deg = THREE.MathUtils.degToRad;
  function ll(lon, lat, r = R) {
    const la = deg(lat), lo = deg(lon);
    return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
  }

  const globe = new THREE.Group();
  scene.add(globe);

  // Fibonacci sphere → land / ocean / Argentina points
  const N = small ? 9000 : 22000;
  const base = [], baseCol = [], ar = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), th = golden * i;
    const x = Math.cos(th) * rad, z = Math.sin(th) * rad;
    const lat = THREE.MathUtils.radToDeg(Math.asin(y));
    const lon = THREE.MathUtils.radToDeg(Math.atan2(-z, x));
    if (isArgentina(lon, lat)) continue; // Argentina gets its own denser grid below
    const land = isLand(lon, lat);
    // sparse, non-periodic ocean sampling (avoids moiré spirals)
    if (!land && (Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1) > 0.2) continue;
    base.push(x * R, y * R, z * R);
    const c = land ? C_LAND : C_SEA;
    baseCol.push(c.r, c.g, c.b);
  }
  // Dense, regular dot grid for Argentina so the country reads clearly.
  const step = small ? 0.75 : 0.55;
  for (let lat = -21.6, row = 0; lat > -55.2; lat -= step, row++) {
    for (let lon = -74 + (row % 2) * step / 2; lon < -53.4; lon += step) {
      if (isArgentina(lon, lat)) { const v = ll(lon, lat, R * 1.004); ar.push(v.x, v.y, v.z); }
    }
  }
  function points(arr, opts) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    if (opts.colors) g.setAttribute("color", new THREE.Float32BufferAttribute(opts.colors, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({
      size: opts.size, map: sprite, vertexColors: !!opts.colors, color: opts.color || 0xffffff,
      transparent: true, alphaTest: 0.5, depthWrite: true, sizeAttenuation: true
    }));
  }
  const ptSize = small ? 0.042 : 0.03;
  globe.add(points(base, { colors: baseCol, size: ptSize }));
  globe.add(points(ar, { color: C_AR, size: ptSize * 1.1 }));

  // Paper-coloured inner sphere: dims the far hemisphere so depth reads.
  const occ = new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 64, 64),
    new THREE.MeshBasicMaterial({ color: C_PAPER, transparent: true, opacity: 0.9, depthWrite: false }));
  occ.renderOrder = 2;
  globe.add(occ);

  // Hairline outline of the sphere and a faint equator ring
  const outline = new THREE.Mesh(new THREE.RingGeometry(R * 1.0, R * 1.006, 160),
    new THREE.MeshBasicMaterial({ color: 0xcbcbc3, transparent: true, opacity: 0.9 }));
  scene.add(outline);

  // Soft marker on Argentina (country centroid, not a city)
  const CENTER = { lon: -65.2, lat: -35.5 };
  const centerV = ll(CENTER.lon, CENTER.lat, R * 1.012);
  const ringGeo = new THREE.RingGeometry(0.16, 0.168, 72);
  const rings = [0, 1].map(k => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: C_AR, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    m.position.copy(centerV); m.lookAt(centerV.clone().multiplyScalar(2)); m.userData.phase = k / 2;
    m.renderOrder = 3;
    globe.add(m); return m;
  });

  const BASE_Y = deg(-90 - CENTER.lon);
  const BASE_X = deg(-30);
  globe.rotation.set(BASE_X, BASE_Y, 0, "XYZ");

  function layout() {
    const r = canvas.getBoundingClientRect();
    const W = Math.max(1, r.width), H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  layout();

  let px = 0, py = 0, tx = 0, ty = 0;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (finePointer && !reduced) {
    window.addEventListener("pointermove", e => {
      tx = e.clientX / window.innerWidth - 0.5; ty = e.clientY / window.innerHeight - 0.5;
    }, { passive: true });
  }

  let visible = true, running = false, last = performance.now(), t = 0;
  function frame(now) {
    if (!visible || document.hidden) { running = false; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    px += (tx - px) * 0.03; py += (ty - py) * 0.03;
    globe.rotation.y = BASE_Y + Math.sin(t * 0.09) * 0.42 + px * 0.25;
    globe.rotation.x = BASE_X + py * 0.08;
    rings.forEach(m => {
      const k = (t * 0.28 + m.userData.phase) % 1;
      m.scale.setScalar(1 + k * 1.8); m.material.opacity = 0.45 * (1 - k);
    });
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  function start() { if (!running && !reduced) { running = true; last = performance.now(); requestAnimationFrame(frame); } }

  const still = () => renderer.render(scene, camera);
  window.addEventListener("resize", () => { layout(); if (reduced) still(); }, { passive: true });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }, { threshold: 0 }).observe(canvas);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) start(); });

  if (reduced) { rings.forEach(m => { m.material.opacity = 0.5; m.scale.setScalar(1.6); }); still(); }
  else start();
  hero && hero.classList.add("webgl-ready");
}

// Lazy init: after the page has painted and the browser is idle.
function boot() {
  const go = () => init().catch(fallback);
  if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 1500 });
  else setTimeout(go, 300);
}
if (document.readyState === "complete") boot();
else window.addEventListener("load", boot, { once: true });
