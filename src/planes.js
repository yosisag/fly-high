import * as THREE from 'three';

/**
 * Detailed procedural aircraft (no downloaded assets).
 *  - 'airliner': narrow-body twin jet in the style of an A320 (~37.6 m long, 34 m span)
 *  - 'light':    high-wing single-prop trainer in the style of a Cessna 172 (~8.3 m long, 11 m span)
 * Both face -Z, origin at the centre of gravity, wheels touch y = -gearHeight.
 * Returned object: { root, update(dt, state), gearHeight, def } where state = { gear, thr, v, t }.
 */

export const PLANES = {
  airliner: {
    id: 'airliner', name: 'מטוס נוסעים', icon: '✈️', desc: 'מהיר, טס גבוה — טיסה של חברת תעופה',
    vRotate: 70, vStall: 55, vApproach: 78, vCruise: 225, thrust: 9.5, drag: 1.5e-4, cruiseAlt: 5000,
    warpMax: 100, gearH: 4.1, retract: true, cam: { back: 62, up: 15, cockpit: [0, 1.9, -15.6] }, turn: 0.22, ktRotate: 140,
  },
  light: {
    id: 'light', name: 'מטוס קל', icon: '🛩️', desc: 'איטי וקל לשליטה — כמו צסנה, מושלם למתחילים',
    vRotate: 28, vStall: 23, vApproach: 34, vCruise: 62, thrust: 3.2, drag: 8.2e-4, cruiseAlt: 1500,
    warpMax: 200, gearH: 1.35, retract: false, cam: { back: 17, up: 4.5, cockpit: [-0.28, 0.5, -1.25] }, turn: 0.32, ktRotate: 55,
  },
};

const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

/** Lathe a body of revolution along -Z from a profile of [z, radius] pairs (nose first), evenly re-sampled. */
function bodyOfRevolution(profile, { segs = 48, samples = 120, sy = 1, sx = 1, upsweep = null } = {}) {
  const z0 = profile[0][0], z1 = profile[profile.length - 1][0];
  const radiusAt = (z) => { for (let i = 1; i < profile.length; i++) { const [za, ra] = profile[i - 1], [zb, rb] = profile[i]; if (z <= zb) { const t = (z - za) / (zb - za || 1); const s = t * t * (3 - 2 * t); return ra + (rb - ra) * (profile[i][2] === 'lin' ? t : s); } } return profile[profile.length - 1][1]; };
  const pts = [];
  for (let i = 0; i <= samples; i++) { const z = z1 - (z1 - z0) * (i / samples); pts.push(new THREE.Vector2(Math.max(0.001, radiusAt(z)), -z)); } // y = -z so nose (most negative z) is last
  const g = new THREE.LatheGeometry(pts, segs);
  g.rotateX(-Math.PI / 2); // lathe axis Y → -Z forward
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * sx, y = p.getY(i) * sy; const z = p.getZ(i);
    if (upsweep) y += upsweep(z);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function wing({ span, root, tip, sweep, thick, dihedral = 0, side = 1, z = 0, y = 0, x0 = 0 }) {
  // planform in (x along span, z along chord); simple thick airfoil-ish slab with rounded leading edge via bevel
  const s = new THREE.Shape();
  const le = (u) => u * span * Math.tan(sweep);
  s.moveTo(0, 0); s.lineTo(span, le(1)); s.lineTo(span, le(1) + tip); s.lineTo(0, root); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.45, bevelSize: thick * 0.45, bevelSegments: 3, curveSegments: 4 });
  g.rotateX(Math.PI / 2); // shape y → +z (chord backwards), extrusion → -y
  g.translate(0, thick / 2, 0);
  // thin towards the tip
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const xx = p.getX(i), u = Math.min(1, Math.max(0, xx / span)); p.setY(i, p.getY(i) * (1 - 0.55 * u) + xx * Math.tan(dihedral)); }
  if (side < 0) g.scale(-1, 1, 1);
  g.translate(x0 * side, y, z);
  g.computeVertexNormals();
  return g;
}

function fin({ height, root, tip, sweep, thick, z, y }) {
  const s = new THREE.Shape(); const off = height * Math.tan(sweep);
  s.moveTo(0, 0); s.lineTo(root, 0); s.lineTo(off + tip, height); s.lineTo(off, height); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: thick * 0.4, bevelSegments: 2 });
  g.rotateY(-Math.PI / 2); // shape x → +z (chord), shape y → +y (height)
  g.translate(thick / 2, y, z);
  g.computeVertexNormals();
  return g;
}

function lights(root, list) {
  const out = [];
  for (const [x, y, z, color, kind] of list) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(kind === 'land' ? 0.18 : 0.12, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(4) }));
    m.position.set(x, y, z); m.userData.kind = kind; root.add(m); out.push(m);
  }
  return out;
}

/* ============================== AIRLINER ============================== */
function createAirliner() {
  const root = new THREE.Group();
  const L = 37.6, R = 1.98;
  // livery painted in UV space: u = around (0 top, .25 right, .5 bottom, .75 left), v = along (0 tail … 1 nose)
  const livery = canvasTex(4096, 1024, (g, W, H) => {
    g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, W, H);
    // belly
    const bel = g.createLinearGradient(0, 0, 0, 1); void bel;
    g.fillStyle = '#c9d2dc'; g.fillRect(0.4 * W, 0, 0.2 * W, H);
    // cheat lines (both sides), u≈.28/.72 below the windows
    for (const u of [0.29, 0.71]) { g.fillStyle = '#1b4fa8'; g.fillRect(u * W - 34, 0, 68, H); g.fillStyle = '#35b6ff'; g.fillRect(u * W + (u < 0.5 ? 40 : -54), 0, 14, H); }
    // windows row u≈.205 / .795, v from .2 to .82 (0 tail at bottom of canvas because flipY)
    const vy = (v) => (1 - v) * H;
    for (const u of [0.205, 0.795]) {
      for (let v = 0.22; v < 0.81; v += 0.0172) { if (Math.abs(v - 0.52) < 0.012 || Math.abs(v - 0.585) < 0.012) continue; // over-wing exits
        g.fillStyle = '#1a2230'; g.beginPath(); g.roundRect(u * W - 13, vy(v) - 7, 26, 15, 7); g.fill(); }
      // doors
      g.strokeStyle = '#aab4c0'; g.lineWidth = 4;
      for (const v of [0.84, 0.135, 0.52, 0.585]) { const big = v > 0.8 || v < 0.2; g.strokeRect(u * W - (big ? 30 : 18), vy(v) - (big ? 22 : 13), big ? 60 : 36, big ? 44 : 26); }
      // cockpit windows
      g.fillStyle = '#121a26';
      g.beginPath(); g.moveTo(u * W - 40, vy(0.925)); g.lineTo(u * W + 40, vy(0.925)); g.lineTo(u * W + 30, vy(0.95)); g.lineTo(u * W - 30, vy(0.95)); g.fill();
    }
    g.fillStyle = '#121a26'; g.fillRect(0.12 * W, vy(0.955), 0.76 * W - 0.76 * W + 0.0 * W, 0); // (front panes handled above)
    g.fillRect(-60, vy(0.952), 120, 26); g.fillRect(W - 60, vy(0.952), 120, 26);
    // titles on both sides
    g.save(); g.font = '900 96px Rubik, Arial'; g.fillStyle = '#1b4fa8'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [u, rot] of [[0.165, Math.PI / 2], [0.835, -Math.PI / 2]]) { g.save(); g.translate(u * W, vy(0.6)); g.rotate(rot); g.scale(1, 0.55); g.fillText('MILIMON AIR', 0, 0); g.restore(); }
    g.restore();
  });
  const paint = new THREE.MeshPhysicalMaterial({ map: livery, roughness: 0.32, metalness: 0.08, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const metal = new THREE.MeshStandardMaterial({ color: '#c7ccd2', roughness: 0.35, metalness: 0.75 });
  const wingMat = new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: 0.42, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1d2228', roughness: 0.5, metalness: 0.5 });
  const blue = new THREE.MeshPhysicalMaterial({ color: '#1b4fa8', roughness: 0.3, metalness: 0.1, clearcoat: 0.8 });

  const fus = new THREE.Mesh(bodyOfRevolution([[-L / 2, 0.02], [-L / 2 + 0.6, 0.75], [-L / 2 + 2.2, 1.55], [-L / 2 + 5, R], [L / 2 - 11, R], [L / 2 - 0.5, 0.42], [L / 2, 0.18, 'lin']],
    { sy: 1.07, upsweep: (z) => (z > L / 2 - 11 ? ((z - (L / 2 - 11)) / 11) ** 1.6 * 1.45 : 0) + (z < -L / 2 + 4 ? -(((-L / 2 + 4 - z) / 4) ** 2) * 0.35 : 0) }), paint);
  root.add(fus);
  // belly fairing
  const fair = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.MeshStandardMaterial({ color: '#c3ccd6', roughness: 0.45, metalness: 0.2 }));
  fair.scale.set(2.1, 0.8, 6.5); fair.position.set(0, -1.75, 0.6); root.add(fair);

  // wings: 34 m span, 25° sweep, dihedral 5°, winglets
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(wing({ span: 15.3, root: 6.1, tip: 1.6, sweep: 25 * Math.PI / 180, thick: 0.42, dihedral: 5 * Math.PI / 180, side, z: -3.1, y: -1.25, x0: 1.6 }), wingMat); root.add(w);
    const tipX = side * (1.6 + 15.3), tipZ = -3.1 + 15.3 * Math.tan(25 * Math.PI / 180), tipY = -1.25 + 15.3 * Math.tan(5 * Math.PI / 180);
    const wl = new THREE.Mesh(fin({ height: 2.4, root: 1.5, tip: 0.6, sweep: 40 * Math.PI / 180, thick: 0.08, z: tipZ, y: tipY }), blue); wl.position.x = tipX; wl.rotation.z = -side * 0.1; root.add(wl);
    // flap-track fairings
    for (const u of [0.25, 0.45, 0.65]) { const ft = new THREE.Mesh(new THREE.ConeGeometry(0.22, 2.4, 8), wingMat); ft.rotation.x = Math.PI / 2; const xx = 1.6 + u * 15.3; ft.position.set(side * xx, -1.45 + u * 15.3 * 0.087, -3.1 + u * 15.3 * 0.466 + 5.2 - u * 3); root.add(ft); }
    // engine (CFM-style): nacelle + fan + spinner + pylon
    const nac = new THREE.Mesh(bodyOfRevolution([[-2.5, 0.98], [-2.3, 1.08], [-1.2, 1.12], [0.9, 0.98], [1.9, 0.62], [2.4, 0.42, 'lin']], { segs: 36, samples: 40 }), metal);
    nac.position.set(side * 5.75, -2.35, -5.4); root.add(nac);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.12, 10, 36), new THREE.MeshStandardMaterial({ color: '#e8ebee', roughness: 0.25, metalness: 0.9 })); lip.position.set(side * 5.75, -2.35, -7.9); root.add(lip);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.95, 36), dark); fan.position.set(side * 5.75, -2.35, -7.75); fan.rotation.y = Math.PI; root.add(fan);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 16), new THREE.MeshStandardMaterial({ color: '#30363d', metalness: 0.9, roughness: 0.3 })); sp.rotation.x = -Math.PI / 2; sp.position.set(side * 5.75, -2.35, -7.95); root.add(sp);
    const ex = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 16), dark); ex.rotation.x = Math.PI / 2; ex.position.set(side * 5.75, -2.35, -2.5); root.add(ex);
    const py = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.0, 4.2), wingMat); py.position.set(side * 5.75, -1.65, -4.4); py.rotation.x = 0.08; root.add(py);
  }
  // tail: horizontal stabiliser + fin with livery colour and logo
  for (const side of [-1, 1]) root.add(new THREE.Mesh(wing({ span: 6.0, root: 3.6, tip: 1.3, sweep: 30 * Math.PI / 180, thick: 0.22, dihedral: 6 * Math.PI / 180, side, z: 13.9, y: 0.75, x0: 0.6 }), wingMat));
  const finMesh = new THREE.Mesh(fin({ height: 6.0, root: 5.2, tip: 1.9, sweep: 35 * Math.PI / 180, thick: 0.26, z: 12.6, y: 1.8 }), blue); root.add(finMesh);
  const logo = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), new THREE.MeshBasicMaterial({ map: canvasTex(256, 256, (g) => { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill(); g.fillStyle = '#ff5ea8'; g.font = '900 150px Rubik, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', 128, 140); }) }));
  for (const side of [-1, 1]) { const l = logo.clone(); l.position.set(side * 0.3, 4.6, 15.8); l.rotation.y = side * Math.PI / 2; root.add(l); }

  // landing gear (retractable)
  const gear = new THREE.Group(); root.add(gear);
  const tire = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 });
  const wheel = (x, y, z, r, w) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18), tire); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); gear.add(m); const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 14), metal); hub.rotation.z = Math.PI / 2; hub.position.set(x, y, z); gear.add(hub); };
  for (const side of [-1, 1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.4, 10), metal); st.position.set(side * 3.8, -2.85, 0.2); gear.add(st); wheel(side * 3.55, -3.55, 0.2, 0.58, 0.36); wheel(side * 4.05, -3.55, 0.2, 0.58, 0.36); }
  { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.9, 10), metal); st.position.set(0, -2.6, -13.2); gear.add(st); wheel(-0.25, -3.6, -13.2, 0.4, 0.26); wheel(0.25, -3.6, -13.2, 0.4, 0.26); }

  const L8 = lights(root, [[-18.3, 0.1, 4.6, '#ff2a2a', 'nav'], [18.3, 0.1, 4.6, '#2aff5a', 'nav'], [0, 2.2, 0, '#ff2020', 'beacon'], [0, -2.55, 2, '#ff2020', 'beacon'], [-18.3, 0.1, 4.9, '#ffffff', 'strobe'], [18.3, 0.1, 4.9, '#ffffff', 'strobe'], [0, 5.7, 18.4, '#ffffff', 'strobe'], [-2.2, -1.6, -2.8, '#fff6dc', 'land'], [2.2, -1.6, -2.8, '#fff6dc', 'land']]);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  let gearT = 1;
  const update = (dt, s) => {
    gearT = THREE.MathUtils.damp(gearT, s.gear ? 1 : 0, 1.5, dt); gear.scale.y = Math.max(0.01, gearT); gear.position.y = (1 - gearT) * 1.6; gear.visible = gearT > 0.03;
    for (const l of L8) { const k = l.userData.kind; l.visible = k === 'nav' || (k === 'beacon' && (s.t % 1.2) < 0.12) || (k === 'strobe' && (s.t % 1.5) < 0.06) || (k === 'land' && s.gear); }
  };
  return { root, update, gearHeight: 4.1 };
}

/* ============================== LIGHT PLANE ============================== */
function createLight() {
  const root = new THREE.Group();
  const livery = canvasTex(2048, 512, (g, W, H) => {
    g.fillStyle = '#f7f8fa'; g.fillRect(0, 0, W, H);
    const vy = (v) => (1 - v) * H;
    for (const u of [0.25, 0.75]) {
      // stripes
      g.fillStyle = '#c4262e'; g.fillRect(u * W - 70, 0, 26, H); g.fillStyle = '#1b3f8f'; g.fillRect(u * W - 40, 0, 12, H);
      // cabin windows (v .62–.78) + rear window
      g.fillStyle = '#1a2534'; g.beginPath(); g.roundRect(u * W - 70 + (u < 0.5 ? -120 : 70), vy(0.79), 120, vy(0.62) - vy(0.79), 18); g.fill();
      g.beginPath(); g.roundRect(u * W - 70 + (u < 0.5 ? -110 : 70), vy(0.6), 100, vy(0.5) - vy(0.6), 22); g.fill();
      // registration
      g.save(); g.translate(u * W + (u < 0.5 ? -40 : 40), vy(0.3)); g.rotate(u < 0.5 ? Math.PI / 2 : -Math.PI / 2); g.scale(1, 0.6); g.font = '900 86px Arial'; g.fillStyle = '#1b3f8f'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('4X-MLM', 0, 0); g.restore();
    }
    // windscreen at the top front
    g.fillStyle = '#1a2534'; g.beginPath(); g.roundRect(-150, vy(0.84), 300, vy(0.76) - vy(0.84), 20); g.fill(); g.beginPath(); g.roundRect(W - 150, vy(0.84), 300, vy(0.76) - vy(0.84), 20); g.fill();
  });
  const paint = new THREE.MeshPhysicalMaterial({ map: livery, roughness: 0.35, metalness: 0.05, clearcoat: 0.6 });
  const red = new THREE.MeshPhysicalMaterial({ color: '#c4262e', roughness: 0.35, clearcoat: 0.6 });
  const white = new THREE.MeshPhysicalMaterial({ color: '#f5f6f8', roughness: 0.35, clearcoat: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: '#9aa1a8', roughness: 0.35, metalness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: '#202428', roughness: 0.6, metalness: 0.3 });

  const fus = new THREE.Mesh(bodyOfRevolution([[-4.0, 0.25], [-3.7, 0.52], [-3.0, 0.62], [-1.6, 0.68], [0.3, 0.66], [2.0, 0.38], [4.3, 0.16, 'lin']], { segs: 32, sx: 0.88, sy: 1.22, upsweep: (z) => (z > 0.6 ? (z - 0.6) * 0.09 : 0) }), paint);
  fus.position.y = 0.1; root.add(fus);
  // cowling + spinner + propeller
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, 0.9, 20), white); cowl.rotation.x = Math.PI / 2; cowl.position.set(0, 0.05, -3.7); root.add(cowl);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 16), red); spinner.rotation.x = -Math.PI / 2; spinner.position.set(0, 0.05, -4.35); root.add(spinner);
  const prop = new THREE.Group(); prop.position.set(0, 0.05, -4.2); root.add(prop);
  for (const a of [0, Math.PI]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.95, 0.04), dark); b.position.y = Math.cos(a) * 0.48; b.rotation.y = 0.35 * (a ? -1 : 1); prop.add(b); const tip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.045), new THREE.MeshStandardMaterial({ color: '#f5c518' })); tip.position.y = Math.cos(a) * 0.92; prop.add(tip); }
  const blur = new THREE.Mesh(new THREE.CircleGeometry(0.98, 32), new THREE.MeshBasicMaterial({ color: '#555', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })); blur.position.set(0, 0.05, -4.18); root.add(blur);
  // high wing (11 m span), struts
  for (const side of [-1, 1]) {
    root.add(new THREE.Mesh(wing({ span: 5.2, root: 1.62, tip: 1.12, sweep: 0.02, thick: 0.17, dihedral: 1.7 * Math.PI / 180, side, z: -1.95, y: 0.92, x0: 0.25 }), white));
    const tipStripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 1.2), red); tipStripe.position.set(side * 5.47, 1.08, -1.25); root.add(tipStripe);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.6, 8), white);
    strut.position.set(side * 1.55, 0.18, -1.3); strut.rotation.z = side * 1.02; root.add(strut);
  }
  // tail
  for (const side of [-1, 1]) root.add(new THREE.Mesh(wing({ span: 1.65, root: 1.05, tip: 0.6, sweep: 0.08, thick: 0.09, side, z: 3.25, y: 0.3, x0: 0.12 }), white));
  root.add(new THREE.Mesh(fin({ height: 1.45, root: 1.3, tip: 0.6, sweep: 38 * Math.PI / 180, thick: 0.08, z: 3.0, y: 0.45 }), red));
  // fixed tricycle gear with wheel fairings
  const tire = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 });
  const wheelAt = (x, z, r) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.16, 16), tire); w.rotation.z = Math.PI / 2; w.position.set(x, -1.35 + r, z); root.add(w); const pant = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), white); pant.scale.set(0.12, r * 1.05, r * 2.1); pant.position.set(x, -1.35 + r * 1.15, z); root.add(pant); };
  for (const side of [-1, 1]) { wheelAt(side * 1.15, 0.0, 0.3); const leg = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.14), metal); leg.position.set(side * 0.72, -0.85, 0); leg.rotation.z = side * -0.55; root.add(leg); }
  wheelAt(0, -3.2, 0.25); { const nl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), metal); nl.position.set(0, -0.85, -3.2); root.add(nl); }
  const L4 = lights(root, [[-5.48, 0.98, -1.9, '#ff2a2a', 'nav'], [5.48, 0.98, -1.9, '#2aff5a', 'nav'], [0, 1.95, 4.0, '#ff2020', 'beacon'], [-5.48, 0.98, -1.75, '#ffffff', 'strobe'], [5.48, 0.98, -1.75, '#ffffff', 'strobe']]);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  let ang = 0;
  const update = (dt, s) => {
    const rpm = 0.25 + s.thr * 0.75; ang += dt * (8 + rpm * 70); prop.rotation.z = ang;
    blur.material.opacity = 0.05 + rpm * 0.22; prop.visible = rpm < 0.55 || Math.sin(ang * 3) > 0; // strobe-ish blades at high rpm
    for (const l of L4) { const k = l.userData.kind; l.visible = k === 'nav' || (k === 'beacon' && (s.t % 1.2) < 0.12) || (k === 'strobe' && (s.t % 1.5) < 0.06); }
  };
  return { root, update, gearHeight: 1.35 };
}

export function createAircraft(id) {
  const def = PLANES[id] || PLANES.airliner;
  const a = def.id === 'light' ? createLight() : createAirliner();
  a.def = def;
  return a;
}
