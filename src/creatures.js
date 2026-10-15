import * as THREE from 'three';
import { createBird } from './bird.js';

/**
 * Flyable characters. The parrot is the original; the others are original Milimon creatures
 * (Pokémon-style but our own designs). All face -Z and share the bird's update(dt, flapRate, glide) API.
 */
export const CHARACTERS = [
  { id: 'parrot', name: 'תוכי', icon: '🦜', trail: [2.2, 0.8, 1.2] },
  { id: 'lahavi', name: 'לַהֲבִי', icon: '🔥', trail: [2.6, 1.0, 0.2], body: '#ff7a2f', belly: '#ffe0a8', wing: '#ff4a2a', accent: '#ffd23f', kind: 'fire' },
  { id: 'meimon', name: 'מֵימוֹן', icon: '💧', trail: [0.4, 1.4, 2.6], body: '#3fa4ff', belly: '#cfeaff', wing: '#7fd0ff', accent: '#1f6fd6', kind: 'water' },
  { id: 'barki', name: 'בְּרָקִי', icon: '⚡', trail: [2.6, 2.3, 0.4], body: '#ffd23f', belly: '#fff3c4', wing: '#ffb300', accent: '#3a2a10', kind: 'electric' },
  { id: 'alal', name: 'עַלְעָל', icon: '🍃', trail: [0.8, 2.4, 0.6], body: '#5ccf6a', belly: '#e8ffd8', wing: '#2fa84a', accent: '#ff7aa8', kind: 'leaf' },
];

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.02, ...o });

function wingShape(kind) {
  const s = new THREE.Shape();
  if (kind === 'fire') { // bat-like membrane with scalloped trailing edge
    s.moveTo(0, -0.1); s.lineTo(1.6, 0.25); s.lineTo(2.2, -0.05); s.quadraticCurveTo(1.8, -0.35, 1.55, -0.55); s.quadraticCurveTo(1.2, -0.3, 1.0, -0.6); s.quadraticCurveTo(0.6, -0.35, 0.3, -0.55); s.lineTo(0, -0.35);
  } else if (kind === 'water') { // rounded fin
    s.moveTo(0, -0.05); s.quadraticCurveTo(1.0, 0.45, 1.9, 0.05); s.quadraticCurveTo(1.5, -0.55, 0.1, -0.5);
  } else if (kind === 'electric') { // lightning bolt
    s.moveTo(0, 0); s.lineTo(1.0, 0.25); s.lineTo(0.85, -0.05); s.lineTo(2.1, 0.1); s.lineTo(1.1, -0.35); s.lineTo(1.25, -0.12); s.lineTo(0, -0.45);
  } else { // leaf
    s.moveTo(0, -0.2); s.quadraticCurveTo(0.9, 0.55, 2.1, -0.1); s.quadraticCurveTo(1.0, -0.75, 0, -0.2);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(Math.PI / 2); g.translate(0, 0, 0);
  return g;
}

function createCreature(def) {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const M = { body: mat(def.body), belly: mat(def.belly), wing: mat(def.wing, { side: THREE.DoubleSide, transparent: def.kind === 'water', opacity: 0.85 }), accent: mat(def.accent), eyeW: mat('#ffffff', { roughness: 0.2 }), eyeB: mat('#141018', { roughness: 0.15 }), shine: mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 1 }), blush: mat('#ff8fa8') };

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 16), M.body); torso.scale.set(1, 0.92, 1.12); body.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 14), M.belly); belly.scale.set(0.9, 0.8, 1); belly.position.set(0, -0.18, -0.2); body.add(belly);
  // big cute eyes on the front (-Z)
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), M.eyeW); e.scale.set(1, 1.15, 0.6); e.position.set(sx * 0.3, 0.22, -0.68); body.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), M.eyeB); p.scale.set(1, 1.15, 0.6); p.position.set(sx * 0.3, 0.2, -0.78); body.add(p);
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), M.shine); sh.position.set(sx * 0.27, 0.27, -0.84); body.add(sh);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), M.blush); b.scale.set(1.3, 0.7, 0.4); b.position.set(sx * 0.5, -0.02, -0.6); body.add(b);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 12, Math.PI), M.eyeB); mouth.position.set(0, -0.06, -0.8); mouth.rotation.z = Math.PI; body.add(mouth);

  // per-kind head features + tail
  const tail = new THREE.Group(); tail.position.set(0, 0, 0.8); body.add(tail);
  let tip = null;
  if (def.kind === 'fire') {
    for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.38, 8), M.belly); h.position.set(sx * 0.3, 0.72, -0.15); h.rotation.z = -sx * 0.35; body.add(h); }
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.1, 10), M.body); t.rotation.x = Math.PI / 2; t.position.z = 0.5; tail.add(t);
    tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat('#ffcc33', { emissive: '#ff6a00', emissiveIntensity: 2.5 })); tip.scale.set(1, 1.6, 1); tip.position.z = 1.05; tail.add(tip);
  } else if (def.kind === 'water') {
    const crest = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), M.accent); crest.scale.set(0.4, 1, 1.4); crest.position.set(0, 0.78, 0); body.add(crest);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 3), M.wing); fin.rotation.x = Math.PI / 2; fin.scale.set(1, 1, 0.25); fin.position.z = 0.45; tail.add(fin);
    tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mat('#bff0ff', { emissive: '#4fc8ff', emissiveIntensity: 1.5, transparent: true, opacity: 0.8 })); tip.position.z = 0.95; tail.add(tip);
  } else if (def.kind === 'electric') {
    for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 8), M.body); ear.position.set(sx * 0.32, 0.8, 0.05); ear.rotation.z = -sx * 0.25; body.add(ear); const tipE = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 8), M.accent); tipE.position.set(sx * 0.38, 1.0, 0.05); tipE.rotation.z = -sx * 0.25; body.add(tipE); }
    const bolt = new THREE.Mesh(wingShape('electric'), M.wing); bolt.rotation.set(0, Math.PI / 2, Math.PI / 2); bolt.scale.setScalar(0.55); bolt.position.set(0, 0.1, 0.1); tail.add(bolt);
    tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat('#fff8b0', { emissive: '#ffe14a', emissiveIntensity: 2.5 })); tip.position.set(0, 0.6, 0.6); tail.add(tip);
  } else {
    const leaf = new THREE.Mesh(wingShape('leaf'), M.wing); leaf.scale.setScalar(0.35); leaf.rotation.set(-0.4, 0, Math.PI / 2 - 0.2); leaf.position.set(0, 0.7, 0.1); body.add(leaf);
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), M.accent); flower.position.set(0.12, 0.92, 0.05); body.add(flower);
    const t = new THREE.Mesh(wingShape('leaf'), M.wing); t.scale.setScalar(0.45); t.rotation.set(0, -Math.PI / 2, 0); t.position.set(0, 0, 0.1); tail.add(t);
  }
  // feet
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), M.belly); f.scale.set(1, 0.6, 1.3); f.position.set(sx * 0.32, -0.7, -0.05); body.add(f); }

  // wings
  const wings = [];
  for (const side of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(side * 0.55, 0.25, 0.05); body.add(sh);
    const g = wingShape(def.kind); if (side < 0) g.scale(-1, 1, 1);
    const w = new THREE.Mesh(g, M.wing); w.scale.setScalar(def.kind === 'electric' ? 0.85 : 1); sh.add(w);
    wings.push({ side, sh });
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  let ph = 0;
  const update = (dt, flapRate, glide) => {
    ph += dt * flapRate;
    const amp = THREE.MathUtils.lerp(0.75, 0.12, glide), a = Math.sin(ph);
    for (const w of wings) { w.sh.rotation.z = w.side * (a * amp + 0.1); w.sh.rotation.x = -a * 0.1 * amp; }
    body.position.y = -a * 0.1 * amp;
    tail.rotation.y = Math.sin(ph * 0.5) * 0.25; tail.rotation.x = 0.1 + Math.sin(ph * 0.7) * 0.06;
    if (tip) { const k = 1 + Math.sin(ph * 2.3) * 0.18; tip.scale.set(k, (def.kind === 'fire' ? 1.6 : 1) * k, k); }
  };
  root.scale.setScalar(1.45);
  return { root, update };
}

export function createCharacter(id) {
  const def = CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
  const c = def.id === 'parrot' ? createBird() : createCreature(def);
  c.def = def;
  return c;
}
