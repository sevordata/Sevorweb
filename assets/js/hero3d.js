/* SEVOR Data — Three.js hero: point-cloud globe with a glowing beacon on
   Bahía Blanca, Argentina, and data arcs to client hubs. Loaded as an ES module.
   Falls back to a CSS background when WebGL / the CDN are unavailable. */
const canvas = document.getElementById("hero-canvas");
const hero = document.querySelector(".hero");

function fallback() {
  if (hero) hero.classList.add("no-webgl");
  if (canvas) canvas.remove();
}

function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch (e) { return false; }
}

async function init() {
  if (!canvas || !webglOK()) return fallback();
  let THREE;
  try {
    THREE = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js");
  } catch (e) { return fallback(); }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = window.matchMedia("(max-width: 760px)").matches || (navigator.hardwareConcurrency || 8) <= 4;
  const DPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: "high-performance" });
  } catch (e) { return fallback(); }
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 6.2);

  const ACCENT = new THREE.Color("#3df5c4");
  const LAND = new THREE.Color("#9fb6ff");
  const SEA = new THREE.Color("#2a3566");

  // Round soft sprite for points
  function dotTexture() {
    const s = 64, c = document.createElement("canvas");
    c.width = c.height = s;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.35, "rgba(255,255,255,.85)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  }
  const sprite = dotTexture();

  // Rough continent outlines [lon, lat] — stylised, not cartographic.
  const POLYS = [
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
  const isLand = (lon, lat) => lat < -70 || POLYS.some(p => inPoly(lon, lat, p));

  const R = 2;
  function ll(lon, lat, r = R) {
    const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon);
    return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
  }

  const globe = new THREE.Group();
  scene.add(globe);

  // Fibonacci sphere sampled into land / ocean points
  const N = mobile ? 5200 : 12000;
  const pos = [], col = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), th = golden * i;
    const x = Math.cos(th) * rad, z = Math.sin(th) * rad;
    const lat = THREE.MathUtils.radToDeg(Math.asin(y));
    const lon = THREE.MathUtils.radToDeg(Math.atan2(-z, x));
    const land = isLand(lon, lat);
    if (!land && i % 5 !== 0) continue;
    pos.push(x * R, y * R, z * R);
    const c = land ? LAND.clone().lerp(ACCENT, Math.max(0, (-lat - 20) / 60) * 0.35 * (lon < -30 && lon > -90 ? 1 : 0)) : SEA;
    col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({
    size: mobile ? 0.05 : 0.042, map: sprite, vertexColors: true, transparent: true,
    opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
  }));
  globe.add(pts);

  // Inner occluding sphere so the back side reads dimmer
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x070a18, transparent: true, opacity: 0.82 })));

  // Atmosphere glow (fresnel)
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 48, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { c: { value: new THREE.Color("#4f6bff") } },
    vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 c; varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0.0,0.0,1.0)), 3.0); gl_FragColor = vec4(c, 1.0) * i; }"
  }));
  scene.add(atmo);

  // Beacon on Bahía Blanca (−38.72, −62.27)
  const HOME = { lon: -62.27, lat: -38.72 };
  const homeV = ll(HOME.lon, HOME.lat, R * 1.01);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite, color: ACCENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  beacon.position.copy(homeV); beacon.scale.setScalar(0.28);
  globe.add(beacon);
  const ringGeo = new THREE.RingGeometry(0.06, 0.075, 48);
  const rings = [0, 1, 2].map(k => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.copy(homeV); m.lookAt(homeV.clone().multiplyScalar(2)); m.userData.phase = k / 3;
    globe.add(m); return m;
  });

  // Data arcs to client hubs (SF, NYC, London, Berlin, Tokyo)
  const HUBS = [[-122.4, 37.8], [-74, 40.7], [-0.1, 51.5], [13.4, 52.5], [139.7, 35.7]];
  const arcs = HUBS.map(([lon, lat], i) => {
    const a = homeV.clone(), b = ll(lon, lat, R * 1.01);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const h = 1 + a.distanceTo(b) * 0.28;
    mid.normalize().multiplyScalar(R * h);
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const lg = new THREE.BufferGeometry().setFromPoints(curve.getPoints(80));
    const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
    globe.add(line);
    const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    p.scale.setScalar(0.12); globe.add(p);
    const end = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite, color: LAND, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    end.position.copy(b); end.scale.setScalar(0.12); globe.add(end);
    return { curve, p, off: i * 0.21 };
  });

  // Ambient particle field
  const F = mobile ? 350 : 1100;
  const fp = new Float32Array(F * 3);
  for (let i = 0; i < F; i++) {
    const r = 5 + Math.random() * 14, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    fp[i * 3] = r * Math.sin(ph) * Math.cos(th); fp[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); fp[i * 3 + 2] = r * Math.cos(ph) - 6;
  }
  const fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.BufferAttribute(fp, 3));
  const field = new THREE.Points(fg, new THREE.PointsMaterial({ size: 0.05, map: sprite, color: 0x8ea2ff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(field);

  // Orientation: face Argentina toward the camera, slight tilt.
  const BASE_Y = THREE.MathUtils.degToRad(-90 - HOME.lon);
  globe.rotation.set(THREE.MathUtils.degToRad(-22), BASE_Y, 0);

  let W = 0, H = 0;
  function layout() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // Desktop: globe sits to the right; mobile: centered behind content, smaller.
    const wide = W > 900;
    camera.position.z = wide ? 6.2 : 7.4;
    camera.setViewOffset(W, H, wide ? -W * 0.2 : 0, wide ? 0 : -H * 0.06, W, H);
    camera.updateProjectionMatrix();
  }
  layout();
  window.addEventListener("resize", layout, { passive: true });

  let px = 0, py = 0, tx = 0, ty = 0, scrollP = 0;
  window.addEventListener("pointermove", e => {
    tx = (e.clientX / window.innerWidth - 0.5); ty = (e.clientY / window.innerHeight - 0.5);
  }, { passive: true });
  window.addEventListener("scroll", () => {
    scrollP = Math.min(1, window.scrollY / Math.max(1, window.innerHeight));
  }, { passive: true });

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 }).observe(canvas);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) last = performance.now(); });

  const clock = { t: 0 };
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible || document.hidden) { requestAnimationFrame(frame); return; }
    clock.t += dt;
    const t = clock.t;
    px += (tx - px) * 0.04; py += (ty - py) * 0.04;
    globe.rotation.y = BASE_Y + Math.sin(t * 0.12) * 0.55 + px * 0.35;
    globe.rotation.x = THREE.MathUtils.degToRad(-22) + py * 0.15 + scrollP * 0.25;
    const s = 1 - scrollP * 0.18; globe.scale.setScalar(s); atmo.scale.setScalar(s);
    globe.position.y = scrollP * 0.9;
    field.rotation.y = t * 0.01; field.rotation.x = t * 0.004;
    beacon.scale.setScalar(0.26 + Math.sin(t * 3) * 0.04);
    rings.forEach(m => {
      const k = (t * 0.45 + m.userData.phase) % 1;
      m.scale.setScalar(1 + k * 4); m.material.opacity = 0.8 * (1 - k);
    });
    arcs.forEach(a => { a.p.position.copy(a.curve.getPoint((t * 0.22 + a.off) % 1)); });
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  if (reduced) {
    // Static, single render: no motion.
    renderer.render(scene, camera);
    window.addEventListener("resize", () => renderer.render(scene, camera), { passive: true });
  } else {
    requestAnimationFrame(frame);
  }
  hero && hero.classList.add("webgl-ready");
}

init().catch(fallback);
