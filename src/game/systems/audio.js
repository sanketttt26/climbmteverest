// All sound is synthesized with WebAudio: no asset files to load. Calls before init() (the first click) are dropped.
export class Sound {
  volume = 0.8;

  init() {
    if (this.ctx) return this.ctx.resume();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.out = ctx.createGain(); this.out.gain.value = this.muted ? 0 : this.volume; this.out.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate); this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0), b = this.brown.getChannelData(0);
    for (let i = 0, last = 0; i < len; i++) { w[i] = Math.random() * 2 - 1; last = (last + 0.02 * w[i]) / 1.02; b[i] = last * 3.5; }
    this.wind = this.loop(this.white, 'lowpass', 600, 0.5);
    this.howl = this.loop(this.white, 'bandpass', 500, 9);
    this.rumble = this.loop(this.brown, 'lowpass', 160, 0.7);
    this.hiss = this.loop(this.white, 'highpass', 4000, 0.3);
    // a soft open-fifth drone under the wind: the mountain's ambience
    const pad = ctx.createGain(), lp = ctx.createBiquadFilter();
    pad.gain.value = 0.018; lp.type = 'lowpass'; lp.frequency.value = 700;
    pad.connect(lp).connect(this.out);
    [55, 82.4, 110, 164.8, 220.6].forEach((f, i) => {
      const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = (i - 2) * 4;
      lfo.frequency.value = 0.03 + i * 0.017; lg.gain.value = 0.5; lfo.connect(lg).connect(o.detune);
      o.connect(pad); o.start(); lfo.start();
    });
  }

  loop(buf, type, freq, Q) {
    const { ctx } = this, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; src.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = Q; g.gain.value = 0;
    src.connect(f).connect(g).connect(this.out); src.start();
    return { f, g };
  }

  shot(buf, type, freq, Q, vol, attack, decay) {
    const { ctx } = this;
    if (!ctx) return;
    const t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = Q;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 1.5); src.stop(t + attack + decay + 0.05);
  }

  tone(freq, vol, dur, type = 'sine', delay = 0, endFreq) {
    const { ctx } = this;
    if (!ctx) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }

  update({ wind, rumble, hiss, t }) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, w = Math.min(1, wind / 40);
    this.wind.g.gain.setTargetAtTime(0.05 + w * 0.5, now, 0.3);
    this.wind.f.frequency.setTargetAtTime(300 + w * 900, now, 0.5);
    this.howl.g.gain.setTargetAtTime(w * w * 0.35, now, 0.3);
    this.howl.f.frequency.setTargetAtTime(380 + 260 * Math.sin(t * 0.6) * Math.sin(t * 0.23) + w * 300, now, 0.2);
    this.rumble.g.gain.setTargetAtTime(rumble * 1.4, now, 0.2);
    this.hiss.g.gain.setTargetAtTime(hiss ? 0.025 : 0, now, 0.1);
  }

  step(crampons, metal) {
    this.shot(this.white, 'bandpass', metal ? 2500 : 1300, 1.2, 0.25, 0.005, 0.12);
    if (crampons) this.shot(this.white, 'highpass', 5000, 1, 0.06, 0.002, 0.05);
    if (metal) this.tone(900, 0.04, 0.15, 'triangle');
  }
  breath(strain) { const d = 0.9 - strain * 0.45; this.shot(this.white, 'bandpass', 700 + strain * 300, 0.8, 0.05 + strain * 0.1, d * 0.45, d); }
  crack(vol = 1) { this.shot(this.white, 'bandpass', 2200, 3, 0.5 * vol, 0.002, 0.25); this.tone(180, 0.2 * vol, 0.4, 'sawtooth', 0, 60); }
  thud() { this.shot(this.brown, 'lowpass', 300, 1, 1.2, 0.005, 0.6); }
  chime(big) { [523, 659, 784, big && 1047].filter(Boolean).forEach((f, i) => this.tone(f, 0.12, 1.4, 'sine', i * 0.14)); }
  heartbeat() { this.tone(55, 0.5, 0.15); this.tone(50, 0.4, 0.15, 'sine', 0.22); }
  click() { this.tone(1400, 0.05, 0.05, 'square'); }
  setVolume(v) { this.volume = v; if (this.out && !this.muted) this.out.gain.value = v; }
  toggleMute() { this.muted = !this.muted; if (this.out) this.out.gain.value = this.muted ? 0 : this.volume; return this.muted; }
}
