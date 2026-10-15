import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Street-level detail around home: footpaths, parking, playgrounds, benches, bins, bottle cages,
 * shop signs, parked cars, 3D balconies, garden walls + hedges, and a real front door at home.
 */
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; };
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });

function ribbon(pts, w, y, P, I) {
  const n = pts.length / 2; if (n < 2) return; const base = P.length / 3;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let dx = pts[b * 2] - pts[a * 2], dz = pts[b * 2 + 1] - pts[a * 2 + 1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    P.push(pts[i * 2] - dz * w / 2, y, pts[i * 2 + 1] + dx * w / 2, pts[i * 2] + dz * w / 2, y, pts[i * 2 + 1] - dx * w / 2);
    if (i) { const k = base + (i - 1) * 2; I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
}
function polyFill(pts, y, P, I) {
  const n = pts.length / 2; const c = []; for (let i = 0; i < n; i++) c.push(new THREE.Vector2(pts[i * 2], pts[i * 2 + 1]));
  let tris; try { tris = THREE.ShapeUtils.triangulateShape(c, []); } catch { return; }
  const base = P.length / 3; for (let i = 0; i < n; i++) P.push(pts[i * 2], y, pts[i * 2 + 1]);
  for (const [a, b, d] of tris) { const cy = (c[b].y - c[a].y) * (c[d].x - c[a].x) - (c[b].x - c[a].x) * (c[d].y - c[a].y); if (cy > 0) I.push(base + a, base + b, base + d); else I.push(base + a, base + d, base + b); }
}
const geo = (P, I) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals(); return g; };

function instanced(geometry, material, list, { colors = null, shadow = true } = {}) {
  const m = new THREE.InstancedMesh(geometry, material, Math.max(1, list.length));
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  list.forEach((it, i) => { p.set(it.x, it.y || 0, it.z); q.setFromAxisAngle(up, it.rot || 0); s.setScalar(it.s || 1); M.compose(p, q, s); m.setMatrixAt(i, M); if (colors) m.setColorAt(i, c.set(colors[i])); });
  m.count = list.length; m.castShadow = shadow; m.receiveShadow = true; return m;
}

/** Low-poly car (faces -Z): body, glass, lights, wheels — shared with moving traffic. */
let _carParts = null;
export function carParts() {
  if (_carParts) return _carParts;
  _carParts = (() => {
    const body = mergeGeometries([
      new THREE.BoxGeometry(1.8, 0.62, 4.3, 2, 1, 4).translate(0, 0.62, 0),
      new THREE.BoxGeometry(1.66, 0.12, 2.25).translate(0, 1.5, 0.15), // roof
      ...[-0.8, 0.8].flatMap((x) => [new THREE.BoxGeometry(0.07, 0.5, 0.08).translate(x, 1.2, -0.95), new THREE.BoxGeometry(0.07, 0.5, 0.08).translate(x, 1.2, 1.25)]), // pillars
    ]);
    { const p = body.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), z = p.getZ(i); if (y > 0.9 && y < 0.95 && Math.abs(z) > 1.5) p.setY(i, y - 0.12); } body.computeVertexNormals(); }
    const glass = new THREE.BoxGeometry(1.6, 0.52, 2.2).translate(0, 1.19, 0.15);
    const lights = mergeGeometries([
      ...[-0.62, 0.62].map((x) => new THREE.BoxGeometry(0.4, 0.14, 0.05).translate(x, 0.78, -2.16)),
      ...[-0.62, 0.62].map((x) => new THREE.BoxGeometry(0.36, 0.14, 0.05).translate(x, 0.8, 2.16)),
    ]);
    const wheels = [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]].map(([x, z]) => new THREE.CylinderGeometry(0.33, 0.33, 0.25, 10).rotateZ(Math.PI / 2).translate(x, 0.33, z));
    return { body, glass, lights, wheels: mergeGeometries(wheels) };
  })();
  return _carParts;
}

export function buildBlock({ scene, data, block, center, homePlate, R = 450 }) {
  const group = new THREE.Group(); scene.add(group);
  const near = (x, z, r = R) => Math.hypot(x - center.x, z - center.z) < r;

  /* ---------------- ground: paths, service roads, areas ---------------- */
  { const P = [], I = [];
    for (const p of block.paths) ribbon(p.p, p.k === 'footway' || p.k === 'steps' ? 2.2 : 3, 0.17, P, I);
    const paths = new THREE.Mesh(geo(P, I), std('#c9bda8', { roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 })); paths.receiveShadow = true; group.add(paths); }
  { const P = [], I = [];
    for (const p of block.service) ribbon(p, 4.2, 0.16, P, I);
    for (const a of block.areas) if (a.k === 'parking') polyFill(a.p, 0.165, P, I);
    const asphalt = new THREE.Mesh(geo(P, I), std('#3b3c41', { roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 })); asphalt.receiveShadow = true; group.add(asphalt); }
  const AREA_C = { playground: '#c65a3c', pitch: '#3f8a4a', school: '#cdbb98' };
  for (const k of Object.keys(AREA_C)) {
    const P = [], I = []; for (const a of block.areas) if (a.k === k) polyFill(a.p, 0.18, P, I);
    if (P.length) { const m = new THREE.Mesh(geo(P, I), std(AREA_C[k], { roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3 })); m.receiveShadow = true; group.add(m); }
  }

  /* ---------------- building helpers ---------------- */
  const nearBuildings = [];
  data.b.forEach((b, bi) => { const x = b[3], z = b[4]; if (near(x, z, R + 60)) nearBuildings.push(bi); });
  const nearestEdge = (x, z, maxD = 6) => {
    let best = null, bd = maxD;
    for (const bi of nearBuildings) {
      const b = data.b[bi], n = (b.length - 3) / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = b[3 + i * 2], az = b[4 + i * 2], bx = b[3 + j * 2], bz = b[4 + j * 2];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; let t = ((x - ax) * dx + (z - az) * dz) / L2; t = Math.max(0, Math.min(1, t));
        const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
        if (d < bd) { const L = Math.sqrt(L2); bd = d; best = { x: px, z: pz, nx: dz / L, nz: -dx / L, bi }; }
      }
    }
    return best;
  };

  /* ---------------- street furniture ---------------- */
  const benchG = mergeGeometries([
    new THREE.BoxGeometry(1.8, 0.06, 0.45).translate(0, 0.45, 0),
    new THREE.BoxGeometry(1.8, 0.4, 0.05).translate(0, 0.72, 0.22),
    new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(-0.8, 0.22, 0), new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(0.8, 0.22, 0),
  ]);
  const binG = new THREE.CylinderGeometry(0.28, 0.24, 0.9, 10).translate(0, 0.45, 0);
  const cageG = mergeGeometries([ // the orange bottle-recycling cage — every Israeli street has one
    new THREE.BoxGeometry(1.1, 1.6, 0.9).translate(0, 0.8, 0),
  ]);
  const tapG = mergeGeometries([new THREE.CylinderGeometry(0.1, 0.12, 0.9, 8).translate(0, 0.45, 0), new THREE.BoxGeometry(0.3, 0.08, 0.2).translate(0.1, 0.85, 0)]);
  const fountainG = mergeGeometries([new THREE.CylinderGeometry(2.2, 2.4, 0.6, 20).translate(0, 0.3, 0), new THREE.CylinderGeometry(0.3, 0.4, 1.4, 10).translate(0, 0.9, 0)]);
  const pick = (k) => block.points.filter((p) => p.k === k).map((p, i) => ({ ...p, rot: hash(i * 7 + k.length) * 6.28 }));
  // orient benches/bins against the nearest facade or footpath if close
  const orient = (list) => list.map((p) => { const e = nearestEdge(p.x, p.z, 8); return e ? { ...p, rot: Math.atan2(e.nx, e.nz) + Math.PI } : p; });
  group.add(instanced(benchG, std('#7a5236', { roughness: 0.7 }), orient(pick('bench'))));
  group.add(instanced(binG, std('#4d6a4a', { roughness: 0.6 }), pick('waste_basket')));
  const cageMat = std('#ff7a1a', { roughness: 0.5, metalness: 0.3, transparent: true, opacity: 0.85 });
  group.add(instanced(cageG, cageMat, orient(pick('recycling'))));
  group.add(instanced(tapG, std('#9aa3ad', { metalness: 0.7, roughness: 0.3 }), pick('drinking_water')));
  group.add(instanced(fountainG, std('#bdb4a6'), pick('fountain')));

  /* ---------------- entrances: door + canopy on the facade ---------------- */
  const doorG = mergeGeometries([
    new THREE.BoxGeometry(1.6, 2.4, 0.08).translate(0, 1.2, 0.05),         // frame/glass
    new THREE.BoxGeometry(2.4, 0.12, 1.3).translate(0, 2.7, 0.6),          // canopy
  ]);
  const doorMat = std('#2c3440', { roughness: 0.2, metalness: 0.6 });
  const doors = [];
  for (const p of block.points.filter((q) => q.k === 'entrance')) { const e = nearestEdge(p.x, p.z, 4); if (e) doors.push({ x: e.x + e.nx * 0.05, z: e.z + e.nz * 0.05, rot: Math.atan2(e.nx, e.nz) }); }
  if (homePlate) doors.push({ x: homePlate.x, z: homePlate.z, rot: Math.atan2(homePlate.nx, homePlate.nz), home: true });
  group.add(instanced(doorG, doorMat, doors));
  // door lamps (warm glow)
  const lampSpr = new THREE.SpriteMaterial({ color: new THREE.Color(2.5, 1.8, 1.1), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, map: (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, '#fff'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })() });
  for (const d of doors) { const s = new THREE.Sprite(lampSpr); s.scale.setScalar(d.home ? 1.6 : 1.1); s.position.set(d.x + Math.sin(d.rot) * 0.9, 2.55, d.z + Math.cos(d.rot) * 0.9); group.add(s); }

  /* ---------------- shop signs ---------------- */
  for (const p of block.points.filter((q) => q.k === 'shop' && q.name)) {
    const e = nearestEdge(p.x, p.z, 12); if (!e) continue;
    const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
    g.fillStyle = '#1d1f26'; g.fillRect(0, 0, 512, 96); g.fillStyle = '#ffd36b'; g.font = '700 54px Rubik, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl'; g.fillText(p.name, 256, 50);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.75), new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.6 }));
    sign.position.set(e.x + e.nx * 0.12, 3.1, e.z + e.nz * 0.12); sign.rotation.y = Math.atan2(e.nx, e.nz); group.add(sign);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.08, 1.4), std(['#b33a3a', '#2f6d9e', '#3f7d4a', '#8a5a2b'][Math.floor(hash(p.x | 0) * 4)]));
    awn.position.set(e.x + e.nx * 0.7, 2.7, e.z + e.nz * 0.7); awn.rotation.y = Math.atan2(e.nx, e.nz); awn.rotateX(0.18); awn.castShadow = true; group.add(awn);
  }

  /* ---------------- parked cars along residential streets ---------------- */
  const carG = carParts();
  const CAR_C = ['#dedfe0', '#e6e4df', '#c9cdd2', '#9ea3a8', '#2b2d31', '#1f3b66', '#8a1d22', '#e7e2d6', '#5a6069'];
  const cars = [];
  let k = 0;
  for (const r of data.r) {
    if (r[1] > 1) continue;
    const p = r.slice(3), w = r[0];
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
      if (!near(ax, az) && !near(bx, bz)) continue;
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 20) continue;
      const nx = -dz / L, nz = dx / L, rot = Math.atan2(dx, dz);
      for (const side of [-1, 1]) for (let t = 9; t < L - 9; t += 5.4) {
        if (hash(k++) < 0.35) continue;
        const off = w / 2 - 1.15;
        cars.push({ x: ax + dx * t / L + nx * off * side, z: az + dz * t / L + nz * off * side, y: 0.02, rot: rot + (hash(k) < 0.5 ? 0 : Math.PI) });
      }
    }
  }
  // cars inside parking lots
  for (const a of block.areas.filter((q) => q.k === 'parking')) {
    const pts = a.p; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); z0 = Math.min(z0, pts[i + 1]); z1 = Math.max(z1, pts[i + 1]); }
    const inside = (x, z) => { let c = false; for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) { if (((pts[i + 1] > z) !== (pts[j + 1] > z)) && (x < (pts[j] - pts[i]) * (z - pts[i + 1]) / (pts[j + 1] - pts[i + 1]) + pts[i])) c = !c; } return c; };
    for (let x = x0 + 2; x < x1 - 1; x += 2.7) for (let z = z0 + 3; z < z1 - 2; z += 6) if (inside(x, z) && hash(k++) > 0.3) cars.push({ x, z, y: 0.17, rot: hash(k) < 0.5 ? 0 : Math.PI });
  }
  const carColors = cars.map((_, i) => CAR_C[Math.floor(hash(i * 13 + 1) * CAR_C.length)]);
  group.add(instanced(carG.body, std('#ffffff', { roughness: 0.55, metalness: 0.25, envMapIntensity: 0.6 }), cars, { colors: carColors }));
  group.add(instanced(carG.wheels, std('#151515', { roughness: 0.9 }), cars));
  group.add(instanced(carG.glass, std('#1a232d', { roughness: 0.08, metalness: 0.9 }), cars, { shadow: false }));
  group.add(instanced(carG.lights, std('#f4efe2', { emissive: '#ffcf9a', emissiveIntensity: 0.2, roughness: 0.3 }), cars, { shadow: false }));

  /* ---------------- balconies (concrete parapet type) ---------------- */
  const balG = mergeGeometries([
    new THREE.BoxGeometry(3.2, 0.18, 1.3).translate(0, 0, 0.65),
    new THREE.BoxGeometry(3.2, 1.0, 0.12).translate(0, 0.55, 1.26),
    new THREE.BoxGeometry(0.12, 1.0, 1.3).translate(-1.54, 0.55, 0.65),
    new THREE.BoxGeometry(0.12, 1.0, 1.3).translate(1.54, 0.55, 0.65),
  ]);
  const bal = [];
  for (const bi of nearBuildings) {
    const b = data.b[bi], h = b[0]; if (h < 8 || h > 48 || b[2] === 1) continue;
    if (!near(b[3], b[4])) continue;
    const n = (b.length - 3) / 2, floors = Math.floor((h - 1.5) / 3.2);
    let u0 = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = b[3 + i * 2], az = b[4 + i * 2], bx = b[3 + j * 2], bz = b[4 + j * 2];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      const nx = dz / L, nz = -dx / L, rot = Math.atan2(nx, nz);
      if (L >= 7.5) {
        // align bays with the shader's 3.6 m window columns; pick bays by hash per building side
        for (let c = Math.ceil(u0 / 3.6) * 3.6 + 1.8; c < u0 + L - 1.8; c += 7.2) {
          const t = (c - u0) / L; if (hash(bi * 31 + Math.floor(c)) < 0.35) continue;
          for (let f = 1; f < floors; f++) bal.push({ x: ax + dx * t, z: az + dz * t, y: f * 3.2 - 0.1, rot });
        }
      }
      u0 += L;
    }
  }
  const balMesh = instanced(balG, std('#ece6dc', { roughness: 0.85 }), bal); group.add(balMesh);

  /* ---------------- garden walls + hedges around residential buildings ---------------- */
  { const W = [], WI = [], H = [], HI = [];
    const quad = (P, I, ax, az, bx, bz, y0, y1, th) => {
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, nx = -dz / L * th / 2, nz = dx / L * th / 2;
      const v = [[ax - nx, az - nz], [bx - nx, bz - nz], [bx + nx, bz + nz], [ax + nx, az + nz]];
      const base = P.length / 3;
      for (const [x, z] of v) P.push(x, y0, z); for (const [x, z] of v) P.push(x, y1, z);
      I.push(base, base + 1, base + 5, base, base + 5, base + 4, base + 2, base + 3, base + 7, base + 2, base + 7, base + 6, base + 4, base + 5, base + 6, base + 4, base + 6, base + 7, base + 1, base + 2, base + 6, base + 1, base + 6, base + 5, base + 3, base, base + 4, base + 3, base + 4, base + 7);
    };
    for (const bi of nearBuildings) {
      const b = data.b[bi]; if (b[0] < 7 || b[0] > 48 || b[2] === 1 || !near(b[3], b[4], 260)) continue;
      const n = (b.length - 3) / 2; if (n > 14) continue;
      let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += b[3 + i * 2]; cz += b[4 + i * 2]; } cx /= n; cz /= n;
      const off = [];
      for (let i = 0; i < n; i++) { const x = b[3 + i * 2], z = b[4 + i * 2], L = Math.hypot(x - cx, z - cz) || 1; off.push([x + (x - cx) / L * 3.2, z + (z - cz) / L * 3.2]); }
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, [ax, az] = off[i], [bx, bz] = off[j];
        const L = Math.hypot(bx - ax, bz - az); if (L < 3) continue;
        // leave the street side open around the entrance: skip the edge facing the nearest road midpoint gap
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        const gap = 3.2 / L, g0 = 0.5 - gap / 2, g1 = 0.5 + gap / 2;
        for (const [t0, t1] of [[0, g0], [g1, 1]]) {
          const sx = ax + (bx - ax) * t0, sz = az + (bz - az) * t0, ex = ax + (bx - ax) * t1, ez = az + (bz - az) * t1;
          quad(W, WI, sx, sz, ex, ez, 0, 0.75, 0.3);
          if (hash(bi + i) > 0.35) quad(H, HI, sx, sz, ex, ez, 0.75, 1.55, 0.7);
        }
        void mx; void mz;
      }
    }
    if (W.length) { const m = new THREE.Mesh(geo(W, WI), std('#d9cdb6', { roughness: 0.9 })); m.castShadow = m.receiveShadow = true; group.add(m); }
    if (H.length) { const m = new THREE.Mesh(geo(H, HI), std('#3f6a2e', { roughness: 1, flatShading: true })); m.castShadow = m.receiveShadow = true; group.add(m); }
  }

  let t = 0;
  const update = (dt, camPos) => { t -= dt; if (t > 0) return; t = 0.5; group.visible = Math.hypot(camPos.x - center.x, camPos.z - center.z) < 1600 && camPos.y < 450; };
  return { group, update, stats: { cars: cars.length, balconies: bal.length, doors: doors.length } };
}
