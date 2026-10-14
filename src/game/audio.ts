type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let holdSource: AudioBufferSourceNode | null = null;
let holdGain: GainNode | null = null;
let holdBuffer: AudioBuffer | null = null;
let muted = true;
let holdWanted = false;
let holdStopTimer = 0;

function ctor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const webkit = (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  return window.AudioContext ?? webkit ?? null;
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AudioContextCtor = ctor();
  if (!AudioContextCtor) return null;
  const context = new AudioContextCtor({ latencyHint: "interactive" });
  const masterGain = context.createGain();
  const sfx = context.createGain();
  const music = context.createGain();
  sfx.gain.setValueAtTime(0.85, context.currentTime);
  music.gain.setValueAtTime(0.22, context.currentTime);
  masterGain.gain.setValueAtTime(muted ? 0 : 0.9, context.currentTime);
  sfx.connect(masterGain);
  music.connect(masterGain);
  masterGain.connect(context.destination);
  ctx = context;
  master = masterGain;
  sfxBus = sfx;
  musicBus = music;
  holdBuffer = makeHoldBuffer(context);
  return context;
}

/** Call synchronously inside a click / key / tap. Starts muted. */
export function unlockAudio(): void {
  try {
    const context = ensure();
    if (context && context.state === "suspended") void context.resume();
  } catch {
    /* audio is optional */
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    const context = ensure();
    if (!context || !master) return;
    master.gain.setTargetAtTime(next ? 0 : 0.9, context.currentTime, 0.02);
    if (next) stopHold();
    else if (holdWanted) startHold();
  } catch {
    /* ignore */
  }
}

export function resumeAudio(): void {
  try {
    if (ctx && ctx.state === "suspended") void ctx.resume();
  } catch {
    /* ignore */
  }
}

function envGain(context: AudioContext, bus: GainNode, peak: number, start: number, dur: number): GainNode {
  const gain = context.createGain();
  gain.connect(bus);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  return gain;
}

function tone(
  context: AudioContext,
  bus: GainNode,
  frequency: number,
  start: number,
  dur: number,
  type: OscillatorType,
  peak: number,
): void {
  const osc = context.createOscillator();
  const gain = envGain(context, bus, peak, start, dur);
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  osc.connect(gain);
  osc.start(start);
  osc.stop(start + dur + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

export function playDial(): void {
  try {
    if (muted) return;
    const context = ensure();
    if (!context || !sfxBus) return;
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime;
    const gain = context.createGain();
    gain.connect(sfxBus);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.09, start + 0.03);
    gain.gain.setValueAtTime(0.09, start + 0.55);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.78);
    for (const frequency of [350, 440]) {
      const osc = context.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, start);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + 0.8);
      osc.onended = () => osc.disconnect();
    }
    window.setTimeout(() => gain.disconnect(), 900);
  } catch {
    /* ignore */
  }
}

export function playChing(): void {
  try {
    if (muted) return;
    const context = ensure();
    if (!context || !sfxBus) return;
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime;
    const noise = context.createBuffer(1, Math.floor(context.sampleRate * 0.08), context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const decay = 1 - i / data.length;
      data[i] = (Math.random() * 2 - 1) * decay * decay;
    }
    const src = context.createBufferSource();
    src.buffer = noise;
    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.12, start);
    src.connect(noiseGain);
    noiseGain.connect(sfxBus);
    src.start(start);
    src.onended = () => {
      src.disconnect();
      noiseGain.disconnect();
    };
    tone(context, sfxBus, 880, start, 0.16, "triangle", 0.16);
    tone(context, sfxBus, 1320, start + 0.07, 0.22, "triangle", 0.14);
    tone(context, sfxBus, 1760, start + 0.12, 0.18, "sine", 0.06);
  } catch {
    /* ignore */
  }
}

export function playAlert(): void {
  try {
    if (muted) return;
    const context = ensure();
    if (!context || !sfxBus) return;
    const start = context.currentTime;
    tone(context, sfxBus, 520, start, 0.12, "square", 0.05);
    tone(context, sfxBus, 780, start + 0.1, 0.16, "square", 0.05);
  } catch {
    /* ignore */
  }
}

export function setHold(on: boolean): void {
  holdWanted = on;
  if (!on || muted) {
    stopHold();
    return;
  }
  try {
    const context = ensure();
    if (!context) return;
    if (context.state === "suspended") void context.resume();
    startHold();
  } catch {
    /* ignore */
  }
}

function startHold(): void {
  if (!ctx || !musicBus || !holdBuffer || holdSource) return;
  window.clearTimeout(holdStopTimer);
  const source = ctx.createBufferSource();
  source.buffer = holdBuffer;
  source.loop = true;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.35);
  source.connect(gain);
  gain.connect(musicBus);
  source.start();
  holdSource = source;
  holdGain = gain;
}

function stopHold(): void {
  if (!holdSource || !ctx || !holdGain) {
    holdSource = null;
    holdGain = null;
    return;
  }
  const source = holdSource;
  const gain = holdGain;
  holdSource = null;
  holdGain = null;
  try {
    gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06);
  } catch {
    /* ignore */
  }
  holdStopTimer = window.setTimeout(() => {
    try {
      source.stop();
      source.disconnect();
      gain.disconnect();
    } catch {
      /* already stopped */
    }
  }, 220);
}

function makeHoldBuffer(context: AudioContext): AudioBuffer {
  const seconds = 2.8;
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  const notes = [261.63, 329.63, 392, 329.63, 440, 392, 329.63, 261.63];
  const beat = seconds / notes.length;
  for (let i = 0; i < data.length; i++) {
    const time = i / context.sampleRate;
    const index = Math.min(notes.length - 1, Math.floor(time / beat));
    const local = time - index * beat;
    const env = Math.sin(Math.min(1, local / 0.05) * Math.PI * 0.5) * Math.exp(-local * 3.1);
    const bass = index % 4 === 0 ? Math.sin(2 * Math.PI * 130.81 * time) * Math.exp(-local * 2.2) * 0.35 : 0;
    data[i] = Math.sin(2 * Math.PI * notes[index]! * time) * env * 0.55 + bass;
  }
  return buffer;
}
