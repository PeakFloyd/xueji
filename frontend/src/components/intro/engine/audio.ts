import { BEAT, CLASSES, DURATION, VOICE } from "./constants";
import { E, rng } from "./ease";

/**
 * Sound: the six voice clips plus a synthesised effects track, all scheduled on the AudioContext
 * clock. The same clock drives the picture, so every hit lands on its frame.
 */

type Ctx = BaseAudioContext;

function makeNoise(ctx: Ctx) {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = rng(7);
  for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
  return buf;
}

function makeImpulse(ctx: Ctx, seconds = 2.4) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const r = rng(11);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  return buf;
}

/** Build the whole soundtrack into `out`, starting at context time `when`. */
export function scheduleSoundtrack(
  ctx: Ctx,
  out: AudioNode,
  when: number,
  voices: (AudioBuffer | null)[],
  opts: { sfx?: boolean } = {},
) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 8;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  const master = ctx.createGain();
  master.gain.value = 0.8;
  // brick-wall-ish limiter so stacked hits never clip
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.12;
  // Chrome's compressor adds automatic make-up gain; a fixed trim after it keeps ~1.5 dB of headroom
  const trim = ctx.createGain();
  trim.gain.value = 0.88;
  comp.connect(master).connect(limiter).connect(trim).connect(out);

  const verb = ctx.createConvolver();
  verb.buffer = makeImpulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  verb.connect(wet).connect(comp);

  const sfx = ctx.createGain();
  const SFX = opts.sfx === false ? 0 : 0.9;
  sfx.gain.value = SFX;
  sfx.connect(comp);
  // duck the effects under each spoken line (measured speech windows, global seconds)
  for (const [a, b] of [
    [0.55, 2.6],
    [4.45, 5.66],
    [8.4, 9.55],
    [12.38, 13.5],
    [13.98, 15.58],
    [15.98, 18.4],
  ]) {
    sfx.gain.setValueAtTime(SFX, when + a - 0.06);
    sfx.gain.linearRampToValueAtTime(SFX * 0.55, when + a);
    sfx.gain.setValueAtTime(SFX * 0.55, when + b);
    sfx.gain.linearRampToValueAtTime(SFX, when + b + 0.12);
  }

  const noise = makeNoise(ctx);
  const offsets = rng(13);
  const T = (t: number) => when + t;

  const env = (g: AudioParam, t: number, a: number, peak: number, d: number) => {
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + d);
  };
  const noiseSrc = (t: number, dur: number) => {
    const n = ctx.createBufferSource();
    n.buffer = noise;
    n.loop = true;
    n.start(t, offsets() * 1.5);
    n.stop(t + dur + 0.05);
    return n;
  };
  const send = (node: AudioNode, amount: number) => {
    const s = ctx.createGain();
    s.gain.value = amount;
    node.connect(s).connect(verb);
  };

  const thud = (t0: number, f0 = 120, f1 = 42, dur = 0.5, gain = 0.8) => {
    const t = T(t0);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
    const g = ctx.createGain();
    env(g.gain, t, 0.003, gain, dur);
    o.connect(g).connect(sfx);
    o.start(t);
    o.stop(t + dur + 0.1);
    // transient
    const n = noiseSrc(t, 0.05);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2200;
    const ng = ctx.createGain();
    env(ng.gain, t, 0.001, gain * 0.22, 0.03);
    n.connect(hp).connect(ng).connect(sfx);
    // body
    const b = noiseSrc(t, 0.2);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    const bg = ctx.createGain();
    env(bg.gain, t, 0.004, gain * 0.35, 0.12);
    b.connect(lp).connect(bg).connect(sfx);
    send(g, 0.08);
  };

  const tick = (t0: number, f = 3200, gain = 0.1, dur = 0.035, pan = 0) => {
    const t = T(t0);
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    const g = ctx.createGain();
    env(g.gain, t, 0.001, gain, dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  const whoosh = (t0: number, dur: number, f0: number, f1: number, gain = 0.15, q = 0.9, pan0 = -0.5, pan1 = 0.5) => {
    const t = T(t0);
    const n = noiseSrc(t, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.68);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(pan0, t);
    p.pan.linearRampToValueAtTime(pan1, t + dur);
    n.connect(bp).connect(g).connect(p).connect(sfx);
    send(g, 0.15);
  };

  const glide = (t0: number, dur: number, f0: number, f1: number, gain = 0.06, type: OscillatorType = "sine") => {
    const t = T(t0);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.05, dur / 3));
    g.gain.setValueAtTime(gain, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
    send(g, 0.2);
  };

  const chime = (t0: number, freqs: number[], gain = 0.08, decay = 1.4) => {
    const t = T(t0);
    freqs.forEach((f, i) => {
      for (const [mult, amp] of [
        [1, 1],
        [2.01, 0.18],
      ]) {
        const o = ctx.createOscillator();
        o.frequency.value = f * mult;
        const g = ctx.createGain();
        env(g.gain, t + i * 0.012, 0.004, gain * amp, decay * (mult === 1 ? 1 : 0.4));
        o.connect(g).connect(sfx);
        send(g, 0.9);
        o.start(t);
        o.stop(t + decay + 0.2);
      }
    });
  };

  const boom = (t0: number, gain = 1) => {
    const t = T(t0);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 1.1);
    const g = ctx.createGain();
    env(g.gain, t, 0.006, gain, 1.5);
    o.connect(g).connect(sfx);
    o.start(t);
    o.stop(t + 1.7);
    const n = noiseSrc(t, 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.4);
    const ng = ctx.createGain();
    env(ng.gain, t, 0.002, gain * 0.55, 0.4);
    n.connect(lp).connect(ng).connect(sfx);
    send(ng, 0.6);
    send(g, 0.2);
  };

  const tock = (t0: number, f = 760, gain = 0.16) => {
    const t = T(t0);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * 1.4, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.02);
    const g = ctx.createGain();
    env(g.gain, t, 0.001, gain, 0.08);
    o.connect(g).connect(sfx);
    o.start(t);
    o.stop(t + 0.15);
    const n = noiseSrc(t, 0.04);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2600;
    bp.Q.value = 3;
    const ng = ctx.createGain();
    env(ng.gain, t, 0.001, gain * 0.5, 0.025);
    n.connect(bp).connect(ng).connect(sfx);
  };

  const scanner = (t0: number, dur: number) => {
    const t = T(t0);
    const n = noiseSrc(t, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 7;
    bp.frequency.setValueAtTime(1100, t);
    bp.frequency.exponentialRampToValueAtTime(5200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.06);
    g.gain.setValueAtTime(0.16, t + dur - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-0.7, t);
    p.pan.linearRampToValueAtTime(0.7, t + dur);
    n.connect(bp).connect(g).connect(p).connect(sfx);
    glide(t0, dur, 1480, 1560, 0.018, "square");
  };

  // ---------- drone bed ----------
  {
    const t = T(0);
    const end = T(DURATION + 1.2);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.linearRampToValueAtTime(260, T(7.9));
    lp.frequency.exponentialRampToValueAtTime(1100, T(8.7));
    lp.frequency.exponentialRampToValueAtTime(300, T(12));
    lp.frequency.exponentialRampToValueAtTime(700, T(16.1));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, T(1.5));
    g.gain.setValueAtTime(0.07, T(DURATION - 1));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    lp.connect(g).connect(sfx);
    for (const [f, type, a] of [
      [55, "sine", 0.9],
      [82.41, "sine", 0.5],
      [110.3, "triangle", 0.25],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = a;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(end + 0.1);
    }
  }

  // ---------- segment 1: kinetic type ----------
  tick(0, 2400, 0.14);
  thud(0, 90, 40, 0.35, 0.45);
  whoosh(0.03, 0.45, 600, 5000, 0.14);
  thud(BEAT.access, 130, 45, 0.5, 0.7);
  whoosh(0.98, 0.3, 2400, 500, 0.08);
  thud(BEAT.permission, 120, 44, 0.45, 0.65);
  whoosh(1.64, 0.26, 600, 2600, 0.07);
  thud(BEAT.required, 105, 38, 0.6, 0.85);
  scanner(2.3, 0.86);
  {
    // a tick as the scan crosses each letter (words share the stack width, so x is uniform per word)
    const inv = (u: number) => {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 30; i++) {
        const m = (lo + hi) / 2;
        if (E.soft(m) < u) lo = m;
        else hi = m;
      }
      return lo;
    };
    const span = 1240 + 100;
    (
      [
        ["ACCESS", 0],
        ["PERMISSION", 1],
        ["REQUIRED", 2],
      ] as const
    ).forEach(([w, line]) => {
      [...w].forEach((ch, i) => {
        const x = 50 + ((i + 0.5) / w.length) * 1240;
        const tt = 2.4 + inv(x / span) * 0.72;
        const hit = line === 2 && (ch === "I" || ch === "D");
        if (hit) tick(tt, 1760, 0.12, 0.12);
        else tick(tt, 4200 + line * 500, 0.035, 0.018, (x / span) * 1.2 - 0.6);
      });
    });
  }
  whoosh(3.16, 0.45, 1800, 220, 0.12);
  whoosh(3.42, 1.0, 250, 1400, 0.08);

  // ---------- segment 2: shape morph ----------
  thud(BEAT.id - 0.04, 140, 48, 0.45, 0.75);
  thud(BEAT.idD - 0.04, 118, 44, 0.42, 0.6);
  glide(4.9, 0.52, 330, 990, 0.04);
  whoosh(4.9, 0.5, 800, 3200, 0.07);
  chime(5.42, [1318.5, 1975.5], 0.09, 1.3);
  glide(5.72, 0.6, 900, 300, 0.05);
  whoosh(5.72, 0.58, 3200, 600, 0.08);
  whoosh(6.2, 0.5, 180, 900, 0.16, 0.7, 0.3, -0.3);
  [760, 680, 820, 620].forEach((f, i) => tock(6.62 + i * 0.15, f));
  whoosh(7.26, 0.3, 2200, 400, 0.05);

  // ---------- segment 3: 2D -> 3D ----------
  whoosh(7.95, 0.75, 200, 6000, 0.13, 0.6);
  glide(7.95, 0.75, 55, 110, 0.16);
  {
    const r = rng(3);
    for (let i = 0; i < 14; i++) tick(8.05 + i * 0.045, 3800 + r() * 2400, 0.022, 0.02, r() * 1.6 - 0.8);
  }
  thud(BEAT.request - 0.04, 100, 40, 0.4, 0.5);
  thud(BEAT.received - 0.04, 100, 40, 0.4, 0.5);
  whoosh(9.48, 0.65, 300, 1800, 0.13);
  whoosh(10.18, 0.24, 600, 4000, 0.15, 0.8, 0.2, -0.2);
  boom(10.42, 1);
  thud(10.42, 160, 35, 0.7, 0.9);
  whoosh(10.5, 0.5, 400, 5200, 0.12, 0.8, 0, 0);
  whoosh(11.12, 0.85, 1500, 300, 0.09);
  tick(11.98, 2000, 0.07);

  // ---------- segment 4: data ----------
  whoosh(12.03, 0.5, 500, 3500, 0.07);
  [12.24, 12.31, 12.38].forEach((t) => tick(t, 3600, 0.05));
  tick(BEAT.start, 3000, 0.1);
  thud(BEAT.start, 90, 40, 0.3, 0.35);
  CLASSES.flatMap((c) => c.credits).forEach((v, i) =>
    tick(BEAT.start + 0.04 + i * 0.024, 900 + v * 70, 0.045, 0.04, (i / 49) * 1.2 - 0.6),
  );
  glide(BEAT.processing, 2.1, 220, 440, 0.025, "triangle");
  whoosh(13.12, 0.5, 1000, 4000, 0.05);
  {
    const r = rng(5);
    for (let t = 12.9; t < 14.5; t += 1 / 18) tick(t, 2200 + Math.floor(r() * 4) * 600, 0.016, 0.015);
  }
  tick(BEAT.permission2, 2600, 0.06);
  // records sorting, class by class
  for (let g = 0; g < 10; g++) tick(14.05 + g * 0.05 + 0.25, 1300 + g * 90, 0.035, 0.05, g / 9 - 0.5);
  thud(BEAT.authorized - 0.05, 120, 40, 0.5, 0.65);
  chime(BEAT.authorized - 0.05, [1046.5, 1318.5, 1568.0, 2093.0], 0.045, 1.2);
  whoosh(15.22, 0.4, 3000, 300, 0.12);
  whoosh(15.55, 0.6, 400, 2400, 0.09);

  // ---------- segment 5: end title ----------
  boom(16.12, 0.7);
  chime(16.12, [261.63, 392.0, 523.25, 784.0, 1318.5], 0.032, 2.8);
  for (let i = 0; i < 6; i++) tick(16.12 + i * 0.07, 1500 + i * 180, 0.04, 0.03, i / 5 - 0.5);
  whoosh(16.6, 0.3, 2000, 6000, 0.04);
  tick(16.98, 3000, 0.04);
  whoosh(17.42, 0.24, 400, 2200, 0.08);
  thud(BEAT.welcome2, 150, 45, 0.5, 0.85);
  tock(BEAT.welcome2, 520, 0.2);
  scanner(17.83, 0.82);
  tick(18.66, 1800, 0.1);

  // ---------- voice ----------
  const vbus = ctx.createGain();
  vbus.gain.value = 1.2;
  vbus.connect(comp);
  VOICE.forEach((v, i) => {
    const buf = voices[i];
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(vbus);
    src.start(T(v.at));
  });

  return master;
}

/** Render the full mix offline (for review / export); returns a 16-bit stereo WAV as base64. */
export async function renderMixWav(sampleRate = 48000, parts: { voice?: boolean; sfx?: boolean } = {}): Promise<string> {
  const ctx = new OfflineAudioContext(2, Math.ceil((DURATION + 2.5) * sampleRate), sampleRate);
  const voices = await Promise.all(
    VOICE.map(async (v) => {
      try {
        return await ctx.decodeAudioData(await (await fetch(v.src)).arrayBuffer());
      } catch {
        return null;
      }
    }),
  );
  scheduleSoundtrack(ctx, ctx.destination, 0, parts.voice === false ? voices.map(() => null) : voices, { sfx: parts.sfx });
  const buf = await ctx.startRendering();
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o: number, v: string) => [...v].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + n * 4, true);
  str(8, "WAVEfmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 2, true);
  out.setUint32(24, sampleRate, true);
  out.setUint32(28, sampleRate * 4, true);
  out.setUint16(32, 4, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  const bytes = new Uint8Array(out.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Live playback: loads the clips, unlocks on a gesture, exposes the audio clock. */
export class IntroAudio {
  ctx: AudioContext | null = null;
  private voices: (AudioBuffer | null)[] = VOICE.map(() => null);
  private bus: GainNode | null = null;
  private t0 = 0;
  readonly ready: Promise<void>;

  constructor() {
    try {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
    } catch {
      this.ctx = null;
    }
    this.ready = this.load();
  }

  private async load() {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      VOICE.map(async (v, i) => {
        try {
          const res = await fetch(v.src);
          this.voices[i] = await ctx.decodeAudioData(await res.arrayBuffer());
        } catch {
          this.voices[i] = null;
        }
      }),
    );
  }

  /** Must be called synchronously inside a user gesture. */
  unlock() {
    void this.ctx?.resume();
  }

  /** Schedule everything; returns false if audio is unavailable (caller falls back to a wall clock). */
  start(): boolean {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return false;
    this.stop(0);
    const bus = ctx.createGain();
    bus.connect(ctx.destination);
    this.bus = bus;
    this.t0 = ctx.currentTime + 0.08;
    scheduleSoundtrack(ctx, bus, this.t0, this.voices);
    return true;
  }

  /** Seconds since the soundtrack started, as currently heard. */
  now(): number {
    const ctx = this.ctx!;
    const ts = ctx.getOutputTimestamp?.();
    if (ts && ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) {
      return ts.contextTime + (performance.now() - ts.performanceTime) / 1000 - this.t0;
    }
    return ctx.currentTime - this.t0;
  }

  stop(fade = 0.25) {
    const ctx = this.ctx;
    const bus = this.bus;
    if (!ctx || !bus) return;
    this.bus = null;
    bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(0, ctx.currentTime + Math.max(fade, 0.01));
    setTimeout(() => bus.disconnect(), (fade + 0.1) * 1000);
  }

  dispose() {
    this.stop(0);
    void this.ctx?.close();
  }
}
