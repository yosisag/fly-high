// Street-level detail around the home block (scripts/raw-block.json → public/data/block.json)
import fs from 'node:fs';
const raw = JSON.parse(fs.readFileSync(new URL('./raw-block.json', import.meta.url)));
const LAT0 = 32.090, LON0 = 34.880, PHI = LAT0 * Math.PI / 180;
const KX = 111412.84 * Math.cos(PHI) - 93.5 * Math.cos(3 * PHI);
const KZ = 111132.92 - 559.82 * Math.cos(2 * PHI) + 1.175 * Math.cos(4 * PHI);
const P = (p) => [+((p.lon - LON0) * KX).toFixed(2), +(-(p.lat - LAT0) * KZ).toFixed(2)];
const flat = (g) => g.flatMap(P);
const out = { paths: [], service: [], areas: [], points: [] };
const POINT_KINDS = ['bench', 'waste_basket', 'recycling', 'drinking_water', 'fountain', 'atm', 'bicycle_parking', 'charging_station', 'vending_machine', 'shelter'];
for (const e of raw.elements) {
  const t = e.tags || {};
  if (e.type === 'node') {
    const [x, z] = P(e);
    if (t.entrance) out.points.push({ k: 'entrance', x, z });
    else if (t.shop) out.points.push({ k: 'shop', x, z, name: t.name || '' });
    else if (POINT_KINDS.includes(t.amenity)) out.points.push({ k: t.amenity, x, z });
    continue;
  }
  const g = e.geometry || (e.members || []).find((m) => m.role === 'outer' && m.geometry)?.geometry;
  if (!g) continue;
  if (t.highway === 'service') out.service.push(flat(g));
  else if (t.highway) out.paths.push({ k: t.highway, p: flat(g) });
  else if (t.amenity === 'parking') out.areas.push({ k: 'parking', p: flat(g) });
  else if (t.leisure === 'playground') out.areas.push({ k: 'playground', p: flat(g) });
  else if (t.leisure === 'pitch') out.areas.push({ k: 'pitch', p: flat(g) });
  else if (t.amenity === 'school' || t.amenity === 'kindergarten') out.areas.push({ k: 'school', p: flat(g) });
  else if (t.amenity === 'fountain') out.points.push({ k: 'fountain', x: P(g[0])[0], z: P(g[0])[1] });
}
fs.writeFileSync(new URL('../public/data/block.json', import.meta.url), JSON.stringify(out));
console.log({ paths: out.paths.length, service: out.service.length, areas: out.areas.length, points: out.points.length });
