import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { carParts } from './block.js';

/**
 * Street life around the player: cars driving the real road network (right-hand traffic)
 * and pedestrians walking the sidewalks. Agents live in a bubble around the camera and
 * respawn ahead when they drift too far, so the cost is constant anywhere in the city.
 */
const rnd = Math.random;

export function createStreetLife({ scene, data, blocked }) {
  // ---------- road graph: segments + endpoint connectivity ----------
  const roads = data.r.map((r) => ({ w: r[0], cls: r[1], p: r.slice(3) })).filter((r) => r.p.length >= 4);
  const key = (x, z) => `${Math.round(x / 3)},${Math.round(z / 3)}`;
  const ends = new Map();
  roads.forEach((r, i) => {
    for (const [end, idx] of [[0, 0], [1, r.p.length - 2]]) { const k = key(r.p[idx], r.p[idx + 1]); if (!ends.has(k)) ends.set(k, []); ends.get(k).push({ i, end }); }
  });
  // spatial index of segments for spawning
  const SEG = []; roads.forEach((r, i) => { for (let s = 0; s + 3 < r.p.length; s += 2) SEG.push({ i, s }); });
  const B = 150, bucket = new Map();
  SEG.forEach((g, n) => { const r = roads[g.i]; const k = `${Math.floor(r.p[g.s] / B)},${Math.floor(r.p[g.s + 1] / B)}`; if (!bucket.has(k)) bucket.set(k, []); bucket.get(k).push(n); });
  const segsNear = (x, z, R) => { const out = []; const gx = Math.floor(x / B), gz = Math.floor(z / B), n = Math.ceil(R / B); for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) { const l = bucket.get(`${gx + i},${gz + j}`); if (l) out.push(...l); } return out; };

  // an agent walks a polyline: road i, segment s (index into p), t along segment, dir ±1
  const place = (a) => {
    const r = roads[a.i], p = r.p;
    const ax = p[a.s], az = p[a.s + 1], bx = p[a.s + 2], bz = p[a.s + 3];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const ux = dx / L * a.dir, uz = dz / L * a.dir; // travel direction
    const rx = -uz, rz = ux;                         // right-hand side
    a.x = ax + dx * a.t + rx * a.off; a.z = az + dz * a.t + rz * a.off; a.yaw = Math.atan2(-ux, -uz); a.L = L;
  };
  const advance = (a, dist) => {
    let guard = 0;
    while (dist > 0 && guard++ < 8) {
      const r = roads[a.i], p = r.p; const L = Math.hypot(p[a.s + 2] - p[a.s], p[a.s + 3] - p[a.s + 1]) || 1;
      const left = (a.dir > 0 ? 1 - a.t : a.t) * L;
      if (dist < left) { a.t += a.dir * dist / L; break; }
      dist -= left;
      const ns = a.s + a.dir * 2;
      if (ns >= 0 && ns + 3 < p.length) { a.s = ns; a.t = a.dir > 0 ? 0 : 1; continue; }
      // end of this road: continue on a connected road (or turn back)
      const ex = a.dir > 0 ? p[p.length - 2] : p[0], ez = a.dir > 0 ? p[p.length - 1] : p[1];
      const opts = (ends.get(key(ex, ez)) || []).filter((o) => o.i !== a.i && (!a.car || roads[o.i].cls >= 0));
      if (opts.length) { const o = opts[Math.floor(rnd() * opts.length)]; const q = roads[o.i].p; a.i = o.i; a.dir = o.end === 0 ? 1 : -1; a.s = o.end === 0 ? 0 : q.length - 4; a.t = o.end === 0 ? 0 : 1; a.off = a.car ? a.laneFn(roads[o.i].w) : a.off; }
      else { a.dir *= -1; a.t = a.dir > 0 ? 0 : 1; }
    }
    place(a);
  };
  const spawn = (a, cx, cz, rMin, rMax) => {
    const cand = segsNear(cx, cz, rMax);
    for (let tries = 0; tries < 12 && cand.length; tries++) {
      const g = SEG[cand[Math.floor(rnd() * cand.length)]], r = roads[g.i];
      if (a.car && r.cls > 3) continue;
      const x = r.p[g.s], z = r.p[g.s + 1], d = Math.hypot(x - cx, z - cz);
      if (d < rMin || d > rMax) continue;
      a.i = g.i; a.s = g.s; a.t = rnd(); a.dir = rnd() < 0.5 ? 1 : -1;
      a.off = a.car ? a.laneFn(r.w) : (r.w / 2 + 2.2) * (rnd() < 0.5 ? 1 : -1);
      place(a); return true;
    }
    return false;
  };

  // ---------- cars ----------
  const NC = 170, parts = carParts();
  const CAR_C = ['#dedfe0', '#e6e4df', '#d0d3d7', '#9ea3a8', '#2b2d31', '#1f3b66', '#8a1d22', '#e7e2d6', '#5a6069', '#d9a400'];
  const mk = (g, m, n) => { const x = new THREE.InstancedMesh(g, m, n); x.instanceMatrix.setUsage(THREE.DynamicDrawUsage); x.frustumCulled = false; return x; };
  const cBody = mk(parts.body, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.25, envMapIntensity: 0.6 }), NC);
  const cGlass = mk(parts.glass, new THREE.MeshStandardMaterial({ color: '#1a232d', roughness: 0.08, metalness: 0.9 }), NC);
  const cWheel = mk(parts.wheels, new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.9 }), NC);
  const cLight = mk(parts.lights, new THREE.MeshStandardMaterial({ color: '#fff4e0', emissive: '#ffd9a8', emissiveIntensity: 0.35 }), NC);
  cBody.castShadow = true;
  const cars = Array.from({ length: NC }, (_, n) => ({ car: true, v: 8 + rnd() * 6, laneFn: (w) => Math.max(1.6, w / 4), alive: false }));
  const col = new THREE.Color(); cars.forEach((_, n) => cBody.setColorAt(n, col.set(CAR_C[n % CAR_C.length])));

  // ---------- pedestrians (instanced, legs swing in the vertex shader) ----------
  const NP = 240;
  const torsoG = mergeGeometries([new THREE.BoxGeometry(0.44, 0.58, 0.24).translate(0, 1.22, 0), new THREE.BoxGeometry(0.11, 0.55, 0.11).translate(-0.29, 1.2, 0), new THREE.BoxGeometry(0.11, 0.55, 0.11).translate(0.29, 1.2, 0)]);
  const headG = mergeGeometries([new THREE.SphereGeometry(0.14, 8, 6).translate(0, 1.66, 0), new THREE.SphereGeometry(0.146, 8, 6, 0, Math.PI * 2, 0, 1.4).translate(0, 1.69, 0.01)]);
  const legL = new THREE.BoxGeometry(0.15, 0.92, 0.15).translate(-0.11, 0.46, 0), legR = new THREE.BoxGeometry(0.15, 0.92, 0.15).translate(0.11, 0.46, 0);
  const side = (g, v) => { g.setAttribute('aSide', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(v), 1)); return g; };
  const legsG = mergeGeometries([side(legL, 1), side(legR, -1)]);
  const phase = new THREE.InstancedBufferAttribute(new Float32Array(NP), 1); legsG.setAttribute('aPhase', phase);
  const time = { value: 0 };
  const legMat = new THREE.MeshStandardMaterial({ color: '#2f3442', roughness: 0.9 });
  legMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSide; attribute float aPhase; uniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float a = sin(uTime * 7.0 + aPhase) * 0.45 * aSide; float py = 0.92;
        float y = transformed.y - py, z = transformed.z;
        transformed.y = py + y * cos(a) - z * sin(a); transformed.z = y * sin(a) + z * cos(a);`);
  };
  const pTorso = mk(torsoG, new THREE.MeshStandardMaterial({ roughness: 0.8 }), NP);
  const pHead = mk(headG, new THREE.MeshStandardMaterial({ roughness: 0.7 }), NP);
  const pLegs = mk(legsG, legMat, NP);
  pTorso.castShadow = true;
  const SHIRT = ['#e85d5d', '#3d7fd6', '#f2f2f2', '#2f9e6a', '#f2c14e', '#8f5bd6', '#1f2533', '#ff8a4c', '#5fb6c9'];
  const SKIN = ['#f1c7a3', '#e0ac84', '#c68e63', '#8d5a3b', '#f6d5b8'];
  const HAIR = ['#2a1d16', '#3b2a1f', '#6b4a2a', '#111', '#c9a26b'];
  const peds = Array.from({ length: NP }, (_, n) => { phase.setX(n, rnd() * 6.28); pTorso.setColorAt(n, col.set(SHIRT[n % SHIRT.length])); pHead.setColorAt(n, col.set(SKIN[n % SKIN.length])); return { car: false, v: 1.1 + rnd() * 0.6, alive: false, ph: rnd() * 6 }; });
  void HAIR;

  const group = new THREE.Group(); group.add(cBody, cGlass, cWheel, cLight, pTorso, pHead, pLegs); scene.add(group);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3(), hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  let enabled = true;
  const update = (dt, cam, t) => {
    time.value = t;
    const show = enabled && cam.y < 380;
    group.visible = show; if (!show) return;
    const cx = cam.x, cz = cam.z;
    for (let n = 0; n < NC; n++) {
      const a = cars[n];
      if (!a.alive || Math.hypot(a.x - cx, a.z - cz) > 750) a.alive = spawn(a, cx, cz, 120, 650);
      if (!a.alive) { cBody.setMatrixAt(n, hidden); cGlass.setMatrixAt(n, hidden); cWheel.setMatrixAt(n, hidden); cLight.setMatrixAt(n, hidden); continue; }
      advance(a, a.v * dt);
      q.setFromAxisAngle(up, a.yaw); ps.set(a.x, 0.02, a.z); M.compose(ps, q, one);
      cBody.setMatrixAt(n, M); cGlass.setMatrixAt(n, M); cWheel.setMatrixAt(n, M); cLight.setMatrixAt(n, M);
    }
    for (let n = 0; n < NP; n++) {
      const a = peds[n];
      if (!a.alive || Math.hypot(a.x - cx, a.z - cz) > 420) a.alive = spawn(a, cx, cz, 30, 380);
      if (!a.alive) { pTorso.setMatrixAt(n, hidden); pHead.setMatrixAt(n, hidden); pLegs.setMatrixAt(n, hidden); continue; }
      const px = a.x, pz = a.z; advance(a, a.v * dt);
      if (blocked(a.x, a.z, 0.3)) { a.x = px; a.z = pz; a.dir *= -1; } // never walk through a wall
      a.ph += dt * 7;
      q.setFromAxisAngle(up, a.yaw); ps.set(a.x, 0.18 + Math.abs(Math.sin(a.ph)) * 0.04, a.z); M.compose(ps, q, one);
      pTorso.setMatrixAt(n, M); pHead.setMatrixAt(n, M); pLegs.setMatrixAt(n, M);
    }
    for (const m of [cBody, cGlass, cWheel, cLight, pTorso, pHead, pLegs]) m.instanceMatrix.needsUpdate = true;
  };
  return { update, setEnabled: (v) => { enabled = v; group.visible = v; } };
}
