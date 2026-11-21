// audio.js — fully procedural WebAudio sound effects. No audio files:
// engine hum, gunshots, sirens, pickups, UI clicks and a tiny bass groove
// are all synthesized with oscillators and filtered noise.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  // Must be called from a user gesture at least once; safe to call repeatedly.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngine();
      this.startMusic();
    } catch (e) { /* audio unavailable — game stays silent */ }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  // --- engine: two detuned saws through a lowpass, pitch follows speed -------
  startEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square'; osc2.frequency.value = 28;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 320; filt.Q.value = 2;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(filt); osc2.connect(filt);
    filt.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); osc2.start();
    this.engineOsc2 = osc2; this.engineFilter = filt;
  }

  setEngine(speedNorm, onFoot) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.now();
    const target = onFoot ? 0 : 0.05 + speedNorm * 0.11;
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : target, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(52 + speedNorm * 130, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(26 + speedNorm * 65, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(280 + speedNorm * 900, t, 0.1);
  }

  // --- police siren: alternating two-tone ------------------------------------
  startSiren() {
    if (!this.ctx || this.sirenOsc) return;
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0.0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.9;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 180;
    lfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start(); lfo.start();
    this.sirenLfo = lfo;
  }

  setSiren(on) {
    if (!this.ctx) return;
    this.startSiren();
    if (!this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(this.muted || !on ? 0 : 0.045, this.now(), 0.3);
  }

  // --- one-shots --------------------------------------------------------------
  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(this.muted ? 0 : vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noiseBurst(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const t = this.now();
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = filterFreq || 1800;
    const g = this.ctx.createGain();
    g.gain.value = this.muted ? 0 : vol;
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t);
  }

  shoot() { this.noiseBurst(0.16, 0.5, 2400); this.blip(160, 0.1, 'square', 0.18, 60); }
  reload() { this.blip(900, 0.06, 'square', 0.12); setTimeout(() => this.blip(620, 0.07, 'square', 0.12), 110); }
  emptyClick() { this.blip(1400, 0.04, 'square', 0.08); }
  pickup() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'sine', 0.2), i * 70)); }
  cash() { [880, 1174, 1568].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'triangle', 0.18), i * 80)); }
  hit() { this.noiseBurst(0.1, 0.3, 900); }
  hurt() { this.blip(110, 0.25, 'sawtooth', 0.25, 55); }
  uiClick() { this.blip(740, 0.07, 'sine', 0.15); }
  missionStart() { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.18), i * 90)); }
  missionDone() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.blip(f, 0.28, 'triangle', 0.2), i * 95)); }
  wantedUp() { this.blip(220, 0.3, 'sawtooth', 0.2, 440); }
  carDoor() { this.noiseBurst(0.08, 0.25, 700); }
  crash() { this.noiseBurst(0.3, 0.5, 500); this.blip(70, 0.3, 'sawtooth', 0.25, 35); }

  // --- tiny bass groove: a looped 8-step pattern, quiet under gameplay -------
  startMusic() {
    const bassNotes = [55, 0, 55, 65.4, 0, 55, 82.4, 73.4];
    const step = () => {
      if (!this.ctx) return;
      const n = bassNotes[this.musicStep % bassNotes.length];
      this.musicStep++;
      if (n > 0 && !this.muted) this.blip(n, 0.32, 'triangle', 0.05);
      if (this.musicStep % 8 === 4 && !this.muted) this.noiseBurst(0.05, 0.03, 6000);
    };
    this.musicTimer = setInterval(step, 240);
  }
}
