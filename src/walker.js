import * as THREE from 'three';

/** Low-poly street-level avatar (faces -Z) with a walk cycle. The parrot rides on the shoulder. */
export function createWalker() {
  const root = new THREE.Group();
  const m = (c, r = 0.7) => new THREE.MeshStandardMaterial({ color: c, roughness: r, flatShading: true });
  const SKIN = m('#e0ac84'), SHIRT = m('#2f7fd6'), PANTS = m('#2b2f3a'), SHOE = m('#f2f2f2', 0.5), HAIR = m('#2a1d16'), CAP = m('#ff5ea8');

  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.6, 0.26), SHIRT); torso.position.y = 0.36; hips.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 6), SKIN); neck.position.y = 0.71; hips.add(neck);
  const head = new THREE.Group(); head.position.y = 0.88; hips.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), SKIN));
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), HAIR); hair.position.y = 0.02; head.add(hair);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 12), CAP); cap.position.y = 0.11; head.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.025, 0.16), CAP); brim.position.set(0, 0.08, -0.2); head.add(brim);

  const limb = (mat, len, w) => { const g = new THREE.Group(); const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat); mesh.position.y = -len / 2; g.add(mesh); return g; };
  const legs = [], arms = [];
  for (const sx of [-1, 1]) {
    const thigh = limb(PANTS, 0.46, 0.17); thigh.position.set(sx * 0.12, 0, 0); hips.add(thigh);
    const shin = limb(PANTS, 0.44, 0.15); shin.position.y = -0.46; thigh.add(shin);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.28), SHOE); shoe.position.set(0, -0.48, -0.05); shin.add(shoe);
    legs.push({ thigh, shin, sx });
    const arm = limb(SHIRT, 0.3, 0.12); arm.position.set(sx * 0.3, 0.62, 0); hips.add(arm);
    const fore = limb(SKIN, 0.3, 0.1); fore.position.y = -0.3; arm.add(fore);
    arms.push({ arm, fore, sx });
  }
  const shoulder = new THREE.Group(); shoulder.position.set(0.24, 0.72, 0.02); hips.add(shoulder);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  let ph = 0;
  const update = (dt, speed) => {
    const k = Math.min(1, speed / 1.8);
    ph += dt * (4 + speed * 2.2);
    const s = Math.sin(ph) * 0.6 * k;
    for (const L of legs) { const a = s * L.sx; L.thigh.rotation.x = a; L.shin.rotation.x = Math.max(0, -Math.cos(ph + (L.sx > 0 ? 0 : Math.PI))) * 0.9 * k; }
    for (const A of arms) { A.arm.rotation.x = -s * A.sx * 0.9; A.fore.rotation.x = -0.35 - k * 0.3; }
    hips.position.y = 0.95 + Math.abs(Math.cos(ph)) * 0.05 * k;
    torso.rotation.y = s * 0.12;
    head.rotation.y = -s * 0.08;
  };
  return { root, shoulder, update };
}
