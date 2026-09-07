// Everything you hear, synthesised from oscillators and noise. No files, no samples.
//
// GDD §21: "Mining audio is part of the information system. Experienced players should be able to
// infer hidden material or spaces partially by sound." That is taken literally here — the HOLLOW
// voice is a real mechanic, and the rising pitch of a combo is the strongest hook in the game.

const PENT = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const semis = (n) => Math.pow(2, n / 12);

// Root note per stratum: A minor, then a fourth down and darker, then a tritone-inflected root.
const ROOTS = [110.0, 82.41, 77.78];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this._muted = false;
    this.vol = 0.85;
    this.voices = 0;
    this.last = Object.create(null);
    this.stratum = 0;
    this.duckT = 0; this.duckAmt = 0;
    this.nextPluck = 0;
    this.nextBeat = 0;
    this.state = { danger: 0, haulRatio: 0, lightRatio: 1, alive: true };
    this.failed = false;
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }
  get muted() { return this._muted; }
  setMuted(m) { this._muted = !!m; if (this.master) this.master.gain.value = this._muted ? 0 : this.vol; }
  setVolume(v) { this.vol = v; if (this.master && !this._muted) this.master.gain.value = v; }

  init() {
    if (this.failed) return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this.failed = true; return; }
        const c = new AC();
        this.ctx = c;

        this.master = c.createGain();
        this.master.gain.value = this._muted ? 0 : this.vol;
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 22; comp.ratio.value = 7;
        comp.attack.value = 0.003; comp.release.value = 0.22;
        this.master.connect(comp); comp.connect(c.destination);

        // A dark, generated impulse. The mine has to sound like a room made of rock.
        const len = Math.floor(c.sampleRate * 1.6);
        const imp = c.createBuffer(2, len, c.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const d = imp.getChannelData(ch);
          let seed = 12345 + ch * 999;
          for (let i = 0; i < len; i++) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            const r = (seed / 4294967296) * 2 - 1;
            const t = i / len;
            d[i] = r * Math.pow(1 - t, 2.6) * (1 - t * 0.4);
          }
        }
        this.verb = c.createConvolver(); this.verb.buffer = imp;
        this.verbGain = c.createGain(); this.verbGain.value = 0.55;
        this.verb.connect(this.verbGain); this.verbGain.connect(this.master);

        this.send = c.createGain(); this.send.gain.value = 0.22;
        this.send.connect(this.verb);

        this.dry = c.createGain(); this.dry.gain.value = 1;
        this.dry.connect(this.master);

        // slapback used only for the hollow tell
        this.slap = c.createDelay(0.4); this.slap.delayTime.value = 0.12;
        this.slapG = c.createGain(); this.slapG.gain.value = 0;
        this.slap.connect(this.slapG); this.slapG.connect(this.verb);

        // noise buffer
        const nlen = Math.floor(c.sampleRate * 1.0);
        const nb = c.createBuffer(1, nlen, c.sampleRate);
        const nd = nb.getChannelData(0);
        let s2 = 777;
        for (let i = 0; i < nlen; i++) { s2 = (s2 * 1664525 + 1013904223) >>> 0; nd[i] = (s2 / 4294967296) * 2 - 1; }
        this.noiseBuf = nb;

        this._buildBed();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { this.failed = true; }
  }

  // ── primitives ────────────────────────────────────────────────────────────
  _ok(key, gapMs) {
    if (this.failed || !this.ctx || this._muted) return false;
    if (this.voices > 26) return false;
    if (key) {
      const t = this.ctx.currentTime;
      if (this.last[key] !== undefined && (t - this.last[key]) * 1000 < (gapMs || 12)) return false;
      this.last[key] = t;
    }
    return true;
  }
  _track(node, dur) {
    this.voices++;
    const self = this;
    setTimeout(() => { self.voices = Math.max(0, self.voices - 1); }, (dur + 0.1) * 1000);
  }

  _out(node, gain, sendAmt, slapAmt) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    node.connect(g);
    g.connect(this.dry);
    if (sendAmt) { const s = this.ctx.createGain(); s.gain.value = sendAmt; g.connect(s); s.connect(this.verb); }
    if (slapAmt) { const s = this.ctx.createGain(); s.gain.value = slapAmt; g.connect(s); s.connect(this.slap); }
    return g;
  }

  /** Filtered noise burst — the transient of almost every impact. */
  _noise(dur, type, freq, q, gain, sendAmt, slapAmt, sweepTo) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(env);
    this._out(env, 1, sendAmt, slapAmt);
    src.start(t); src.stop(t + dur + 0.02);
    this._track(src, dur);
    return src;
  }

  /** A single body tone: the pitch that tells you what the rock is. */
  _tone(freq, type, dur, gain, sendAmt, dropTo, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (dropTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, dropTo), t + dur);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(env);
    this._out(env, 1, sendAmt, 0);
    o.start(t); o.stop(t + dur + 0.02);
    this._track(o, dur);
    return o;
  }

  /** FM bell — crystal, discoveries, pickups. Clean and tuned. */
  _bell(freq, ratio, index, dur, gain, sendAmt, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const car = c.createOscillator(); car.frequency.value = freq;
    const mod = c.createOscillator(); mod.frequency.value = freq * ratio;
    const mg = c.createGain(); mg.gain.setValueAtTime(freq * index, t);
    mg.gain.exponentialRampToValueAtTime(1, t + dur * 0.6);
    mod.connect(mg); mg.connect(car.frequency);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(env);
    this._out(env, 1, sendAmt === undefined ? 0.5 : sendAmt, 0);
    car.start(t); mod.start(t); car.stop(t + dur + 0.02); mod.stop(t + dur + 0.02);
    this._track(car, dur);
  }

  // ── material voices ───────────────────────────────────────────────────────
  strike(voice, o) {
    o = o || {};
    if (!this._ok('s' + voice + (o.crit ? 'c' : ''), 14)) return;
    this.init();
    if (!this.ctx) return;

    if (o.tooHard) {
      // The tool bounced. No body at all — just a bright scrape.
      this._noise(0.16, 'bandpass', 4200, 9, 0.16, 0.28, 0, 1800);
      this._tone(2400, 'square', 0.05, 0.03, 0.1, 1300);
      return;
    }

    const hollow = !!o.hollow;
    const send = hollow ? 0.55 : 0.13;
    const slap = hollow ? 0.5 : 0;
    const amp = (o.heavy ? 1.25 : 1) * (o.crit ? 1.25 : 1);

    switch (voice) {
      case 'dirt':
        this._noise(0.07, 'lowpass', hollow ? 420 : 760, 1.1, 0.30 * amp, send, slap);
        this._tone(96, 'sine', 0.06, 0.16 * amp, send * 0.5, 62);
        break;
      case 'gravel':
        this._noise(0.05, 'bandpass', 1500, 2.2, 0.24 * amp, send, slap);
        for (let i = 0; i < 3; i++) this._tone(700 + i * 260, 'square', 0.018, 0.035 * amp, 0.05, 0, 0.012 * i + 0.01);
        break;
      case 'stone':
        this._noise(0.055, 'bandpass', hollow ? 900 : 1650, 3.2, 0.34 * amp, send, slap);
        this._tone(hollow ? 120 : 182, 'sine', 0.075, 0.20 * amp, send * 0.6, hollow ? 78 : 120);
        break;
      case 'slate':
        this._noise(0.10, 'bandpass', 2100, 4.0, 0.30 * amp, send, slap, 520);
        this._tone(210, 'triangle', 0.07, 0.15 * amp, send * 0.6, 150);
        break;
      case 'granite':
        this._noise(0.035, 'highpass', 3400, 1.4, 0.20 * amp, send * 0.6, slap);
        this._tone(90, 'sine', 0.055, 0.32 * amp, send * 0.4, 66);
        break;
      case 'metal':
        this._tone(1180, 'triangle', 0.18, 0.13 * amp, 0.35 + send, 940);
        this._tone(1790, 'sine', 0.13, 0.07 * amp, 0.35, 1500);
        this._noise(0.03, 'highpass', 5200, 1, 0.12 * amp, 0.2, slap);
        break;
      case 'crystal': {
        const step = PENT[Math.min(PENT.length - 1, (o.combo || 0) % PENT.length)];
        this._bell(660 * semis(step), 2.01, 3.2, 0.55, 0.13 * amp, 0.6);
        this._noise(0.02, 'highpass', 6000, 1, 0.07, 0.2, 0);
        break;
      }
      case 'bone':
        this._noise(0.05, 'bandpass', 1100, 3.0, 0.22 * amp, send, slap);
        this._tone(320, 'square', 0.04, 0.07 * amp, 0.1, 260);
        break;
      case 'root':
        this._noise(0.08, 'bandpass', 620, 1.6, 0.20 * amp, send, slap, 300);
        break;
      case 'wood':
        this._tone(160, 'triangle', 0.09, 0.18 * amp, send, 110);
        this._noise(0.06, 'bandpass', 1900, 1.4, 0.14 * amp, send, slap);
        break;
      case 'water':
        this._noise(0.12, 'lowpass', 500, 2.4, 0.20 * amp, 0.5, slap);
        this._tone(340, 'sine', 0.14, 0.08 * amp, 0.4, 130);
        break;
      case 'magma':
        this._noise(0.5, 'lowpass', 260, 1.0, 0.16 * amp, 0.5, 0);
        this._noise(0.4, 'highpass', 3000, 0.8, 0.05, 0.3, 0);
        this._tone(52, 'sine', 0.4, 0.20, 0.3, 40);
        break;
      default:
        this._noise(0.05, 'bandpass', 1400, 2.4, 0.26 * amp, send, slap);
        this._tone(170, 'sine', 0.06, 0.16 * amp, send * 0.5, 120);
    }

    if (o.crit) {
      // The combo layer. It climbs a pentatonic scale and shortens as you get better,
      // so a long combo audibly turns the rock into an instrument.
      const c = Math.min(o.combo || 1, 24);
      const step = PENT[Math.min(PENT.length - 1, c % PENT.length)] + Math.floor(c / PENT.length) * 12;
      const f = 523.25 * semis(Math.min(step, 24));
      this._bell(f, 1.5, 1.6, Math.max(0.10, 0.30 - c * 0.006), 0.10, 0.35);
      this._noise(0.022, 'highpass', 5600, 1, 0.10, 0.15, 0);
    }
  }

  breakTile(voice, o) {
    o = o || {};
    if (!this._ok('b' + voice, 18)) return;
    if (!this.ctx) return;
    const big = !!o.big;

    // the rattle: individual fragments hitting the floor
    const n = 3 + (big ? 3 : 0);
    for (let i = 0; i < n; i++) {
      const d = 0.02 + (i % 3) * 0.008;
      this._noise(d, 'bandpass', 900 + ((i * 613) % 2200), 3, 0.10, 0.12, 0);
    }
    if (voice === 'crystal') {
      this._bell(880, 2.0, 4.0, 0.7, 0.12, 0.7);
      this._bell(1320, 3.0, 3.0, 0.5, 0.06, 0.7, 0.05);
    } else if (voice === 'metal') {
      this._tone(760, 'triangle', 0.3, 0.12, 0.5, 380);
    } else {
      this._tone(voice === 'granite' ? 62 : 88, 'sine', big ? 0.22 : 0.13, big ? 0.30 : 0.18, 0.2, 44);
    }
    if (big) this._tone(44, 'sine', 0.3, 0.28, 0.15, 32);
    if (o.shear) this._noise(0.34, 'bandpass', 2600, 5, 0.16, 0.4, 0, 420);
    if (o.chain > 1) {
      for (let i = 0; i < Math.min(6, o.chain); i++) {
        this._tone(420 * semis(PENT[i % PENT.length]), 'square', 0.05, 0.05, 0.2, 0, 0.045 * i);
      }
    }
    if (o.value > 0.35) this._bell(1046, 2.0, 2.0, 0.35, 0.07, 0.6, 0.02);
  }

  pickup(kind, streak) {
    if (!this._ok('p' + kind, 20)) return;
    const s = Math.min(streak || 0, 20);
    const step = PENT[s % PENT.length] + Math.floor(s / PENT.length) * 12;
    if (kind === 'gem' || kind === 'relic') {
      const base = kind === 'relic' ? 392 : 523.25;
      this._bell(base, 2.0, 2.6, 0.55, 0.09, 0.6);
      this._bell(base * 1.5, 2.0, 2.0, 0.45, 0.06, 0.6, 0.06);
      this._bell(base * 2, 2.0, 1.6, 0.4, 0.05, 0.6, 0.12);
    } else if (kind === 'oil') {
      this._tone(300, 'sine', 0.22, 0.09, 0.3, 620);
    } else {
      this._bell(784 * semis(step), 1.0, 0.9, 0.16, 0.075, 0.25);
    }
  }

  comboTick(combo) {
    if (!this._ok('tick', 40)) return;
    // The metronome. Quiet, but it is how the beat is learned by ear.
    this._noise(0.012, 'highpass', 7000, 1, 0.035 + Math.min(combo, 20) * 0.002, 0.05, 0);
  }
  comboBreak() {
    if (!this._ok('cb', 120)) return;
    this._tone(150, 'sawtooth', 0.10, 0.05, 0.1, 84);
  }

  discovery(tier) {
    if (!this._ok('disc', 220)) return;
    if (tier >= 3) {
      this.duck(1.6, 0.42);
      this._bell(261.6, 2.0, 3.0, 1.5, 0.13, 0.8);
      this._bell(392.0, 2.0, 2.6, 1.4, 0.11, 0.8, 0.16);
      this._bell(523.3, 2.0, 2.2, 1.6, 0.12, 0.9, 0.32);
      this._tone(43.65, 'sine', 1.4, 0.26, 0.2, 32, 0.02);
    } else if (tier === 2) {
      this.duck(1.2, 0.32);
      this._tone(58.3, 'sine', 0.9, 0.20, 0.3, 44);
      this._bell(659.3, 2.0, 2.4, 1.1, 0.10, 0.85, 0.06);
      this._noise(0.6, 'highpass', 4000, 0.8, 0.05, 0.6, 0);
    } else {
      this._bell(587.3, 2.0, 1.8, 0.5, 0.08, 0.6);
      this._bell(880.0, 2.0, 1.4, 0.5, 0.07, 0.6, 0.10);
    }
  }

  bank(amount) {
    if (!this._ok('bank', 400)) return;
    const n = Math.max(3, Math.min(11, Math.round(Math.log10(Math.max(10, amount)) * 4)));
    for (let i = 0; i < n; i++) {
      const step = PENT[i % PENT.length] + Math.floor(i / PENT.length) * 12;
      this._bell(523.25 * semis(step), 1.0, 1.1, 0.28, 0.075, 0.4, i * 0.075);
    }
    this._tone(65.4, 'sine', 1.0, 0.16, 0.3, 49, 0.05);
  }

  hurt() { if (!this._ok('hurt', 90)) return; this._noise(0.16, 'lowpass', 900, 1.2, 0.28, 0.25, 0, 260); this._tone(140, 'sawtooth', 0.18, 0.16, 0.2, 62); }
  heal() { if (!this._ok('heal', 120)) return; this._bell(523, 2, 1.4, 0.4, 0.08, 0.4); }
  die() {
    if (!this._ok('die', 600)) return;
    this.duck(2.4, 0.7);
    this._tone(110, 'sine', 2.2, 0.22, 0.5, 34);
    this._tone(55, 'sine', 2.6, 0.20, 0.4, 22, 0.1);
    this._noise(1.6, 'lowpass', 700, 0.8, 0.16, 0.6, 0, 120);
  }
  jump() { if (!this._ok('jump', 90)) return; this._noise(0.05, 'bandpass', 900, 1.4, 0.08, 0.06, 0, 1600); }
  land(force) {
    if (!this._ok('land', 60)) return;
    this._noise(0.07, 'lowpass', 500 + force * 400, 1.2, 0.10 + force * 0.16, 0.12, 0);
    if (force > 0.5) this._tone(70, 'sine', 0.10, 0.18 * force, 0.15, 46);
  }
  step(voice) {
    if (!this._ok('step', 110)) return;
    this._noise(0.035, voice === 'gravel' ? 'bandpass' : 'lowpass', voice === 'gravel' ? 1800 : 620, 1.2, 0.055, 0.05, 0);
  }

  ui(kind) {
    if (!this._ok('ui' + kind, 30)) return;
    switch (kind) {
      case 'move': this._tone(880, 'square', 0.03, 0.035, 0.05); break;
      case 'confirm': this._bell(659, 1, 1.0, 0.2, 0.07, 0.2); this._bell(988, 1, 0.8, 0.22, 0.05, 0.2, 0.06); break;
      case 'cancel': case 'close': this._tone(330, 'square', 0.07, 0.05, 0.1, 200); break;
      case 'open': this._tone(440, 'square', 0.07, 0.05, 0.1, 660); break;
      case 'buy': for (let i = 0; i < 3; i++) this._bell(523 * semis(PENT[i]), 1, 1.2, 0.3, 0.07, 0.4, i * 0.06); break;
      case 'deny': this._tone(180, 'sawtooth', 0.12, 0.07, 0.1, 120); break;
      case 'tick': this._noise(0.012, 'highpass', 6000, 1, 0.04, 0.05, 0); break;
    }
  }

  danger(kind) {
    if (!this._ok('d' + kind, 500)) return;
    switch (kind) {
      case 'collapse':
        this._noise(1.1, 'lowpass', 380, 1.0, 0.34, 0.7, 0, 90);
        this._tone(40, 'sine', 1.0, 0.32, 0.4, 26);
        break;
      case 'enemy_alert':
        this._tone(220, 'sawtooth', 0.18, 0.10, 0.3, 150);
        this._noise(0.14, 'bandpass', 1500, 4, 0.10, 0.3, 0);
        break;
      case 'water': this._noise(0.7, 'lowpass', 620, 1.4, 0.16, 0.6, 0, 220); break;
      case 'magma': this._noise(0.9, 'lowpass', 300, 1.0, 0.16, 0.6, 0); this._tone(48, 'sine', 0.8, 0.2, 0.4, 34); break;
      case 'lowlight': this._bell(196, 2, 1.2, 0.7, 0.07, 0.7); break;
      case 'bagfull': this._tone(150, 'square', 0.16, 0.09, 0.1, 100); break;
    }
  }

  duck(sec, amt) { this.duckT = Math.max(this.duckT, sec); this.duckAmt = Math.max(this.duckAmt, amt); }

  // ── the bed ───────────────────────────────────────────────────────────────
  _buildBed() {
    const c = this.ctx;
    this.bedGain = c.createGain(); this.bedGain.gain.value = 0;
    this.bedFilter = c.createBiquadFilter();
    this.bedFilter.type = 'lowpass'; this.bedFilter.frequency.value = 380; this.bedFilter.Q.value = 0.6;
    this.bedGain.connect(this.bedFilter);
    this.bedFilter.connect(this.master);
    const vs = c.createGain(); vs.gain.value = 0.5;
    this.bedFilter.connect(vs); vs.connect(this.verb);

    this.drone = [];
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = ROOTS[0] * (i === 1 ? 1.5 : i === 2 ? 0.5 : 1);
      o.detune.value = (i - 1) * 7;
      const g = c.createGain(); g.gain.value = i === 2 ? 0.09 : 0.045;
      o.connect(g); g.connect(this.bedGain);
      o.start();
      this.drone.push({ o, g, mul: i === 1 ? 1.5 : i === 2 ? 0.5 : 1 });
    }

    // the heartbeat that rises with danger
    this.heart = c.createGain(); this.heart.gain.value = 0;
    const ho = c.createOscillator(); ho.type = 'sine'; ho.frequency.value = 44;
    ho.connect(this.heart); this.heart.connect(this.master); ho.start();
    this.heartOsc = ho;

    // the shimmer that rises with what you are carrying
    this.shimmer = c.createGain(); this.shimmer.gain.value = 0;
    const so = c.createOscillator(); so.type = 'triangle'; so.frequency.value = ROOTS[0] * 8;
    const sf = c.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 2400; sf.Q.value = 3;
    so.connect(sf); sf.connect(this.shimmer); this.shimmer.connect(this.verb); so.start();
    this.shimOsc = so;
  }

  ambient(stratumIdx) {
    this.stratum = Math.max(0, Math.min(ROOTS.length - 1, stratumIdx | 0));
    if (!this.ctx || !this.drone) return;
    const root = ROOTS[this.stratum];
    const t = this.ctx.currentTime;
    for (const d of this.drone) d.o.frequency.setTargetAtTime(root * d.mul, t, 0.6);
    if (this.shimOsc) this.shimOsc.frequency.setTargetAtTime(root * 8, t, 0.6);
    // the deepest stratum beats against itself
    if (this.drone[1]) this.drone[1].o.detune.setTargetAtTime(this.stratum === 2 ? 34 : 7, t, 1.0);
  }

  update(dt, st) {
    if (!this.ctx || this.failed) return;
    if (st) this.state = st;
    const s = this.state;
    const t = this.ctx.currentTime;

    if (this.duckT > 0) { this.duckT -= dt; if (this.duckT <= 0) this.duckAmt = 0; }
    const duck = 1 - this.duckAmt * Math.min(1, this.duckT * 2);

    const target = (s.alive === false ? 0.06 : 0.13 + s.danger * 0.10) * duck;
    this.bedGain.gain.setTargetAtTime(target, t, 0.4);
    this.bedFilter.frequency.setTargetAtTime(340 + s.danger * 1600, t, 0.5);

    // The player should feel their own wealth as tension in the mix.
    this.shimmer.gain.setTargetAtTime(Math.pow(s.haulRatio || 0, 1.4) * 0.035 * duck, t, 0.7);

    // Heartbeat: rate and depth both climb with danger.
    if (s.danger > 0.16) {
      const bpm = 52 + s.danger * 66;
      if (t > this.nextBeat) {
        this.nextBeat = t + 60 / bpm;
        this.heart.gain.cancelScheduledValues(t);
        this.heart.gain.setValueAtTime(0.0001, t);
        this.heart.gain.exponentialRampToValueAtTime(0.05 * s.danger + 0.006, t + 0.03);
        this.heart.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      }
    } else this.nextBeat = t;

    // A sparse pentatonic pluck, scheduled ahead. Exploration should mostly be quiet.
    if (t > this.nextPluck) {
      this.nextPluck = t + 4 + ((t * 7919) % 5);
      if (s.alive !== false && this.voices < 14) {
        const root = ROOTS[this.stratum];
        const step = PENT[Math.floor((t * 13) % PENT.length)];
        this._bell(root * 4 * semis(step), 2.0, 1.1, 2.2, 0.026 * duck, 0.9);
      }
    }

    // the tick of a failing lamp
    if ((s.lightRatio || 1) < 0.25 && t > (this._nextTick || 0)) {
      this._nextTick = t + 1.1;
      this._noise(0.02, 'bandpass', 2600, 6, 0.03, 0.2, 0);
    }
  }
}

export const audio = new AudioEngine();
