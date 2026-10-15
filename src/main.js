import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildCity, glowTexture } from './city.js';
import { createCharacter, CHARACTERS } from './creatures.js';
import { Sound } from './audio.js';
import { createLabels } from './labels.js';
import { buildBlock } from './block.js';
import { createInput } from './input.js';
import { createMissions } from './missions.js';
import { createKids } from './kids.js';
import { createStreetLife } from './traffic.js';
import { createWalker } from './walker.js';
import { HOME } from './config.js';
import { createSatellite, createGoogle3D, loadRoofAtlas } from './realistic.js';

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, damp = THREE.MathUtils.damp;
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('touch');
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

/* ============================== LETTERS ============================== */
const WORD = ['פ', 'ת', 'ח', ' ', 'ת', 'ק', 'ו', 'ו', 'ה'];
const LETTERS = [
  { ch: 'פ', slot: 0, place: 'גלובל טאוורס 1', label: 'גלובל טאוורס' },
  { ch: 'ת', slot: 1, place: 'מגדלי צמרת דן', label: 'מגדלי צמרת דן' },
  { ch: 'ח', slot: 2, place: 'מגדל בזל פארק', label: 'מגדל בזל פארק' },
  { ch: 'ת', slot: 4, place: 'מגדלי העיר', label: 'מגדלי העיר' },
  { ch: 'ק', slot: 5, place: 'פנורמה צפון', label: 'פנורמה צפון' },
  { ch: 'ו', slot: 6, place: 'נווה כפר גנים', label: 'נווה כפר גנים' },
  { ch: 'ו', slot: 7, place: 'מגדלי ספייס 2', label: 'מגדלי ספייס' },
  { ch: 'ה', slot: 8, place: 'גן העצמאות', label: 'גן העצמאות', park: true },
];

/* ============================== TIME OF DAY ============================== */
const TOD = [
  { name: '🌅 שקיעה', el: 3.2, az: 258, turb: 7, ray: 2.4, mie: 0.003, g: 0.9, sun: '#ffa468', sunI: 1.25, hemiS: '#e8b4b0', hemiG: '#3b2638', hemiI: 0.48, fog: '#d6a48c', fogD: 0.00015, exp: 0.6, night: 0.55, env: 0.22, cloud: 0.35, tint: '#ffd2b8' },
  { name: '🌃 לילה', el: -1.2, az: 262, turb: 2.2, ray: 3.5, mie: 0.003, g: 0.8, sun: '#7c8cff', sunI: 0.3, hemiS: '#44558f', hemiG: '#15111f', hemiI: 0.5, fog: '#232a4d', fogD: 0.00026, exp: 0.95, night: 0.75, env: 0.14, cloud: 0.2, tint: '#5a6290' },
  { name: '☀️ בוקר', el: 26, az: 110, turb: 2.4, ray: 1.0, mie: 0.0022, g: 0.76, sun: '#fff1dc', sunI: 1.25, hemiS: '#a9c6f0', hemiG: '#5d5040', hemiI: 0.55, fog: '#b4c9df', fogD: 0.00009, exp: 0.5, night: 0.0, env: 0.26, cloud: 0.45, tint: '#ffffff' },
];

/* ============================== RENDERER ============================== */
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
// Quality presets — "balanced" is the default so laptops stay cool.
const QUALITY = [
  { name: '⚡ חיסכון בסוללה', dpr: 1, shadows: false, shadowMap: 512, samples: 0, bloom: false, fps: 30 },
  { name: '⚖️ מאוזן', dpr: Math.min(devicePixelRatio, 1.25), shadows: true, shadowMap: 1024, samples: 2, bloom: true, fps: 60 },
  { name: '💎 איכות גבוהה', dpr: Math.min(devicePixelRatio, 1.75), shadows: true, shadowMap: 2048, samples: 4, bloom: true, fps: 60 },
];
let qi = clamp(+(store.get('flypt.quality') ?? (IS_TOUCH ? 0 : 1)), 0, 2);
let Q = QUALITY[qi];
const DPR = Q.dpr;
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 30000);
camera.position.set(1200, 500, 1400);

let composer, bloom;
function buildComposer() {
  composer?.dispose();
  const rt = new THREE.WebGLRenderTarget(innerWidth * Q.dpr, innerHeight * Q.dpr, { type: THREE.HalfFloatType, samples: Q.samples });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.45, 0.5, 2.4);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
buildComposer();
const render = () => (Q.bloom ? composer.render() : renderer.render(scene, camera));

/* sky + lights */
const sky = new Sky(); sky.scale.setScalar(20000); scene.add(sky);
const skyU = sky.material.uniforms;
skyU.showSunDisc.value = 0; // the analytic disc is far too hot for bloom; use a controllable sprite instead
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,255,1)', 'rgba(255,190,120,0.35)'), color: new THREE.Color(1.3, 1.05, 0.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
sunSprite.scale.setScalar(520); scene.add(sunSprite);
const sunDir = new THREE.Vector3();
const sunLight = new THREE.DirectionalLight('#ffab6b', 2.6);
sunLight.castShadow = Q.shadows;
sunLight.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
Object.assign(sunLight.shadow.camera, { left: -380, right: 380, top: 380, bottom: -380, near: 10, far: 4000 });
sunLight.shadow.bias = -0.0006; sunLight.shadow.normalBias = 0.6;
scene.add(sunLight, sunLight.target);
const hemi = new THREE.HemisphereLight('#ffc2a8', '#3b2638', 0.85); scene.add(hemi);
scene.fog = new THREE.FogExp2('#d99a7c', 0.00024);

const ground = new THREE.Mesh(new THREE.CircleGeometry(26000, 64), new THREE.MeshStandardMaterial({ color: '#a49a8c', roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
{ // subtle tiled noise on the ground so it isn't a flat colour
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = 200 + Math.random() * 55; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 6, 2 + Math.random() * 6); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(900, 900); t.colorSpace = THREE.SRGBColorSpace;
  ground.material.map = t;
}

// horizon haze: a camera-following cylinder fading from fog colour to transparent, hides the ground/sky seam
const hazeMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color('#c98f7a') } },
  vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 uColor; varying float vY; void main(){ float a = pow(1.0 - vY, 5.0) * 0.85; gl_FragColor = vec4(uColor, a); }',
  transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
});
const haze = new THREE.Mesh(new THREE.CylinderGeometry(16000, 16000, 2600, 48, 1, true), hazeMat);
haze.position.y = 1200; haze.renderOrder = -1; scene.add(haze);

const pmrem = new THREE.PMREMGenerator(renderer);
const skyScene = new THREE.Scene(); const skyForEnv = new Sky(); skyForEnv.scale.setScalar(1000); skyForEnv.material.uniforms.showSunDisc.value = 0; skyScene.add(skyForEnv);
let envRT = null;

const TOD0 = +(store.get('flypt.tod') ?? 2) % TOD.length;
const tod = { i: TOD0, from: null, to: TOD[TOD0], t: 1, cur: { ...TOD[TOD0] } };
function applyTod(p) {
  const phi = THREE.MathUtils.degToRad(90 - p.el), theta = THREE.MathUtils.degToRad(p.az);
  // az measured clockwise from north; north = -z, east = +x
  sunDir.setFromSphericalCoords(1, phi, 0);
  sunDir.set(Math.sin(theta) * Math.sin(phi), Math.cos(phi), -Math.cos(theta) * Math.sin(phi));
  for (const U of [skyU, skyForEnv.material.uniforms]) {
    U.turbidity.value = p.turb; U.rayleigh.value = p.ray; U.mieCoefficient.value = p.mie; U.mieDirectionalG.value = p.g;
    U.sunPosition.value.copy(sunDir); U.cloudCoverage.value = p.cloud;
  }
  sunLight.color.set(p.sun); sunLight.intensity = p.sunI;
  hemi.color.set(p.hemiS); hemi.groundColor.set(p.hemiG); hemi.intensity = p.hemiI;
  scene.fog.color.set(p.fog); scene.fog.density = p.fogD;
  hazeMat.uniforms.uColor.value.set(p.fog);
  renderer.toneMappingExposure = p.exp;
  scene.environmentIntensity = p.env;
  if (city) { city.bMat.userData.uniforms.uNight.value = p.night; city.lampMat.opacity = clamp(p.night * 1.1, 0.05, 1); }
  google?.setTint(new THREE.Color(p.tint));
}
function lerpTod(a, b, t) {
  const o = {};
  for (const k in b) {
    if (typeof b[k] === 'number') o[k] = lerp(a[k], b[k], t);
    else if (k === 'name') o[k] = b[k];
    else o[k] = '#' + new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t).getHexString();
  }
  return o;
}
function refreshEnv() {
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(skyScene, 0, 1, 2000);
  scene.environment = envRT.texture;
}
function cycleTod() {
  tod.from = { ...tod.cur }; tod.i = (tod.i + 1) % TOD.length; store.set('flypt.tod', String(tod.i)); tod.to = TOD[tod.i]; tod.t = 0;
  const chip = $('todChip'); chip.textContent = tod.to.name; chip.classList.add('on');
  clearTimeout(cycleTod.tm); cycleTod.tm = setTimeout(() => chip.classList.remove('on'), 2200);
}

function setQuality(i) {
  qi = i; Q = QUALITY[i]; store.set('flypt.quality', String(i));
  renderer.setPixelRatio(Q.dpr); renderer.setSize(innerWidth, innerHeight);
  sunLight.castShadow = Q.shadows;
  sunLight.shadow.mapSize.set(Q.shadowMap, Q.shadowMap); sunLight.shadow.map?.dispose(); sunLight.shadow.map = null;
  buildComposer();
  $('btnQuality').textContent = Q.name;
  if (google) google.tiles && (google.tiles.errorTarget = ERR_TARGET[i]);
  if (city) setMapMode(mapMode);
}

/* ============================== STATE ============================== */
let city = null, bird = null, walker = null, labels = null, home = null;
let sat = null, google = null, roofAtlas = null, blockDetail = null, missions = null, missionMk = null, kids = null, street = null;

/* ============================== MAP STYLES ============================== */
const MAPS = [
  { id: 'illustrated', name: '🎨 מאויר' },
  { id: 'satellite', name: '🛰️ לוויין' },
  { id: 'google', name: '🌍 Google 3D' },
];
const envKey = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
const gKey = () => store.get('flypt.gkey') || envKey;
// Google/Cesium has no true 3D mesh for Petah Tikva (only imagery on terrain), so satellite stays the default.
let mapMode = store.get('flypt.map') === 'illustrated' ? 'illustrated' : 'satellite';
const ERR_TARGET = [12, 8, 5]; // screen-space error for photoreal tiles (lower = sharper)
function setMapMode(id) {
  if (id === 'google' && !gKey()) { $('keyBox').classList.remove('hidden'); $('gkey').focus(); id = mapMode === 'google' ? 'satellite' : mapMode; }
  mapMode = id; store.set('flypt.map', id);
  document.querySelectorAll('.map-chip').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  if (!city) return;
  if (id === 'google' && !google) {
    google = createGoogle3D(scene, camera, renderer, gKey(), { errorTarget: ERR_TARGET[qi], onError: () => {
      showToast('⚠️ Google 3D לא נטען — בדקו שהמפתח תקין ושהופעל Map Tiles API', 5000);
      store.set('flypt.gkey', ''); google?.dispose(); google = null; setMapMode('satellite');
    } });
    google.setTint(new THREE.Color(tod.cur.tint));
  }
  if (google) { google.group.visible = id === 'google'; }
  const L = city.layers, real = id === 'google';
  L.buildings.forEach((m) => { m.visible = !real; });
  L.ground.visible = id === 'illustrated';
  L.trees.forEach((m) => { m.visible = !real; });
  L.heaters.visible = !real; L.poles.visible = !real; L.lamps.visible = !real; if (L.skirt) L.skirt.visible = !real; street?.setEnabled(!real);
  L.traffic.forEach((m) => { m.visible = !real; });
  sat.group.visible = id === 'satellite';
  if (blockDetail) blockDetail.group.visible = !real; blockDetail && (blockDetail.hidden = real);
  ground.visible = !real; // the flat plane would poke through real terrain
  city.bMat.userData.uniforms.uSatOn.value = id === 'satellite' && roofAtlas ? 1 : 0;
  if (home) home.outline.visible = !real;
  sunLight.castShadow = Q.shadows && !real;
  updateAttrib();
}
function cycleMap() {
  const i = MAPS.findIndex((m) => m.id === mapMode); let nx = MAPS[(i + 1) % MAPS.length].id;
  if (nx === 'google' && !gKey()) nx = MAPS[(i + 2) % MAPS.length].id;
  setMapMode(nx); showToast(MAPS.find((m) => m.id === mapMode).name, 1400);
}
function updateAttrib() {
  const parts = ['© OpenStreetMap contributors'];
  if (mapMode === 'satellite') parts.push(sat.attribution);
  if (mapMode === 'google' && google) parts.push('Google' + (google.attributions() ? ' · ' + google.attributions() : ''));
  $('attrib').textContent = parts.join(' · ');
}
const sound = new Sound();
const S = {
  mode: 'title', // title | fly | end | photo
  free: false,
  pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, speed: 24, turnS: 0, lift: 0,
  boost: 1, boosting: false, flapCD: 0, flapGlow: 0,
  t0: 0, elapsed: 0, hits: 0, dist: 0, invuln: 0, shake: 0,
  got: new Set(),
  wyaw: 0, wspeed: 0, landT: 0, landFrom: new THREE.Vector3(), homeMission: false, homeDone: false,
};
const START = { pos: new THREE.Vector3(620, 70, 820), yaw: 0.41 };
const keys = {};
const touch = { x: 0, y: 0, boost: false };
const axis = { x: 0, y: 0, boost: false, flap: false }; // touch + mouse + gamepad, merged each frame
const input = createInput({
  canvas, store,
  canLock: () => !IS_TOUCH && ['fly', 'walk', 'landing'].includes(S.mode) && $('mdone').classList.contains('hidden'),
  onAction: (a) => {
    if (a === 'mouse-on') { $('mouseHint').classList.add('hidden'); showToast('🖱️ שליטה בעכבר · לחיצה = נפנוף · ימני = טורבו · Esc לשחרור', 2600); }
    if (a === 'mouse-off') $('mouseHint').classList.toggle('hidden', IS_TOUCH || !['fly', 'walk'].includes(S.mode));
    if (a === 'primary' && S.mode === 'walk') takeOff();
    if (a === 'land') landOrTakeoff();
    if (a === 'time' && city) cycleTod();
    if (a === 'photo' && (S.mode === 'fly' || S.mode === 'photo')) togglePhoto();
    if (a === 'map' && city) cycleMap();
    if (a === 'start' && S.mode === 'title' && !$('btnStart').disabled) startGame(false);
  },
  onPadChange: (id, on) => showToast(on ? `🎮 שלט מחובר — ${/xbox|xinput/i.test(id) ? 'Xbox' : /playstation|dualsense|dualshock|054c/i.test(id) ? 'PlayStation' : 'בקר'}` : '🎮 השלט נותק', 2200),
});
function mergeAxes(dt) {
  input.update(dt);
  const c = input.ctl;
  axis.x = clamp(touch.x + c.x, -1, 1); axis.y = clamp(touch.y + c.y, -1, 1);
  axis.boost = touch.boost || c.boost; axis.flap = c.flap;
}

/* ============================== LOADING ============================== */
function progress(f, text) { $('loaderFill').style.width = `${Math.round(f * 100)}%`; if (text) $('loaderText').textContent = text; }

async function loadJSON(url) {
  const res = await fetch(url);
  const total = +res.headers.get('content-length') || 0;
  if (!res.body || !total) return res.json();
  const reader = res.body.getReader(); const chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    chunks.push(value); got += value.length; progress(Math.min(0.3, got / total * 0.3), `מוריד את מפת פתח תקווה… ${(got / 1e6).toFixed(1)}MB`);
  }
  const all = new Uint8Array(got); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  return JSON.parse(new TextDecoder().decode(all));
}

const letterObjs = [];
let landmarks = [];

function setCharacter(id) {
  store.set('flypt.char', id);
  document.querySelectorAll('.char-chip').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  if (!bird) return;
  const vis = bird.root.visible, parent = bird.root.parent;
  parent?.remove(bird.root); bird = createCharacter(id); bird.root.visible = vis;
  if (parent && parent !== scene) { parent.add(bird.root); bird.root.scale.setScalar(0.2); } else scene.add(bird.root);
}
$('charChips').innerHTML = CHARACTERS.map((c) => `<button class="char-chip" data-id="${c.id}" title="${c.name}"><span>${c.icon}</span><small>${c.name}</small></button>`).join('');
document.querySelectorAll('.char-chip').forEach((b) => { b.onclick = () => setCharacter(b.dataset.id); b.classList.toggle('on', b.dataset.id === (store.get('flypt.char') || 'parrot')); });
$('mapChips').innerHTML = MAPS.map((m) => `<button class="map-chip" data-id="${m.id}">${m.name}</button>`).join('');
document.querySelectorAll('.map-chip').forEach((b) => { b.onclick = () => setMapMode(b.dataset.id); b.classList.toggle('on', b.dataset.id === mapMode); });
$('btnKey').onclick = () => { const v = $('gkey').value.trim(); if (!v) return; store.set('flypt.gkey', v); $('gkey').value = ''; $('keyBox').classList.add('hidden'); setMapMode('google'); };

async function init() {
  applyTod(tod.cur); refreshEnv();
  // word preview on title
  $('wordPreview').innerHTML = WORD.map((c) => c === ' ' ? '<span class="gap"></span>' : `<span class="wp">${c}</span>`).join('');
  $('wordPreview').querySelectorAll('.wp').forEach((e, i) => { e.style.animationDelay = `${i * 0.12}s`; });
  $('slots').innerHTML = WORD.map((c, i) => c === ' ' ? '<span class="slot gap"></span>' : `<span class="slot" data-i="${i}">${c}</span>`).join('');
  const best = +store.get('flypt.best') || 0;
  if (best) $('bestLine').innerHTML = `השיא שלך: <b>${fmt(best)}</b>`;
  buildCompass();

  progress(0.02, 'מוריד את מפת פתח תקווה…');
  const data = await loadJSON(`${import.meta.env.BASE_URL}data/city.json`);
  city = await buildCity(data, scene, (f, t) => progress(0.3 + f * 0.65, t));
  applyTod(tod.cur);
  $('statLine').textContent = `${data.b.length.toLocaleString('he-IL')} בניינים · ${(data.t.length / 2).toLocaleString('he-IL')} עצים · ${data.r.length.toLocaleString('he-IL')} רחובות`;

  bird = createCharacter(store.get('flypt.char') || 'parrot'); scene.add(bird.root);
  bird.root.visible = false;
  walker = createWalker(); walker.root.visible = false; scene.add(walker.root);
  labels = createLabels(data, scene);
  sat = createSatellite(scene, renderer);
  buildHome(data);
  if (home) try { // street-level detail only exists around the configured home
    const block = await loadJSON(`${import.meta.env.BASE_URL}data/block.json`);
    blockDetail = buildBlock({ scene, data, block, center: home ? home.door : new THREE.Vector3(), homePlate: home?.plate });
  } catch (e) { console.warn('block detail failed', e); }

  // landmarks for the "you're flying over" label
  const seen = new Set();
  landmarks = data.p.filter((p) => p.h >= 38).map((p) => ({ ...p, name: p.name.replace(/\s+([\dA-Za-z]|One)$/, '') }))
    .filter((p) => { const k = p.name + Math.round(p.x / 300) + Math.round(p.z / 300); if (seen.has(k)) return false; seen.add(k); return true; });

  buildLetters(data.p);
  buildMinimap(data);
  progress(1, 'מוכנים להמראה');
  setTimeout(() => $('loader').classList.add('done'), 400);
  progress(0.97, 'מוריד תמונת לוויין של הגגות…');
  try {
    roofAtlas = await loadRoofAtlas(city.bounds, (f) => progress(0.97 + f * 0.03, `מוריד תמונת לוויין של הגגות… ${Math.round(f * 100)}%`), qi === 2 ? 17 : 16);
    const U = city.bMat.userData.uniforms; U.uSat.value = roofAtlas.tex; U.uSatA.value.copy(roofAtlas.map);
  } catch (e) { console.warn('roof atlas failed', e); }
  setMapMode(mapMode);
  street = createStreetLife({ scene, data, blocked: city.blocked });
  missions = createMissions({ scene, data, home, store });
  kids = createKids({ scene, grid: city.grid, store, baseUrl: import.meta.env.BASE_URL, onCollect: (p, word) => { FX.burst(p.clone(), word ? 320 : 110); sound.collect(word ? 7 : kids.state.i); input.rumble(0.2, 0.5, 140); } });
  missionMk = { pos: new THREE.Vector3(), mk: Object.assign(document.createElement('div'), { className: 'mk mission' }) };
  missionMk.mk.innerHTML = '<div class="gem"><b>📦</b></div><div class="d"></div>'; missionMk.dEl = missionMk.mk.querySelector('.d'); $('markers').appendChild(missionMk.mk);
  $('btnStart').disabled = false; $('btnFree').disabled = false; $('btnHome').disabled = !home; if (!home) $('btnHome').style.display = 'none'; $('btnMissions').disabled = false; $('btnKids').disabled = false;
}

/* ============================== LETTER RINGS ============================== */
function letterTexture(ch) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 190px Rubik, Arial';
  g.shadowColor = 'rgba(255,170,40,0.95)'; g.shadowBlur = 30;
  const gr = g.createLinearGradient(0, 30, 0, 230); gr.addColorStop(0, '#fff6c8'); gr.addColorStop(0.45, '#ffc94d'); gr.addColorStop(1, '#d47d08');
  g.fillStyle = gr; g.fillText(ch, 128, 140);
  g.shadowBlur = 0; g.lineWidth = 5; g.strokeStyle = 'rgba(90,40,0,0.6)'; g.strokeText(ch, 128, 140);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function beamTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256); return new THREE.CanvasTexture(c);
}

function buildLetters(places) {
  const ringGeo = new THREE.TorusGeometry(10, 0.9, 14, 64);
  const ringMat = new THREE.MeshStandardMaterial({ color: '#ffcf5a', metalness: 1, roughness: 0.22, emissive: '#ff9a1f', emissiveIntensity: 0.9 });
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.1, 0.4), alphaMap: beamTexture(), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const halo = glowTexture('rgba(255,230,160,0.9)', 'rgba(255,170,60,0.25)');
  const { grid } = city;
  for (const L of LETTERS) {
    const p = places.find((q) => q.name === L.place);
    if (!p) { console.warn('missing place', L.place); continue; }
    let pos;
    if (L.park) pos = new THREE.Vector3(p.x, 26, p.z);
    else {
      const y = clamp(p.h * 0.62, 32, 105);
      let best = null, bestScore = -1e9;
      for (const r of [42, 55, 70, 90]) for (let a = 0; a < 16; a++) {
        const ang = a / 16 * Math.PI * 2, x = p.x + Math.cos(ang) * r, z = p.z + Math.sin(ang) * r;
        if (grid.around(x, z, 16) > y - 16) continue;
        // prefer rings close to the tower and on the side facing the start point (more visible)
        const score = -r * 2 - Math.hypot(x - START.pos.x, z - START.pos.z) * 0.02;
        if (score > bestScore) { bestScore = score; best = new THREE.Vector3(x, y, z); }
      }
      pos = best || new THREE.Vector3(p.x, p.h + 24, p.z);
    }
    const g = new THREE.Group(); g.position.copy(pos);
    const ring = new THREE.Mesh(ringGeo, ringMat); g.add(ring);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTexture(L.ch), color: new THREE.Color(1.4, 1.3, 1.1), depthWrite: false, fog: false }));
    spr.scale.setScalar(13); g.add(spr);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: new THREE.Color(1.2, 0.8, 0.35), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.setScalar(34); g.add(glow);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 900, 16, 1, true), beamMat);
    beam.position.y = 450 - pos.y; g.add(beam);
    ring.lookAt(new THREE.Vector3(0, 0, 0).sub(pos).setY(0).add(pos));
    scene.add(g);
    const mk = document.createElement('div'); mk.className = 'mk'; mk.innerHTML = `<div class="gem"><b>${L.ch}</b></div><div class="d"></div>`;
    $('markers').appendChild(mk);
    letterObjs.push({ ...L, pos, g, ring, spr, glow, beam, mk, dEl: mk.querySelector('.d'), taken: false, spin: Math.random() * 6 });
  }
}

/* ============================== HOME ============================== */
function buildHome(data) {
  if (!HOME) return; // public build: no personal address
  const plate = labels.findAddress(HOME.street, HOME.number);
  if (!plate) { console.warn('home address not found'); return; }
  const b = data.b[plate.bi], h = b[0], pts = b.slice(3), n = pts.length / 2;
  let cx = 0, cz = 0; for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cz += pts[i + 1]; } cx /= n; cz /= n;
  // glowing outline of the actual building
  const seg = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = pts[i * 2], az = pts[i * 2 + 1], bx = pts[j * 2], bz = pts[j * 2 + 1];
    seg.push(ax, h + 0.1, az, bx, h + 0.1, bz, ax, 0.3, az, bx, 0.3, bz, ax, 0.3, az, ax, h + 0.1, az);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  const outline = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: new THREE.Color(0.6, 2.4, 3.0), toneMapped: false, fog: false }));
  scene.add(outline);
  const c = document.createElement('canvas'); c.width = 512; c.height = 180; const g = c.getContext('2d');
  g.fillStyle = 'rgba(16,10,30,0.82)'; g.beginPath(); g.roundRect(8, 8, 496, 164, 40); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#6fe7ff'; g.stroke();
  g.fillStyle = '#fff'; g.font = '900 64px Rubik, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
  g.fillText('🏠 ' + HOME.label, 256, 70); g.font = '500 38px Rubik, Arial'; g.fillStyle = '#6fe7ff'; g.fillText(`${HOME.street} ${HOME.number}`, 256, 130);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false, toneMapped: false }));
  sign.scale.set(22, 7.7, 1); sign.position.set(cx, h + 12, cz); scene.add(sign);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 700, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 2.2), alphaMap: beamTexture(), transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  beam.position.set(cx, h + 350, cz); scene.add(beam);
  const mk = document.createElement('div'); mk.className = 'mk home'; mk.innerHTML = '<div class="gem"><b>🏠</b></div><div class="d"></div>';
  $('markers').appendChild(mk);
  home = { pos: new THREE.Vector3(cx, h + 12, cz), door: new THREE.Vector3(plate.x + plate.nx * 3, 0, plate.z + plate.nz * 3), plate, h, sign, beam, outline, mk, dEl: mk.querySelector('.d') };
}

/* ============================== PARTICLES ============================== */
const FX = (() => {
  const N = 1400;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 1.6, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  const P = []; for (let i = 0; i < N; i++) P.push({ life: 0, max: 1, v: new THREE.Vector3(), c: new THREE.Color(), s: 1 });
  let head = 0;
  const spawn = (p, v, c, life) => { const q = P[head]; head = (head + 1) % N; q.life = q.max = life; q.p = p.clone(); q.v.copy(v); q.c.copy(c); };
  const burst = (at, n = 260) => {
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(8 + Math.random() * 30);
      c.setHSL(0.09 + Math.random() * 0.06, 1, 0.55 + Math.random() * 0.3).multiplyScalar(2.2);
      spawn(at, v, c, 1 + Math.random() * 1.2);
    }
  };
  const trail = (at, c) => spawn(at, new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2), c, 0.7);
  const update = (dt) => {
    for (let i = 0; i < N; i++) {
      const q = P[i];
      if (q.life <= 0) { pos[i * 3 + 1] = -9999; continue; }
      q.life -= dt; q.v.multiplyScalar(Math.exp(-dt * 1.8)); q.v.y -= dt * 4; q.p.addScaledVector(q.v, dt);
      const k = Math.max(0, q.life / q.max);
      pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z;
      col[i * 3] = q.c.r * k; col[i * 3 + 1] = q.c.g * k; col[i * 3 + 2] = q.c.b * k;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
  };
  return { burst, trail, update, mat };
})();

/* ============================== INPUT ============================== */
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyT' && city) cycleTod();
  if (e.code === 'KeyQ') setQuality((qi + 1) % QUALITY.length), showToast(Q.name, 1400);
  if (e.code === 'KeyE') landOrTakeoff();
  if (e.code === 'KeyG' && city) cycleMap();
  if (e.code === 'KeyI') { input.setInvert(!input.ctl.invert); showToast(input.ctl.invert ? '↕️ ציר אנכי הפוך (כמו מטוס)' : '↕️ ציר אנכי רגיל', 1600); }
  if (e.code === 'Space' && S.mode === 'walk') takeOff();
  if (e.code === 'KeyM') { sound.setMuted(!sound.muted); showToast(sound.muted ? '🔇 שקט' : '🔊 קול פעיל', 1200); }
  if (e.code === 'KeyP' && (S.mode === 'fly' || S.mode === 'photo')) togglePhoto();
  if (e.code === 'Enter' && S.mode === 'photo') takeShot();
  if (e.code === 'Escape' && S.mode === 'photo') togglePhoto();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// touch stick
{
  const stick = $('stick'), knob = $('stickKnob'); let id = null, cx = 0, cy = 0;
  stick.addEventListener('pointerdown', (e) => { id = e.pointerId; const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; stick.setPointerCapture(id); move(e); });
  const move = (e) => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - cx, dy = e.clientY - cy; const m = Math.hypot(dx, dy), R = 50;
    if (m > R) { dx *= R / m; dy *= R / m; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`; touch.x = dx / R; touch.y = -dy / R;
  };
  stick.addEventListener('pointermove', move);
  const end = (e) => { if (e.pointerId !== id) return; id = null; touch.x = touch.y = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  $('btnLand').addEventListener('pointerdown', (e) => { e.preventDefault(); landOrTakeoff(); });
  $('btnFlap').addEventListener('pointerdown', (e) => { e.preventDefault(); if (S.mode === 'walk') takeOff(); else keys.Space = true; });
  $('btnFlap').addEventListener('pointerup', () => { keys.Space = false; });
  $('btnBoost').addEventListener('pointerdown', (e) => { e.preventDefault(); touch.boost = true; });
  $('btnBoost').addEventListener('pointerup', () => { touch.boost = false; });
  $('btnBoost').addEventListener('pointercancel', () => { touch.boost = false; });
}

/* ============================== FLOW ============================== */
function startGame(free, homeMission = false, mission = null) {
  sound.start();
  S.free = free; S.mode = 'fly'; S.homeMission = homeMission; S.homeDone = false;
  if (S.kids) { kids?.stop(); S.kids = false; document.body.classList.remove('kids'); $('kcard').classList.add('hidden'); }
  missions?.stop(); S.mission = null; $('mcard').classList.add('hidden'); $('mdone').classList.add('hidden'); $('missionsScreen').classList.add('hidden');
  $('mouseHint').classList.toggle('hidden', IS_TOUCH || input.ctl.mouse);
  if (walker) { walker.root.visible = false; if (bird.root.parent !== scene) scene.add(bird.root); bird.root.scale.setScalar(1.35); }
  document.body.classList.remove('walking');
  S.pos.copy(START.pos); S.yaw = START.yaw; S.pitch = 0; S.roll = 0; S.speed = 26; S.turnS = 0; S.lift = 0; S.boost = 1;
  S.hits = 0; S.dist = 0; S.got.clear(); S.elapsed = 0; S.t0 = performance.now(); S.invuln = 1.5;
  for (const L of letterObjs) { L.taken = false; L.g.visible = true; L.g.scale.setScalar(1); L.mk.style.display = ''; }
  document.querySelectorAll('.slot').forEach((s) => s.classList.remove('got', 'pop'));
  $('letterCount').textContent = `0/${letterObjs.length}`;
  bird.root.visible = true;
  $('title').classList.add('fade'); $('end').classList.add('hidden');
  setTimeout(() => $('title').classList.add('hidden'), 800);
  $('hud').classList.remove('hidden');
  document.querySelector('.timer').style.display = free ? 'none' : '';
  document.querySelector('.letters-panel').style.display = '';
  $('keysHint').classList.remove('fade'); clearTimeout(startGame.hint); startGame.hint = setTimeout(() => $('keysHint').classList.add('fade'), 14000);
  showToast(homeMission ? '🏠 טוסו הביתה — עקבו אחרי הקרן התכולה, ונחתו ליד הכניסה (E)' : free ? 'טיסה חופשית — נמוך מעל רחוב? לחצו E לנחות וללכת' : 'עקבו אחרי קרני הזהב ✨ ואספו את כל האותיות', 3600);
  const noLetters = homeMission || !!mission || startGame.kidsNext;
  document.querySelector('.letters-panel').style.display = noLetters ? 'none' : '';
  letterObjs.forEach((L) => { L.g.visible = !noLetters; L.mk.style.display = noLetters ? 'none' : ''; if (noLetters) L.taken = true; });
  updateHint();
  if (mission) beginMission(mission);
}

/* ============================== KIDS (MILIMON) ============================== */
function startKids() {
  startGame.kidsNext = true; startGame(true); startGame.kidsNext = false;
  S.kids = true; document.body.classList.add('kids');
  setTod(2); // bright morning
  const d = home?.door || new THREE.Vector3();
  S.pos.set(d.x, 45, d.z + 40); S.yaw = 0; S.speed = 15; camInit = false;
  kids.startSession(); $('kcard').classList.remove('hidden');
  newKidsWord();
  showToast('🦜 שלום! תעופו אל האותיות לפי הסדר', 3500);
}
function newKidsWord() {
  const st = kids.spawn(S.pos, S.yaw);
  $('kEmoji').textContent = st.emoji;
  $('kSlots').innerHTML = st.letters.map((L, i) => `<span class="kslot${i === 0 ? ' next' : ''}" data-i="${i}">${L.g}</span>`).join('');
  $('kCount').textContent = kids.stickers().length;
}
function kidsEvent(ev) {
  const st = kids.state; if (!st) return;
  document.querySelectorAll('.kslot').forEach((el, i) => { el.classList.toggle('got', i < st.i); el.classList.toggle('next', i === st.i); });
  if (ev === 'word') {
    $('kCount').textContent = kids.stickers().length;
    $('kcBig').textContent = st.emoji; $('kcWord').textContent = st.word;
    $('kcele').classList.remove('hidden'); sound.fanfare();
    setTimeout(() => { $('kcele').classList.add('hidden'); if (S.kids) newKidsWord(); }, 3600);
  }
}
$('btnKids').onclick = () => startKids();
$('kRepeat').onclick = () => kids.repeat();
$('kExit').onclick = () => { kids.stop(); S.kids = false; document.body.classList.remove('kids'); $('kcard').classList.add('hidden'); showToast('טיסה חופשית', 1200); };

/* ============================== MISSIONS ============================== */
function setTod(i) { if (tod.i !== i) { tod.from = { ...tod.cur }; tod.i = i; tod.to = TOD[i]; tod.t = 0; } }
function beginMission(def) {
  const run = missions.start(def); S.mission = run;
  if (def.tod !== undefined) setTod(def.tod);
  const st = run.stages[0], d = home?.door || new THREE.Vector3();
  if (def.start === 'home-walk' && home) {
    const pl = home.plate; S.pos.set(pl.x + pl.nx * 3, 0, pl.z + pl.nz * 3); S.yaw = Math.atan2(-pl.nx, -pl.nz);
    finishLanding();
  } else if (def.start === 'race') {
    const a = Math.atan2(-(st.x - 300), -(st.z + 100)); S.pos.set(st.x + Math.sin(a) * 260, st.y, st.z + Math.cos(a) * 260); S.yaw = a;
  } else {
    S.pos.set(d.x, 55, d.z); S.yaw = Math.atan2(-(st.x - d.x), -(st.z - d.z));
  }
  camInit = false;
  $('mcard').classList.remove('hidden'); $('mcIcon').textContent = def.icon; $('mcName').textContent = def.name;
  showToast(`${def.icon} ${def.desc}`, 4200);
}
function missionEvent(ev) {
  const run = S.mission; if (!run) return;
  if (ev === 'stage') { sound.collect(run.i); FX.burst(S.pos.clone().add(new THREE.Vector3(0, 3, 0)), 120); showToast(`✅ מעולה! עכשיו: ${esc(run.stages[run.i].text)}`, 3000); input.rumble(0.3, 0.6, 160); return; }
  input.release();
  const ok = ev === 'done'; const def = run.def;
  if (ok) { sound.fanfare(); FX.burst(S.pos.clone().add(new THREE.Vector3(0, 4, 0)), 260); input.rumble(0.5, 0.9, 400); }
  $('mdTitle').textContent = ok ? `${def.icon} ${def.name} — הושלמה!` : `${def.icon} ${def.name} — הזמן נגמר`;
  const stars = ok ? run.result.stars : 0;
  $('mdStars').innerHTML = [0, 1, 2].map((i) => `<span class="star ${i < stars ? 'on' : ''}" style="animation-delay:${0.2 + i * 0.25}s">★</span>`).join('');
  $('mdTime').textContent = fmt(ok ? run.result.time : (performance.now() - run.t0) / 1000);
  const best = missions.progress()[def.id]; $('mdBest').textContent = best?.time ? fmt(best.time) : '--';
  $('mdHint').textContent = ok ? (stars < 3 ? `ל־3 כוכבים: מתחת ל־${fmt(def.stars[0])}` : 'שלמות! 🏆') : 'נסו שוב — הפיצה כבר קרה 🥶';
  const idx = missions.defs.indexOf(def), next = missions.defs[(idx + 1) % missions.defs.length];
  $('mdNext').textContent = ok ? `הבאה: ${next.icon} ${next.name}` : 'נסו שוב';
  $('mdNext').onclick = () => startGame(true, false, ok ? next : def);
  $('mdone').classList.remove('hidden');
  missions.stop(); S.mission = null; $('mcard').classList.add('hidden');
}
function abortMission() { missions?.stop(); S.mission = null; $('mcard').classList.add('hidden'); showToast('המשימה בוטלה — טיסה חופשית', 1600); }
function showMissions() {
  const prog = missions.progress();
  $('mList').innerHTML = missions.defs.map((d, i) => {
    const p = prog[d.id] || {}; const st = p.stars || 0;
    return `<button class="mitem" data-i="${i}"><span class="mi-icon">${d.icon}</span><span class="mi-body"><b>${d.name}</b><small>${d.desc}</small></span><span class="mi-stars">${[0, 1, 2].map((k) => `<i class="${k < st ? 'on' : ''}">★</i>`).join('')}${p.time ? `<em>${fmt(p.time)}</em>` : ''}</span></button>`;
  }).join('');
  const total = missions.defs.reduce((a, d) => a + ((prog[d.id] || {}).stars || 0), 0);
  $('mTotal').textContent = `${total} / ${missions.defs.length * 3} ★`;
  $('mList').querySelectorAll('.mitem').forEach((b) => { b.onclick = () => startGame(true, false, missions.defs[+b.dataset.i]); });
  $('missionsScreen').classList.remove('hidden');
  if (S.mode === 'title') $('title').classList.add('hidden');
}

function finish() {
  S.mode = 'end';
  const time = S.elapsed;
  const prev = +store.get('flypt.best') || 0;
  const isBest = !prev || time < prev;
  if (isBest) store.set('flypt.best', String(time));
  $('endTime').textContent = fmt(time); $('endBest').textContent = fmt(isBest ? time : prev);
  $('endHits').textContent = S.hits; $('endDist').textContent = (S.dist / 1000).toFixed(1);
  $('newBest').classList.toggle('hidden', !isBest);
  $('bestLine').innerHTML = `השיא שלך: <b>${fmt(isBest ? time : prev)}</b>`;
  $('end').classList.remove('hidden', 'fade');
}

function togglePhoto() {
  if (S.mode === 'photo') { S.mode = 'fly'; document.body.classList.remove('photo'); S.t0 = performance.now() - S.elapsed * 1000; }
  else { S.mode = 'photo'; document.body.classList.add('photo'); photoAng = S.yaw + Math.PI; }
}
let photoAng = 0;
function takeShot() {
  render();
  const a = document.createElement('a'); a.download = `petah-tikva-flight-${Date.now()}.png`; a.href = canvas.toDataURL('image/png'); a.click();
  showToast('📸 התמונה נשמרה', 1500);
}

$('btnStart').onclick = () => startGame(false);
$('btnFree').onclick = () => startGame(true);
$('btnHome').onclick = () => startGame(true, true);
$('btnMissions').onclick = () => showMissions();
$('btnMissionsBack').onclick = () => { $('missionsScreen').classList.add('hidden'); if (S.mode === 'title') $('title').classList.remove('hidden', 'fade'); };
$('mdList').onclick = () => { $('mdone').classList.add('hidden'); showMissions(); };
$('mdFree').onclick = () => { $('mdone').classList.add('hidden'); };
$('mcClose').onclick = () => abortMission();
$('btnQuality').onclick = () => setQuality((qi + 1) % QUALITY.length);
$('btnQuality').textContent = Q.name;
$('btnAgain').onclick = () => startGame(false);
$('btnFreeEnd').onclick = () => { $('end').classList.add('hidden'); S.mode = 'fly'; S.free = true; document.querySelector('.timer').style.display = 'none'; };
$('btnShot').onclick = takeShot;
$('btnPhotoExit').onclick = togglePhoto;

/* ============================== HUD ============================== */
const fmt = (s) => { const m = Math.floor(s / 60); return `${String(m).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
let toastTm;
// text from map data (street / building names) must never be parsed as HTML
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function showToast(html, ms = 2200) { const t = $('toast'); t.innerHTML = html; t.classList.add('on'); clearTimeout(toastTm); toastTm = setTimeout(() => t.classList.remove('on'), ms); }

const PX_PER_DEG = 3.2;
let goalSpan;
function buildCompass() {
  const tape = $('compassTape'); const CARD = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  let html = '';
  for (let d = -180; d <= 540; d += 15) {
    const n = ((d % 360) + 360) % 360;
    if (CARD[n] !== undefined) html += `<span class="card${n === 0 ? ' n' : ''}" style="left:${d * PX_PER_DEG}px">${CARD[n]}</span>`;
    else html += `<span style="left:${d * PX_PER_DEG}px">${n}</span>`;
  }
  html += '<span class="goal" id="goal">◆</span>';
  tape.innerHTML = html; goalSpan = $('goal');
}

let mini = null;
function buildMinimap(data) {
  const { X0, X1, Z0, Z1 } = city.bounds; const M = 3; // metres per pixel
  const c = document.createElement('canvas'); c.width = Math.ceil((X1 - X0) / M) + 2; c.height = Math.ceil((Z1 - Z0) / M) + 2;
  const g = c.getContext('2d');
  const tx = (x) => (x - X0) / M, tz = (z) => (z - Z0) / M;
  const poly = (pts) => { g.beginPath(); for (let i = 0; i < pts.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, tx(pts[i]), tz(pts[i + 1])); g.closePath(); };
  g.fillStyle = 'rgba(90,150,80,0.55)'; for (const q of data.g) { poly(q.slice(1)); g.fill(); }
  g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineCap = 'round';
  for (const r of data.r) { const p = r.slice(3); g.lineWidth = Math.max(1, r[0] / M * 0.6); g.beginPath(); for (let i = 0; i < p.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, tx(p[i]), tz(p[i + 1])); g.stroke(); }
  for (const b of data.b) { const h = b[0]; g.fillStyle = h > 45 ? 'rgba(255,190,120,0.95)' : `rgba(230,220,235,${0.35 + Math.min(0.4, h / 80)})`; poly(b.slice(3)); g.fill(); }
  mini = { img: c, M, X0, Z0, ctx: $('minimap').getContext('2d') };
}

function drawMinimap(headingRad) {
  if (!mini) return;
  const g = mini.ctx, W = 360, R = W / 2, scale = 0.42; // px per metre
  g.save(); g.clearRect(0, 0, W, W);
  g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.clip();
  const bg = g.createRadialGradient(R, R, 0, R, R, R); bg.addColorStop(0, 'rgba(34,18,48,0.78)'); bg.addColorStop(1, 'rgba(16,8,24,0.88)');
  g.fillStyle = bg; g.fillRect(0, 0, W, W);
  g.translate(R, R); g.rotate(-headingRad);
  g.imageSmoothingEnabled = true;
  const s = scale * mini.M;
  g.drawImage(mini.img, (mini.X0 - S.pos.x) * scale, (mini.Z0 - S.pos.z) * scale, mini.img.width * s, mini.img.height * s);
  // letters
  for (const L of letterObjs) {
    if (L.taken) continue;
    let dx = (L.pos.x - S.pos.x) * scale, dz = (L.pos.z - S.pos.z) * scale; const m = Math.hypot(dx, dz), lim = R - 16;
    if (m > lim) { dx *= lim / m; dz *= lim / m; }
    g.save(); g.translate(dx, dz); g.rotate(headingRad);
    g.shadowColor = '#ffc94d'; g.shadowBlur = 12; g.fillStyle = '#ffc94d';
    g.beginPath(); g.moveTo(0, -9); g.lineTo(9, 0); g.lineTo(0, 9); g.lineTo(-9, 0); g.fill();
    g.shadowBlur = 0; g.fillStyle = '#3a1d00'; g.font = '900 11px Rubik'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L.ch, 0, 1);
    g.restore();
  }
  if (home) {
    let dx = (home.pos.x - S.pos.x) * scale, dz = (home.pos.z - S.pos.z) * scale; const m = Math.hypot(dx, dz), lim = R - 16;
    if (m > lim) { dx *= lim / m; dz *= lim / m; }
    g.save(); g.translate(dx, dz); g.rotate(headingRad); g.shadowColor = '#6fe7ff'; g.shadowBlur = 14; g.fillStyle = '#6fe7ff';
    g.beginPath(); g.arc(0, 0, 11, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0; g.font = '14px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🏠', 0, 1); g.restore();
  }
  const mtm = missions?.target();
  if (mtm) {
    let dx = (mtm.x - S.pos.x) * scale, dz = (mtm.z - S.pos.z) * scale; const m = Math.hypot(dx, dz), lim = R - 16;
    if (m > lim) { dx *= lim / m; dz *= lim / m; }
    g.save(); g.translate(dx, dz); g.rotate(headingRad); g.shadowColor = '#c79bff'; g.shadowBlur = 16; g.fillStyle = '#b77cff';
    g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0; g.font = '15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(S.mission.def.icon, 0, 1); g.restore();
  }
  // north marker
  g.save(); g.rotate(0); g.fillStyle = '#ff5ea8'; g.font = '700 16px Rubik'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const nx = 0, nz = -(R - 16); g.translate(nx, nz); g.rotate(headingRad); g.fillText('צ', 0, 0); g.restore();
  g.restore();
  // player arrow + fov wedge
  g.save(); g.translate(R, R);
  const wedge = g.createRadialGradient(0, 0, 0, 0, 0, 110); wedge.addColorStop(0, 'rgba(111,231,255,0.35)'); wedge.addColorStop(1, 'rgba(111,231,255,0)');
  g.fillStyle = wedge; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 110, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.shadowColor = '#6fe7ff'; g.shadowBlur = 14;
  g.beginPath(); g.moveTo(0, -14); g.lineTo(10, 11); g.lineTo(0, 5); g.lineTo(-10, 11); g.closePath(); g.fill();
  g.restore();
  // rim
  g.strokeStyle = 'rgba(255,220,190,0.25)'; g.lineWidth = 2; g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.stroke();
}

const v3 = new THREE.Vector3();
let hudT = 0, lastLm = null;
function updateHud(dt, fwd) {
  const headingRad = ((-(S.mode === 'walk' ? S.wyaw : S.yaw)) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const hdg = THREE.MathUtils.radToDeg(headingRad);
  $('compassTape').style.transform = `translateX(${-hdg * PX_PER_DEG}px)`;
  // nearest letter
  let nearest = null, nd = 1e9;
  for (const L of letterObjs) { if (L.taken) continue; const d = L.pos.distanceTo(S.pos); if (d < nd) { nd = d; nearest = L; } }
  if (home && (S.homeMission || !nearest)) { nearest = home; nd = home.pos.distanceTo(S.pos); }
  const mt = missions?.target();
  if (mt) { missionMk.pos.set(mt.x, mt.y, mt.z); missionMk.taken = false; nearest = missionMk; nd = missionMk.pos.distanceTo(S.pos); missionMk.mk.querySelector('b').textContent = S.mission.def.icon; }
  else if (S.kids && kids?.target()) { const kt = kids.target(); missionMk.pos.copy(kt.mesh.position); missionMk.taken = false; nearest = missionMk; nd = missionMk.pos.distanceTo(S.pos); missionMk.mk.querySelector('b').textContent = kt.g; }
  else if (missionMk) missionMk.taken = true;
  if (nearest) {
    let b = THREE.MathUtils.radToDeg(Math.atan2(nearest.pos.x - S.pos.x, -(nearest.pos.z - S.pos.z)));
    b = ((b % 360) + 360) % 360; while (b - hdg > 180) b -= 360; while (hdg - b > 180) b += 360;
    goalSpan.style.left = `${b * PX_PER_DEG}px`; goalSpan.style.display = '';
  } else goalSpan.style.display = 'none';

  // screen markers
  const W = innerWidth, H = innerHeight;
  for (const L of [...letterObjs, ...(home && !mt && !S.kids ? [home] : []), ...(missionMk ? [missionMk] : [])]) {
    if (L.taken) { L.mk.style.display = 'none'; continue; }
    L.mk.style.display = '';
    v3.copy(L.pos).project(camera);
    const behind = v3.z > 1;
    let x = (v3.x * 0.5 + 0.5) * W, y = (-v3.y * 0.5 + 0.5) * H;
    if (behind) { x = W - x; y = H - y; }
    const m = 46, mx = W > 900 ? 150 : 46; const onScreen = !behind && x > m && x < W - m && y > m && y < H - m;
    if (!onScreen) {
      const cx = W / 2, cy = H / 2; let dx = x - cx, dy = y - cy; if (behind && Math.abs(dy) < 1) dy = 1;
      const k = Math.min((W / 2 - mx) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6)); x = cx + dx * k; y = cy + dy * k;
    }
    L.mk.classList.toggle('edge', !onScreen); L.mk.classList.toggle('nearest', L === nearest);
    const d = L.pos.distanceTo(S.pos);
    L.mk.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%)`;
    L.mk.style.opacity = d < 60 ? d / 60 : 1;
    if (L === home && S.mode === 'walk' && d < 40) L.mk.style.opacity = 0;
    L.dEl.textContent = d > 1000 ? `${(d / 1000).toFixed(1)} ק״מ` : `${Math.round(d)} מ׳`;
  }

  if (input.ctl.mouse) { const r = $('reticle'); r.style.transform = `translate(calc(-50% + ${input.ctl.vx * 110}px), calc(-50% + ${-input.ctl.vy * 110}px))`; }
  hudT += dt; if (hudT < 0.08) return; hudT = 0;
  if (S.mission) {
    const run = S.mission, el = (performance.now() - run.t0) / 1000, st = run.stages[run.i];
    $('mcStep').textContent = st.text; $('mcStage').textContent = `שלב ${run.i + 1} / ${run.stages.length}`;
    $('mcDist').textContent = nd > 1000 ? `${(nd / 1000).toFixed(1)} ק״מ` : `${Math.round(nd)} מ׳`;
    const lim = run.def.limit; $('mcTime').textContent = lim ? `⏱ ${fmt(Math.max(0, lim - el))}` : fmt(el);
    $('mcTime').classList.toggle('urgent', !!lim && lim - el < 30);
    $('mcHint').textContent = st.type === 'ring' ? 'עופו דרך הטבעת' : S.mode === 'walk' ? (nd < 60 ? 'כמעט שם — לכו אל הסימון' : 'המריאו (רווח) כדי להגיע מהר') : nd < 140 ? 'רדו ונחתו ליד היעד (E)' : 'עקבו אחרי הקרן הסגולה';
  }
  $('headingDeg').textContent = String(Math.round(hdg) % 360).padStart(3, '0') + '°';
  $('headingCard').textContent = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(hdg / 45) % 8];
  $('altVal').textContent = Math.round(S.pos.y);
  $('altBar').style.height = `${clamp(S.pos.y / 400, 0, 1) * 100}%`;
  const vs = fwd.y * S.speed + S.lift;
  $('vsVal').textContent = `${vs >= 0 ? '▲' : '▼'} ${Math.abs(vs).toFixed(1)} מ׳/ש`;
  $('spdVal').textContent = Math.round(S.speed * 3.6);
  $('boostBar').style.width = `${S.boost * 100}%`;
  document.querySelector('.gauge.spd').classList.toggle('boosting', S.boosting);
  if (!S.free && S.mode === 'fly') $('timer').textContent = fmt(S.elapsed);
  drawMinimap(headingRad);
  // landmark label
  let lm = null, ld = 170;
  for (const p of landmarks) { const d = Math.hypot(p.x - S.pos.x, p.z - S.pos.z); if (d < ld) { ld = d; lm = p; } }
  if (lm !== lastLm) {
    lastLm = lm;
    if (lm) { $('lmName').textContent = lm.name; $('lmH').textContent = `${Math.round(lm.h)} מטר · פתח תקווה`; }
    $('landmark').classList.toggle('on', !!lm);
  }
}

/* ============================== SIM ============================== */
const fwd = new THREE.Vector3(), camTarget = new THREE.Vector3(), camLook = new THREE.Vector3(), look = new THREE.Vector3();
const prevPos = new THREE.Vector3();
let camInit = false;

function simulate(dt) {
  const k = keys;
  const left = (k.ArrowLeft || k.KeyA) ? 1 : 0, right = (k.ArrowRight || k.KeyD) ? 1 : 0;
  const up = (k.ArrowUp || k.KeyW) ? 1 : 0, down = (k.ArrowDown || k.KeyS) ? 1 : 0;
  const turn = clamp(left - right - axis.x, -1, 1), pitchIn = clamp(up - down + axis.y, -1, 1);
  S.boosting = (k.ShiftLeft || k.ShiftRight || axis.boost) && S.boost > 0.02;
  S.boost = clamp(S.boost + (S.boosting ? -dt * 0.28 : dt * 0.12), 0, 1);

  S.turnS = damp(S.turnS, turn, 4, dt);
  S.yaw += S.turnS * (S.kids ? 0.95 : 1.25) * dt;
  S.pitch = damp(S.pitch, pitchIn * (S.kids ? 0.35 : 0.5), 2.6, dt);
  S.roll = damp(S.roll, S.turnS * 0.8, 4, dt);

  // flap
  S.flapCD -= dt;
  if ((k.Space || axis.flap) && S.flapCD <= 0) { S.flapCD = 0.38; S.lift += 7; S.speed += 2.5; S.flapGlow = 1; sound.flap(); }
  S.lift *= Math.exp(-dt * 1.6);
  S.flapGlow = Math.max(0, S.flapGlow - dt * 2.5);

  const target = S.kids ? 15 + (S.boosting ? 10 : 0) - S.pitch * 6 : 25 + (S.boosting ? 30 : 0) - S.pitch * 12 + (S.pitch < 0 ? -S.pitch * 26 : 0);
  S.speed = damp(S.speed, target, S.boosting ? 1.6 : 0.7, dt);

  // ceiling
  if (S.pos.y > (S.kids ? 140 : 420)) S.pitch = damp(S.pitch, -0.3, 2, dt);

  fwd.set(-Math.sin(S.yaw) * Math.cos(S.pitch), Math.sin(S.pitch), -Math.cos(S.yaw) * Math.cos(S.pitch));
  prevPos.copy(S.pos);
  S.pos.addScaledVector(fwd, S.speed * dt); S.pos.y += S.lift * dt;
  S.dist += S.speed * dt;

  // ground — in photoreal mode the "ground" is the real surface under us (roofs included)
  const real = mapMode === 'google' && google;
  if (real) {
    S.surfT = (S.surfT || 0) - dt;
    if (S.surfT <= 0) { S.surfT = 0.1; const y = google.groundAt(S.pos.x, S.pos.z, S.pos.y + 200); S.surf = y ?? 0; if (y !== null && !S.gySet) { S.gy = y; } }
  }
  const floorY = real ? (S.surf ?? 0) + 2.5 : 2.5;
  if (S.pos.y < floorY) { S.pos.y = floorY; if (S.pitch < 0) S.pitch = damp(S.pitch, 0.15, 6, dt); }

  // buildings
  S.invuln -= dt;
  const gh = city.grid.at(S.pos.x, S.pos.z);
  if (S.kids && !real && gh > 0 && S.pos.y < gh + 2.5) { S.pos.y = damp(S.pos.y, gh + 3, 12, dt); S.pitch = Math.max(S.pitch, 0.2); } // kids: glide over, never crash
  else if (!real && gh > 0 && S.pos.y < gh + 1.0) {
    if (S.invuln > 0) { S.pos.y = gh + 1.2; }
    else crash(gh);
  }

  // letters
  for (const L of letterObjs) {
    if (L.taken) continue;
    if (L.pos.distanceTo(S.pos) < 13) collect(L);
  }
  if (S.boosting || S.flapGlow > 0.5) FX.trail(S.pos.clone().addScaledVector(fwd, -1.5), new THREE.Color(...bird.def.trail));
  sound.wind(S.speed, S.boosting);
}

/* ============================== LAND & WALK ============================== */
function landOrTakeoff() {
  if (S.mode === 'walk') return takeOff();
  if (S.mode !== 'fly') return;
  const agl = S.pos.y - (mapMode === 'google' && google ? (S.surf ?? 0) : 0);
  if (agl > 35) return showToast('⬇️ רדו מתחת ל־35 מ׳ כדי לנחות', 1600);
  if (city.grid.at(S.pos.x, S.pos.z) > 0 || city.blocked(S.pos.x, S.pos.z, 1)) return showToast('🏢 מתחתיכם בניין — חפשו רחוב פנוי', 1600);
  S.mode = 'landing'; S.landT = 0; S.landFrom.copy(S.pos);
}
function takeOff() {
  if (S.mode !== 'walk') return;
  scene.add(bird.root); bird.root.scale.setScalar(1.35);
  S.pos.set(walker.root.position.x, 3, walker.root.position.z);
  S.yaw = S.wyaw; S.pitch = 0.45; S.lift = 9; S.speed = 16; S.invuln = 1.5;
  walker.root.visible = false; S.mode = 'fly'; document.body.classList.remove('walking'); sound.flap(); updateHint();
}
function finishLanding() {
  S.mode = 'walk'; S.wyaw = S.yaw; S.wspeed = 0; S.pos.y = 0;
  walker.root.position.set(S.pos.x, 0, S.pos.z); S.gy = google && mapMode === 'google' ? (google.groundAt(S.pos.x, S.pos.z, 60) ?? 0) : 0; walker.root.position.y = S.gy; walker.root.rotation.y = S.wyaw; walker.root.visible = true;
  walker.shoulder.add(bird.root); bird.root.position.set(0, 0, 0); bird.root.rotation.set(0, 0, 0); bird.root.scale.setScalar(0.2);
  document.body.classList.add('walking'); updateHint();
  showToast('🚶 הלכתם לרחוב! רווח = המראה', 2200);
}
function walkSim(dt) {
  const k = keys;
  const fwdIn = clamp(((k.ArrowUp || k.KeyW) ? 1 : 0) - ((k.ArrowDown || k.KeyS) ? 1 : 0) + axis.y, -1, 1);
  const turn = clamp(((k.ArrowLeft || k.KeyA) ? 1 : 0) - ((k.ArrowRight || k.KeyD) ? 1 : 0) - axis.x, -1, 1);
  const run = k.ShiftLeft || k.ShiftRight || axis.boost;
  S.wyaw += turn * 2.1 * dt;
  S.wspeed = damp(S.wspeed, fwdIn * (run ? 5.8 : 1.9), 6, dt);
  const p = walker.root.position;
  const dx = -Math.sin(S.wyaw) * S.wspeed * dt, dz = -Math.cos(S.wyaw) * S.wspeed * dt;
  if (!city.blocked(p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; }
  else if (!city.blocked(p.x + dx, p.z)) p.x += dx;
  else if (!city.blocked(p.x, p.z + dz)) p.z += dz;
  walker.root.rotation.y = S.wyaw;
  if (mapMode === 'google' && google) { S.gyT = (S.gyT || 0) - dt; if (S.gyT <= 0) { S.gyT = 0.12; const gy = google.groundAt(p.x, p.z, p.y + 3); if (gy !== null && Math.abs(gy - p.y) < 3) S.gy = gy; } p.y = damp(p.y, S.gy ?? 0, 10, dt); }
  else p.y = 0;
  walker.update(dt, Math.abs(S.wspeed));
  bird.update(dt, 2, 1);
  S.pos.set(p.x, 0, p.z); S.dist += Math.abs(S.wspeed) * dt;
  if (home && S.homeMission && !S.homeDone && Math.hypot(p.x - home.door.x, p.z - home.door.z) < 9) {
    S.homeDone = true; sound.fanfare(); FX.burst(new THREE.Vector3(home.door.x, 6, home.door.z), 90);
    showToast(`🏠 הגעתם הביתה! ${esc(HOME.street)} ${esc(HOME.number)}`, 4000);
  }
  sound.wind(2, false);
}
const wcam = new THREE.Vector3();
function walkCamera(dt) {
  const p = walker.root.position;
  let back = 4.4;
  for (; back > 1.2; back -= 0.4) { if (!city.blocked(p.x + Math.sin(S.wyaw) * back, p.z + Math.cos(S.wyaw) * back, 0.2)) break; }
  wcam.set(p.x + Math.sin(S.wyaw) * back, p.y + 2.2, p.z + Math.cos(S.wyaw) * back);
  camera.position.x = damp(camera.position.x, wcam.x, 6, dt); camera.position.y = damp(camera.position.y, wcam.y, 6, dt); camera.position.z = damp(camera.position.z, wcam.z, 6, dt);
  look.set(p.x - Math.sin(S.wyaw) * 4, p.y + 1.5, p.z - Math.cos(S.wyaw) * 4);
  camLook.lerp(look, 1 - Math.exp(-dt * 8)); camera.lookAt(camLook);
  camera.fov = damp(camera.fov, 60, 3, dt); camera.updateProjectionMatrix();
}
let whereT = 0;
function walkHud(dt) {
  whereT -= dt; if (whereT > 0) return; whereT = 0.4;
  const w = labels.where(walker.root.position.x, walker.root.position.z);
  $('streetName').textContent = w.road ? `רחוב ${w.road}` : 'שטח פתוח';
  $('streetNum').textContent = w.plate ? `ליד ${w.plate.street} ${w.plate.num}` : '';
  if (home) { const d = Math.hypot(walker.root.position.x - home.door.x, walker.root.position.z - home.door.z); $('homeDist').textContent = d < 1000 ? `🏠 ${Math.round(d)} מ׳ הביתה` : `🏠 ${(d / 1000).toFixed(1)} ק״מ הביתה`; }
}
function updateHint() {
  $('keysHint').innerHTML = S.mode === 'walk'
    ? '<div><kbd>↑</kbd><kbd>↓</kbd> הליכה</div><div><kbd>←</kbd><kbd>→</kbd> / 🖱️ פנייה</div><div><kbd>Shift</kbd> ריצה</div><div><kbd>רווח</kbd> / <kbd>E</kbd> / 🖱️ לחיצה — המראה</div><div class="pad">🎮 סטיק שמאלי · A המראה</div>'
    : '<div><kbd>←</kbd><kbd>→</kbd> פנייה</div><div><kbd>↑</kbd><kbd>↓</kbd> טיפוס / צלילה</div><div><kbd>רווח</kbd> נפנוף · <kbd>Shift</kbd> טורבו</div><div><kbd>E</kbd> נחיתה ברחוב (מתחת ל־35 מ׳)</div><div>🖱️ הזיזו = היגוי · לחיצה = נפנוף · ימני = טורבו</div><div class="pad">🎮 סטיק · A נפנוף · RT טורבו · B נחיתה</div><div><kbd>T</kbd> שעה · <kbd>P</kbd> צילום · <kbd>Q</kbd> איכות · <kbd>I</kbd> היפוך ציר · <kbd>M</kbd> קול</div>';
  $('btnLand').textContent = S.mode === 'walk' ? 'המראה' : 'נחיתה';
  $('keysHint').classList.remove('fade'); clearTimeout(updateHint.tm); updateHint.tm = setTimeout(() => $('keysHint').classList.add('fade'), 12000);
}

function crash(gh) {
  input.rumble(0.9, 0.6, 260);
  S.hits++; S.shake = 0.6; S.invuln = 1.2; sound.crash();
  const hf = document.querySelector('.hit-flash'); hf.classList.add('on'); setTimeout(() => hf.classList.remove('on'), 60);
  // escape toward the lowest nearby direction
  let bestA = S.yaw + Math.PI, bestH = 1e9;
  for (let a = 0; a < 16; a++) {
    const ang = a / 16 * Math.PI * 2; const x = S.pos.x - Math.sin(ang) * 14, z = S.pos.z - Math.cos(ang) * 14;
    const h = city.grid.at(x, z); if (h < bestH) { bestH = h; bestA = ang; }
  }
  S.pos.copy(prevPos); S.pos.x += -Math.sin(bestA) * 5; S.pos.z += -Math.cos(bestA) * 5;
  if (bestH > S.pos.y - 2) S.pos.y = Math.max(S.pos.y, gh + 4);
  S.yaw = bestA; S.speed = 12; S.pitch = 0.25; S.lift = 4;
  showToast('💥 אאוץ׳! זהירות מהמגדלים', 1400);
}

function collect(L) {
  L.taken = true; S.got.add(L.slot);
  FX.burst(L.pos.clone());
  sound.collect(S.got.size - 1);
  const slot = document.querySelector(`.slot[data-i="${L.slot}"]`); slot.classList.add('got', 'pop');
  $('letterCount').textContent = `${S.got.size}/${letterObjs.length}`;
  L.collectT = 0;
  showToast(`<span class="big">${L.ch}</span> ${L.label}`, 2000);
  if (S.got.size === letterObjs.length && !S.free) {
    S.elapsed = (performance.now() - S.t0) / 1000;
    setTimeout(() => { sound.fanfare(); for (let i = 0; i < 5; i++) setTimeout(() => FX.burst(S.pos.clone().add(new THREE.Vector3((Math.random() - .5) * 40, 10 + Math.random() * 20, (Math.random() - .5) * 40)), 200), i * 250); }, 300);
    setTimeout(finish, 2600);
  }
}

/* ============================== LOOP ============================== */
const clock = new THREE.Clock();
let titleT = 0;
let simT = 0, lastFrame = 0, attribT = 0;
function frame(now = 0) {
  requestAnimationFrame(frame);
  const cap = (S.mode === 'title' || S.mode === 'end') ? 30 : Q.fps; // menus don't need 60 fps
  if (now - lastFrame < 1000 / cap - 3) return;
  lastFrame = now;
  step(Math.min(clock.getDelta(), 0.05));
}
function step(dt) {
  simT += dt;
  mergeAxes(dt);
  const t = simT;

  // time of day transition
  if (tod.t < 1) {
    tod.t = Math.min(1, tod.t + dt / 2.5);
    const e = tod.t * tod.t * (3 - 2 * tod.t);
    tod.cur = lerpTod(tod.from, tod.to, e); applyTod(tod.cur);
    if (tod.t === 1) refreshEnv();
  }
  skyU.time.value = t;

  if (!city) { camera.position.set(Math.cos(t * 0.05) * 1400, 520, Math.sin(t * 0.05) * 1400); camera.lookAt(-600, 40, -200); render(); return; }

  city.updateTraffic(dt);
  street?.update(dt, camera.position, t);
  sat?.update(dt, camera.position);
  if (blockDetail && !blockDetail.hidden) blockDetail.update(dt, camera.position);
  google?.update(dt);
  if (google && mapMode === 'google') { attribT -= dt; if (attribT < 0) { attribT = 3; updateAttrib(); } }
  if (labels && S.mode !== 'title') labels.update(dt, S.pos, S.mode === 'walk', mapMode === 'google' && google ? (S.mode === 'walk' ? walker.root.position.y : (S.surf ?? 0)) + 0.3 : 0);
  if (S.kids && S.mode === 'fly') { const ev = kids.update(dt, S.pos); if (ev) kidsEvent(ev); }
  if (S.mission && ['fly', 'walk', 'landing'].includes(S.mode)) { const ev = missions.update(dt, S, walker.root.position, S.mode); if (ev) missionEvent(ev); }
  if (home) { home.sign.material.rotation = 0; home.beam.material.opacity = 0.2 + Math.sin(t * 2) * 0.06; home.sign.visible = !S.kids; home.beam.visible = !S.kids && Math.hypot(camera.position.x - home.door.x, camera.position.z - home.door.z) > 70; }
  FX.update(dt);
  for (const L of letterObjs) {
    L.spin += dt;
    if (L.taken) {
      L.collectT = (L.collectT || 0) + dt;
      const s = Math.max(0, 1 - L.collectT * 1.6); L.g.scale.setScalar(1 + (1 - s) * 1.5); L.g.visible = s > 0;
      continue;
    }
    L.ring.rotation.z = L.spin * 0.6;
    L.g.position.y = L.pos.y + Math.sin(L.spin * 1.4) * 0.8;
    L.glow.material.opacity = 0.55 + Math.sin(L.spin * 3) * 0.2;
  }

  if (S.mode === 'title') {
    titleT += dt;
    const a = titleT * 0.045 + 0.6;
    camera.position.set(-750 + Math.cos(a) * 1150, 330 + Math.sin(titleT * 0.1) * 40, -250 + Math.sin(a) * 1150);
    camera.lookAt(-800, 40, -250);
    camera.fov = 55; camera.updateProjectionMatrix();
    placeSunShadow(new THREE.Vector3(-800, 0, -250));
  } else if (S.mode === 'fly' || S.mode === 'end') {
    if (S.mode === 'fly') { S.elapsed = S.free ? 0 : (performance.now() - S.t0) / 1000; simulate(dt); }
    else { // gentle auto-glide in a circle during the end screen
      S.yaw += dt * 0.25; S.pitch = damp(S.pitch, 0.05, 2, dt); S.roll = damp(S.roll, 0.4, 2, dt); S.speed = damp(S.speed, 20, 1, dt);
      fwd.set(-Math.sin(S.yaw) * Math.cos(S.pitch), Math.sin(S.pitch), -Math.cos(S.yaw) * Math.cos(S.pitch));
      S.pos.addScaledVector(fwd, S.speed * dt); S.pos.y = Math.min(S.pos.y, 300);
      if (city.grid.around(S.pos.x, S.pos.z, 10) > S.pos.y - 5) S.pos.y += 20 * dt;
    }
    updateBird(dt);
    chaseCamera(dt);
    updateHud(dt, fwd);
    placeSunShadow(S.pos);
  } else if (S.mode === 'landing') {
    S.landT += dt / 1.4; const e = Math.min(1, S.landT);
    fwd.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
    S.pos.addScaledVector(fwd, lerp(S.speed, 2, e) * dt * (1 - e));
    S.pos.y = lerp(S.landFrom.y, (mapMode === 'google' && google ? (S.surf ?? 0) : 0) + 0.6, e * e * (3 - 2 * e)); S.pitch = damp(S.pitch, 0.35, 4, dt); S.roll = damp(S.roll, 0, 4, dt);
    if (city.blocked(S.pos.x, S.pos.z, 0.6)) S.pos.addScaledVector(fwd, -lerp(S.speed, 2, e) * dt * (1 - e));
    updateBird(dt); chaseCamera(dt); updateHud(dt, fwd); placeSunShadow(S.pos);
    if (S.landT >= 1) finishLanding();
  } else if (S.mode === 'walk') {
    walkSim(dt); walkCamera(dt); walkHud(dt); updateHud(dt, fwd.set(0, 0, 0)); placeSunShadow(S.pos);
  } else if (S.mode === 'photo') {
    photoAng += dt * 0.15;
    bird.update(dt, 3, 0.8);
    camera.position.set(S.pos.x + Math.sin(photoAng) * 16, S.pos.y + 4, S.pos.z + Math.cos(photoAng) * 16);
    camera.lookAt(S.pos);
    placeSunShadow(S.pos);
  }
  haze.position.x = camera.position.x; haze.position.z = camera.position.z;
  sunSprite.position.copy(camera.position).addScaledVector(sunDir, 14000); sunSprite.visible = sunDir.y > -0.03;
  render();
}

function updateBird(dt) {
  bird.root.position.copy(S.pos);
  bird.root.rotation.set(S.pitch, S.yaw, S.roll, 'YXZ');
  const glide = S.boosting ? 0.85 : (S.pitch < -0.15 ? 0.9 : clamp(0.55 - S.flapGlow * 0.8 - Math.max(0, S.pitch) * 0.8, 0, 1));
  bird.update(dt, S.boosting ? 9 : (6 + S.flapGlow * 10 + Math.max(0, S.pitch) * 6), glide);
}

function chaseCamera(dt) {
  const back = S.boosting ? 15 : 13;
  camTarget.set(S.pos.x + Math.sin(S.yaw) * back, S.pos.y + 3.6 - Math.sin(S.pitch) * back * 0.3, S.pos.z + Math.cos(S.yaw) * back);
  const ch = mapMode === 'google' && google ? (S.surf ?? 0) : city.grid.at(camTarget.x, camTarget.z); if (camTarget.y < ch + 2) camTarget.y = ch + 2;
  if (!camInit) { camera.position.copy(camTarget).add(new THREE.Vector3(0, 60, 80)); camInit = true; }
  camera.position.x = damp(camera.position.x, camTarget.x, 5, dt);
  camera.position.y = damp(camera.position.y, camTarget.y, 5, dt);
  camera.position.z = damp(camera.position.z, camTarget.z, 5, dt);
  look.copy(S.pos).addScaledVector(fwd, 8); look.y += 1.2;
  camLook.lerp(look, 1 - Math.exp(-dt * 10));
  if (S.shake > 0) { S.shake -= dt; camera.position.x += (Math.random() - 0.5) * S.shake * 2; camera.position.y += (Math.random() - 0.5) * S.shake * 2; }
  camera.lookAt(camLook);
  camera.rotateZ(-S.roll * 0.18);
  const fov = 62 + (S.speed - 25) * 0.45 + (S.boosting ? 6 : 0);
  camera.fov = damp(camera.fov, fov, 3, dt); camera.updateProjectionMatrix();
}

function placeSunShadow(at) {
  sunLight.position.copy(at).addScaledVector(sunDir.y > 0.02 ? sunDir : v3.set(sunDir.x, 0.3, sunDir.z).normalize(), 1500);
  sunLight.target.position.copy(at); sunLight.target.updateMatrixWorld();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth / 2, innerHeight / 2);
});

if (import.meta.env.DEV) window.__game = { S, letterObjs, cycleTod, camera, scene, setMapMode, get walker() { return walker; }, get missions() { return missions; }, get kids() { return kids; }, input, get google() { return google; }, get home() { return home; }, land: landOrTakeoff, step: (n = 60) => { for (let i = 0; i < n; i++) step(1 / 60); } };

frame();
init().catch((e) => { console.error(e); progress(0, 'שגיאה בטעינה: ' + e.message); });
