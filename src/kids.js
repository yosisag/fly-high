import * as THREE from 'three';

/**
 * Milimon kids mode: fly gently and collect the letters of a word, in order.
 * Speaks with the pre-recorded Milimon voice clips (public/milimon-audio), falling back to the
 * system Hebrew voice (Carmit) when a clip is missing.
 */
const WORDS = [
  ['אַבָּא', '👨'], ['אִמָּא', '👩'], ['דָּג', '🐟'], ['סוּס', '🐴'], ['בַּיִת', '🏠'], ['יָד', '✋'], ['כֶּלֶב', '🐶'],
  ['חָתוּל', '🐱'], ['שֶׁמֶשׁ', '☀️'], ['סֵפֶר', '📖'], ['כַּדּוּר', '⚽'], ['עֵץ', '🌳'], ['פֶּרַח', '🌸'], ['פִּיל', '🐘'],
  ['קוֹף', '🐒'], ['דֹּב', '🐻'], ['עוּגָה', '🎂'], ['מַיִם', '💧'], ['אֵשׁ', '🔥'], ['יָרֵחַ', '🌙'], ['אוֹטוֹ', '🚗'],
  ['מָטוֹס', '✈️'], ['נָחָשׁ', '🐍'], ['צָב', '🐢'], ['לֵב', '❤️'], ['יָם', '🌊'], ['הַר', '⛰️'], ['נֵר', '🕯️'],
  ['חָלָב', '🥛'], ['לֶחֶם', '🍞'], ['תּוּת', '🍓'], ['גֶּזֶר', '🥕'], ['פָּרָה', '🐄'], ['עָנָן', '☁️'], ['שֶׁלֶג', '❄️'],
];
const LETTER_NAME = { 'א': 'אָלֶף', 'ב': 'בֵּית', 'ג': 'גִּימֶל', 'ד': 'דָּלֶת', 'ה': 'הֵא', 'ו': 'וָו', 'ז': 'זַיִן', 'ח': 'חֵית', 'ט': 'טֵית', 'י': 'יוֹד', 'כ': 'כָּף', 'ך': 'כָּף', 'ל': 'לָמֶד', 'מ': 'מֵם', 'ם': 'מֵם', 'נ': 'נוּן', 'ן': 'נוּן', 'ס': 'סָמֶךְ', 'ע': 'עַיִן', 'פ': 'פֵּא', 'ף': 'פֵּא', 'צ': 'צָדִיק', 'ץ': 'צָדִיק', 'ק': 'קוֹף', 'ר': 'רֵישׁ', 'ש': 'שִׁין', 'ת': 'תָּו' };
const PRAISES = ['כֹּל הַכָּבוֹד', 'מְעוּלֶה', 'וָואוּ אַלּוּף', 'בְּדִיּוּק', 'מַדְהִים'];
const COLORS = ['#ff6b8b', '#ffb84d', '#6fe7ff', '#9b8cff', '#7dde7a', '#ff8ad8'];

// split a pointed word into letters, each with its own niqqud marks
const graphemes = (w) => { const out = []; for (const ch of w) { if (/[ְ-ׇ]/.test(ch) && out.length) out[out.length - 1] += ch; else out.push(ch); } return out; };
const base = (g) => g.replace(/[ְ-ׇ]/g, '');

/* ------------------------------ voice ------------------------------ */
function createVoice(baseUrl) {
  let manifest = {}, muted = false, gen = 0, cur = null, heVoice = null;
  fetch(`${baseUrl}milimon-audio/manifest.json`).then((r) => r.json()).then((m) => { manifest = m; }).catch(() => {});
  const norm = (t) => t.replace(/[?!.,:;"״]/g, ' ').replace(/\s+/g, ' ').trim();
  const pick = () => { const vs = speechSynthesis?.getVoices() || []; const he = vs.filter((v) => v.lang?.toLowerCase().startsWith('he') || /carmit|כרמית/i.test(v.name)); heVoice = he.find((v) => /premium|enhanced|משופר/i.test(v.name)) || he[0] || null; };
  if (window.speechSynthesis) { pick(); speechSynthesis.onvoiceschanged = pick; }
  const tts = (text) => { if (!window.speechSynthesis) return Promise.resolve(); pick(); if (!heVoice) return Promise.resolve(); return new Promise((res) => { const u = new SpeechSynthesisUtterance(norm(text)); u.lang = 'he-IL'; u.voice = heVoice; u.rate = 0.75; u.onend = res; u.onerror = res; speechSynthesis.speak(u); setTimeout(res, 4000); }); };
  const clip = (fn) => new Promise((res) => { const a = new Audio(`${baseUrl}milimon-audio/${fn}`); a.playbackRate = 0.95; cur = a; a.onended = () => res(true); a.onerror = () => res(false); a.play().catch(() => res(false)); });
  const say = async (...parts) => {
    if (muted) return; const g = ++gen; cur?.pause(); window.speechSynthesis?.cancel();
    for (const p of parts) { if (g !== gen) return; const k = norm(p); const ok = manifest[k] ? await clip(manifest[k]) : false; if (!ok) await tts(p); if (g !== gen) return; await new Promise((r) => setTimeout(r, 120)); }
  };
  return { say, setMuted: (m) => { muted = m; if (m) { cur?.pause(); window.speechSynthesis?.cancel(); } }, has: (t) => !!manifest[norm(t)] };
}

/* ------------------------------ letter bubbles ------------------------------ */
function bubbleTexture(text, color) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(100, 90, 10, 128, 128, 124); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, color); gr.addColorStop(1, color + '88');
  g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
  g.lineWidth = 8; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.stroke();
  g.fillStyle = '#1d1030'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
  g.font = '900 150px "Arial Hebrew", Arial, sans-serif'; g.fillText(text, 128, 140);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createKids({ scene, grid, store, baseUrl, onCollect }) {
  const voice = createVoice(baseUrl);
  const group = new THREE.Group(); scene.add(group);
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.4, 0.6), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 400, 12, 1, true), beamMat); group.add(beam);
  let st = null; // { word, emoji, letters:[{g, base, mesh, pos, got}], i, wordsDone }
  const stickers = () => { try { return JSON.parse(store.get('flypt.kids.stickers') || '[]'); } catch { return []; } };
  const addSticker = (e) => { const s = stickers(); s.push(e); store.set('flypt.kids.stickers', JSON.stringify(s.slice(-200))); };
  let order = []; const nextWord = () => { if (!order.length) order = WORDS.map((_, i) => i).sort(() => Math.random() - 0.5); return WORDS[order.pop()]; };

  const clear = () => { if (!st) return; for (const L of st.letters) { group.remove(L.mesh); L.mesh.material.map.dispose(); L.mesh.material.dispose(); } };
  const spawn = (from, yaw) => {
    clear();
    const [word, emoji] = nextWord(); const gs = graphemes(word);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
    const letters = gs.map((g, i) => {
      const d = 110 + i * 75, side = (i % 2 ? 1 : -1) * (25 + Math.random() * 25);
      const x = from.x + fx * d + rx * side, z = from.z + fz * d + rz * side;
      const y = Math.max(32, Math.min(110, grid.around(x, z, 22) + 20));
      const col = COLORS[i % COLORS.length];
      const mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(g, col), depthWrite: false, fog: false, transparent: true }));
      mesh.scale.setScalar(13); mesh.position.set(x, y, z); group.add(mesh);
      return { g, base: base(g), mesh, pos: new THREE.Vector3(x, y, z), got: false, phase: Math.random() * 6 };
    });
    st = { word, emoji, letters, i: 0, wordsDone: st?.wordsDone || 0, t: 0 };
    voice.say(word, `אֵיפֹה הָאוֹת ${LETTER_NAME[letters[0].base]}`);
    return st;
  };
  const target = () => (st && st.i < st.letters.length ? st.letters[st.i] : null);

  // returns 'letter' | 'word' | 'wrong' | null
  const update = (dt, pos) => {
    if (!st) return null;
    st.t += dt;
    const tgt = target();
    for (const [k, L] of st.letters.entries()) {
      if (L.got) { L.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 4)); L.mesh.visible = L.mesh.scale.x > 0.3; continue; }
      L.phase += dt; const isNext = L === tgt;
      L.mesh.position.y = L.pos.y + Math.sin(L.phase * 1.6) * 1.2;
      L.mesh.scale.setScalar((isNext ? 15 : 10) + (isNext ? Math.sin(L.phase * 5) * 1.2 : 0));
      L.mesh.material.opacity = isNext ? 1 : 0.55;
      const d = L.mesh.position.distanceTo(pos);
      if (d < 16) {
        if (isNext) {
          L.got = true; st.i++;
          const sound = voice.has(L.g) && L.g !== L.base ? L.g : `זֹאת הָאוֹת ${LETTER_NAME[L.base]}`;
          if (st.i >= st.letters.length) {
            st.wordsDone++; addSticker(st.emoji);
            voice.say(sound, 'בָּנִיתָ אֶת הַמִּלָּה', st.word, PRAISES[Math.floor(Math.random() * PRAISES.length)]);
            onCollect?.(L.pos, true); return 'word';
          }
          voice.say(sound, `אֵיפֹה הָאוֹת ${LETTER_NAME[st.letters[st.i].base]}`);
          onCollect?.(L.pos, false); return 'letter';
        } else if (!L.warned || st.t - L.warned > 4) {
          L.warned = st.t; voice.say(`זֹאת הָאוֹת ${LETTER_NAME[L.base]}`, `אֵיפֹה הָאוֹת ${LETTER_NAME[tgt.base]}`); return 'wrong';
        }
      }
    }
    if (tgt) { beam.visible = true; beam.position.set(tgt.pos.x, tgt.pos.y - 200 - 8, tgt.pos.z); } else beam.visible = false;
    return null;
  };
  const repeat = () => { const t = target(); if (st && t) voice.say(st.word, `אֵיפֹה הָאוֹת ${LETTER_NAME[t.base]}`); };
  const stop = () => { clear(); st = null; group.visible = false; voice.setMuted(false); };
  const startSession = () => { group.visible = true; if (st) st.wordsDone = 0; };
  return { spawn, update, target, repeat, stop, startSession, stickers, voice, get state() { return st; }, graphemes };
}
