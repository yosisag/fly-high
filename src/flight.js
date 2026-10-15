import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createGoogle3D } from './realistic.js';
import { Sound } from './audio.js';
import { createInput } from './input.js';
import { createAircraft, PLANES } from './planes.js';

/* Flight simulator over the real photoreal globe: country-to-country levels with takeoff, cruise
 * (time-accelerated), approach rings and landing. The plane flies in lat/lon/ellipsoid-height and
 * the globe is re-anchored under it (floating origin) so precision stays fine anywhere on Earth. */
const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp, damp = THREE.MathUtils.damp, D2R = Math.PI / 180, R_E = 6371000;
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('touch');
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private */ } } };

/* ---------------- world data ---------------- */
const AP = {
  TLV: { name: 'תל אביב', land: 'ישראל', flag: '🇮🇱', lat: 32.0094, lon: 34.8867, rwy: 255 },
  LCA: { name: 'לרנקה', land: 'קפריסין', flag: '🇨🇾', lat: 34.8751, lon: 33.6249, rwy: 221 },
  ATH: { name: 'אתונה', land: 'יוון', flag: '🇬🇷', lat: 37.9364, lon: 23.9445, rwy: 214 },
  FCO: { name: 'רומא', land: 'איטליה', flag: '🇮🇹', lat: 41.8003, lon: 12.2389, rwy: 163 },
  CDG: { name: 'פריז', land: 'צרפת', flag: '🇫🇷', lat: 49.0097, lon: 2.5479, rwy: 266 },
  LHR: { name: 'לונדון', land: 'אנגליה', flag: '🇬🇧', lat: 51.4700, lon: -0.4543, rwy: 270 },
  JFK: { name: 'ניו יורק', land: 'ארה״ב', flag: '🇺🇸', lat: 40.6413, lon: -73.7781, rwy: 314 },
};
let RWY = {}; // real runway geometry from OpenStreetMap (public/data/runways.json)
fetch(`${import.meta.env.BASE_URL}data/runways.json`).then((r) => r.json()).then((d) => { RWY = d; }).catch(() => {});
/** Longest runway at an airport, oriented to the direction closest to `prefer` (rad). */
function runwayFor(code, prefer) {
  const ap = AP[code], list = RWY[code];
  if (!list?.length) return { lat: ap.lat, lon: ap.lon, thrLat: ap.lat, thrLon: ap.lon, rwy: ap.rwy, len: 3000, ref: '' };
  const r = list[0]; let [a, b] = [r.a, r.b];
  let h = gcBearing(a[0], a[1], b[0], b[1]);
  const diff = (x) => Math.abs(Math.atan2(Math.sin(x - prefer), Math.cos(x - prefer)));
  if (diff(h + Math.PI) < diff(h)) { [a, b] = [b, a]; h += Math.PI; }
  h = (h + Math.PI * 2) % (Math.PI * 2);
  const [aimLat, aimLon] = gcDest(a[0], a[1], h, 350); // touchdown zone
  const end = r.ref.split('/'); const num = Math.round(h / D2R / 10) % 36 || 36;
  return { lat: aimLat, lon: aimLon, thrLat: a[0], thrLon: a[1], rwy: h / D2R, len: r.len, ref: end.find((e) => parseInt(e, 10) === num) || r.ref };
}
let LND = null, DEP = null;
const LEVELS = [['TLV', 'LCA'], ['LCA', 'ATH'], ['ATH', 'FCO'], ['FCO', 'CDG'], ['CDG', 'LHR'], ['LHR', 'JFK']];
const gcDist = (a1, o1, a2, o2) => { const p1 = a1 * D2R, p2 = a2 * D2R, dp = p2 - p1, dl = (o2 - o1) * D2R; const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 2 * R_E * Math.asin(Math.min(1, Math.sqrt(h))); };
const gcBearing = (a1, o1, a2, o2) => { const p1 = a1 * D2R, p2 = a2 * D2R, dl = (o2 - o1) * D2R; return Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)); };
const gcDest = (a, o, brg, d) => { const p1 = a * D2R, l1 = o * D2R, dr = d / R_E; const p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(brg)); const l2 = l1 + Math.atan2(Math.sin(brg) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2)); return [p2 / D2R, l2 / D2R]; };

/* ---------------- renderer ---------------- */
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.5;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 4e6);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera)); composer.addPass(new OutputPass()); // no bloom here: it smeared the bright sky into a white veil over the ground
const sky = new Sky(); sky.scale.setScalar(2e6); scene.add(sky); sky.material.uniforms.showSunDisc.value = 0;
const sunDir = new THREE.Vector3();
const sunLight = new THREE.DirectionalLight('#fff3e0', 1.6); scene.add(sunLight, sunLight.target);
scene.add(new THREE.HemisphereLight('#dfeaff', '#a8a097', 1.25)); // bright ground bounce so the plane's underside isn't black
const TOD = [{ name: '☀️ צהריים', el: 55, az: 160, turb: 1.6, ray: 0.9, mie: 0.0012, g: 0.7, exp: 0.42, tint: '#ffffff' }, { name: '🌅 שקיעה', el: 6, az: 255, turb: 4, ray: 2, mie: 0.0015, g: 0.75, exp: 0.5, tint: '#ffd9c0' }];
let todI = 0;
const pmrem = new THREE.PMREMGenerator(renderer); const envScene = new THREE.Scene(); const envSky = new Sky(); envSky.scale.setScalar(1000); envSky.material.uniforms.showSunDisc.value = 0; envScene.add(envSky); let envRT = null;
function applyTod() {
  const p = TOD[todI], phi = (90 - p.el) * D2R, th = p.az * D2R;
  sunDir.set(Math.sin(th) * Math.sin(phi), Math.cos(phi), -Math.cos(th) * Math.sin(phi));
  const U = sky.material.uniforms; U.turbidity.value = p.turb; U.rayleigh.value = p.ray; U.mieCoefficient.value = p.mie; U.mieDirectionalG.value = p.g; U.sunPosition.value.copy(sunDir);
  renderer.toneMappingExposure = p.exp; tiles?.setTint(new THREE.Color(p.tint));
  const EU = envSky.material.uniforms; EU.turbidity.value = p.turb; EU.rayleigh.value = p.ray; EU.mieCoefficient.value = p.mie; EU.mieDirectionalG.value = p.g; EU.sunPosition.value.copy(sunDir);
  envRT?.dispose(); envRT = pmrem.fromScene(envScene, 0, 1, 2000); scene.environment = envRT.texture; scene.environmentIntensity = 0.55;
}

/* ---------------- state ---------------- */
const P = { easy: store.get('flypt.flightEasy') !== '0', lat: 0, lon: 0, alt: 0, hdg: 0, pitch: 0, roll: 0, v: 0, thr: 0, gear: true, ground: true, brakes: false, agl: 0, vs: 0, ap: false, warp: 1, t0: 0, crashed: false, touchVs: null, dist0: 1, landed: false };
let level = 0, mode = 'title', tiles = null, origin = { lat: 0, lon: 0 }, camMode = 0, camSnap = true;
let plane = createAircraft(store.get('flypt.plane') || 'airliner'); scene.add(plane.root); plane.root.visible = false;
const PD = () => plane.def;
function setPlane(id) { store.set('flypt.plane', id); scene.remove(plane.root); plane = createAircraft(id); plane.root.visible = false; scene.add(plane.root); document.querySelectorAll('.pl-card').forEach((b) => b.classList.toggle('on', b.dataset.id === id)); }
const sound = new Sound();
const keys = {}, touch = { x: 0, y: 0, thrUp: false, thrDn: false };
const input = createInput({ canvas, store, canLock: () => !IS_TOUCH && mode === 'fly', onAction: (a) => {
  if (a === 'land') P.brakes = !P.brakes;
  if (a === 'time') { todI = (todI + 1) % TOD.length; applyTod(); }
}, onPadChange: (id, on) => toast(on ? '🎮 שלט מחובר — סטיק = הגאי, RT = גז' : '🎮 השלט נותק', 2000) });

/* ---------------- globe ---------------- */
const envKey = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
const gKey = () => store.get('flypt.gkey') || envKey;
function startGlobe(lat, lon) {
  if (!gKey()) { $('keyBox').classList.remove('hidden'); return; }
  tiles?.dispose();
  tiles = createGoogle3D(scene, camera, renderer, gKey(), { lat, lon, height: 0, errorTarget: 6, calibrateFor: 0, onError: () => { toast('⚠️ הטוקן לא עובד', 3000); $('keyBox').classList.remove('hidden'); } });
  tiles.group.rotation.y = 0; // keep the plugin's own frame here: we work in ECEF→world directly
  origin = { lat, lon }; applyTod();
}
$('btnKey').onclick = () => { const v = $('gkey').value.trim(); if (!v) return; store.set('flypt.gkey', v); $('keyBox').classList.add('hidden'); startGlobe(AP.TLV.lat, AP.TLV.lon); renderLevels(); };

const _m = new THREE.Matrix4(), _e = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3();
const toWorld = (lat, lon, h, out = new THREE.Vector3()) => { tiles.ellipsoid.getCartographicToPosition(lat * D2R, lon * D2R, h, out); return out.applyMatrix4(tiles.tiles.group.matrixWorld); };
function enuAt(lat, lon, E, N, U) {
  tiles.ellipsoid.getEastNorthUpAxes(lat * D2R, lon * D2R, E, N, U);
  const q = new THREE.Quaternion(); tiles.tiles.group.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  E.applyQuaternion(q); N.applyQuaternion(q); U.applyQuaternion(q);
}
function rebase(force) {
  if (!force && gcDist(P.lat, P.lon, origin.lat, origin.lon) < 12000) return;
  origin = { lat: P.lat, lon: P.lon }; tiles.setOrigin(P.lat, P.lon, 0);
}

/* ---------------- approach rings + destination ---------------- */
const ringMat = new THREE.MeshStandardMaterial({ color: '#6fe7ff', emissive: '#2fb8ff', emissiveIntensity: 1.6, transparent: true, opacity: 0.85 });
let rings = [], destElev = null;
function buildRings(dst) {
  for (const r of rings) scene.remove(r.mesh); rings = [];
  // approach from the opposite side of the runway heading, 3° glide slope
  const back = (dst.rwy + 180) * D2R;
  for (const d of [16000, 12000, 9000, 6500, 4500, 3000, 1800]) {
    const [la, lo] = gcDest(dst.lat, dst.lon, back, d);
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(d > 8000 ? 70 : 50, 3, 10, 48), ringMat); mesh.visible = false; scene.add(mesh);
    rings.push({ lat: la, lon: lo, d, mesh, passed: false });
  }
}
const mk = document.createElement('div'); mk.className = 'mk mission'; mk.innerHTML = '<div class="gem"><b>🛬</b></div><div class="d"></div>'; $('markers').appendChild(mk);

/* ---------------- flow ---------------- */
let toastTm; function toast(html, ms = 2200) { const t = $('toast'); t.innerHTML = html; t.classList.add('on'); clearTimeout(toastTm); toastTm = setTimeout(() => t.classList.remove('on'), ms); }
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const progress = () => { try { return JSON.parse(store.get('flypt.flight') || '{}'); } catch { return {}; } };
function renderPlanes() {
  const cur = store.get('flypt.plane') || 'airliner';
  $('planePick').innerHTML = Object.values(PLANES).map((p) => `<button class="pl-card ${p.id === cur ? 'on' : ''}" data-id="${p.id}"><span class="pl-ic">${p.icon}</span><span class="pl-tx"><b>${p.name}</b><small>${p.desc}</small></span></button>`).join('');
  $('planePick').querySelectorAll('.pl-card').forEach((b) => { b.onclick = () => setPlane(b.dataset.id); });
}
function renderLevels() {
  renderPlanes();
  document.body.classList.toggle('no-globe', !gKey());
  const pr = progress(), unlocked = Math.max(0, ...Object.keys(pr).map(Number).map((k) => k + 1), 0);
  $('levels').innerHTML = LEVELS.map(([a, b], i) => {
    const A = AP[a], Bp = AP[b], km = Math.round(gcDist(A.lat, A.lon, Bp.lat, Bp.lon) / 1000), p = pr[i] || {}, lock = i > unlocked;
    return `<button class="lvl ${lock ? 'lock' : ''}" data-i="${i}" ${lock ? 'disabled' : ''}><span class="lv-n">${i + 1}</span><span class="lv-route">${A.flag} ${A.name} <i>✈</i> ${Bp.flag} ${Bp.name}</span><span class="lv-km">${km.toLocaleString('he-IL')} ק״מ</span><span class="lv-stars">${[0, 1, 2].map((k) => `<i class="${k < (p.stars || 0) ? 'on' : ''}">★</i>`).join('')}</span>${lock ? '<span class="lv-lock">🔒</span>' : ''}</button>`;
  }).join('');
  $('levels').querySelectorAll('.lvl:not(.lock)').forEach((b) => { b.onclick = () => startLevel(+b.dataset.i); });
}
function startLevel(i) {
  if (!gKey() || !tiles?.tiles.root) { $('keyBox').classList.remove('hidden'); $('gkey')?.focus(); $('loaderText').textContent = gKey() ? '⏳ כדור הארץ עדיין נטען — רגע…' : '🔑 כדי לטוס צריך טוקן Cesium ion — הדביקו אותו למעלה'; $('loader').classList.remove('done'); return; }
  level = i; const [a, b] = LEVELS[i], A = AP[a], Bp = AP[b];
  sound.start();
  const brgAB = gcBearing(A.lat, A.lon, Bp.lat, Bp.lon);
  DEP = runwayFor(a, brgAB); LND = runwayFor(b, brgAB);
  const [sLat, sLon] = gcDest(DEP.thrLat, DEP.thrLon, DEP.rwy * D2R, 60); // line up just past the threshold
  Object.assign(P, { offRwy: false, altHold: null, rotHint: false, lat: sLat, lon: sLon, alt: 600, agl: null, landedAtDest: false, hdg: DEP.rwy * D2R, pitch: 0, roll: 0, v: 0, thr: 0, gear: true, ground: true, brakes: false, ap: false, warp: 1, crashed: false, touchVs: null, landed: false, placed: false, dist0: gcDist(A.lat, A.lon, Bp.lat, Bp.lon) });
  if (!tiles) startGlobe(A.lat, A.lon); else { rebase(true); }
  destElev = null; buildRings(LND);
  $('flFrom').textContent = `${A.flag} ${A.name}`; $('flTo').textContent = `${Bp.flag} ${Bp.name}`;
  $('title').classList.add('hidden'); $('end').classList.add('hidden'); $('hud').classList.remove('hidden');
  plane.root.visible = true; mode = 'fly'; P.t0 = performance.now(); camSnap = true;
  $('keysHint').classList.remove('fade'); clearTimeout(startLevel.hint); startLevel.hint = setTimeout(() => $('keysHint').classList.add('fade'), 15000);
  toast(`שלב ${i + 1}: ${A.name} ← ${Bp.name} · מסלול ${DEP.ref} · W להגברת המנוע, ↑ להמראה ב־${PD().ktRotate} קשר`, 5000);
}
function endLevel(ok, reason) {
  mode = 'end'; input.release();
  const t = (performance.now() - P.t0) / 1000, [a, b] = LEVELS[level], Bp = AP[b];
  const stars = ok ? (P.offRwy ? 1 : P.touchVs > -1.6 ? 3 : P.touchVs > -3 ? 2 : 1) : 0;
  if (ok) { const pr = progress(), o = pr[level] || {}; pr[level] = { stars: Math.max(o.stars || 0, stars), time: o.time ? Math.min(o.time, t) : t }; store.set('flypt.flight', JSON.stringify(pr)); sound.fanfare(); }
  else { sound.crash(); input.rumble(1, 0.8, 500); }
  $('endKicker').textContent = ok ? 'נחיתה מוצלחת' : 'אוי לא';
  $('endTitle').textContent = ok ? `${Bp.flag} נחתתם ב${Bp.name}!` : reason;
  $('endStars').innerHTML = [0, 1, 2].map((i) => `<span class="star ${i < stars ? 'on' : ''}" style="animation-delay:${0.2 + i * 0.25}s">★</span>`).join('');
  $('endTime').textContent = fmt(t); $('endVs').textContent = P.touchVs !== null ? `${Math.round(-P.touchVs * 197)} ft/m` : '--';
  $('endDist').textContent = Math.round(P.dist0 / 1000).toLocaleString('he-IL'); $('endBest').textContent = progress()[level]?.time ? fmt(progress()[level].time) : '--';
  $('endHint').textContent = ok ? (stars < 3 ? 'לנחיתה רכה יותר: הורידו את האף לאט והורידו גז ממש לפני הקרקע' : 'נחיתה של טייס אמיתי 👨‍✈️') : 'טיפ: גלגלים למטה (G), מהירות מתחת ל־170 קשר, ירידה איטית';
  const next = level + 1 < LEVELS.length;
  $('btnNext').textContent = ok && next ? `לשלב הבא: ${AP[LEVELS[level + 1][1]].flag} ${AP[LEVELS[level + 1][1]].name}` : ok ? '🏆 סיימתם את המסע!' : 'נסו שוב';
  $('btnNext').onclick = () => (ok && next ? startLevel(level + 1) : ok ? showTitle() : startLevel(level));
  $('end').classList.remove('hidden'); $('hud').classList.add('hidden');
}
function showTitle() { mode = 'title'; $('end').classList.add('hidden'); $('hud').classList.add('hidden'); $('title').classList.remove('hidden'); renderLevels(); }
$('btnRetry').onclick = () => startLevel(level);
$('btnLevels').onclick = () => showTitle();

/* ---------------- input ---------------- */
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return; keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (mode !== 'fly') return;
  if (e.code === 'KeyG' && !P.ground && PD().retract) { P.gear = !P.gear; toast(P.gear ? '⬇ גלגלים בחוץ' : '⬆ גלגלים בפנים', 1200); }
  if (e.code === 'KeyB') P.brakes = !P.brakes;
  if (e.code === 'KeyA') { P.ap = !P.ap; toast(P.ap ? '🤖 טייס אוטומטי: טס אל היעד' : 'טייס אוטומטי כבוי', 1600); }
  if (e.code === 'KeyC') { camMode = (camMode + 1) % 3; toast(['🎥 מצלמה מאחור', '👨‍✈️ תא טייס', '🎥 מצלמה מהצד'][camMode], 1200); }
  if (e.code === 'KeyR') { P.easy = !P.easy; store.set('flypt.flightEasy', P.easy ? '1' : '0'); toast(P.easy ? '🎮 שליטה קלה: חצים = פנייה וטיפוס, עזיבה = טיסה ישרה' : '🛩️ שליטה ריאליסטית: הטיה והגבהה כמו במטוס אמיתי', 2600); }
  if (e.code === 'KeyT') { todI = (todI + 1) % TOD.length; applyTod(); }
  if (e.code === 'KeyM') sound.setMuted(!sound.muted);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
{
  const stick = $('stick'), knob = $('stickKnob'); let id = null, cx = 0, cy = 0;
  const move = (e) => { if (e.pointerId !== id) return; let dx = e.clientX - cx, dy = e.clientY - cy; const m = Math.hypot(dx, dy); if (m > 50) { dx *= 50 / m; dy *= 50 / m; } knob.style.transform = `translate(${dx}px,${dy}px)`; touch.x = dx / 50; touch.y = -dy / 50; };
  stick.addEventListener('pointerdown', (e) => { id = e.pointerId; const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; stick.setPointerCapture(id); move(e); });
  stick.addEventListener('pointermove', move); stick.addEventListener('pointerup', () => { id = null; touch.x = touch.y = 0; knob.style.transform = ''; });
  $('btnThrUp').addEventListener('pointerdown', () => { touch.thrUp = true; }); $('btnThrUp').addEventListener('pointerup', () => { touch.thrUp = false; });
  $('btnThrDn').addEventListener('pointerdown', () => { touch.thrDn = true; }); $('btnThrDn').addEventListener('pointerup', () => { touch.thrDn = false; });
}

/* ---------------- flight model ---------------- */
const pos = new THREE.Vector3(), E = new THREE.Vector3(), N = new THREE.Vector3(), U = new THREE.Vector3(), fwd = new THREE.Vector3(), down = new THREE.Vector3();
let gT = 0;
function sampleGround() {
  // distance straight down to the real surface (null until tiles under us have loaded)
  toWorld(P.lat, P.lon, P.alt, pos); enuAt(P.lat, P.lon, E, N, U);
  down.copy(U).negate(); const from = pos.clone().addScaledVector(U, 3);
  const hit = tiles.hitAlong(from, down, 20000);
  return hit ? hit.distance - 3 : null;
}
function simulate(dt) {
  if (!P.placed) { gT -= dt; if (gT <= 0) { gT = 0.25; const g = sampleGround(); if (g !== null) { P.agl = g; P.placed = true; P.alt -= g - plane.gearHeight; P.agl = plane.gearHeight; } } return; } // wait for the runway to load
  const k = keys, c = input.ctl;
  const rollIn = clamp((k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0) + touch.x + c.x, -1, 1);
  const pitchIn = clamp((k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0) + touch.y + c.y, -1, 1); // ↑ = nose up, same as the bird game
  const manual = Math.abs(rollIn) > 0.05 || Math.abs(pitchIn) > 0.05;
  if (manual && P.ap) { P.ap = false; toast('טייס אוטומטי כבוי', 1000); }
  if (k.KeyW || touch.thrUp || c.boost) P.thr = Math.min(1, P.thr + dt * 0.45);
  if (k.KeyS || touch.thrDn) P.thr = Math.max(0, P.thr - dt * 0.45);

  const Bp = LND;
  const dist = gcDist(P.lat, P.lon, Bp.lat, Bp.lon);
  let tRoll = rollIn * 1.0, tPitchRate = pitchIn * 0.45;
  // easy mode: ←/→ turn directly (bank is cosmetic), ↑/↓ climb/descend, release = level flight at this altitude
  const easy = P.easy && !P.ap && !P.ground;
  if (easy) {
    P.turnRate = rollIn * PD().turn;
    tRoll = clamp(P.turnRate * Math.max(P.v, 60) / 9.81 / 2.2, -0.6, 0.6);
    let vsT;
    if (Math.abs(pitchIn) > 0.05) { vsT = pitchIn * 16; P.altHold = null; } else { if (P.altHold === null) P.altHold = P.alt; vsT = clamp((P.altHold - P.alt) * 0.4, -8, 8); }
    // approach assist: gear down + on the runway axis → fly the 3° glide path and hold ~150 kt automatically
    const finalCone = (P.along ?? 1e9) > 300 && P.along < 24000 && Math.abs(P.cross) < Math.max(700, P.along * 0.5);
    if (P.gear && finalCone && Math.abs(pitchIn) < 0.05 && destElev !== null) {
      const glide = destElev + P.along * 0.0524 + 15;
      vsT = clamp((glide - P.alt) * 0.35 - P.v * 0.0524, -12, 4); P.altHold = null;
      P.thr = clamp(P.thr + (PD().vApproach - P.v) * 0.03 * dt * 10, 0, 1); P.assist = true;
    } else P.assist = false;
    // landing assist: gear down, close to the runway and low → settle gently instead of holding altitude
    const dLand = gcDist(P.lat, P.lon, LND.lat, LND.lon);
    const overRwy = (P.along ?? 1e9) <= 300 && P.along > -LND.len && Math.abs(P.cross ?? 1e9) < 220;
    if (P.gear && pitchIn < 0.05 && (overRwy || (dLand < 7000 && (P.agl ?? 999) < 60))) { vsT = Math.min(vsT, -Math.max(1.0, (P.agl ?? 30) * 0.1)); P.altHold = null; }
    tPitchRate = (Math.asin(clamp(vsT / Math.max(P.v, 40), -0.35, 0.35)) - P.pitch) * 2.5;
  }
  // approach geometry relative to the destination runway axis (metres): along > 0 = on the approach side
  const rw = Bp.rwy * D2R, cosLat = Math.cos(P.lat * D2R);
  const dn = (P.lat - Bp.lat) * 111132, de = (P.lon - Bp.lon) * 111320 * cosLat;
  const along = -(de * Math.sin(rw) + dn * Math.cos(rw)), cross = de * Math.cos(rw) - dn * Math.sin(rw);
  P.along = along; P.cross = cross;
  for (const r of rings) if (!r.passed && along < r.d && destElev !== null) { r.passed = true; if (Math.abs(cross) < 350 && Math.abs(P.alt - (r.h ?? P.alt)) < 220) { r.hit = true; sound.collect(rings.indexOf(r)); } }
  if (P.ap && !P.ground) {
    // near the field, trust the measured ground under us over the precomputed airport height
    const gnd = P.agl !== null && dist < 9000 ? P.alt - P.agl : destElev ?? (P.alt - (P.agl ?? 1000));
    const onFinal = along > 300 && along < 22000 && Math.abs(cross) < Math.max(600, along * 0.45);
    let hdgT, altT;
    if (onFinal) {
      // localizer: steer back onto the centreline, glideslope: 3°
      hdgT = rw - clamp(cross / (along * 0.25 + 400), -0.6, 0.6); // right of centreline → turn left
      altT = gnd + along * 0.0524 + 15;
    } else if (along <= 300 && dist < 4000) {
      hdgT = rw; altT = gnd; // over the runway: hold heading, let it settle
    } else {
      const [ela, elo] = gcDest(Bp.lat, Bp.lon, rw + Math.PI, 16000); // final approach fix
      hdgT = gcBearing(P.lat, P.lon, ela, elo);
      const dFix = gcDist(P.lat, P.lon, ela, elo);
      altT = gnd + Math.min(PD().cruiseAlt, 16000 * 0.0524 + dFix * 0.052) + 30;
    }
    let dh = hdgT - P.hdg; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); P.apDh = dh; tRoll = clamp(dh * 1.6, -0.45, 0.45) / (P.warp > 2 ? 3 : 1);
    let wantPitch = clamp((altT - P.alt) / 500, -0.11, 0.2);
    const low = dist < 6000 && (P.agl ?? 99) < 20;
    if (low || (along <= 300 && dist < 4000)) { const vsT = -Math.max(1.1, (P.agl ?? 30) * 0.13); wantPitch = Math.asin(clamp(vsT / Math.max(P.v, 40), -0.2, 0.2)); } // flare: sink rate shrinks with height
    const flare = low;
    tPitchRate = (wantPitch - P.pitch) * (flare ? 3 : 1.5);
    const vT = onFinal || dist < 6000 ? PD().vApproach : PD().vCruise;
    P.thr = flare ? ((P.agl ?? 0) > 8 && P.v < PD().vApproach - 4 ? 0.18 : 0) : clamp(P.thr + (vT - P.v) * 0.02 * dt * 10, onFinal ? 0 : 0.2, 1);
    if (dist < 25000 && !P.gear) { P.gear = true; toast('🤖 גלגלים למטה', 1400); }
  }
  if (P.ap && P.ground && !P.landedAtDest) { P.thr = Math.min(1, P.thr + dt * 0.6); P.brakes = false; if (P.v > PD().vRotate + 2) tPitchRate = (0.16 - P.pitch) * 1.5; } // auto takeoff
  if (P.ap && !P.ground && P.gear && PD().retract && (P.agl ?? 0) > 150 && dist > 20000) { P.gear = false; }
  // attitude
  if (P.ground) { tRoll = 0; P.roll = damp(P.roll, 0, 6, dt); P.hdg += rollIn * 0.7 * dt * clamp(P.v / 8, 0, 1) / (1 + P.v / 60); }
  else P.roll = damp(P.roll, tRoll, 3.2, dt);
  const authority = clamp(P.v / 80, 0, 1);
  P.pitch += tPitchRate * authority * dt;
  const stall = !P.ground && P.v < PD().vStall;
  if (stall) P.pitch = damp(P.pitch, -0.25, 0.8, dt);
  P.pitch = clamp(P.pitch, P.ground ? 0 : -0.5, 0.42);
  if (P.ground && P.v < PD().vRotate) P.pitch = damp(P.pitch, 0, 4, dt); // can't rotate before rotation speed
  if (P.ground && !P.ap && P.v >= PD().vRotate && Math.abs(pitchIn) < 0.05 && !P.rotHint) { P.rotHint = true; toast('↑ עכשיו! הרימו את האף להמראה', 2000); }
  if (easy) P.hdg += P.turnRate * dt * Math.min(P.warp, 4);
  else if (!P.ground) P.hdg += (3 * 9.81 * Math.tan(P.roll) / Math.max(P.v, 45) + rollIn * 0.12) * dt * Math.min(P.warp, 4); // game-tuned turn rate (≈3× a real airliner); turns speed up with the time-lapse too
  if (P.ap && !P.ground && P.warp > 2 && P.apDh !== undefined) P.hdg += clamp(P.apDh, -0.5 * dt, 0.5 * dt); // in fast-forward the autopilot steers the track directly
  P.hdg = (P.hdg + Math.PI * 2) % (Math.PI * 2);

  // speed
  const thrust = P.thr * PD().thrust, drag = PD().drag * P.v * P.v * (P.gear && PD().retract ? 1.35 : 1), grav = 9.81 * Math.sin(P.pitch);
  let acc = thrust - drag - grav;
  if (P.ground) acc -= (P.brakes ? 4.5 : 0.25) * Math.sign(P.v);
  P.v = Math.max(0, P.v + acc * dt);

  // vertical
  const climb = P.v * Math.sin(P.pitch) - (stall ? (PD().vStall - P.v) * 0.4 : 0);
  P.vs = P.ground ? 0 : climb;
  // time compression in cruise, easing off near the destination
  const aglNow = P.agl ?? 9999;
  const warpAlt = !P.ground && aglNow > 300 ? 1 + (aglNow - 300) / (PD().cruiseAlt / PD().warpMax) : 1; // full time-lapse at cruise altitude
  const warpDst = Math.max(1, (dist - 18000) / 700);
  P.warp = clamp(Math.min(warpAlt, warpDst), 1, PD().warpMax);
  if (!P.ground && (P.along ?? 0) > 5000 && P.along < 30000 && Math.abs(P.cross ?? 1e9) < Math.max(1500, P.along * 0.5)) P.warp = Math.max(P.warp, clamp((P.along - 4000) / (PD().vApproach * 28), 1, 14)); // shorten the long final
  const horiz = P.v * Math.cos(P.pitch) * dt * P.warp;
  const [la, lo] = gcDest(P.lat, P.lon, P.hdg, horiz); P.lat = la; P.lon = lo;
  P.alt += P.vs * dt * P.warp; // time-lapse: same factor vertically keeps climb/descent angles true

  // ground contact
  gT -= dt;
  if (gT <= 0) { gT = 0.08; const g = sampleGround(); if (g !== null) { P.agl = g; P.placed = true; } }
  else if (P.agl !== null) P.agl -= P.vs * dt * P.warp;
  if (!P.placed) { P.alt = damp(P.alt, P.alt, 1, dt); return; }
  const gearH = P.gear ? plane.gearHeight : 1.5;
  if (P.ground) {
    P.alt -= P.agl - gearH; P.agl = gearH;
    if (P.pitch > 0.05 && P.v > PD().vRotate) { P.ground = false; toast(PD().retract ? '🛫 המראה! הכניסו גלגלים (G) ועלו לגובה' : '🛫 המראה! עלו לגובה', 2600); }
    if (P.landedAtDest) { P.thr = 0; P.brakes = true; }
    if (P.landedAtDest && P.v < 18) { endLevel(true); return; }
  } else if (P.agl !== null && P.agl < gearH) {
    const vs = P.vs; P.touchVs = vs;
    const nearDest = dist < 5000;
    if (!P.gear) return endLevel(false, 'נחתתם בלי גלגלים 😬');
    if (vs < -6 || Math.abs(P.roll) > 0.35 || P.pitch < -0.15) return endLevel(false, 'נחיתה קשה מדי 💥');
    P.ground = true; P.alt -= P.agl - gearH; P.agl = gearH; P.pitch = Math.max(0, P.pitch);
    input.rumble(0.4, 0.6, 200);
    if (nearDest) { P.landedAtDest = true; P.brakes = true; P.offRwy = Math.abs(P.cross) > 70; toast(P.offRwy ? '🛬 נחתתם — אבל ליד המסלול' : `🛬 נגיעה על מסלול ${LND.ref}! ${Math.round(-vs * 197)} רגל/דקה · בולמים…`, 2500); }
    else toast('נחתתם רחוק מהיעד — המריאו שוב', 2000);
  }
  if (!P.ground && P.agl !== null && P.agl < 1 && !P.gear) endLevel(false, 'התרסקות 💥');

  // approach rings
  if (destElev === null && dist < 30000) {
    const top = toWorld(Bp.lat, Bp.lon, 3000); enuAt(Bp.lat, Bp.lon, E, N, U); const hit = tiles.hitAlong(top, U.clone().negate(), 6000);
    if (hit) { destElev = 3000 - hit.distance; }
  }
  if (destElev !== null) for (const r of rings) r.h = destElev + r.d * Math.tan(3 * D2R) + 20;
  sound.wind(P.v * 0.25 + P.thr * 20, P.thr > 0.9);
  // detail follows height: sharpest near the ground, lighter at cruise (and while fast-forwarding)
  const et = (P.agl ?? 0) < 1500 ? 3 : P.warp > 5 ? 14 : 8; if (tiles.tiles.errorTarget !== et) tiles.tiles.errorTarget = et;
}

/* ---------------- render helpers ---------------- */
const camPos = new THREE.Vector3(), camOff = new THREE.Vector3(), wantOff = new THREE.Vector3(), flat = new THREE.Vector3(), look = new THREE.Vector3(), qRoll = new THREE.Quaternion(), M4 = new THREE.Matrix4();
function placePlane(dt) {
  toWorld(P.lat, P.lon, P.alt, pos); enuAt(P.lat, P.lon, E, N, U);
  fwd.copy(N).multiplyScalar(Math.cos(P.hdg)).addScaledVector(E, Math.sin(P.hdg)).multiplyScalar(Math.cos(P.pitch)).addScaledVector(U, Math.sin(P.pitch)).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, U).normalize(), up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  M4.makeBasis(right, up, fwd.clone().negate()); plane.root.quaternion.setFromRotationMatrix(M4);
  qRoll.setFromAxisAngle(new THREE.Vector3(0, 0, -1), -P.roll); plane.root.quaternion.multiply(qRoll);
  plane.root.position.copy(pos); plane.update(dt, { gear: P.gear, thr: P.thr, v: P.v, t: performance.now() / 1000 });
  // camera
  camera.up.copy(U);
  flat.copy(N).multiplyScalar(Math.cos(P.hdg)).addScaledVector(E, Math.sin(P.hdg));
  if (camMode === 0) { camPos.copy(pos).addScaledVector(flat, -PD().cam.back).addScaledVector(U, PD().cam.up); look.copy(pos).addScaledVector(fwd, PD().cam.back * 0.65).addScaledVector(U, PD().cam.up * 0.25); }
  else if (camMode === 1) { const [cx, cy, cz] = PD().cam.cockpit; camPos.copy(pos).addScaledVector(right, cx).addScaledVector(up, cy).addScaledVector(fwd, -cz); look.copy(camPos).addScaledVector(fwd, 200); camera.up.copy(up); }
  else { camPos.copy(pos).addScaledVector(right, 60).addScaledVector(U, 8).addScaledVector(fwd, -20); look.copy(pos); }
  wantOff.subVectors(camPos, pos);
  if (camMode === 1 || camSnap) { camOff.copy(wantOff); camSnap = false; } else camOff.lerp(wantOff, 1 - Math.exp(-dt * 5));
  camera.position.copy(pos).add(camOff); // follow as an offset, so time-lapse and re-anchoring never leave the camera behind
  camera.lookAt(look);
  plane.root.visible = camMode !== 1 || PD().id === 'light'; // light plane: you can see the wing overhead from the seat
  document.body.classList.toggle('cockpit', camMode === 1); document.body.dataset.plane = PD().id;
  // rings & destination
  for (const r of rings) { r.mesh.visible = destElev !== null && !r.passed; if (r.mesh.visible) { toWorld(r.lat, r.lon, r.h, r.mesh.position); enuAt(r.lat, r.lon, E, N, U); const a = LND.rwy * D2R; const dir = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(E, Math.sin(a)); r.mesh.lookAt(r.mesh.position.clone().add(dir)); } }
  sky.position.copy(camera.position);
  sunLight.position.copy(camera.position).addScaledVector(sunDir, 5000); sunLight.target.position.copy(camera.position);
}

const PX = 3.2; let hudT = 0;
{ const CARD = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }; let h = ''; for (let d = -180; d <= 540; d += 15) { const n = ((d % 360) + 360) % 360; h += CARD[n] !== undefined ? `<span class="card${n === 0 ? ' n' : ''}" style="left:${d * PX}px">${CARD[n]}</span>` : `<span style="left:${d * PX}px">${n}</span>`; } $('compassTape').innerHTML = h + '<span class="goal" id="goal">◆</span>'; }
const adi = $('adi').getContext('2d');
function drawAdi() {
  const g = adi, S = 240, R = S / 2; g.clearRect(0, 0, S, S); g.save(); g.beginPath(); g.arc(R, R, R - 4, 0, Math.PI * 2); g.clip();
  g.translate(R, R); g.rotate(-P.roll); const off = P.pitch * 260;
  g.fillStyle = '#3e8ee8'; g.fillRect(-S, -S * 2 + off, S * 2, S * 2); g.fillStyle = '#8a5a2b'; g.fillRect(-S, off, S * 2, S * 2);
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(-S, off); g.lineTo(S, off); g.stroke();
  g.font = '700 12px JetBrains Mono'; g.fillStyle = '#fff'; g.textAlign = 'center';
  for (const d of [-20, -10, 10, 20]) { const y = off - d * D2R * 260; g.beginPath(); g.moveTo(-30, y); g.lineTo(30, y); g.stroke(); g.fillText(String(Math.abs(d)), 44, y + 4); }
  g.restore();
  g.strokeStyle = '#ffd36b'; g.lineWidth = 4; g.beginPath(); g.moveTo(R - 50, R); g.lineTo(R - 15, R); g.lineTo(R, R + 10); g.lineTo(R + 15, R); g.lineTo(R + 50, R); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.beginPath(); g.arc(R, R, R - 4, 0, Math.PI * 2); g.stroke();
}
const v3 = new THREE.Vector3();
function hud(dt) {
  const hdg = (P.hdg / D2R + 360) % 360; $('compassTape').style.transform = `translateX(${-hdg * PX}px)`;
  const Bp = LND, dist = gcDist(P.lat, P.lon, Bp.lat, Bp.lon);
  let brg = (gcBearing(P.lat, P.lon, Bp.lat, Bp.lon) / D2R + 360) % 360; while (brg - hdg > 180) brg -= 360; while (hdg - brg > 180) brg += 360; $('goal').style.left = `${brg * PX}px`;
  // destination marker
  toWorld(Bp.lat, Bp.lon, destElev ?? 50, v3).project(camera); const W = innerWidth, H = innerHeight; const behind = v3.z > 1;
  let x = (v3.x * 0.5 + 0.5) * W, y = (-v3.y * 0.5 + 0.5) * H; if (behind) { x = W - x; y = H - y; }
  const m = 60, mx = W > 900 ? 170 : 60; if (behind || x < mx || x > W - mx || y < m || y > H - m) { const cx = W / 2, cy = H / 2, dx = x - cx, dy = y - cy || 1, k = Math.min((W / 2 - mx) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy)); x = cx + dx * k; y = cy + dy * k; }
  mk.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%)`; mk.querySelector('.d').textContent = dist > 1000 ? `${Math.round(dist / 1000)} ק״מ` : `${Math.round(dist)} מ׳`;
  hudT += dt; if (hudT < 0.1) return; hudT = 0;
  $('headingDeg').textContent = String(Math.round(hdg) % 360).padStart(3, '0') + '°'; $('headingCard').textContent = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(hdg / 45) % 8];
  $('altVal').textContent = Math.round(P.alt * 3.281).toLocaleString('he-IL');
  $('aglVal').textContent = P.agl !== null && P.agl < 20000 ? `מעל הקרקע ${Math.round(P.agl).toLocaleString('he-IL')} מ׳` : '';
  $('vsVal').textContent = `${P.vs >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(P.vs * 197)).toLocaleString('he-IL')} רגל/דקה`;
  $('spdVal').textContent = Math.round(P.v * 1.944); $('thrBar').style.width = `${P.thr * 100}%`;
  $('gearVal').textContent = P.gear ? '⬇ גלגלים בחוץ' : '⬆ גלגלים בפנים';
  $('flProg').style.width = `${clamp(1 - dist / P.dist0, 0, 1) * 100}%`;
  $('flDist').textContent = `${Math.round(dist / 1000).toLocaleString('he-IL')} ק״מ ליעד`;
  const gs = P.v * Math.cos(P.pitch) * P.warp; $('flEta').textContent = gs > 5 ? `⏱ ${fmt(dist / gs)}` : '';
  $('flWarp').textContent = P.warp > 1.5 ? `⏩ ×${Math.round(P.warp)}` : '';
  const passed = rings.filter((r) => r.hit).length;
  // steering guide: towards the final-approach fix, then down the runway centreline
  let guide = '';
  if (!P.ground && !P.ap && P.placed) {
    const onFinal = (P.along ?? 1e9) > 300 && P.along < 22000 && Math.abs(P.cross) < Math.max(600, P.along * 0.45);
    const [fla, flo] = gcDest(LND.lat, LND.lon, LND.rwy * D2R + Math.PI, 16000);
    const tgtH = onFinal ? LND.rwy * D2R - clamp(P.cross / (P.along * 0.25 + 400), -0.6, 0.6) : gcBearing(P.lat, P.lon, fla, flo);
    const dh = Math.atan2(Math.sin(tgtH - P.hdg), Math.cos(tgtH - P.hdg)) / D2R;
    guide = Math.abs(dh) < 6 ? '✓ בכיוון הנכון' : `${dh > 0 ? '→ פנו ימינה' : '← פנו שמאלה'} ${Math.round(Math.abs(dh))}°`;
    // vertical cue along the same 3° profile the autopilot flies (only once we're within reach of the field)
    if (dist < 140000) {
      const gnd = destElev ?? (P.alt - (P.agl ?? 0));
      const dFix = gcDist(P.lat, P.lon, fla, flo);
      const tgt = onFinal ? gnd + P.along * 0.0524 + 15 : gnd + Math.min(PD().cruiseAlt, 16000 * 0.0524 + dFix * 0.052) + 30;
      const e = P.alt - tgt, tol = onFinal ? 50 : 250;
      if (e > tol) guide += ' · ⬇ רדו'; else if (e < -tol) guide += ' · ⬆ עלו';
    }
    if (dist < 45000 && P.v > (onFinal ? PD().vApproach : PD().vCruise) * 1.15) guide += ' · 🐢 האטו (S)';
    if (dist < 25000 && !P.gear && PD().retract) guide += ' · ⬇ גלגלים (G)!';
  }
  const overRwy = !P.ground && (P.along ?? 1e9) <= 300 && P.along > -LND.len && Math.abs(P.cross ?? 1e9) < 220;
  if (overRwy) guide = P.gear ? `🛬 ישר על המסלול ${LND.ref} — נוחתים` : '⬇ גלגלים (G)! אתם מעל המסלול';
  if (P.assist) guide = guide.replace(/ · ⬇ רדו| · ⬆ עלו| · 🐢 האטו \(S\)/g, '') + ' · 🛬 מסלול גלישה אוטומטי';
  if (P.ground && P.landedAtDest) guide = `🛬 על מסלול ${LND.ref} — בולמים…`;
  $('flStatus').textContent = guide && (P.landedAtDest || !(P.v < PD().vStall + 5)) ? guide + (dist < 30000 ? ` · 🛬 מסלול ${LND.ref}` : '') : !P.placed ? '⏳ טוען את שדה התעופה…' : P.ground && P.v < 5 && !P.landedAtDest ? `W = גז · כשמגיעים ל־${PD().ktRotate} קשר — ↑ להרמת האף` : P.ap ? '🤖 טייס אוטומטי' : P.v < PD().vStall + 3 && !P.ground ? '⚠️ מהירות נמוכה — הגבירו מנוע!' : dist < 30000 && destElev !== null ? `🛬 עברו דרך הטבעות (${passed}/${rings.length}) · גלגלים למטה · מהירות < 170 קשר` : dist < 150000 ? 'התחילו לרדת לקראת הנחיתה' : 'שייט — A לטייס אוטומטי';
  drawAdi();
}

/* ---------------- loop ---------------- */
const clock = new THREE.Clock(); let titleT = 0;
function step(dt) {
  if (tiles) tiles.update(dt);
  if (mode === 'title') {
    titleT += dt;
    if (tiles && tiles.tiles.root) { const a = titleT * 0.03; const c = toWorld(AP.TLV.lat, AP.TLV.lon, 0); enuAt(AP.TLV.lat, AP.TLV.lon, E, N, U); camera.up.copy(U); camera.position.copy(c).addScaledVector(E, Math.cos(a) * 9000).addScaledVector(N, Math.sin(a) * 9000).addScaledVector(U, 3500); camera.lookAt(c); sky.position.copy(camera.position); }
  } else if (mode === 'fly' && tiles) {
    simulate(dt); rebase(false); placePlane(dt); hud(dt);
  } else if (mode === 'end' && tiles) { placePlane(dt); }
  composer.render();
}
function frame() { requestAnimationFrame(frame); step(Math.min(clock.getDelta(), 0.05)); }
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });
if (import.meta.env.DEV) window.__fl = { P, camera, get tiles() { return tiles; }, get mode() { return mode; }, step: (n = 60) => { for (let i = 0; i < n; i++) step(1 / 60); }, startLevel, keys };

// boot: show levels; load the globe around Tel Aviv for the title flyover
renderLevels(); startGlobe(AP.TLV.lat, AP.TLV.lon);
{ let n = 0; const iv = setInterval(() => { n++; if (!gKey()) { $('loader').classList.add('done'); return; } const L = tiles?.tiles.stats.loaded || 0; $('loaderFill').style.width = `${Math.min(100, L / 2)}%`; $('loaderText').textContent = `טוען את כדור הארץ… ${L}`; if (L > 200 || n > 60) { clearInterval(iv); $('loader').classList.add('done'); } }, 400); }
frame();
