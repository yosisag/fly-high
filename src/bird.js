import * as THREE from 'three';

/** Procedural low-poly scarlet macaw. Faces -Z. Call update(dt, flapRate, bank). */
export function createBird() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);

  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05, flatShading: true, ...o });
  const RED = mat('#e0262e'), YEL = mat('#ffc51a'), BLU = mat('#1f6fe0'), GRN = mat('#2fb35a'), WHT = mat('#f4efe6'), BLK = mat('#16121a', { roughness: 0.3 }), BEAK = mat('#e9dcc8');

  // torso
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), RED);
  torso.scale.set(0.85, 0.8, 1.6); body.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), mat('#c91d25'));
  belly.scale.set(0.8, 0.7, 1.4); belly.position.set(0, -0.12, 0.05); body.add(belly);
  // head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), RED);
  head.position.set(0, 0.22, -0.9); body.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), WHT);
  face.scale.set(1.25, 0.9, 0.7); face.position.set(0, 0.18, -1.08); body.add(face);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), BLK);
    eye.position.set(sx * 0.27, 0.3, -1.1); body.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 3), mat('#fff', { emissive: '#fff', emissiveIntensity: 1 }));
    glint.position.set(sx * 0.29, 0.33, -1.15); body.add(glint);
  }
  // curved beak: upper + lower
  const up = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 6), BEAK);
  up.rotation.x = -Math.PI / 2 - 0.9; up.position.set(0, 0.12, -1.35); body.add(up);
  const lo = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 6), BLK);
  lo.rotation.x = -Math.PI / 2 + 0.2; lo.position.set(0, -0.05, -1.28); body.add(lo);

  // tail: layered long feathers
  const tail = new THREE.Group(); tail.position.set(0, 0.05, 0.8); body.add(tail);
  const featherGeo = (len, w) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.quadraticCurveTo(w, len * 0.4, w * 0.35, len); s.lineTo(-w * 0.35, len); s.quadraticCurveTo(-w, len * 0.4, 0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false });
    g.rotateX(Math.PI / 2); return g;
  };
  const tails = [[RED, 2.4, 0.22, 0], [BLU, 2.0, 0.2, -0.16], [BLU, 2.0, 0.2, 0.16], [RED, 1.7, 0.2, -0.3], [RED, 1.7, 0.2, 0.3]];
  for (const [m, len, w, a] of tails) { const f = new THREE.Mesh(featherGeo(len, w), m); f.rotation.y = a * 0.6; f.position.x = a * 0.3; tail.add(f); }

  // wings: inner + outer segment, each a fan of coloured feather bands (red → yellow → green → blue)
  const wings = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(side * 0.35, 0.18, -0.25); body.add(shoulder);
    const inner = new THREE.Group(); shoulder.add(inner);
    const band = (m, x0, x1, z0, z1, zb) => {
      const s = new THREE.Shape();
      s.moveTo(x0, z0); s.lineTo(x1, z0 + 0.05); s.lineTo(x1, z1); s.lineTo(x0, zb);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false }); g.rotateX(Math.PI / 2);
      if (side < 0) { g.scale(-1, 1, 1); }
      const mesh = new THREE.Mesh(g, m); mesh.material.side = THREE.DoubleSide; return mesh;
    };
    inner.add(band(RED, 0, 1.25, -0.1, 0.25, 0.3));
    inner.add(band(YEL, 0, 1.25, 0.25, 0.55, 0.6));
    inner.add(band(GRN, 0.1, 1.25, 0.55, 0.85, 0.85));
    const outer = new THREE.Group(); outer.position.set(side * 1.2, 0, 0); inner.add(outer);
    outer.add(band(RED, 0, 1.3, -0.05, 0.2, 0.25));
    outer.add(band(BLU, 0, 1.6, 0.2, 0.7, 0.85));
    outer.add(band(mat('#1a4fb0'), 0.4, 1.9, 0.7, 1.05, 0.95));
    wings.push({ side, shoulder, outer });
  }

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });

  let phase = 0;
  const update = (dt, flapRate, glide) => {
    phase += dt * flapRate;
    const a = Math.sin(phase);
    const amp = THREE.MathUtils.lerp(0.6, 0.1, glide);
    for (const w of wings) {
      w.shoulder.rotation.z = w.side * (a * amp + 0.05);
      w.outer.rotation.z = w.side * (Math.sin(phase - 0.7) * amp * 0.7);
      w.shoulder.rotation.x = -a * 0.12 * amp;
    }
    body.position.y = -a * 0.12 * amp;
    tail.rotation.x = 0.1 + Math.sin(phase * 0.5) * 0.05;
    head.rotation.x = Math.sin(phase) * 0.03;
  };
  root.scale.setScalar(1.35);
  return { root, update };
}
