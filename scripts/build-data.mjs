// Converts raw Overpass JSON (scripts/raw.json) into a compact local-meter dataset for the game.
import fs from 'node:fs';
const raw = JSON.parse(fs.readFileSync(new URL('./raw.json', import.meta.url)));
const LAT0 = 32.090, LON0 = 34.880;
// WGS84 metres per degree at LAT0 — must match src/geo.js so OSM data lines up with satellite / Google 3D tiles
const PHI = LAT0 * Math.PI / 180;
const KX = 111412.84 * Math.cos(PHI) - 93.5 * Math.cos(3 * PHI);
const KZ = 111132.92 - 559.82 * Math.cos(2 * PHI) + 1.175 * Math.cos(4 * PHI);
const px = (p) => [+((p.lon - LON0) * KX).toFixed(1), +(-(p.lat - LAT0) * KZ).toFixed(1)];
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; };
const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i += 2) { const j = (i + 2) % pts.length; a += pts[i] * pts[j + 1] - pts[j] * pts[i + 1]; } return a / 2; };
const flat = (geom) => { const out = []; for (const p of geom) out.push(...px(p)); return out; };
const closeStrip = (pts) => { const n = pts.length; if (n > 4 && pts[0] === pts[n - 2] && pts[1] === pts[n - 1]) return pts.slice(0, n - 2); return pts; };

const buildings = [], roads = [], greens = [], waters = [], places = [], addrs = [], named = [];
const names = [], nameIdx = new Map();
const nameId = (n) => { if (!n) return -1; if (!nameIdx.has(n)) { nameIdx.set(n, names.length); names.push(n); } return nameIdx.get(n); };
const ROADW = { motorway: 22, trunk: 18, primary: 14, secondary: 11, tertiary: 9, residential: 6, unclassified: 6 };
const ROADC = { motorway: 3, trunk: 3, primary: 2, secondary: 2, tertiary: 1, residential: 0, unclassified: 0 };

function heightOf(t, id, a) {
  let h = parseFloat(t.height);
  const lv = parseFloat(t['building:levels']);
  if (!isNaN(lv)) h = isNaN(h) ? lv * 3.2 + 1.5 : h;
  if (!isNaN(h)) return h;
  const r = hash(id);
  const b = t.building;
  if (a < 50) return 3 + r * 2;
  if (['house', 'detached', 'semidetached_house', 'garage', 'shed', 'roof', 'hut'].includes(b)) return 4 + r * 5;
  if (['industrial', 'warehouse', 'retail', 'commercial', 'supermarket'].includes(b)) return 7 + r * 6;
  if (['school', 'synagogue', 'kindergarten', 'public', 'civic'].includes(b)) return 7 + r * 5;
  if (a > 350) return 12 + Math.floor(r * 5) * 3.2; // typical 4-8 storey apartment block
  return 6 + Math.floor(r * 3) * 3.2;
}

for (const e of raw.elements) {
  const t = e.tags || {};
  const rings = e.type === 'way' ? (e.geometry ? [e.geometry] : []) :
    (e.members || []).filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry);
  if (t.building) {
    for (const g of rings) {
      let pts = closeStrip(flat(g));
      if (pts.length < 6) continue;
      let a = area(pts);
      if (a < 0) { // make CCW in x/-z plane consistent
        const r = []; for (let i = pts.length - 2; i >= 0; i -= 2) r.push(pts[i], pts[i + 1]); pts = r; a = -a;
      }
      const h = +heightOf(t, e.id, a).toFixed(1);
      const minH = +(parseFloat(t.min_height) || (parseFloat(t['building:min_level']) * 3.2) || 0).toFixed(1);
      const tall = h >= 45 ? 1 : 0;
      if (t.name) { let cx = 0, cz = 0; for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cz += pts[i + 1]; } named.push([t.name, +(cx / (pts.length / 2)).toFixed(1), +(cz / (pts.length / 2)).toFixed(1), buildings.length, t.amenity || t.building || '']); }
      if (t['addr:housenumber'] && t['addr:street']) addrs.push({ bi: buildings.length, street: t['addr:street'], num: t['addr:housenumber'], pts });
      buildings.push([h, minH, tall, ...pts]);
      if (t.name && h >= 30) {
        let cx = 0, cz = 0; for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cz += pts[i + 1]; }
        places.push({ name: t.name, x: +(cx / (pts.length / 2)).toFixed(1), z: +(cz / (pts.length / 2)).toFixed(1), h });
      }
    }
  } else if (t.highway && e.geometry) {
    roads.push([ROADW[t.highway] || 6, ROADC[t.highway] || 0, nameId(t.name), ...flat(e.geometry)]);
  } else if (t.natural === 'water' || t.waterway) {
    if (e.geometry) waters.push([t.waterway ? 1 : 0, ...flat(e.geometry)]);
  } else if (rings.length) {
    const kind = t.landuse === 'cemetery' ? 2 : (t.leisure === 'pitch' || t.leisure === 'stadium') ? 1 : 0;
    for (const g of rings) { const pts = closeStrip(flat(g)); if (pts.length >= 6) greens.push([kind, ...pts]); }
    if (t.name && t.leisure === 'park') {
      const pts = flat(rings[0]); let cx = 0, cz = 0;
      for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cz += pts[i + 1]; }
      places.push({ name: t.name, x: +(cx / (pts.length / 2)).toFixed(1), z: +(cz / (pts.length / 2)).toFixed(1), h: 0, park: Math.abs(area(pts)) });
    }
  }
}

// Scatter trees inside parks/woods (not pitches), deterministic.
const inPoly = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { if (((p[i + 1] > z) !== (p[j + 1] > z)) && (x < (p[j] - p[i]) * (z - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i])) c = !c; } return c; };
const trees = []; let seed = 1;
for (const g of greens) {
  if (g[0] === 1) continue;
  const p = g.slice(1); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); }
  const n = Math.min(400, Math.floor(Math.abs(area(p)) / 180));
  for (let k = 0; k < n; k++) {
    const x = x0 + hash(seed++) * (x1 - x0), z = z0 + hash(seed++) * (z1 - z0);
    if (inPoly(x, z, p)) trees.push(+x.toFixed(1), +z.toFixed(1));
  }
}
// Street trees along residential roads.
for (const r of roads) {
  if (r[1] > 1) continue;
  const p = r.slice(3);
  for (let i = 0; i + 3 < p.length; i += 2) {
    const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1], L = Math.hypot(dx, dz);
    const nx = -dz / L, nz = dx / L, off = r[0] / 2 + 4;
    for (let s = 6; s < L; s += 16) {
      if (hash(seed++) < 0.45) continue;
      const side = hash(seed++) < 0.5 ? 1 : -1;
      trees.push(+(p[i] + dx * s / L + nx * off * side).toFixed(1), +(p[i + 1] + dz * s / L + nz * off * side).toFixed(1));
    }
  }
}

// House-number plates: put each plate on the facade point closest to its own street.
const roadsByName = new Map();
for (const r of roads) { if (r[2] < 0) continue; const k = names[r[2]]; if (!roadsByName.has(k)) roadsByName.set(k, []); roadsByName.get(k).push(r.slice(3)); }
const segDist = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; let t = ((x - ax) * dx + (z - az) * dz) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
const A = [];
for (const a of addrs) {
  const rs = roadsByName.get(a.street) || [];
  const p = a.pts, n = p.length / 2; let best = null, bd = 1e9;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1], L = Math.hypot(bx - ax, bz - az);
    if (L < 1.5) continue;
    const nx = (bz - az) / L, nz = -(bx - ax) / L;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    let d = 1e9;
    for (const r of rs) for (let k = 0; k + 3 < r.length; k += 2) d = Math.min(d, segDist(mx, mz, r[k], r[k + 1], r[k + 2], r[k + 3]));
    if (d < bd) { bd = d; best = [mx + nx * 0.35, mz + nz * 0.35, nx, nz]; }
  }
  if (!best) continue;
  A.push([a.bi, nameId(a.street), a.num, ...best.map((v) => +v.toFixed(2))]);
}

places.sort((a, b) => b.h - a.h);
const out = { origin: [LAT0, LON0], n: names, b: buildings, r: roads, g: greens, w: waters, t: trees, p: places, a: A, pn: named };
fs.writeFileSync(new URL('../public/data/city.json', import.meta.url), JSON.stringify(out));
console.log({ addresses: A.length, streetNames: names.length, buildings: buildings.length, roads: roads.length, greens: greens.length, waters: waters.length, trees: trees.length / 2, places: places.length });
console.log(places.slice(0, 30).map((p) => `${p.name} ${p.h}m @${p.x},${p.z}`).join('\n'));
console.log(places.filter(p=>p.park).sort((a,b)=>b.park-a.park).slice(0,8).map((p) => `${p.name} park ${Math.round(p.park)} @${p.x},${p.z}`).join('\n'));
