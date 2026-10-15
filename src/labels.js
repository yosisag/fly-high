import * as THREE from 'three';

/**
 * Street-name decals painted on the asphalt + Israeli blue house-number plates on facades.
 * Only the nearest few are materialised (pooled meshes, cached canvas textures).
 */
export function createLabels(data, scene) {
  const names = data.n;

  // --- anchors ---------------------------------------------------------------
  const roadAnchors = []; // {x,z,ang,w,name}
  for (const r of data.r) {
    if (r[2] < 0) continue;
    const p = r.slice(3); let acc = 70;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1], L = Math.hypot(dx, dz);
      if (L < 30) { acc += L; continue; }
      for (let t = Math.min(L / 2, 20); t < L - 10; t += 110) {
        if (acc + t < 60) continue;
        let ang = Math.atan2(dz, dx); // text runs along the road; keep it upright-ish when seen from the south
        if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
        roadAnchors.push({ x: p[i] + dx * t / L, z: p[i + 1] + dz * t / L, ang, w: r[0], y: 0.24 + r[1] * 0.012, name: names[r[2]] });
        acc = 0;
      }
      acc += L;
    }
  }
  const plates = data.a.map(([bi, si, num, x, z, nx, nz]) => ({ bi, street: names[si], num, x, z, nx, nz }));

  // simple spatial buckets
  const bucket = (arr, S) => { const m = new Map(); arr.forEach((a, i) => { const k = Math.floor(a.x / S) + ',' + Math.floor(a.z / S); if (!m.has(k)) m.set(k, []); m.get(k).push(i); }); return m; };
  const RB = bucket(roadAnchors, 150), PB = bucket(plates, 60);
  const near = (arr, B, S, x, z, R) => {
    const out = []; const r = Math.ceil(R / S);
    const gx = Math.floor(x / S), gz = Math.floor(z / S);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const l = B.get((gx + i) + ',' + (gz + j)); if (!l) continue;
      for (const k of l) { const a = arr[k]; const d = Math.hypot(a.x - x, a.z - z); if (d < R) out.push([d, a]); }
    }
    return out.sort((a, b) => a[0] - b[0]);
  };

  // --- textures ---------------------------------------------------------------
  const cache = new Map();
  const texCache = (key, draw, w, h) => {
    let t = cache.get(key);
    if (t) { cache.delete(key); cache.set(key, t); return t; }
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    cache.set(key, t);
    if (cache.size > 220) { const [k, old] = cache.entries().next().value; old.dispose(); cache.delete(k); }
    return t;
  };
  const roadTex = (name) => texCache('r:' + name, (g, w, h) => {
    g.font = '700 84px Rubik, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    g.lineWidth = 10; g.strokeStyle = 'rgba(20,20,26,0.55)'; g.strokeText(name, w / 2, h / 2);
    g.fillStyle = 'rgba(255,250,235,0.92)'; g.fillText(name, w / 2, h / 2);
  }, 1024, 128);
  const plateTex = (street, num) => texCache('p:' + street + num, (g, w, h) => {
    const r = 22; g.fillStyle = '#1b4f9e';
    g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, r); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#f4f4f4'; g.beginPath(); g.roundRect(16, 16, w - 32, h - 32, r - 8); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    g.font = '900 96px Rubik, Arial'; g.fillText(num, w / 2, h * 0.43);
    g.font = '700 38px Rubik, Arial'; g.fillText(street, w / 2, h * 0.8);
  }, 320, 220);

  // --- pools ---------------------------------------------------------------
  const roadGeo = new THREE.PlaneGeometry(1, 0.125); roadGeo.rotateX(-Math.PI / 2);
  const roadPool = [];
  for (let i = 0; i < 48; i++) {
    const m = new THREE.Mesh(roadGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false, opacity: 0.9 }));
    m.visible = false; m.renderOrder = 2; scene.add(m); roadPool.push(m);
  }
  const plateGeo = new THREE.PlaneGeometry(0.62, 0.43);
  const platePool = [];
  for (let i = 0; i < 28; i++) {
    const m = new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.25 }));
    m.visible = false; scene.add(m); platePool.push(m);
  }

  let t = 0;
  const update = (dt, pos, walking, yOff = 0) => {
    t -= dt; if (t > 0) return; t = 0.35;
    // road names: bigger letters when flying so they read from altitude
    const alt = pos.y;
    const R = walking ? 160 : Math.min(700, 250 + alt * 2.5);
    const list = alt - yOff > 260 && !walking ? [] : near(roadAnchors, RB, 150, pos.x, pos.z, R);
    for (let i = 0; i < roadPool.length; i++) {
      const m = roadPool[i], a = list[i]?.[1];
      if (!a) { m.visible = false; continue; }
      const len = Math.min(a.w * 0.9 * 8, walking ? 34 : 60) * (walking ? 0.75 : 1);
      m.material.map = roadTex(a.name); m.material.needsUpdate = m.userData.name !== a.name; m.userData.name = a.name;
      m.scale.set(len, 1, len); m.position.set(a.x, a.y + yOff, a.z); m.rotation.y = -a.ang; m.visible = true;
    }
    // house plates only when low
    const pl = alt - yOff < 70 ? near(plates, PB, 60, pos.x, pos.z, walking ? 55 : 90) : [];
    for (let i = 0; i < platePool.length; i++) {
      const m = platePool[i], a = pl[i]?.[1];
      if (!a) { m.visible = false; continue; }
      const key = a.street + a.num;
      if (m.userData.key !== key) { m.material.map = plateTex(a.street, a.num); m.material.emissiveMap = m.material.map; m.material.needsUpdate = true; m.userData.key = key; }
      m.position.set(a.x, 2.6 + yOff, a.z); m.rotation.y = Math.atan2(a.nx, a.nz);
      const s = walking ? 1.4 : 4; m.scale.setScalar(s); if (!walking) m.position.y = 5 + yOff;
      m.visible = true;
    }
  };

  // nearest street name + nearest address (for the walking HUD)
  const where = (x, z) => {
    const p = near(plates, PB, 60, x, z, 45)[0]?.[1];
    let road = null, rd = 30;
    // precise nearest named road
    for (const r of data.r) {
      if (r[2] < 0) continue;
      const q = r.slice(3);
      for (let i = 0; i + 3 < q.length; i += 2) {
        const ax = q[i], az = q[i + 1], bx = q[i + 2], bz = q[i + 3];
        if (Math.abs(ax - x) > 400 || Math.abs(az - z) > 400) continue;
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; let tt = ((x - ax) * dx + (z - az) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
        const d = Math.hypot(x - ax - dx * tt, z - az - dz * tt); if (d < rd) { rd = d; road = names[r[2]]; }
      }
    }
    return { road, plate: p };
  };

  const findAddress = (street, num) => plates.find((p) => p.street === street && String(p.num).split(',').includes(String(num)));
  return { update, where, findAddress };
}
