/* ═══════════════════════════ Sound, synthesized with the Web Audio API ═══════════════════════════
   No audio files: every effect is built from oscillators and filtered noise. Browsers only let a
   page make sound after the visitor clicks or presses a key, so the context starts then.
   `at` arguments are { pan, volume }: where the sound comes from, as seen by the robot. */

import { CRIES } from "./cries.js";

const VOLUME = 0.55;

export class Sound {
  constructor(on = true) {
    this.ctx = null;
    this.on = on;
    this.charging = new Map();          // monster id → stops its charging sound
  }

  unlock() {
    if (!this.ctx) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      const ctx = this.ctx = new Context();
      this.master = ctx.createGain();
      this.master.gain.value = this.on ? VOLUME : 0;
      const glue = ctx.createDynamicsCompressor();
      glue.threshold.value = -16; glue.ratio.value = 4; glue.attack.value = 0.003; glue.release.value = 0.2;
      this.master.connect(glue).connect(ctx.destination);
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.startDrone();
    }
    if (this.on && this.ctx.state === "suspended") this.ctx.resume();
  }

  /* Muted, the audio thread is suspended once the fade-out is over: the drone stops costing. */
  setOn(on) {
    this.on = on;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(on ? VOLUME : 0, this.ctx.currentTime, 0.05);
    if (on) this.ctx.resume();
    else setTimeout(() => { if (!this.on) this.ctx.suspend(); }, 300);
  }

  get live() { return !!this.ctx && this.ctx.state === "running" && this.on; }

  /* ─────────────── Building blocks ─────────────── */

  /* Output for one effect, placed in the stereo field. */
  voice({ pan = 0, volume = 1 } = {}) {
    const g = this.ctx.createGain();
    g.gain.value = volume;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  /* A gain with a percussive envelope, feeding `dest`. */
  env(dest, t, peak, attack, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }

  filter(dest, type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    f.connect(dest);
    return f;
  }

  /* An oscillator sweeping from `from` to `to` over dur seconds. `via`, as [frequency, seconds],
     is a turning point on the way: a shriek that rises before it falls. */
  tone(dest, type, from, to, t, dur, via = null) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (via) o.frequency.exponentialRampToValueAtTime(via[0], t + via[1]);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  noise(dest, t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuffer;
    s.loop = true;
    s.connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
    return s;
  }

  /* Vibrato, growl or a slow sweep: an LFO wobbling a parameter (forever when dur is Infinity). */
  wobble(param, t, dur, rate, depth) {
    const lfo = this.ctx.createOscillator(), amount = this.ctx.createGain();
    lfo.frequency.value = rate;
    amount.gain.value = depth;
    lfo.connect(amount).connect(param);
    lfo.start(t);
    if (dur < Infinity) lfo.stop(t + dur + 0.05);
  }

  /* Notes played one after the other, each with its own short envelope. */
  arpeggio(v, t, notes, step, { type, peak, attack, decay, cutoff, length }) {
    notes.forEach((f, i) => this.tone(this.filter(this.env(v, t + i * step, peak, attack, decay), "lowpass", cutoff),
      type, f, f, t + i * step, length));
  }

  distortion(dest, k = 20) {
    const shaper = this.ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = i / 512 - 1; curve[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    shaper.curve = curve;
    shaper.connect(dest);
    return shaper;
  }

  /* A low, slowly breathing drone under the whole game. */
  startDrone() {
    const ctx = this.ctx, t = ctx.currentTime;
    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    this.drone.connect(this.master);
    const lp = this.filter(this.drone, "lowpass", 170, 1.2);
    for (const f of [55, 55.6, 82.7]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth"; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = f > 60 ? 0.25 : 0.5;
      o.connect(g).connect(lp);
      o.start(t);
    }
    this.wobble(lp.frequency, t, Infinity, 0.07, 70);
  }

  ambience(on) {
    if (this.ctx) this.drone.gain.setTargetAtTime(on ? 0.05 : 0, this.ctx.currentTime, 0.6);
  }

  /* ─────────────── Effects ─────────────── */

  /* The robot's plasma rifle: a zap, a crack and a thump. */
  shot() {
    if (!this.live) return;
    const t = this.ctx.currentTime, v = this.voice({ volume: 0.9 });
    this.tone(this.filter(this.env(v, t, 0.22, 0.003, 0.17), "lowpass", 3200), "square", 1100, 140, t, 0.18);
    this.noise(this.filter(this.env(v, t, 0.4, 0.002, 0.07), "bandpass", 2400, 0.8), t, 0.1);
    this.tone(this.env(v, t, 0.6, 0.004, 0.14), "sine", 160, 48, t, 0.16);
  }

  /* Watcher winding up a fireball: a rising, wobbling moan, cut short if it flinches. */
  charge(id, at, dur) {
    if (!this.live) return;
    const ctx = this.ctx, t = ctx.currentTime, v = this.voice(at);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.2, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.08);
    g.connect(v);
    const lp = this.filter(g, "lowpass", 300, 3);
    lp.frequency.exponentialRampToValueAtTime(2200, t + dur);
    const o = this.tone(lp, "sawtooth", 70, 210, t, dur);
    this.wobble(o.frequency, t, dur, 11, 18);
    this.charging.set(id, () => {
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(0.0001, now, 0.02);
    });
  }

  stopCharge(id) {
    this.charging.get(id)?.();
    this.charging.delete(id);
  }

  /* Fireball leaving the mouth: a filtered whoosh over a low roar. */
  fireball(id, at) {
    this.charging.delete(id);
    if (!this.live) return;
    const t = this.ctx.currentTime, v = this.voice(at);
    const bp = this.filter(this.env(v, t, 0.5, 0.02, 0.4), "bandpass", 500, 1.2);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.12);
    bp.frequency.exponentialRampToValueAtTime(600, t + 0.42);
    this.noise(bp, t, 0.45);
    this.tone(this.filter(this.env(v, t, 0.18, 0.01, 0.3), "lowpass", 900), "sawtooth", 150, 70, t, 0.32);
  }

  explosion(at, size = 1) {
    if (!this.live) return;
    const t = this.ctx.currentTime, v = this.voice(at);
    const lp = this.filter(this.env(v, t, 0.7 * size, 0.005, 0.55 * size), "lowpass", 1600, 0.8);
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.55 * size);
    this.noise(lp, t, 0.6 * size);
    this.tone(this.env(v, t, 0.6 * size, 0.005, 0.42), "sine", 110, 32, t, 0.45);
  }

  /* Waking up, flinching, dying: each species has its own cries (see CRIES). Monsters woken by the
     same gunshot do not all roar on the same instant. */
  roar(kind, at) {
    if (this.live) CRIES[kind].roar(this, this.ctx.currentTime + Math.random() * 0.12, this.voice(at));
  }

  pain(kind, at) {
    if (this.live) CRIES[kind].pain(this, this.ctx.currentTime, this.voice(at));
  }

  death(kind, at) {
    if (!this.live) return;
    this.explosion(at, CRIES[kind].blast);
    CRIES[kind].death(this, this.ctx.currentTime, this.voice(at));
  }

  /* Seeker bite: two quick crunches. */
  bite(at) {
    if (!this.live) return;
    const t = this.ctx.currentTime, v = this.voice(at);
    for (const dt of [0, 0.08]) this.noise(this.filter(this.env(v, t + dt, 0.5, 0.002, 0.06), "bandpass", 1000, 1.5), t + dt, 0.08);
    this.tone(this.env(v, t, 0.3, 0.003, 0.1), "square", 90, 60, t, 0.12);
  }

  /* The robot takes a hit: a metallic clank (inharmonic partials) over a thud. */
  hurt() {
    if (!this.live) return;
    const t = this.ctx.currentTime, v = this.voice({ volume: 0.9 });
    const metal = this.env(v, t, 0.16, 0.002, 0.32);
    for (const f of [420, 613, 1031]) this.tone(metal, "triangle", f, f * 0.97, t, 0.34);
    this.tone(this.env(v, t, 0.6, 0.003, 0.18), "sine", 120, 45, t, 0.2);
    this.noise(this.filter(this.env(v, t, 0.25, 0.002, 0.12), "lowpass", 900), t, 0.14);
  }

  pickup(kind) {
    if (!this.live) return;
    const ammo = kind === "ammo";
    this.arpeggio(this.voice({ volume: 0.7 }), this.ctx.currentTime, ammo ? [660, 990] : [523, 659, 784, 1047], 0.06,
      { type: ammo ? "square" : "sine", peak: 0.16, attack: 0.005, decay: 0.12, cutoff: 2600, length: 0.14 });
  }

  end(won) {
    if (!this.live) return;
    const step = won ? 0.11 : 0.22;
    this.arpeggio(this.voice({ volume: 0.8 }), this.ctx.currentTime + 0.3, won ? [392, 523, 659, 784, 1047] : [220, 185, 147, 110], step,
      { type: won ? "triangle" : "sawtooth", peak: 0.2, attack: 0.01, decay: step * 1.6, cutoff: won ? 3000 : 900, length: step * 1.7 });
  }
}
