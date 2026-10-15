import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createCharacter } from './creatures.js';
import { Sound } from './audio.js';
import { createGoogle3D } from './realistic.js';
import { glowTexture } from './city.js';
import { createWalker } from './walker.js';
import { createInput } from './input.js';

/* New York over Google Photorealistic 3D Tiles (via Cesium ion or a Google key). */
const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, damp = THREE.MathUtils.damp;
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('touch');
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private */ } } };

// local projection around Midtown
const LAT0 = 40.7549, LON0 = -73.9840, PHI = LAT0 * Math.PI / 180;
const KX = 111412.84 * Math.cos(PHI) - 93.5 * Math.cos(3 * PHI);
const KZ = 111132.92 - 559.82 * Math.cos(2 * PHI) + 1.175 * Math.cos(4 * PHI);
const L2W = (lat, lon, y) => new THREE.Vector3((lon - LON0) * KX, y, -(lat - LAT0) * KZ);

const WORD = ['נ', 'י', 'ו', ' ', 'י', 'ו', 'ר', 'ק'];
const LETTERS = [
  { ch: 'נ', slot: 0, label: 'אמפייר סטייט בילדינג', lat: 40.74844, lon: -73.98566, y: 300, off: [70, 0] },
  { ch: 'י', slot: 1, label: 'בניין קרייזלר', lat: 40.75162, lon: -73.97550, y: 250, off: [0, 60] },
  { ch: 'ו', slot: 2, label: 'טיימס סקוור', lat: 40.75800, lon: -73.98550, y: 70, off: [0, 0] },
  { ch: 'י', slot: 4, label: 'סנטרל פארק', lat: 40.77400, lon: -73.97120, y: 45, off: [0, 0] },
  { ch: 'ו', slot: 5, label: 'גשר ברוקלין', lat: 40.70610, lon: -73.99686, y: 100, off: [0, 0] },
  { ch: 'ר', slot: 6, label: 'וואן וורלד טרייד סנטר', lat: 40.71274, lon: -74.01338, y: 420, off: [0, 70] },
  { ch: 'ק', slot: 7, label: 'פסל החירות', lat: 40.68925, lon: -74.04450, y: 120, off: [0, 0] },
];
const LANDMARKS = [
  ...LETTERS.map((l) => ({ name: l.label, lat: l.lat, lon: l.lon })),
  { name: 'מרכז רוקפלר', lat: 40.7587, lon: -73.9787 }, { name: 'הדסון יארדס · The Vessel', lat: 40.7538, lon: -74.0020 },
  { name: 'גשר מנהטן', lat: 40.7075, lon: -73.9908 }, { name: 'וול סטריט', lat: 40.7060, lon: -74.0088 },
  { name: 'בניין פלאטאיירון', lat: 40.7411, lon: -73.9897 }, { name: 'הוואי ליין', lat: 40.7480, lon: -74.0048 },
  { name: 'גראנד סנטרל', lat: 40.7527, lon: -73.9772 }, { name: 'One Vanderbilt', lat: 40.7530, lon: -73.9786 },
];

const TOD = [
  { name: '🌅 שקיעה', el: 4, az: 250, turb: 6, ray: 2.2, mie: 0.0018, g: 0.82, sun: '#ffa468', sunI: 1.4, hemi: 0.7, exp: 0.5, tint: '#ffd9c0', fog: '#caa08c' },
  { name: '☀️ צהריים', el: 38, az: 170, turb: 3, ray: 1.1, mie: 0.004, g: 0.8, sun: '#fff5e6', sunI: 2, hemi: 0.9, exp: 0.5, tint: '#ffffff', fog: '#bcd0e4' },
  { name: '🌃 ערב', el: -1.5, az: 255, turb: 2, ray: 3.2, mie: 0.003, g: 0.8, sun: '#7c8cff', sunI: 0.3, hemi: 0.5, exp: 0.95, tint: '#7a7fa8', fog: '#2a3050' },
];

/* ---------------- renderer ---------------- */
const QUALITY = [{ name: '⚡ חיסכון', dpr: 1, err: 16, bloom: false }, { name: '⚖️ מאוזן', dpr: Math.min(devicePixelRatio, 1.25), err: 10, bloom: true }, { name: '💎 גבוהה', dpr: Math.min(devicePixelRatio, 1.75), err: 6, bloom: true }];
let qi = clamp(+(store.get('flypt.quality') ?? 1), 0, 2), Q = QUALITY[qi];
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Q.dpr); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 1, 60000);
let composer, bloom;
function buildComposer() {
  composer?.dispose();
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * Q.dpr, innerHeight * Q.dpr, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  // no bloom: on photoreal tiles it only smeared the bright sky into a white veil
  composer.addPass(new OutputPass());
}
buildComposer();
const render = () => (Q.bloom ? composer.render() : renderer.render(scene, camera));

const sky = new Sky(); sky.scale.setScalar(50000); scene.add(sky);
const skyU = sky.material.uniforms; skyU.showSunDisc.value = 0;
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,255,1)', 'rgba(255,190,120,0.35)'), color: new THREE.Color(1.2, 0.95, 0.7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
sunSprite.scale.setScalar(900); scene.add(sunSprite);
const sunDir = new THREE.Vector3();
const sunLight = new THREE.DirectionalLight('#fff', 1.4); scene.add(sunLight, sunLight.target);
const hemi = new THREE.HemisphereLight('#cfe0ff', '#4a3a30', 0.7); scene.add(hemi);
scene.fog = new THREE.FogExp2('#caa08c', 0.00006);

let tiles = null;
const pmrem = new THREE.PMREMGenerator(renderer);
const skyScene = new THREE.Scene(); const skyEnv = new Sky(); skyEnv.scale.setScalar(1000); skyEnv.material.uniforms.showSunDisc.value = 0; skyScene.add(skyEnv);
let envRT = null;
function waterNormals(seed = 0, rep = 330) { // tileable procedural ripples → normal map
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const img = g.createImageData(N, N);
  const W = []; let r = 1 + seed * 17; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 14; i++) { const a = rnd() * 6.283, f = 1 + Math.floor(rnd() * (i < 5 ? 4 : 11)); W.push([Math.round(Math.cos(a) * f), Math.round(Math.sin(a) * f), 1 / (1 + f * 0.9), rnd() * 6.283]); }
  const h = (x, y) => W.reduce((a, [kx, ky, amp, ph]) => a + amp * Math.sin((kx * x + ky * y) / N * Math.PI * 2 + ph), 0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1); const n = new THREE.Vector3(-dx * 6, -dy * 6, 1).normalize(); const i = (y * N + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); return t;
}
// two ripple layers at different scales/directions so the tiling never lines up
const waterMat = new THREE.MeshPhysicalMaterial({ color: '#23404f', roughness: 0.28, metalness: 0, normalMap: waterNormals(1, 170), normalScale: new THREE.Vector2(0.12, 0.12), clearcoat: 1, clearcoatRoughness: 0.06, clearcoatNormalMap: waterNormals(2, 610), clearcoatNormalScale: new THREE.Vector2(0.18, 0.18), envMapIntensity: 0.9 });
const water = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), waterMat);
// Tiles are anchored at ellipsoid height -20 m. Mean sea level in NYC is ~32.3 m below the WGS84
// ellipsoid (EGM96), so the sea sits at y ≈ -12.3 — verified on detailed tiles (Hudson -12.2/-12.3,
// Chelsea streets -1…-4). Never sample coarse tiles for this: they are off by 10+ m.
const ORIGIN_H = -20, SEA_Y = -32.3 - ORIGIN_H;
water.rotation.x = -Math.PI / 2; water.position.y = SEA_Y + 0.3; water.visible = false; scene.add(water);
let todI = +(store.get('flypt.nyc.tod') ?? 1) % 3; // midday by default — less glare
function applyTod(p) {
  const phi = THREE.MathUtils.degToRad(90 - p.el), th = THREE.MathUtils.degToRad(p.az);
  sunDir.set(Math.sin(th) * Math.sin(phi), Math.cos(phi), -Math.cos(th) * Math.sin(phi));
  skyU.turbidity.value = p.turb; skyU.rayleigh.value = p.ray; skyU.mieCoefficient.value = p.mie; skyU.mieDirectionalG.value = p.g; skyU.sunPosition.value.copy(sunDir);
  sunLight.color.set(p.sun); sunLight.intensity = p.sunI; hemi.intensity = p.hemi; renderer.toneMappingExposure = p.exp;
  scene.fog.color.set(p.fog); tiles?.setTint(new THREE.Color(p.tint));
  const U = skyEnv.material.uniforms; U.turbidity.value = p.turb; U.rayleigh.value = p.ray; U.mieCoefficient.value = p.mie; U.mieDirectionalG.value = p.g; U.sunPosition.value.copy(sunDir);
  envRT?.dispose(); envRT = pmrem.fromScene(skyScene, 0, 1, 2000); scene.environment = envRT.texture; scene.environmentIntensity = 0.8;
  waterMat.color.set(p.el < 0 ? '#0c1624' : p.el < 10 ? '#2a3f52' : '#1d3f55');
}
applyTod(TOD[todI]);

/* ---------------- state ---------------- */
const S = { mode: 'title', free: false, pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, speed: 26, turnS: 0, lift: 0, boost: 1, boosting: false, flapCD: 0, flapGlow: 0,
  t0: 0, elapsed: 0, hits: 0, dist: 0, invuln: 0, shake: 0, got: new Set(), surf: 0, surfT: 0, rayT: 0 };
const START = { pos: L2W(40.7330, -73.9870, 260), yaw: 0.05 };
const keys = {}, touch = { x: 0, y: 0, boost: false };
const sound = new Sound();
const axis = { x: 0, y: 0, boost: false, flap: false };
const input = createInput({
  canvas, store,
  canLock: () => !IS_TOUCH && ['fly', 'walk', 'landing'].includes(S.mode),
  onAction: (a) => {
    if (a === 'mouse-on') toast('🖱️ שליטה בעכבר · לחיצה = נפנוף · ימני = טורבו · Esc לשחרור', 2600);
    if (a === 'primary' && S.mode === 'walk') takeOff();
    if (a === 'land') landOrTakeoff();
    if (a === 'time') { todI = (todI + 1) % TOD.length; applyTod(TOD[todI]); }
    if (a === 'start' && S.mode === 'title' && !$('btnStart').disabled) start(false);
  },
  onPadChange: (id, on) => toast(on ? '🎮 שלט מחובר' : '🎮 השלט נותק', 2000),
});
const bird = createCharacter(store.get('flypt.char') || 'parrot'); bird.root.visible = false; scene.add(bird.root);
const walker = createWalker(); walker.root.visible = false; scene.add(walker.root);

const envKey = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
const gKey = () => store.get('flypt.gkey') || envKey;

/* ---------------- letters ---------------- */
function letterTexture(ch) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 190px Rubik, Arial'; g.shadowColor = 'rgba(255,170,40,0.95)'; g.shadowBlur = 30;
  const gr = g.createLinearGradient(0, 30, 0, 230); gr.addColorStop(0, '#fff6c8'); gr.addColorStop(0.45, '#ffc94d'); gr.addColorStop(1, '#d47d08');
  g.fillStyle = gr; g.fillText(ch, 128, 140); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const letters = [];
{
  const ringGeo = new THREE.TorusGeometry(16, 1.4, 14, 64);
  const ringMat = new THREE.MeshStandardMaterial({ color: '#ffcf5a', metalness: 1, roughness: 0.22, emissive: '#ff9a1f', emissiveIntensity: 1.1 });
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.1, 0.4), transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  for (const L of LETTERS) {
    const pos = L2W(L.lat, L.lon, L.y); pos.x += L.off[0]; pos.z += L.off[1];
    const g = new THREE.Group(); g.position.copy(pos);
    const ring = new THREE.Mesh(ringGeo, ringMat); g.add(ring);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTexture(L.ch), color: new THREE.Color(1.4, 1.3, 1.1), depthWrite: false, fog: false })); spr.scale.setScalar(22); g.add(spr);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 1400, 16, 1, true), beamMat); beam.position.y = 700 - pos.y; g.add(beam);
    ring.lookAt(new THREE.Vector3().copy(pos).setY(pos.y).add(new THREE.Vector3(-pos.x, 0, -pos.z)));
    scene.add(g);
    const mk = document.createElement('div'); mk.className = 'mk'; mk.innerHTML = `<div class="gem"><b>${L.ch}</b></div><div class="d"></div>`; $('markers').appendChild(mk);
    letters.push({ ...L, pos, g, ring, mk, dEl: mk.querySelector('.d'), taken: false, spin: Math.random() * 6 });
  }
}
const landmarks = LANDMARKS.map((l) => ({ ...l, p: L2W(l.lat, l.lon, 0) }));

/* ---------------- particles ---------------- */
const FX = (() => {
  const N = 1200, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.4, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; scene.add(pts);
  const P = Array.from({ length: N }, () => ({ life: 0, max: 1, v: new THREE.Vector3(), c: new THREE.Color(), p: new THREE.Vector3() })); let h = 0;
  const spawn = (p, v, c, life) => { const q = P[h]; h = (h + 1) % N; q.life = q.max = life; q.p.copy(p); q.v.copy(v); q.c.copy(c); };
  return {
    burst(at, n = 260) { const c = new THREE.Color(); for (let i = 0; i < n; i++) { c.setHSL(0.09 + Math.random() * 0.06, 1, 0.6).multiplyScalar(2.2); spawn(at, new THREE.Vector3().randomDirection().multiplyScalar(10 + Math.random() * 40), c, 1 + Math.random() * 1.2); } },
    trail(at, c = [2.2, 0.8, 1.2]) { spawn(at, new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2), new THREE.Color(...c), 0.7); },
    update(dt) { for (let i = 0; i < N; i++) { const q = P[i]; if (q.life <= 0) { pos[i * 3 + 1] = -9999; continue; } q.life -= dt; q.v.multiplyScalar(Math.exp(-dt * 1.8)); q.v.y -= dt * 4; q.p.addScaledVector(q.v, dt); const k = Math.max(0, q.life / q.max); pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z; col[i * 3] = q.c.r * k; col[i * 3 + 1] = q.c.g * k; col[i * 3 + 2] = q.c.b * k; } geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; },
  };
})();

/* ---------------- tiles ---------------- */
function progress(f, t) { $('loaderFill').style.width = `${Math.round(f * 100)}%`; if (t) $('loaderText').textContent = t; }
function startTiles() {
  if (!gKey()) { $('keyBox').classList.remove('hidden'); $('loader').classList.add('done'); return; }
  $('keyBox').classList.add('hidden'); $('loader').classList.remove('done');
  tiles?.dispose();
  tiles = createGoogle3D(scene, camera, renderer, gKey(), { lat: LAT0, lon: LON0, height: ORIGIN_H, errorTarget: Q.err, calibrateFor: 0,
    onError: () => { progress(0, '⚠️ הטוקן לא עובד — בדקו אותו והדביקו שוב'); store.set('flypt.gkey', ''); $('keyBox').classList.remove('hidden'); } });
  applyTod(TOD[todI]);
  let tt = 0; const iv = setInterval(() => {
    tt++; const s = tiles.tiles.stats; progress(Math.min(1, s.loaded / 250), `טוען את מנהטן בתלת־ממד… ${s.loaded} חלקים`);
    if (s.loaded > 250 || tt > 40) { clearInterval(iv); progress(1, 'מוכנים'); setTimeout(() => $('loader').classList.add('done'), 400); $('btnStart').disabled = false; $('btnFree').disabled = false; }
  }, 500);
}
$('btnKey').onclick = () => { const v = $('gkey').value.trim(); if (!v) return; store.set('flypt.gkey', v); $('gkey').value = ''; startTiles(); };

/* ---------------- input ---------------- */
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyT') { todI = (todI + 1) % TOD.length; store.set('flypt.nyc.tod', String(todI)); applyTod(TOD[todI]); const c = $('todChip'); c.textContent = TOD[todI].name; c.classList.add('on'); setTimeout(() => c.classList.remove('on'), 1800); }
  if (e.code === 'KeyM') sound.setMuted(!sound.muted);
  if (e.code === 'KeyE') landOrTakeoff();
  if (e.code === 'KeyV' && S.mode === 'walk') { wci = (wci + 1) % WCAMS.length; store.set('flypt.nyc.wcam', String(wci)); toast(WCAMS[wci].name, 1300); }
  if (e.code === 'Space' && S.mode === 'walk') takeOff();
  if (e.code === 'KeyQ') { qi = (qi + 1) % 3; Q = QUALITY[qi]; store.set('flypt.quality', String(qi)); renderer.setPixelRatio(Q.dpr); renderer.setSize(innerWidth, innerHeight); buildComposer(); if (tiles) tiles.tiles.errorTarget = Q.err; toast(Q.name, 1200); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
{
  const stick = $('stick'), knob = $('stickKnob'); let id = null, cx = 0, cy = 0;
  const move = (e) => { if (e.pointerId !== id) return; let dx = e.clientX - cx, dy = e.clientY - cy; const m = Math.hypot(dx, dy); if (m > 50) { dx *= 50 / m; dy *= 50 / m; } knob.style.transform = `translate(${dx}px,${dy}px)`; touch.x = dx / 50; touch.y = -dy / 50; };
  stick.addEventListener('pointerdown', (e) => { id = e.pointerId; const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; stick.setPointerCapture(id); move(e); });
  stick.addEventListener('pointermove', move);
  stick.addEventListener('pointerup', () => { id = null; touch.x = touch.y = 0; knob.style.transform = ''; });
  $('btnLand').addEventListener('pointerdown', (e) => { e.preventDefault(); landOrTakeoff(); });
  $('btnFlap').addEventListener('pointerdown', () => { if (S.mode === 'walk') takeOff(); else keys.Space = true; }); $('btnFlap').addEventListener('pointerup', () => { keys.Space = false; });
  $('btnBoost').addEventListener('pointerdown', () => { touch.boost = true; }); $('btnBoost').addEventListener('pointerup', () => { touch.boost = false; });
}

/* ---------------- HUD ---------------- */
let toastTm; function toast(html, ms = 2200) { const t = $('toast'); t.innerHTML = html; t.classList.add('on'); clearTimeout(toastTm); toastTm = setTimeout(() => t.classList.remove('on'), ms); }
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const PX = 3.2; let goalSpan;
{
  const CARD = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }; let h = '';
  for (let d = -180; d <= 540; d += 15) { const n = ((d % 360) + 360) % 360; h += CARD[n] !== undefined ? `<span class="card${n === 0 ? ' n' : ''}" style="left:${d * PX}px">${CARD[n]}</span>` : `<span style="left:${d * PX}px">${n}</span>`; }
  $('compassTape').innerHTML = h + '<span class="goal" id="goal">◆</span>'; goalSpan = $('goal');
  $('wordPreview').innerHTML = WORD.map((c) => c === ' ' ? '<span class="gap"></span>' : `<span class="wp">${c}</span>`).join('');
  $('slots').innerHTML = WORD.map((c, i) => c === ' ' ? '<span class="slot gap"></span>' : `<span class="slot" data-i="${i}">${c}</span>`).join('');
  const best = +store.get('flypt.nyc.best') || 0; if (best) $('bestLine').innerHTML = `השיא שלך: <b>${fmt(best)}</b>`;
}
const v3 = new THREE.Vector3(); let hudT = 0, lastLm = null, attribT = 0;
function updateHud(dt, fwd) {
  const hr = ((-S.yaw) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2), hdg = THREE.MathUtils.radToDeg(hr);
  $('compassTape').style.transform = `translateX(${-hdg * PX}px)`;
  let nearest = null, nd = 1e9; for (const L of letters) { if (L.taken) continue; const d = L.pos.distanceTo(S.pos); if (d < nd) { nd = d; nearest = L; } }
  if (nearest) { let b = THREE.MathUtils.radToDeg(Math.atan2(nearest.pos.x - S.pos.x, -(nearest.pos.z - S.pos.z))); b = ((b % 360) + 360) % 360; while (b - hdg > 180) b -= 360; while (hdg - b > 180) b += 360; goalSpan.style.left = `${b * PX}px`; goalSpan.style.display = ''; } else goalSpan.style.display = 'none';
  const W = innerWidth, H = innerHeight;
  for (const L of letters) {
    if (L.taken) { L.mk.style.display = 'none'; continue; } L.mk.style.display = '';
    v3.copy(L.pos).project(camera); const behind = v3.z > 1; let x = (v3.x * 0.5 + 0.5) * W, y = (-v3.y * 0.5 + 0.5) * H; if (behind) { x = W - x; y = H - y; }
    const m = 46, mx = W > 900 ? 150 : 46, on = !behind && x > m && x < W - m && y > m && y < H - m;
    if (!on) { const cx = W / 2, cy = H / 2, dx = x - cx, dy = y - cy || 1, k = Math.min((W / 2 - mx) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy)); x = cx + dx * k; y = cy + dy * k; }
    L.mk.classList.toggle('edge', !on); L.mk.classList.toggle('nearest', L === nearest);
    const d = L.pos.distanceTo(S.pos); L.mk.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%)`; L.mk.style.opacity = d < 80 ? d / 80 : 1;
    L.dEl.textContent = d > 1000 ? `${(d / 1000).toFixed(1)} ק״מ` : `${Math.round(d)} מ׳`;
  }
  attribT -= dt; if (attribT < 0 && tiles) { attribT = 3; $('attrib').textContent = 'Google' + (tiles.attributions() ? ' · ' + tiles.attributions() : ''); }
  hudT += dt; if (hudT < 0.08) return; hudT = 0;
  $('headingDeg').textContent = String(Math.round(hdg) % 360).padStart(3, '0') + '°'; $('headingCard').textContent = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(hdg / 45) % 8];
  $('altVal').textContent = Math.round(S.pos.y); $('altBar').style.height = `${clamp(S.pos.y / 600, 0, 1) * 100}%`;
  const vs = fwd.y * S.speed + S.lift; $('vsVal').textContent = `${vs >= 0 ? '▲' : '▼'} ${Math.abs(vs).toFixed(1)} מ׳/ש`;
  $('spdVal').textContent = Math.round(S.speed * 3.6); $('boostBar').style.width = `${S.boost * 100}%`;
  if (!S.free && S.mode === 'fly') $('timer').textContent = fmt(S.elapsed);
  let lm = null, ld = 350; for (const p of landmarks) { const d = Math.hypot(p.p.x - S.pos.x, p.p.z - S.pos.z); if (d < ld) { ld = d; lm = p; } }
  if (lm !== lastLm) { lastLm = lm; if (lm) { $('lmName').textContent = lm.name; $('lmH').textContent = 'ניו יורק'; } $('landmark').classList.toggle('on', !!lm); }
}

/* ---------------- flow ---------------- */
function start(free) {
  sound.start(); S.free = free; S.mode = 'fly';
  if (bird.root.parent !== scene) scene.add(bird.root); bird.root.scale.setScalar(1.35); walker.root.visible = false; document.body.classList.remove('walking');
  S.pos.copy(START.pos); S.yaw = START.yaw; S.pitch = -0.05; S.roll = 0; S.speed = 28; S.lift = 0; S.boost = 1; S.hits = 0; S.dist = 0; S.got.clear(); S.t0 = performance.now(); S.invuln = 2;
  for (const L of letters) { L.taken = false; L.g.visible = true; L.g.scale.setScalar(1); }
  document.querySelectorAll('.slot').forEach((s) => s.classList.remove('got', 'pop')); $('letterCount').textContent = `0/${letters.length}`;
  bird.root.visible = true; $('title').classList.add('fade'); setTimeout(() => $('title').classList.add('hidden'), 800); $('end').classList.add('hidden');
  $('hud').classList.remove('hidden'); document.querySelector('.timer').style.display = free ? 'none' : '';
  toast(free ? 'ניו יורק כולה שלכם 🗽' : 'עקבו אחרי קרני הזהב ✨ — האמפייר סטייט ממש מולכם', 3200);
  setTimeout(() => $('keysHint').classList.add('fade'), 12000);
}
function finish() {
  S.mode = 'end'; const time = S.elapsed, prev = +store.get('flypt.nyc.best') || 0, isBest = !prev || time < prev; if (isBest) store.set('flypt.nyc.best', String(time));
  $('endTime').textContent = fmt(time); $('endBest').textContent = fmt(isBest ? time : prev); $('endHits').textContent = S.hits; $('endDist').textContent = (S.dist / 1000).toFixed(1);
  $('newBest').classList.toggle('hidden', !isBest); $('end').classList.remove('hidden');
}
$('btnStart').onclick = () => start(false); $('btnFree').onclick = () => start(true); $('btnAgain').onclick = () => start(false);
$('btnFreeEnd').onclick = () => { $('end').classList.add('hidden'); S.mode = 'fly'; S.free = true; document.querySelector('.timer').style.display = 'none'; };

/* ---------------- sim ---------------- */
const fwd = new THREE.Vector3(), camT = new THREE.Vector3(), camLook = new THREE.Vector3(), look = new THREE.Vector3(), prev = new THREE.Vector3();
function simulate(dt) {
  const k = keys;
  const turn = clamp(((k.ArrowLeft || k.KeyA) ? 1 : 0) - ((k.ArrowRight || k.KeyD) ? 1 : 0) - axis.x, -1, 1);
  const pin = clamp(((k.ArrowUp || k.KeyW) ? 1 : 0) - ((k.ArrowDown || k.KeyS) ? 1 : 0) + axis.y, -1, 1);
  S.boosting = (k.ShiftLeft || k.ShiftRight || axis.boost) && S.boost > 0.02; S.boost = clamp(S.boost + (S.boosting ? -dt * 0.25 : dt * 0.12), 0, 1);
  S.turnS = damp(S.turnS, turn, 4, dt); S.yaw += S.turnS * 1.15 * dt; S.pitch = damp(S.pitch, pin * 0.55, 2.6, dt); S.roll = damp(S.roll, S.turnS * 0.8, 4, dt);
  S.flapCD -= dt; if ((k.Space || axis.flap) && S.flapCD <= 0) { S.flapCD = 0.38; S.lift += 9; S.speed += 3; S.flapGlow = 1; sound.flap(); }
  S.lift *= Math.exp(-dt * 1.6); S.flapGlow = Math.max(0, S.flapGlow - dt * 2.5);
  S.speed = damp(S.speed, 30 + (S.boosting ? 40 : 0) - S.pitch * 12 + (S.pitch < 0 ? -S.pitch * 30 : 0), S.boosting ? 1.6 : 0.7, dt);
  if (S.pos.y > 900) S.pitch = damp(S.pitch, -0.3, 2, dt);
  fwd.set(-Math.sin(S.yaw) * Math.cos(S.pitch), Math.sin(S.pitch), -Math.cos(S.yaw) * Math.cos(S.pitch));
  prev.copy(S.pos); S.pos.addScaledVector(fwd, S.speed * dt); S.pos.y += S.lift * dt; S.dist += S.speed * dt;
  // real surface below (roofs, streets, water)
  S.surfT -= dt; if (tiles && S.surfT <= 0) { S.surfT = 0.1; const y = tiles.groundAt(S.pos.x, S.pos.z, S.pos.y + 300); S.surf = y ?? S.surf; }
  if (S.pos.y < S.surf + 3) { S.pos.y = S.surf + 3; if (S.pitch < 0) S.pitch = damp(S.pitch, 0.15, 6, dt); }
  // walls ahead
  S.invuln -= dt; S.rayT -= dt;
  if (tiles && S.rayT <= 0 && S.invuln <= 0) {
    S.rayT = 0.05;
    const hit = tiles.hitAlong(prev, fwd, S.speed * 0.25 + 4);
    if (hit) crash(hit);
  }
  for (const L of letters) if (!L.taken && L.pos.distanceTo(S.pos) < 20) collect(L);
  if (S.boosting || S.flapGlow > 0.5) FX.trail(S.pos.clone().addScaledVector(fwd, -1.5), bird.def.trail);
  sound.wind(S.speed, S.boosting);
}
function crash(hit) {
  input.rumble(0.9, 0.6, 260);
  S.hits++; S.shake = 0.6; S.invuln = 1.2; sound.crash();
  const hf = document.querySelector('.hit-flash'); hf.classList.add('on'); setTimeout(() => hf.classList.remove('on'), 60);
  const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : fwd.clone().negate();
  n.y = Math.max(n.y, 0.2); n.normalize();
  S.pos.copy(prev).addScaledVector(n, 6);
  S.yaw = Math.atan2(-n.x, -n.z) * 0.5 + S.yaw * 0.5 + Math.PI * 0.5 * Math.sign(Math.random() - 0.5);
  S.speed = 14; S.pitch = 0.3; S.lift = 6;
  toast('💥 אאוץ׳! זהירות מהגורדי שחקים', 1400);
}
function collect(L) {
  L.taken = true; S.got.add(L.slot); FX.burst(L.pos.clone()); sound.collect(S.got.size - 1); L.ct = 0;
  const slot = document.querySelector(`.slot[data-i="${L.slot}"]`); slot.classList.add('got', 'pop');
  $('letterCount').textContent = `${S.got.size}/${letters.length}`; toast(`<span class="big">${L.ch}</span> ${L.label}`, 2000);
  if (S.got.size === letters.length && !S.free) { S.elapsed = (performance.now() - S.t0) / 1000; setTimeout(() => sound.fanfare(), 300); setTimeout(finish, 2600); }
}
/* ---------------- land & walk ---------------- */
const WATER_Y = SEA_Y + 1.6;
const wv = new THREE.Vector3(), dirV = new THREE.Vector3(), downV = new THREE.Vector3(0, -1, 0);
function landOrTakeoff() {
  if (S.mode === 'walk') return takeOff();
  if (S.mode !== 'fly') return;
  if (S.pos.y - S.surf > 40) return toast('⬇️ רדו עד 40 מ׳ מעל הקרקע או הגג כדי לנחות', 1600);
  if (S.surf < WATER_Y) return toast('🌊 מתחתיכם מים — חפשו רחוב, פארק או גג', 1600);
  S.mode = 'landing'; S.landT = 0; S.landFrom = S.pos.y;
}
function takeOff() {
  if (S.mode !== 'walk') return;
  scene.add(bird.root); bird.root.scale.setScalar(1.35);
  const p = walker.root.position; S.pos.set(p.x, p.y + 3, p.z); S.yaw = S.wyaw; S.pitch = 0.5; S.lift = 10; S.speed = 16; S.invuln = 1.5;
  walker.root.visible = false; S.mode = 'fly'; document.body.classList.remove('walking'); sound.flap(); $('btnLand').textContent = 'נחיתה';
  tiles.tiles.errorTarget = Q.err;
}
function finishLanding() {
  S.mode = 'walk'; S.wyaw = S.yaw; S.wspeed = 0;
  walker.root.position.set(S.pos.x, S.surf, S.pos.z); walker.root.rotation.y = S.wyaw; walker.root.visible = true;
  walker.shoulder.add(bird.root); bird.root.position.set(0, 0, 0); bird.root.rotation.set(0, 0, 0); bird.root.scale.setScalar(0.2);
  document.body.classList.add('walking'); $('btnLand').textContent = 'המראה';
  tiles.tiles.errorTarget = 1.5; tiles.tiles.lruCache.maxBytesSize = 1.2 * 1024 ** 3; // sharpest tiles Google has, only around us
  toast('🚶 נחתתם בניו יורק! חצים = הליכה · V = זווית מצלמה · רווח = המראה', 2800);
}
function walkSim(dt) {
  const k = keys;
  const fin = clamp(((k.ArrowUp || k.KeyW) ? 1 : 0) - ((k.ArrowDown || k.KeyS) ? 1 : 0) + axis.y, -1, 1);
  const turn = clamp(((k.ArrowLeft || k.KeyA) ? 1 : 0) - ((k.ArrowRight || k.KeyD) ? 1 : 0) - axis.x, -1, 1);
  S.wyaw += turn * 2.1 * dt; S.wspeed = damp(S.wspeed, fin * ((k.ShiftLeft || k.ShiftRight || axis.boost) ? 6 : 2), 6, dt);
  const p = walker.root.position, step = S.wspeed * dt;
  if (Math.abs(step) > 1e-4) {
    dirV.set(-Math.sin(S.wyaw) * Math.sign(step), 0, -Math.cos(S.wyaw) * Math.sign(step));
    wv.set(p.x, p.y + 1.0, p.z);
    const wall = tiles.hitAlong(wv, dirV, Math.abs(step) + 0.6);
    if (!wall) {
      const nx = p.x + dirV.x * Math.abs(step), nz = p.z + dirV.z * Math.abs(step);
      wv.set(nx, p.y + 1.6, nz); const g = tiles.hitAlong(wv, downV, 40);
      const gy = g ? g.point.y : p.y;
      if (gy < WATER_Y && p.y >= WATER_Y) { /* don't walk into the river */ }
      else if (gy - p.y < 1.2) { p.x = nx; p.z = nz; S.gyT = gy; }
    }
  }
  if (S.gyT !== undefined) p.y = gy_smooth(p.y, S.gyT, dt);
  walker.root.rotation.y = S.wyaw; walker.update(dt, Math.abs(S.wspeed)); bird.update(dt, 2, 1);
  S.pos.set(p.x, p.y, p.z); S.dist += Math.abs(step); S.surf = p.y;
  sound.wind(2, false);
}
const gy_smooth = (y, t, dt) => (t < y - 0.5 ? damp(y, t, 5, dt) : damp(y, t, 14, dt));
const wcam = new THREE.Vector3();
const WCAMS = [{ name: '🚁 מבט רחפן נמוך', back: 9, up: 0.55, lookUp: 0.6 }, { name: '🚶 גובה עיניים', back: 4.6, up: 0.12, lookUp: 1.6 }];
let wci = +(store.get('flypt.nyc.wcam') ?? 0) % WCAMS.length;
function walkCamera(dt) {
  const p = walker.root.position, C = WCAMS[wci]; let back = C.back;
  wv.set(p.x, p.y + 1.8, p.z); dirV.set(Math.sin(S.wyaw), C.up, Math.cos(S.wyaw)).normalize();
  const h = tiles.hitAlong(wv, dirV, back); if (h) back = Math.max(1.0, h.distance - 0.4);
  wcam.copy(wv).addScaledVector(dirV, back); wcam.y += 0.4;
  camera.position.x = damp(camera.position.x, wcam.x, 6, dt); camera.position.y = damp(camera.position.y, wcam.y, 6, dt); camera.position.z = damp(camera.position.z, wcam.z, 6, dt);
  look.set(p.x - Math.sin(S.wyaw) * 5, p.y + C.lookUp, p.z - Math.cos(S.wyaw) * 5); camLook.lerp(look, 1 - Math.exp(-dt * 8)); camera.lookAt(camLook);
  camera.fov = damp(camera.fov, 62, 3, dt); camera.updateProjectionMatrix();
  let lm = null, ld = 400; for (const q of landmarks) { const d = Math.hypot(q.p.x - p.x, q.p.z - p.z); if (d < ld) { ld = d; lm = q; } }
  $('streetName').textContent = lm ? lm.name : 'מנהטן'; $('streetNum').textContent = lm ? `${Math.round(ld)} מ׳ ממך` : '';
}

function chase(dt) {
  const back = S.boosting ? 16 : 14;
  camT.set(S.pos.x + Math.sin(S.yaw) * back, S.pos.y + 4 - Math.sin(S.pitch) * back * 0.3, S.pos.z + Math.cos(S.yaw) * back);
  if (camT.y < S.surf + 2) camT.y = S.surf + 2;
  camera.position.x = damp(camera.position.x, camT.x, 5, dt); camera.position.y = damp(camera.position.y, camT.y, 5, dt); camera.position.z = damp(camera.position.z, camT.z, 5, dt);
  look.copy(S.pos).addScaledVector(fwd, 8); look.y += 1.2; camLook.lerp(look, 1 - Math.exp(-dt * 10));
  if (S.shake > 0) { S.shake -= dt; camera.position.x += (Math.random() - 0.5) * S.shake * 2; camera.position.y += (Math.random() - 0.5) * S.shake * 2; }
  camera.lookAt(camLook); camera.rotateZ(-S.roll * 0.18);
  camera.fov = damp(camera.fov, 62 + (S.speed - 30) * 0.4 + (S.boosting ? 6 : 0), 3, dt); camera.updateProjectionMatrix();
}

/* ---------------- loop ---------------- */
const clock = new THREE.Clock(); let simT = 0, last = 0, titleT = 0;
function step(dt) {
  simT += dt;
  input.update(dt); const c = input.ctl;
  axis.x = clamp(touch.x + c.x, -1, 1); axis.y = clamp(touch.y + c.y, -1, 1); axis.boost = touch.boost || c.boost; axis.flap = c.flap;
  tiles?.update(dt); FX.update(dt);
  water.visible = !!tiles && tiles.tiles.stats.loaded > 80;
  waterMat.normalMap.offset.set(simT * 0.003, simT * 0.0018); waterMat.clearcoatNormalMap.offset.set(-simT * 0.0011, simT * 0.0016);
  for (const L of letters) {
    L.spin += dt;
    if (L.taken) { L.ct += dt; const s = Math.max(0, 1 - L.ct * 1.6); L.g.scale.setScalar(1 + (1 - s) * 1.5); L.g.visible = s > 0; continue; }
    L.ring.rotation.z = L.spin * 0.6; L.g.position.y = L.pos.y + Math.sin(L.spin * 1.4);
  }
  if (S.mode === 'title') {
    titleT += dt; const a = titleT * 0.04 + 1.2;
    camera.position.set(Math.cos(a) * 1600, 520, 400 + Math.sin(a) * 1600); camera.lookAt(0, 120, 500); camera.fov = 55; camera.updateProjectionMatrix();
  } else if (S.mode === 'landing') {
    S.landT += dt / 1.4; const e = Math.min(1, S.landT);
    fwd.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw)); S.pos.addScaledVector(fwd, S.speed * dt * (1 - e) * 0.6);
    S.surfT -= dt; if (S.surfT <= 0) { S.surfT = 0.1; const y = tiles.groundAt(S.pos.x, S.pos.z, S.pos.y + 50); if (y !== null) S.surf = y; }
    S.pos.y = lerp(S.landFrom, S.surf + 0.6, e * e * (3 - 2 * e)); S.pitch = damp(S.pitch, 0.35, 4, dt); S.roll = damp(S.roll, 0, 4, dt);
    bird.root.position.copy(S.pos); bird.root.rotation.set(S.pitch, S.yaw, S.roll, 'YXZ'); bird.update(dt, 7, 0.3);
    chase(dt); updateHud(dt, fwd);
    if (S.landT >= 1) finishLanding();
  } else if (S.mode === 'walk') {
    walkSim(dt); walkCamera(dt); updateHud(dt, fwd.set(0, 0, 0));
  } else {
    if (S.mode === 'fly') { S.elapsed = S.free ? 0 : (performance.now() - S.t0) / 1000; simulate(dt); }
    else { S.yaw += dt * 0.2; S.speed = damp(S.speed, 22, 1, dt); fwd.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw)); S.pos.addScaledVector(fwd, S.speed * dt); S.pos.y = Math.max(S.pos.y, S.surf + 40); }
    bird.root.position.copy(S.pos); bird.root.rotation.set(S.pitch, S.yaw, S.roll, 'YXZ');
    bird.update(dt, S.boosting ? 9 : 6 + S.flapGlow * 10 + Math.max(0, S.pitch) * 6, S.boosting ? 0.85 : clamp(0.55 - S.flapGlow * 0.8 - Math.max(0, S.pitch) * 0.8, 0, 1));
    chase(dt); updateHud(dt, fwd);
  }
  sunSprite.position.copy(camera.position).addScaledVector(sunDir, 40000); sunSprite.visible = sunDir.y > -0.03;
  sunLight.position.copy(camera.position).addScaledVector(sunDir, 1000); sunLight.target.position.copy(camera.position);
  render();
}
function frame(now = 0) { requestAnimationFrame(frame); const cap = S.mode === 'title' ? 30 : 60; if (now - last < 1000 / cap - 3) return; last = now; step(Math.min(clock.getDelta(), 0.05)); }
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });
if (import.meta.env.DEV) window.__nyc = { S, letters, get tiles() { return tiles; }, step: (n = 60) => { for (let i = 0; i < n; i++) step(1 / 60); } };
frame(); startTiles();
