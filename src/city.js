import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; };
const tick = () => new Promise((r) => setTimeout(r, 0));

const STONE = ['#efe6d6', '#e4d8c3', '#d8cbb4', '#f3eee4', '#d6cfc4', '#e9dcc6', '#cbbfae', '#e0e2e2'].map((c) => new THREE.Color(c));
const GLASS = ['#7f97ad', '#8aa2b6', '#6f8aa3', '#9aabb8', '#7d8f9e'].map((c) => new THREE.Color(c));

/* --------------------------------------------------------------------------
 * Building material: standard PBR + procedural facade windows that light up
 * as the scene gets darker (uNight). Per-vertex attribute aWin = (u, v, seed, kind)
 * kind 0 = roof, 1 = stone wall, 2 = glass tower wall.
 * ------------------------------------------------------------------------ */
export function makeBuildingMaterial() {
  const uniforms = { uNight: { value: 1 }, uSat: { value: null }, uSatOn: { value: 0 }, uSatA: { value: new THREE.Vector4(0, 0, 0, 0) } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aWin;\nvarying vec4 vWin;\nvarying vec2 vWXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWin = aWin;\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vWin;
        uniform float uNight;
        uniform sampler2D uSat; uniform float uSatOn; uniform vec4 uSatA; varying vec2 vWXZ;
        float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
        float winMask; float winLit; vec3 winCol; float winAA; float isGlass;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 satUV = vec2(vWXZ.x * uSatA.x + uSatA.y, vWXZ.y * uSatA.z + uSatA.w);
        float satIn = uSatOn * step(0.0, satUV.x) * step(satUV.x, 1.0) * step(0.0, satUV.y) * step(satUV.y, 1.0);
        if (satIn > 0.5) {
          if (vWin.w < 0.5) diffuseColor.rgb = texture2D(uSat, satUV).rgb * 1.05;           // real roof from the satellite
          else diffuseColor.rgb = mix(diffuseColor.rgb, textureLod(uSat, satUV, 5.0).rgb * 1.2 + 0.08, 0.12); // a hint of local colour only
        }
        winMask = 0.0; winLit = 0.0; winAA = 0.0; isGlass = step(1.5, vWin.w) * step(vWin.w, 2.5); float isParapet = step(2.5, vWin.w);
        if (vWin.w > 0.5) {
          float colW = mix(3.6, 2.4, isGlass);
          vec2 cell = vec2(vWin.x / colW, vWin.y / 3.2);
          vec2 f = fract(cell); vec2 id = floor(cell);
          float fw = max(fwidth(cell.x), fwidth(cell.y));
          winAA = clamp(1.0 - fw * 2.2, 0.0, 1.0);
          float wx = mix(0.22, 0.08, isGlass), wy = mix(0.28, 0.12, isGlass);
          float m = smoothstep(wx - .04, wx, f.x) * smoothstep(1.0 - wx + .04, 1.0 - wx, f.x)
                  * smoothstep(wy - .04, wy, f.y) * smoothstep(1.0 - wy * .6 + .04, 1.0 - wy * .6, f.y);
          m *= step(0.5, id.y) * (1.0 - isParapet);
          // baked ambient occlusion: walls darken towards the ground
          diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(0.0, 4.0, vWin.y)) * (1.0 - isParapet * 0.0);
          float r = h21(id + vWin.z * 71.3);
          winLit = step(mix(0.64, 0.58, isGlass), r);
          winCol = mix(vec3(1.0, 0.66, 0.32), vec3(1.0, 0.86, 0.62), step(0.8, r));
          winCol = mix(winCol, vec3(0.62, 0.8, 1.0), step(0.94, r));
          winMask = m;
          vec3 glassC = mix(vec3(0.10, 0.12, 0.16), vec3(0.16, 0.2, 0.26), isGlass);
          if (isGlass < 0.5) {
            // facade finish: ~half the buildings are Jerusalem-stone clad, the rest are plaster
            float stoneB = step(0.45, fract(vWin.z * 7.31));
            vec2 sc = vec2(vWin.x / 1.1, vWin.y / 0.55);
            sc.x += step(1.0, mod(floor(sc.y), 2.0)) * 0.5;
            vec2 sf = fract(sc), sid = floor(sc);
            float mortar = (1.0 - smoothstep(0.0, 0.05, sf.y)) + (1.0 - smoothstep(0.0, 0.025, sf.x));
            float sAA = clamp(1.0 - max(fwidth(sc.x), fwidth(sc.y)) * 1.5, 0.0, 1.0);
            vec3 stoneVar = vec3(1.0) + (h21(sid + vWin.z) - 0.5) * vec3(0.10, 0.09, 0.07);
            diffuseColor.rgb *= mix(vec3(1.0), stoneVar * (1.0 - clamp(mortar, 0.0, 1.0) * 0.18), stoneB * sAA);
            float plaster = h21(floor(vec2(vWin.x, vWin.y) * 4.0) + vWin.z) * 0.06;
            diffuseColor.rgb *= 1.0 - plaster * (1.0 - stoneB) * sAA;
            float slab = (1.0 - smoothstep(0.0, 0.07, f.y)) * step(0.5, id.y) * winAA;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.18 + 0.04, slab);
            float balc = step(0.55, h21(vec2(floor(cell.x / 2.0), id.y) + vWin.z)) * step(0.5, id.y);
            diffuseColor.rgb *= 1.0 - balc * 0.1 * winAA;
            if (id.y < 0.5 && isParapet < 0.5) diffuseColor.rgb *= 0.72;
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, glassC, m * winAA * 0.9 + (1.0 - winAA) * mix(0.25, 0.55, isGlass));
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.12, max(winMask * winAA, isGlass * 0.7));`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.55, isGlass * 0.9);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (vWin.w > 0.5 && vWin.w < 2.5) {
          float bright = 0.5 + 1.3 * fract(h21(floor(vec2(vWin.x / 2.4, vWin.y / 3.2)) + vWin.z) * 17.0);
          vec3 near = winCol * winMask * winLit * bright;
          vec3 far = mix(vec3(1.0, 0.7, 0.4), vec3(0.8, 0.85, 1.0), isGlass) * 0.1;
          totalEmissiveRadiance += mix(far, near, winAA) * uNight * 1.6;
        }`);
  };
  mat.userData.uniforms = uniforms;
  return mat;
}

/** Extrude a flat polygon [x,z,...] into walls + roof arrays. */
function extrude(pts, h, minH, seed, glass, colorBase, P, N, C, W, I) {
  const n = pts.length / 2;
  let base = P.length / 3;
  let u = 0;
  const wallC = colorBase;
  const kind = glass ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = pts[i * 2], az = pts[i * 2 + 1], bx = pts[j * 2], bz = pts[j * 2 + 1];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 0.05) continue;
    const nx = dz / L, nz = -dx / L;
    // light direction-based shading tint so facades read well even without light
    P.push(ax, minH, az, bx, minH, bz, ax, h, az, bx, h, bz);
    for (let k = 0; k < 4; k++) { N.push(nx, 0, nz); C.push(wallC.r, wallC.g, wallC.b); }
    W.push(u, minH, seed, kind, u + L, minH, seed, kind, u, h, seed, kind, u + L, h, seed, kind);
    I.push(base, base + 3, base + 1, base, base + 2, base + 3);
    base += 4;
    u += L;
  }
  // roof parapet (low wall around the roof edge) on ordinary buildings
  if (!glass && h > 6 && h < 60 && n >= 3 && n <= 28) {
    const ph = h + 0.9, inset = 0.3, inner = [];
    for (let i = 0; i < n; i++) {
      const pi = (i + n - 1) % n, ni = (i + 1) % n;
      const ex1 = pts[i * 2] - pts[pi * 2], ez1 = pts[i * 2 + 1] - pts[pi * 2 + 1], l1 = Math.hypot(ex1, ez1) || 1;
      const ex2 = pts[ni * 2] - pts[i * 2], ez2 = pts[ni * 2 + 1] - pts[i * 2 + 1], l2 = Math.hypot(ex2, ez2) || 1;
      let bx = ez1 / l1 + ez2 / l2, bz = -ex1 / l1 - ex2 / l2; const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;
      const cosH = Math.max(0.45, bx * (ez2 / l2) + bz * (-ex2 / l2));
      inner.push(pts[i * 2] - bx * inset / cosH, pts[i * 2 + 1] - bz * inset / cosH);
    }
    const pc = wallC.clone().multiplyScalar(1.04);
    const quad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz) => {
      const b0 = P.length / 3; P.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
      for (let k = 0; k < 4; k++) { N.push(nx, ny, nz); C.push(pc.r, pc.g, pc.b); W.push(0, ay, seed, 3); }
      I.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
    };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = pts[i * 2], az = pts[i * 2 + 1], bx = pts[j * 2], bz = pts[j * 2 + 1];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.05) continue;
      const nx = dz / L, nz = -dx / L, iax = inner[i * 2], iaz = inner[i * 2 + 1], ibx = inner[j * 2], ibz = inner[j * 2 + 1];
      quad(ax, h, az, ax, ph, az, bx, ph, bz, bx, h, bz, nx, 0, nz);              // outer face
      quad(ibx, h, ibz, ibx, ph, ibz, iax, ph, iaz, iax, h, iaz, -nx, 0, -nz);    // inner face (towards the roof)
      quad(ax, ph, az, iax, ph, iaz, ibx, ph, ibz, bx, ph, bz, 0, 1, 0);          // cap
    }
  }
  // roof
  const contour = [];
  for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(pts[i * 2], pts[i * 2 + 1]));
  let tris;
  try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { tris = []; }
  const roofStart = P.length / 3;
  const rc = colorBase.clone().multiplyScalar(glass ? 0.55 : 0.78);
  for (let i = 0; i < n; i++) {
    P.push(pts[i * 2], h, pts[i * 2 + 1]); N.push(0, 1, 0); C.push(rc.r, rc.g, rc.b); W.push(0, 0, seed, 0);
  }
  for (const t of tris) {
    const [a, b, c] = t;
    const cy = (contour[b].y - contour[a].y) * (contour[c].x - contour[a].x) - (contour[b].x - contour[a].x) * (contour[c].y - contour[a].y);
    if (cy > 0) I.push(roofStart + a, roofStart + b, roofStart + c);
    else I.push(roofStart + a, roofStart + c, roofStart + b);
  }
}

function geomFrom(P, N, C, W, I) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aWin', new THREE.Float32BufferAttribute(W, 4));
  g.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------ collision grid ------------------------------ */
export class HeightGrid {
  constructor(x0, z0, x1, z1, cell) {
    this.x0 = x0; this.z0 = z0; this.cell = cell;
    this.nx = Math.ceil((x1 - x0) / cell); this.nz = Math.ceil((z1 - z0) / cell);
    this.h = new Uint8Array(this.nx * this.nz); // metres, rounded up
  }
  addPoly(pts, h) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); z0 = Math.min(z0, pts[i + 1]); z1 = Math.max(z1, pts[i + 1]); }
    const c = this.cell;
    const i0 = Math.max(0, Math.floor((x0 - this.x0) / c)), i1 = Math.min(this.nx - 1, Math.floor((x1 - this.x0) / c));
    const j0 = Math.max(0, Math.floor((z0 - this.z0) / c)), j1 = Math.min(this.nz - 1, Math.floor((z1 - this.z0) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = this.x0 + (i + 0.5) * c, z = this.z0 + (j + 0.5) * c;
      let inside = false;
      for (let a = 0, b = pts.length - 2; a < pts.length; b = a, a += 2) {
        if (((pts[a + 1] > z) !== (pts[b + 1] > z)) && (x < (pts[b] - pts[a]) * (z - pts[a + 1]) / (pts[b + 1] - pts[a + 1]) + pts[a])) inside = !inside;
      }
      // small footprints can miss every cell centre: mark the centre cell anyway
      if (inside || (i1 - i0 < 1 && j1 - j0 < 1)) { const k = j * this.nx + i; const hv = Math.min(255, Math.ceil(h)); if (hv > this.h[k]) this.h[k] = hv; }
    }
  }
  at(x, z) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return 0;
    return this.h[j * this.nx + i];
  }
  /** max height within radius r (sampled) */
  around(x, z, r) {
    let m = 0; const s = this.cell;
    for (let dz = -r; dz <= r; dz += s) for (let dx = -r; dx <= r; dx += s) { if (dx * dx + dz * dz <= r * r) m = Math.max(m, this.at(x + dx, z + dz)); }
    return m;
  }
}

/* ------------------------------ ribbons ------------------------------ */
function ribbon(pts, w, y, color, P, N, C, I) {
  const n = pts.length / 2; if (n < 2) return;
  let base = P.length / 3;
  for (let i = 0; i < n; i++) {
    const pi = Math.max(0, i - 1), ni = Math.min(n - 1, i + 1);
    let dx = pts[ni * 2] - pts[pi * 2], dz = pts[ni * 2 + 1] - pts[pi * 2 + 1];
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const ox = -dz * w / 2, oz = dx * w / 2;
    const x = pts[i * 2], z = pts[i * 2 + 1];
    P.push(x + ox, y, z + oz, x - ox, y, z - oz);
    N.push(0, 1, 0, 0, 1, 0);
    C.push(color.r, color.g, color.b, color.r, color.g, color.b);
    if (i > 0) { const a = base + (i - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
}

function flatPoly(pts, y, color, P, N, C, I) {
  const contour = []; const n = pts.length / 2;
  for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(pts[i * 2], pts[i * 2 + 1]));
  let tris; try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { return; }
  const base = P.length / 3;
  for (let i = 0; i < n; i++) { P.push(pts[i * 2], y, pts[i * 2 + 1]); N.push(0, 1, 0); C.push(color.r, color.g, color.b); }
  for (const [a, b, c] of tris) {
    const cy = (contour[b].y - contour[a].y) * (contour[c].x - contour[a].x) - (contour[b].x - contour[a].x) * (contour[c].y - contour[a].y);
    if (cy > 0) I.push(base + a, base + b, base + c); else I.push(base + a, base + c, base + b);
  }
}

function simpleGeom(P, N, C, I) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------ glow sprite ------------------------------ */
export function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,200,120,0.35)') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, mid); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ========================================================================== */
export async function buildCity(data, scene, onProgress) {
  const group = new THREE.Group(); scene.add(group);
  const layers = { buildings: [], ground: null, trees: [], heaters: null, poles: null, lamps: null, traffic: [] };
  const bMat = makeBuildingMaterial();

  // bounds
  let X0 = 1e9, X1 = -1e9, Z0 = 1e9, Z1 = -1e9;
  for (const b of data.b) for (let i = 3; i < b.length; i += 2) { X0 = Math.min(X0, b[i]); X1 = Math.max(X1, b[i]); Z0 = Math.min(Z0, b[i + 1]); Z1 = Math.max(Z1, b[i + 1]); }
  const PAD = 4000;
  const grid = new HeightGrid(X0 - PAD, Z0 - PAD, X1 + PAD, Z1 + PAD, 4);

  // synthetic surroundings so the real city doesn't float in a void, plus a distant Tel Aviv skyline to the west
  const extra = [];
  let s = 991;
  const box = (cx, cz, w, d, h, rot, glass) => {
    const c = Math.cos(rot), sn = Math.sin(rot); const pts = [];
    for (const [ux, uz] of [[-w, -d], [w, -d], [w, d], [-w, d]]) pts.push(+(cx + ux * c - uz * sn).toFixed(1), +(cz + ux * sn + uz * c).toFixed(1));
    extra.push([h, 0, glass ? 1 : 0, ...pts]);
  };
  for (let k = 0; k < 4200; k++) {
    const ang = hash(s++) * Math.PI * 2, rad = 0.2 + hash(s++) * 1.0;
    const cx = (X0 + X1) / 2 + Math.cos(ang) * ((X1 - X0) / 2 + 250 + rad * 3200);
    const cz = (Z0 + Z1) / 2 + Math.sin(ang) * ((Z1 - Z0) / 2 + 250 + rad * 3200);
    if (cx > X0 - 60 && cx < X1 + 60 && cz > Z0 - 60 && cz < Z1 + 60) continue;
    const big = hash(s++);
    box(cx, cz, 8 + hash(s++) * 14, 7 + hash(s++) * 10, big > 0.97 ? 40 + hash(s++) * 60 : 6 + hash(s++) * 20, hash(s++) * 3.14, big > 0.97);
  }
  // Tel Aviv / Ramat Gan skyline (west, ~6-10 km)
  const skyline = [[-7200, 600, 1], [-7600, 300, 0.9], [-8200, 900, 0.8], [-9000, 200, 0.95], [-9600, 1400, 0.7], [-8700, -600, 0.6], [-10400, 700, 0.8]];
  for (const [sx, sz, f] of skyline) {
    for (let k = 0; k < 26; k++) {
      const cx = sx + (hash(s++) - 0.5) * 900, cz = sz + (hash(s++) - 0.5) * 900;
      box(cx, cz, 14 + hash(s++) * 16, 14 + hash(s++) * 16, (60 + hash(s++) * 190) * f, hash(s++) * 1.2, true);
    }
  }

  const all = data.b.concat(extra);
  const CH = 700;
  const chunks = new Map();
  let done = 0;
  for (let bi = 0; bi < all.length; bi++) {
    const b = all[bi];
    const h = b[0], minH = b[1], glass = b[2] === 1 || h > 55;
    const pts = b.slice(3);
    let cx = 0, cz = 0; for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cz += pts[i + 1]; }
    cx /= pts.length / 2; cz /= pts.length / 2;
    const key = Math.floor(cx / CH) + ',' + Math.floor(cz / CH);
    let ch = chunks.get(key); if (!ch) { ch = { P: [], N: [], C: [], W: [], I: [] }; chunks.set(key, ch); }
    const seed = hash(bi * 7 + 3);
    const col = (glass ? GLASS : STONE)[Math.floor(seed * 1000) % (glass ? GLASS.length : STONE.length)].clone();
    col.multiplyScalar(0.84 + hash(bi) * 0.1);
    extrude(pts, h, minH, seed * 100, glass, col, ch.P, ch.N, ch.C, ch.W, ch.I);
    grid.addPoly(pts, h);
    if (++done % 1500 === 0) { onProgress?.(done / all.length * 0.7, `בונה בניינים ${Math.min(done, data.b.length).toLocaleString('he-IL')} / ${data.b.length.toLocaleString('he-IL')}`); await tick(); }
  }
  for (const ch of chunks.values()) {
    const m = new THREE.Mesh(geomFrom(ch.P, ch.N, ch.C, ch.W, ch.I), bMat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m); layers.buildings.push(m);
  }

  // spatial hash of real building footprints for precise street-level collision
  const BH = 40, bHash = new Map();
  data.b.forEach((b, bi) => {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 3; i < b.length; i += 2) { x0 = Math.min(x0, b[i]); x1 = Math.max(x1, b[i]); z0 = Math.min(z0, b[i + 1]); z1 = Math.max(z1, b[i + 1]); }
    for (let gx = Math.floor(x0 / BH); gx <= Math.floor(x1 / BH); gx++) for (let gz = Math.floor(z0 / BH); gz <= Math.floor(z1 / BH); gz++) {
      const k = gx + ',' + gz; if (!bHash.has(k)) bHash.set(k, []); bHash.get(k).push(bi);
    }
  });
  const insideB = (x, z, b) => { let c = false; for (let a = 3, j = b.length - 2; a < b.length; j = a, a += 2) { if (((b[a + 1] > z) !== (b[j + 1] > z)) && (x < (b[j] - b[a]) * (z - b[a + 1]) / (b[j + 1] - b[a + 1]) + b[a])) c = !c; } return c; };
  const blocked = (x, z, r = 0.35) => {
    const list = bHash.get(Math.floor(x / BH) + ',' + Math.floor(z / BH)); if (!list) return false;
    for (const bi of list) { const b = data.b[bi]; if (b[1] > 2.5) continue; // raised (pilotis/bridge) parts are walkable underneath
      if (insideB(x, z, b) || insideB(x + r, z, b) || insideB(x - r, z, b) || insideB(x, z + r, b) || insideB(x, z - r, b)) return true; }
    return false;
  };

  // solar water heaters on residential roofs — the most Israeli roof detail there is
  {
    const tank = new THREE.CylinderGeometry(0.32, 0.32, 1.5, 8); tank.rotateZ(Math.PI / 2); tank.translate(0, 1.25, -0.5);
    const panel = new THREE.BoxGeometry(1.4, 0.06, 1.9); panel.rotateX(-0.6); panel.translate(0, 0.75, 0.45);
    const legs = new THREE.BoxGeometry(1.3, 0.8, 0.08); legs.translate(0, 0.4, -0.45);
    const heaterG = mergeGeometries([tank, panel, legs]);
    const spots = [];
    data.b.forEach((b, bi) => {
      const h = b[0]; if (h < 7 || h > 45 || b[2] === 1) return;
      const pts = b.slice(3); const n = pts.length / 2; if (n < 4) return;
      let cx = 0, cz = 0; for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cz += pts[i + 1]; } cx /= n; cz /= n;
      const k = 1 + Math.floor(hash(bi * 11) * 3);
      for (let j = 0; j < k; j++) {
        const x = cx + (j - (k - 1) / 2) * 1.7, z = cz + (hash(bi + j) - 0.5) * 2;
        if (insideB(x, z, b)) spots.push(x, h, z);
      }
    });
    const nH = spots.length / 3;
    const heaters = new THREE.InstancedMesh(heaterG, new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: 0.45, metalness: 0.6 }), nH);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < nH; i++) { ps.set(spots[i * 3], spots[i * 3 + 1], spots[i * 3 + 2]); q.setFromAxisAngle(up, Math.PI); m.compose(ps, q, one); heaters.setMatrixAt(i, m); }
    heaters.castShadow = true; group.add(heaters); layers.heaters = heaters;
  }

  { // soft contact shadows on the ground around each real building (cheap baked AO)
    const P = [], C = [], I = []; const W = 3.2;
    for (const b of data.b) {
      if (b[1] > 2.5) continue; const pts = b.slice(3), n = pts.length / 2; const a = 0.42 * Math.min(1, b[0] / 10);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = pts[i * 2], az = pts[i * 2 + 1], bx = pts[j * 2], bz = pts[j * 2 + 1];
        const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.3) continue;
        const nx = dz / L * W, nz = -dx / L * W, b0 = P.length / 3;
        P.push(ax, 0.24, az, bx, 0.24, bz, bx + nx, 0.24, bz + nz, ax + nx, 0.24, az + nz);
        C.push(0, 0, 0, a, 0, 0, 0, a, 0, 0, 0, 0, 0, 0, 0, 0);
        I.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4)); g.setIndex(I);
    const skirt = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
    skirt.renderOrder = 1; group.add(skirt); layers.skirt = skirt;
  }

  onProgress?.(0.75, 'סולל כבישים ופארקים…'); await tick();

  // ---------------- ground layers ----------------
  const gP = [], gN = [], gC = [], gI = [];
  const GREEN = [new THREE.Color('#5b7d3c'), new THREE.Color('#3f8a45'), new THREE.Color('#79806a')];
  for (const g of data.g) flatPoly(g.slice(1), 0.06 + g[0] * 0.01, GREEN[g[0]], gP, gN, gC, gI);
  const WATER = new THREE.Color('#3d6f8e');
  for (const w of data.w) { if (w[0] === 1) ribbon(w.slice(1), 7, 0.1, WATER, gP, gN, gC, gI); else flatPoly(w.slice(1), 0.1, WATER, gP, gN, gC, gI); }
  const ROAD = [new THREE.Color('#3a3b40'), new THREE.Color('#34353a'), new THREE.Color('#2e2f34'), new THREE.Color('#29292e')];
  const WALK = new THREE.Color('#8e8a86'), CURB = new THREE.Color('#b9b3aa'), LINE = new THREE.Color('#d9d4c8');
  for (const r of data.r) ribbon(r.slice(3), r[0] + 7, 0.11, WALK, gP, gN, gC, gI);
  for (const r of data.r) ribbon(r.slice(3), r[0] + 1.2, 0.125, CURB, gP, gN, gC, gI);
  for (const r of data.r) ribbon(r.slice(3), r[0], 0.14 + r[1] * 0.012, ROAD[r[1]], gP, gN, gC, gI);
  // dashed centre lines on bigger roads
  for (const r of data.r) {
    if (r[1] < 1) continue;
    const p = r.slice(3), y = 0.2 + r[1] * 0.012;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1], L = Math.hypot(dx, dz);
      for (let t = 2; t + 3 < L; t += 9) ribbon([p[i] + dx * t / L, p[i + 1] + dz * t / L, p[i] + dx * (t + 3.5) / L, p[i + 1] + dz * (t + 3.5) / L], 0.28, y, LINE, gP, gN, gC, gI);
    }
  }
  const groundMesh = new THREE.Mesh(simpleGeom(gP, gN, gC, gI), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  groundMesh.receiveShadow = true;
  group.add(groundMesh); layers.ground = groundMesh;

  // ---------------- street lights (glow points) ----------------
  const lampPos = [];
  const majors = [];
  for (const r of data.r) {
    const p = r.slice(3); if (r[1] >= 2) majors.push(p);
    const step = r[1] >= 2 ? 34 : 60;
    const off = r[0] / 2 + 1;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1], L = Math.hypot(dx, dz); if (L < 1) continue;
      const nx = -dz / L, nz = dx / L;
      for (let t = step / 2; t < L; t += step) {
        const sd = (Math.floor(t / step) % 2 ? 1 : -1);
        lampPos.push(p[i] + dx * t / L + nx * off * sd, 7, p[i + 1] + dz * t / L + nz * off * sd);
      }
    }
  }
  const lampGeo = new THREE.BufferGeometry(); lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
  const lampMat = new THREE.PointsMaterial({ size: 9, map: glowTexture('rgba(255,240,210,1)', 'rgba(255,170,80,0.35)'), color: new THREE.Color(2.4, 1.6, 0.9), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const lamps = new THREE.Points(lampGeo, lampMat); group.add(lamps); layers.lamps = lamps;
  // lamp posts (visible when walking)
  const poleG = mergeGeometries([
    new THREE.CylinderGeometry(0.09, 0.14, 7, 5).translate(0, 3.5, 0),
    new THREE.BoxGeometry(0.12, 0.12, 1.4).translate(0, 7, 0.6),
    new THREE.BoxGeometry(0.35, 0.12, 0.5).translate(0, 6.95, 1.2),
  ]);
  const nL = lampPos.length / 3;
  const poles = new THREE.InstancedMesh(poleG, new THREE.MeshStandardMaterial({ color: '#4a4d52', roughness: 0.6, metalness: 0.5 }), nL);
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < nL; i++) { ps.set(lampPos[i * 3], 0, lampPos[i * 3 + 2]); q.setFromAxisAngle(up, hash(i) * 6.28); m.compose(ps, q, one); poles.setMatrixAt(i, m); } }
  group.add(poles); layers.poles = poles;

  // ---------------- traffic: moving head/tail lights on major roads ----------------
  const roads = majors.map((p) => { const cum = [0]; for (let i = 2; i < p.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1])); return { p, cum, len: cum[cum.length - 1] }; }).filter((r) => r.len > 80);
  const totalLen = roads.reduce((a, r) => a + r.len, 0);
  const cars = [];
  const NCARS = 900;
  for (let k = 0; k < NCARS; k++) {
    let pick = hash(k * 13 + 5) * totalLen, ri = 0; while (pick > roads[ri].len) { pick -= roads[ri].len; ri++; }
    cars.push({ r: roads[ri], d: pick, v: (9 + hash(k * 3) * 8) * (hash(k * 17) < 0.5 ? 1 : -1), lane: hash(k * 17) < 0.5 ? 1 : -1 });
  }
  const headGeo = new THREE.BufferGeometry(); headGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NCARS * 3), 3));
  const tailGeo = new THREE.BufferGeometry(); tailGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NCARS * 3), 3));
  const headMat = new THREE.PointsMaterial({ size: 4.5, map: glowTexture('rgba(255,255,255,1)', 'rgba(200,220,255,0.4)'), color: new THREE.Color(3, 3, 2.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const tailMat = new THREE.PointsMaterial({ size: 4, map: glowTexture('rgba(255,120,120,1)', 'rgba(255,40,40,0.4)'), color: new THREE.Color(3, 0.4, 0.3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const heads = new THREE.Points(headGeo, headMat), tails = new THREE.Points(tailGeo, tailMat);
  heads.frustumCulled = tails.frustumCulled = false;
  group.add(heads, tails); layers.traffic.push(heads, tails);
  const posAt = (r, d, out) => {
    d = ((d % r.len) + r.len) % r.len;
    let i = 1; while (i < r.cum.length - 1 && r.cum[i] < d) i++;
    const t = (d - r.cum[i - 1]) / (r.cum[i] - r.cum[i - 1] || 1);
    const ax = r.p[(i - 1) * 2], az = r.p[(i - 1) * 2 + 1], bx = r.p[i * 2], bz = r.p[i * 2 + 1];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    out.x = ax + (bx - ax) * t; out.z = az + (bz - az) * t; out.nx = -(bz - az) / L; out.nz = (bx - ax) / L;
    return out;
  };
  const tmpA = {}, tmpB = {};
  const updateTraffic = (dt) => {
    const hp = headGeo.attributes.position.array, tp = tailGeo.attributes.position.array;
    for (let k = 0; k < cars.length; k++) {
      const c = cars[k]; c.d += c.v * dt;
      const dir = Math.sign(c.v);
      posAt(c.r, c.d + dir * 2, tmpA); posAt(c.r, c.d - dir * 2, tmpB);
      const lo = 2.2 * c.lane;
      hp[k * 3] = tmpA.x + tmpA.nx * lo; hp[k * 3 + 1] = 1.1; hp[k * 3 + 2] = tmpA.z + tmpA.nz * lo;
      tp[k * 3] = tmpB.x + tmpB.nx * lo; tp[k * 3 + 1] = 1.1; tp[k * 3 + 2] = tmpB.z + tmpB.nz * lo;
    }
    headGeo.attributes.position.needsUpdate = true; tailGeo.attributes.position.needsUpdate = true;
  };

  onProgress?.(0.85, 'שותל עצים…'); await tick();

  // ---------------- trees ----------------
  const nT = data.t.length / 2;
  const isPalm = (i) => hash(i * 97 + 3) < 0.16; // date & washingtonia palms are everywhere in Petah Tikva
  const trunkG = new THREE.CylinderGeometry(0.22, 0.38, 3.2, 6); trunkG.translate(0, 1.6, 0);
  const crownG = mergeGeometries([
    new THREE.IcosahedronGeometry(2.4, 1).translate(0, 4.8, 0),
    new THREE.IcosahedronGeometry(1.8, 1).translate(1.2, 5.6, 0.5),
    new THREE.IcosahedronGeometry(1.7, 1).translate(-1.0, 5.4, -0.7),
    new THREE.IcosahedronGeometry(1.4, 1).translate(0.2, 6.6, -0.2),
  ]);
  { // jitter vertices so the canopy isn't a perfect ball
    const p = crownG.attributes.position; for (let i = 0; i < p.count; i++) { const k = hash(i * 13 + 5) * 0.35 - 0.17; p.setXYZ(i, p.getX(i) * (1 + k), p.getY(i) * (1 + k * 0.6), p.getZ(i) * (1 - k)); }
    crownG.computeVertexNormals();
  }
  const palmTrunkG = new THREE.CylinderGeometry(0.28, 0.4, 9, 7); palmTrunkG.translate(0, 4.5, 0);
  const frondG = (() => { const parts = [];
    for (let f = 0; f < 10; f++) { const g = new THREE.PlaneGeometry(0.9, 4.2, 1, 4); g.translate(0, 2.1, 0);
      const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, -y * y * 0.07); }
      g.rotateX(-1.25 + (f % 2) * 0.35); g.rotateY(f / 10 * Math.PI * 2); g.translate(0, 9, 0); parts.push(g); }
    return mergeGeometries(parts); })();
  const palms = [], broad = [];
  for (let i = 0; i < nT; i++) (isPalm(i) ? palms : broad).push(i);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: '#5b4330', roughness: 1 }), broad.length);
  const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), broad.length);
  const pTrunks = new THREE.InstancedMesh(palmTrunkG, new THREE.MeshStandardMaterial({ color: '#8a7358', roughness: 1 }), Math.max(1, palms.length));
  const pFronds = new THREE.InstancedMesh(frondG, new THREE.MeshStandardMaterial({ color: '#4f7a2c', roughness: 0.85, side: THREE.DoubleSide }), Math.max(1, palms.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const tc = new THREE.Color();
  const TREEC = ['#4d7a33', '#5d8a3a', '#3f6b30', '#6b8f3e', '#4a6f2e', '#7a9443', '#58803a'];
  broad.forEach((i, n) => {
    const x = data.t[i * 2], z = data.t[i * 2 + 1];
    const r = hash(i * 31 + 7); const sz = 0.75 + r * 0.8;
    q.setFromAxisAngle(up, r * 6.28); sc.set(sz, 1.05 + hash(i) * 0.45, sz); ps.set(x, 0, z);
    m4.compose(ps, q, sc); trunks.setMatrixAt(n, m4); crowns.setMatrixAt(n, m4);
    tc.set(TREEC[Math.floor(hash(i * 5) * TREEC.length)]); crowns.setColorAt(n, tc);
  });
  palms.forEach((i, n) => {
    const x = data.t[i * 2], z = data.t[i * 2 + 1], r = hash(i * 31 + 7), s = 0.8 + r * 0.5;
    q.setFromAxisAngle(up, r * 6.28); sc.set(s, s, s); ps.set(x, 0, z); m4.compose(ps, q, sc);
    pTrunks.setMatrixAt(n, m4); pFronds.setMatrixAt(n, m4);
  });
  pTrunks.count = pFronds.count = palms.length;
  pTrunks.castShadow = pFronds.castShadow = true;
  group.add(pTrunks, pFronds); layers.trees.push(pTrunks, pFronds);
  crowns.castShadow = true; crowns.receiveShadow = true;
  group.add(trunks, crowns); layers.trees.push(trunks, crowns);

  onProgress?.(0.95, 'מכין את השמיים…'); await tick();

  return { group, grid, bMat, lampMat, updateTraffic, blocked, layers, bounds: { X0, X1, Z0, Z1 } };
}
