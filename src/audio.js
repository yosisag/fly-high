/** Fully procedural WebAudio: wind bed, ambient pad, flap whoosh, collect chime, crash thud. */
export class Sound {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(ctx.destination);

    // brown-noise buffer
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    this.noise = buf;

    // wind
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'lowpass'; this.windF.frequency.value = 400; this.windF.Q.value = 0.7;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    src.connect(this.windF).connect(this.windG).connect(this.master); src.start();

    // ambient pad: slow chord cycle
    this.padG = ctx.createGain(); this.padG.gain.value = 0.0; this.padG.connect(this.master);
    const padF = ctx.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 900; padF.connect(this.padG);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lfoG = ctx.createGain(); lfoG.gain.value = 500; lfo.connect(lfoG).connect(padF.frequency); lfo.start();
    this.padOsc = [];
    for (let i = 0; i < 4; i++) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
        const g = ctx.createGain(); g.gain.value = 0.035; o.connect(g).connect(padF); o.start(); this.padOsc.push(o);
      }
    }
    const chords = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]; // Am F C G
    let ci = 0;
    const setChord = () => {
      const c = chords[ci++ % chords.length]; const t = ctx.currentTime;
      this.padOsc.forEach((o, k) => o.frequency.setTargetAtTime(440 * Math.pow(2, (c[k >> 1] - 69) / 12), t, 1.2));
    };
    setChord(); this.chordTimer = setInterval(setChord, 8000);
    this.padG.gain.setTargetAtTime(0.55, ctx.currentTime, 3);
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.1); }

  wind(speed, boosting) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = Math.min(1, speed / 55);
    this.windG.gain.setTargetAtTime(0.05 + k * 0.35 + (boosting ? 0.15 : 0), t, 0.2);
    this.windF.frequency.setTargetAtTime(250 + k * 1400 + (boosting ? 600 : 0), t, 0.2);
  }

  flap() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(1600, t + 0.18); f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * 2, 0.4);
  }

  collect(n) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const base = [72, 74, 76, 79, 81, 84, 86, 88][n % 8];
    [0, 4, 7, 12].forEach((iv, i) => {
      const o = ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = 440 * Math.pow(2, (base + iv - 69) / 12);
      const g = ctx.createGain(); const st = t + i * 0.07;
      g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.22, st + 0.01); g.gain.exponentialRampToValueAtTime(0.001, st + 1.2);
      o.connect(g).connect(this.master); o.start(st); o.stop(st + 1.3);
    });
  }

  fanfare() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [[60, 0], [64, 0.15], [67, 0.3], [72, 0.45], [76, 0.7], [79, 0.7], [84, 0.7]].forEach(([n, dt]) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 440 * Math.pow(2, (n - 69) / 12);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t + dt); g.gain.linearRampToValueAtTime(0.18, t + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + dt + 2.2);
      o.connect(g).connect(this.master); o.start(t + dt); o.stop(t + dt + 2.3);
    });
  }

  crash() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.6);
    const s = ctx.createBufferSource(); s.buffer = this.noise; const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.5, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.35); s.connect(g2).connect(this.master); s.start(t, 0, 0.4);
  }
}
