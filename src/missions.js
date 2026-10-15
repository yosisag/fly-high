import * as THREE from 'three';

/**
 * Missions built on real Petah Tikva data: deliveries to real addresses, landing at real buildings
 * and parks, and a checkpoint race between the real towers.
 *
 * Stage types
 *   door     – walk to within 5 m of a building entrance (house-number plate position)
 *   building – walk to within 7 m of a named building's outline
 *   land     – be on foot within r metres of a point (parks)
 *   ring     – fly through a checkpoint ring
 */
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; };

export function createMissions({ scene, data, home, store }) {
  const names = data.n;
  const plates = data.a.map(([bi, si, num, x, z, nx, nz]) => ({ bi, street: names[si], num: String(num).split(',')[0], x: x + nx * 2.5, z: z + nz * 2.5 }));
  const named = (re) => data.pn.find((p) => re.test(p[0]));
  const bPoly = (bi) => data.b[bi].slice(3);
  const plateNear = (x, z, rMin, rMax, seed) => {
    const c = plates.filter((p) => { const d = Math.hypot(p.x - x, p.z - z); return d > rMin && d < rMax && !(home && p.bi === home.plate.bi); });
    return c[Math.floor(hash(seed) * c.length)] || plates[0];
  };
  const parks = data.p.filter((p) => p.park && p.park > 15000).sort((a, b) => b.park - a.park);
  const towers = data.p.filter((p) => p.h >= 55);

  const homeDoor = home ? { x: home.door.x, z: home.door.z } : { x: 0, z: 0 };
  const doorStage = (p, verb = 'מסרו את החבילה ל') => ({ type: 'door', x: p.x, z: p.z, label: `${p.street} ${p.num}`, text: `${verb}${p.street} ${p.num}` });
  const bldStage = (re, label, verb) => { const n = named(re); return n ? { type: 'building', x: n[1], z: n[2], bi: n[3], label, text: `${verb}${label}` } : null; };

  // stage generators are functions so random missions differ every run
  const DEFS = [
    { id: 'neighbor', icon: '📦', name: 'משלוח לשכן', desc: 'צאו מהבית ומסרו חבילה לשכן ברחוב. אפשר ללכת או לעוף.', start: 'home-walk', stars: [70, 140],
      stages: (seed) => [doorStage(plateNear(homeDoor.x, homeDoor.z, 120, 420, seed))] },
    { id: 'library', icon: '📚', name: 'החזרת ספר', desc: 'הספר באיחור! טוסו לספריית כפר גנים, נחתו והיכנסו.', start: 'home-fly', stars: [75, 150],
      stages: () => [bldStage(/^ספריית כפר גנים/, 'ספריית כפר גנים', 'היכנסו ל')].filter(Boolean) },
    { id: 'pizza', icon: '🍕', name: 'פיצה חמה', desc: 'אספו פיצה מקניון גנים ומסרו אותה לפני שתתקרר — 3 דקות.', start: 'home-fly', stars: [120, 170], limit: 180,
      stages: (seed) => { const m = named(/^קניון גנים/); const s1 = bldStage(/^קניון גנים/, 'קניון גנים', 'אספו את הפיצה מ'); return [s1, doorStage(plateNear(m ? m[1] : 0, m ? m[2] : 0, 600, 1300, seed + 3), 'מסרו פיצה ל')].filter(Boolean); } },
    { id: 'parks', icon: '🌳', name: 'שלושה פארקים', desc: 'נחתו בשלושת הפארקים הגדולים בעיר — לפי הסדר.', start: 'home-fly', stars: [150, 260],
      stages: () => parks.slice(0, 3).map((p) => ({ type: 'land', x: p.x, z: p.z, r: 70, label: p.name, text: `נחתו ב${p.name}` })) },
    { id: 'race', icon: '🏁', name: 'מרוץ המגדלים', desc: '10 טבעות בין המגדלים הגבוהים. כמה מהר אתם?', start: 'race', stars: [95, 140],
      stages: () => raceRings() },
    { id: 'cityhall', icon: '🏛️', name: 'פגישה בעירייה', desc: 'טוסו מהבית לעיריית פתח תקווה ובקרו גם בשוק בדרך חזרה.', start: 'home-fly', stars: [140, 230],
      stages: () => [bldStage(/^עיריית פתח תקווה$/, 'עיריית פתח תקווה', 'היכנסו ל'), bldStage(/^שוק פתח תקווה/, 'שוק פתח תקווה', 'קנו פירות ב')].filter(Boolean) },
    { id: 'night', icon: '🌃', name: 'שליח לילה', desc: 'שלוש חבילות, שלוש כתובות, באמצע הלילה.', start: 'home-fly', stars: [170, 280], tod: 1,
      stages: (seed) => { const a = plateNear(homeDoor.x, homeDoor.z, 500, 1000, seed), b = plateNear(a.x, a.z, 500, 1000, seed + 7), c = plateNear(b.x, b.z, 500, 1100, seed + 13); return [doorStage(a), doorStage(b), doorStage(c)]; } },
    { id: 'random', icon: '🎲', name: 'משימה אקראית', desc: 'כתובת חדשה בכל פעם, איפשהו בעיר.', start: 'home-fly', stars: [90, 160], random: true,
      stages: (seed) => [doorStage(plateNear(homeDoor.x, homeDoor.z, 700, 2400, seed))] },
  ];

  function raceRings() {
    // a loop through the tall towers, ordered greedily from the city centre westwards
    const pts = []; const used = new Set(); let cur = { x: 300, z: -100 };
    const clean = (n) => n.replace(/\s+([\dA-Za-z]|One)$/, '');
    const pool = towers.filter((t, i, a) => a.findIndex((q) => Math.hypot(q.x - t.x, q.z - t.z) < 120 || clean(q.name) === clean(t.name)) === i);
    for (let k = 0; k < Math.min(10, pool.length); k++) {
      let best = null, bd = 1e9; for (const t of pool) { if (used.has(t)) continue; const d = Math.hypot(t.x - cur.x, t.z - cur.z); if (d < bd) { bd = d; best = t; } }
      if (!best) break; used.add(best); cur = best;
      pts.push({ type: 'ring', x: best.x + 45, z: best.z + 45, y: Math.min(90, best.h * 0.6), label: best.name.replace(/\s+([\dA-Za-z]|One)$/, ''), text: `עברו בטבעת ליד ${best.name.replace(/\s+([\dA-Za-z]|One)$/, '')}` });
    }
    return pts;
  }

  /* ---------- visuals for the active target ---------- */
  const grp = new THREE.Group(); grp.visible = false; scene.add(grp);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 900, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.7, 2.4), transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 450; grp.add(beam);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(12, 1.1, 14, 64), new THREE.MeshStandardMaterial({ color: '#c79bff', emissive: '#9a5bff', emissiveIntensity: 1.4, metalness: 0.8, roughness: 0.25 }));
  grp.add(ring);
  const padMesh = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.2, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.9, 2.6), transparent: true, opacity: 0.85, side: THREE.DoubleSide, fog: false, depthWrite: false }));
  padMesh.rotation.x = -Math.PI / 2; padMesh.position.y = 0.35; grp.add(padMesh);
  const signTex = document.createElement('canvas'); signTex.width = 512; signTex.height = 140;
  const sTex = new THREE.CanvasTexture(signTex); sTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: sTex, depthWrite: false, fog: false, toneMapped: false })); sign.scale.set(24, 6.6, 1); grp.add(sign);
  const drawSign = (icon, text) => {
    const g = signTex.getContext('2d'); g.clearRect(0, 0, 512, 140);
    g.fillStyle = 'rgba(24,10,40,0.85)'; g.beginPath(); g.roundRect(6, 6, 500, 128, 36); g.fill(); g.lineWidth = 5; g.strokeStyle = '#c79bff'; g.stroke();
    g.fillStyle = '#fff'; g.font = '700 50px Rubik, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl'; g.fillText(`${icon} ${text}`, 256, 72); sTex.needsUpdate = true;
  };

  /* ---------- state ---------- */
  let cur = null; // { def, stages, i, t0, seed }
  const progress = () => { try { return JSON.parse(store.get('flypt.missions') || '{}'); } catch { return {}; } };
  const saveResult = (id, stars, time) => { const p = progress(); const o = p[id] || {}; p[id] = { stars: Math.max(o.stars || 0, stars), time: o.time ? Math.min(o.time, time) : time }; store.set('flypt.missions', JSON.stringify(p)); };

  const showStage = (groundY = 0) => {
    const st = cur.stages[cur.i]; grp.visible = true;
    const isRing = st.type === 'ring';
    ring.visible = isRing; padMesh.visible = st.type === 'door';
    grp.position.set(st.x, 0, st.z);
    ring.position.y = st.y || 0;
    const prev = cur.stages[cur.i - 1] || { x: st.x - 1, z: st.z }; ring.rotation.set(0, Math.atan2(st.x - prev.x, st.z - prev.z), 0); // face the approach
    sign.position.y = isRing ? (st.y || 0) + 22 : (st.type === 'building' ? 45 : st.type === 'land' ? 30 : 9) + groundY;
    padMesh.position.y = 0.35 + groundY;
    drawSign(cur.def.icon, st.label);
  };

  const start = (def) => {
    const seed = def.random ? (Date.now() & 0xffff) : (+(store.get('flypt.mseed.' + def.id) || 1));
    if (!def.random) store.set('flypt.mseed.' + def.id, String(seed + 1)); // a different neighbour next time
    const stages = def.stages(seed);
    cur = { def, stages, i: 0, t0: performance.now(), seed };
    showStage();
    return cur;
  };
  const stop = () => { cur = null; grp.visible = false; };

  // returns 'stage' | 'done' | 'fail' | null
  const update = (dt, S, walkerPos, mode) => {
    if (!cur) return null;
    ring.rotation.z += dt * 0.8; padMesh.material.opacity = 0.6 + Math.sin(performance.now() / 250) * 0.25;
    beam.material.opacity = 0.2 + Math.sin(performance.now() / 400) * 0.06;
    beam.visible = Math.hypot(S.pos.x - grp.position.x, S.pos.z - grp.position.z) > 60; // a beam you stand inside just washes out the screen
    const st = cur.stages[cur.i]; const elapsed = (performance.now() - cur.t0) / 1000;
    if (cur.def.limit && elapsed > cur.def.limit) return 'fail';
    let hit = false;
    if (st.type === 'ring') hit = mode === 'fly' && Math.hypot(S.pos.x - st.x, S.pos.y - st.y, S.pos.z - st.z) < 15;
    else if (mode === 'walk') {
      const p = walkerPos;
      if (st.type === 'door') hit = Math.hypot(p.x - st.x, p.z - st.z) < 5;
      else if (st.type === 'land') hit = Math.hypot(p.x - st.x, p.z - st.z) < st.r;
      else if (st.type === 'building') {
        const b = bPoly(st.bi); let d = 1e9;
        for (let i = 0, n = b.length / 2; i < n; i++) { const j = (i + 1) % n, ax = b[i * 2], az = b[i * 2 + 1], bx = b[j * 2], bz = b[j * 2 + 1], dx = bx - ax, dzz = bz - az, L2 = dx * dx + dzz * dzz || 1; let t = ((p.x - ax) * dx + (p.z - az) * dzz) / L2; t = Math.max(0, Math.min(1, t)); d = Math.min(d, Math.hypot(p.x - ax - dx * t, p.z - az - dzz * t)); }
        hit = d < 7;
      }
    }
    if (!hit) return null;
    cur.i++;
    if (cur.i >= cur.stages.length) {
      const t = elapsed, [s3, s2] = cur.def.stars; const stars = t <= s3 ? 3 : t <= s2 ? 2 : 1;
      saveResult(cur.def.id, stars, t); cur.result = { stars, time: t }; grp.visible = false; return 'done';
    }
    showStage(); return 'stage';
  };

  const target = () => { if (!cur) return null; const st = cur.stages[cur.i]; return { x: st.x, y: st.type === 'ring' ? st.y : 10, z: st.z, st }; };
  return { defs: DEFS, start, stop, update, target, progress, get current() { return cur; } };
}
