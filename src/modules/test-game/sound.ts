// Tiny Web Audio synthesiser for the test game (P07 T3, DECISIONS Q13/Q18): no sound files, no dependency.
// Rules: one AudioContext, created lazily and resumed from the Start tap (browser autoplay rule); low master volume;
// a muted game creates no audio nodes at all; ANY audio problem is swallowed, so the game always works silently.

export type SoundKind = 'tap' | 'correct' | 'wrong' | 'result';

/** localStorage key that remembers the mute choice: "off" = muted, "on" = sound. */
export const SOUND_STORAGE_KEY = 'np.test.sound';

/** Master volume (0-1). Deliberately low: the cheer must never startle anybody. */
export const MASTER_VOLUME = 0.2;

// The small part of the Web Audio API that is used, so a fake can stand in during tests.
interface ParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}
interface OscillatorLike {
  type: OscillatorType;
  frequency: ParamLike;
  connect(destination: unknown): unknown;
  start(when?: number): void;
  stop(when?: number): void;
}
interface GainLike {
  gain: ParamLike;
  connect(destination: unknown): unknown;
}
export interface AudioContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  close?(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SoundOptions {
  /** Makes the audio context. Default: the browser's AudioContext (or webkitAudioContext). Return null when there is none. */
  createContext?: () => AudioContextLike | null;
  /** Where the mute choice is remembered. Default: localStorage. Pass null for "nowhere". */
  storage?: StorageLike | null;
}

export interface Sound {
  /** Call from the Start tap: creates the audio context and resumes it when the browser suspended it. */
  unlock(): void;
  /** Plays one sound. `stars` (1-5) only matters for 'result': more stars, longer fanfare. */
  play(kind: SoundKind, stars?: number): void;
  readonly muted: boolean;
  setMuted(muted: boolean): void;
  /** Releases the audio context (call when the game screen closes). The sound can be used again afterwards. */
  dispose(): void;
}

// Note frequencies in Hz.
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;
const E6 = 1318.51;
const G6 = 1567.98;
const E4 = 329.63;
const C4 = 261.63;
const FANFARE = [C5, E5, G5, C6, E6, G6];

function defaultContext(): AudioContextLike | null {
  const globals = globalThis as unknown as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  const Ctor = globals.AudioContext ?? globals.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage can throw when the browser blocks it
  }
}

export function createSound(options: SoundOptions = {}): Sound {
  const createContext = options.createContext ?? defaultContext;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;

  let muted = false;
  try {
    muted = storage?.getItem(SOUND_STORAGE_KEY) === 'off';
  } catch {
    muted = false;
  }

  let context: AudioContextLike | null = null;
  let master: GainLike | null = null;

  function ensureContext(): AudioContextLike | null {
    if (context) return context;
    try {
      const made = createContext();
      if (!made) return null;
      const gain = made.createGain();
      gain.gain.value = MASTER_VOLUME;
      gain.connect(made.destination);
      context = made;
      master = gain;
    } catch {
      context = null;
      master = null;
    }
    return context;
  }

  /** One soft note: a short fade in, then a fade out, so there are no clicks. `hold` keeps it at full level a little longer; `glideTo` slides the pitch. */
  function note(
    ctx: AudioContextLike,
    out: GainLike,
    frequency: number,
    delay: number,
    length: number,
    type: OscillatorType,
    shape: { glideTo?: number; hold?: number } = {},
  ) {
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    if (shape.glideTo !== undefined) {
      osc.frequency.setValueAtTime(frequency, start);
      osc.frequency.exponentialRampToValueAtTime(shape.glideTo, start + length);
    }
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(1, start + 0.01);
    if (shape.hold !== undefined) envelope.gain.setValueAtTime(1, start + 0.01 + shape.hold);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(envelope);
    envelope.connect(out);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }

  function play(kind: SoundKind, stars = 3): void {
    if (muted) return;
    try {
      const ctx = ensureContext();
      if (!ctx || !master) return;
      switch (kind) {
        case 'tap':
          note(ctx, master, 660, 0, 0.06, 'triangle');
          break;
        case 'correct':
          note(ctx, master, C5, 0, 0.16, 'sine');
          note(ctx, master, G5, 0.09, 0.22, 'sine');
          break;
        case 'wrong':
          // Owner check (P07 T10): the first wrong sound (196 Hz sine, faded out at once) could not be heard on a phone or laptop speaker.
          // Now: a triangle note (its overtones carry on small speakers) that slides down from E4 to C4 and stays loud for a moment.
          note(ctx, master, E4, 0, 0.45, 'triangle', { glideTo: C4, hold: 0.18 });
          break;
        case 'result': {
          const earned = Math.min(5, Math.max(1, Math.round(Number.isFinite(stars) ? stars : 1)));
          const count = earned + 1; // 1 star: 2 notes ... 5 stars: 6 notes
          for (let i = 0; i < count; i++) {
            const last = i === count - 1;
            note(ctx, master, FANFARE[i], i * 0.12, last ? 0.5 : 0.14, last ? 'triangle' : 'sine');
          }
          break;
        }
      }
    } catch {
      // never let a sound problem reach the game
    }
  }

  return {
    unlock() {
      try {
        const ctx = ensureContext();
        if (ctx && ctx.state === 'suspended') {
          void Promise.resolve(ctx.resume()).catch(() => undefined);
        }
      } catch {
        // ignored on purpose: the game works silently
      }
    },
    play,
    get muted() {
      return muted;
    },
    setMuted(value: boolean) {
      muted = value;
      try {
        storage?.setItem(SOUND_STORAGE_KEY, value ? 'off' : 'on');
      } catch {
        // the choice then lasts only for this visit
      }
    },
    dispose() {
      const old = context;
      context = null;
      master = null;
      try {
        if (old?.close) void Promise.resolve(old.close()).catch(() => undefined);
      } catch {
        // ignored on purpose
      }
    },
  };
}
