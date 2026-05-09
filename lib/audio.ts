'use client';

/**
 * Tasteful Web Audio click / hum / glitch FX. Lazy-init on first user gesture
 * (browsers require this for AudioContext). Sounds are synthesized at call
 * time — no asset loading, no Howler dependency.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;
let masterVolume = 0.35;
let lastBigEvent = 0;

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = (window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return null;
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = masterVolume;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

function out(): GainNode | null {
  ensureCtx();
  return masterGain;
}

export function setMuted(v: boolean) {
  muted = v;
  if (masterGain && ctx) {
    masterGain.gain.setTargetAtTime(v ? 0 : masterVolume, ctx.currentTime, 0.05);
  }
}
export function isMuted() { return muted; }

export function setVolume(v: number) {
  masterVolume = Math.max(0, Math.min(1, v));
  if (masterGain && ctx && !muted) {
    masterGain.gain.setTargetAtTime(masterVolume, ctx.currentTime, 0.05);
  }
}
export function getVolume() { return masterVolume; }

/** Subtle high-pitched click on block place. */
export function playPlaceClick(pitch = 1) {
  if (muted) return;
  const c = ensureCtx();
  const o = out();
  if (!c || !o) return;

  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(880 * pitch, t);
  osc.frequency.exponentialRampToValueAtTime(620 * pitch, t + 0.06);

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

  // gentle band-pass filter for "neon" feel
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1200;
  bp.Q.value = 4;

  osc.connect(bp).connect(g).connect(o);
  osc.start(t);
  osc.stop(t + 0.1);
}

/** Soft neon hum tail — used as accent for big paint operations. */
export function playNeonHum(pitch = 1) {
  if (muted) return;
  const c = ensureCtx();
  const o = out();
  if (!c || !o) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 220 * pitch;

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 800;
  lp.Q.value = 0.7;

  osc.connect(lp).connect(g).connect(o);
  osc.start(t);
  osc.stop(t + 0.42);
}

/** Glitch static burst on erase. */
export function playEraseGlitch() {
  if (muted) return;
  const c = ensureCtx();
  const o = out();
  if (!c || !o) return;
  const t = c.currentTime;

  // Filtered noise burst
  const buf = c.createBuffer(1, 0.18 * c.sampleRate, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const env = 1 - i / data.length;
    data[i] = (Math.random() * 2 - 1) * env * env;
  }
  const src = c.createBufferSource();
  src.buffer = buf;

  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1700;
  bp.Q.value = 1.6;

  const g = c.createGain();
  g.gain.value = 0.18;
  g.gain.setTargetAtTime(0, t + 0.1, 0.04);

  src.connect(bp).connect(g).connect(o);
  src.start(t);
  src.stop(t + 0.2);
}

/** Big "thump" + bloom-pulse audio for large fills. Throttled. */
export function playLargeFillThump() {
  if (muted) return;
  const c = ensureCtx();
  const o = out();
  if (!c || !o) return;
  const now = performance.now();
  if (now - lastBigEvent < 180) return;
  lastBigEvent = now;
  const t = c.currentTime;

  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.25);

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

  osc.connect(g).connect(o);
  osc.start(t);
  osc.stop(t + 0.55);

  // High-end shimmer overlay
  const sh = c.createOscillator();
  sh.type = 'square';
  sh.frequency.setValueAtTime(1200, t);
  const sg = c.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.04, t + 0.005);
  sg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  sh.connect(sg).connect(o);
  sh.start(t);
  sh.stop(t + 0.2);
}
