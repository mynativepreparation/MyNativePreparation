// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  createSound,
  MASTER_VOLUME,
  SOUND_STORAGE_KEY,
  type AudioContextLike,
  type SoundKind,
  type StorageLike,
} from './sound';

// ---- fakes: the real sound is judged on the owner's phone; here only the wiring is checked ----

class FakeParam {
  value = 0;
  setValueAtTime(): this {
    return this;
  }
  linearRampToValueAtTime(): this {
    return this;
  }
  exponentialRampToValueAtTime(): this {
    return this;
  }
}

class FakeNode {
  connected: unknown[] = [];
  connect(destination: unknown): unknown {
    this.connected.push(destination);
    return destination;
  }
}

class FakeOscillator extends FakeNode {
  type: OscillatorType = 'sine';
  frequency = new FakeParam();
  started: number[] = [];
  stopped: number[] = [];
  start(when = 0): void {
    this.started.push(when);
  }
  stop(when = 0): void {
    this.stopped.push(when);
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeContext implements AudioContextLike {
  state = 'suspended';
  currentTime = 0;
  destination = { name: 'destination' };
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  resumeCalls = 0;
  closeCalls = 0;
  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closeCalls += 1;
    return Promise.resolve();
  }
  createOscillator(): FakeOscillator {
    const osc = new FakeOscillator();
    this.oscillators.push(osc);
    return osc;
  }
  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
}

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function setup(storage: StorageLike | null = new MemoryStorage()) {
  const context = new FakeContext();
  const createContext = vi.fn(() => context);
  const sound = createSound({ createContext, storage });
  return { context, createContext, sound, storage };
}

const ALL_KINDS: SoundKind[] = ['tap', 'correct', 'wrong', 'result'];

describe('starting state', () => {
  it('is not muted and creates no audio context until it is needed', () => {
    const { sound, createContext } = setup();
    expect(sound.muted).toBe(false);
    expect(createContext).not.toHaveBeenCalled();
  });

  it('starts muted when the saved choice is "off"', () => {
    const storage = new MemoryStorage();
    storage.setItem(SOUND_STORAGE_KEY, 'off');
    expect(setup(storage).sound.muted).toBe(true);
  });

  it('stays unmuted for any other saved value', () => {
    const storage = new MemoryStorage();
    storage.setItem(SOUND_STORAGE_KEY, 'on');
    expect(setup(storage).sound.muted).toBe(false);
    storage.setItem(SOUND_STORAGE_KEY, 'garbage');
    expect(setup(storage).sound.muted).toBe(false);
  });
});

describe('unlock', () => {
  it('creates one context and resumes a suspended one exactly once', () => {
    const { sound, context, createContext } = setup();
    sound.unlock();
    sound.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(context.resumeCalls).toBe(1); // the fake is "running" after the first resume
  });

  it('does not resume a context that is already running', () => {
    const { sound, context } = setup();
    context.state = 'running';
    sound.unlock();
    expect(context.resumeCalls).toBe(0);
  });

  it('uses a low master volume wired to the output', () => {
    const { sound, context } = setup();
    sound.unlock();
    const master = context.gains[0];
    expect(master.gain.value).toBe(MASTER_VOLUME);
    expect(MASTER_VOLUME).toBeLessThanOrEqual(0.3);
    expect(master.connected).toContain(context.destination);
  });

  it('works even when unlocking also happens while muted', () => {
    const { sound, context } = setup();
    sound.setMuted(true);
    sound.unlock();
    expect(context.resumeCalls).toBe(1);
    expect(context.oscillators).toHaveLength(0);
  });
});

describe('play', () => {
  it('plays a single short blip for tap and one soft low note for wrong', () => {
    const { sound, context } = setup();
    sound.play('tap');
    expect(context.oscillators).toHaveLength(1);
    sound.play('wrong');
    expect(context.oscillators).toHaveLength(2);
  });

  it('plays two rising notes for correct', () => {
    const { sound, context } = setup();
    sound.play('correct');
    expect(context.oscillators).toHaveLength(2);
    const [first, second] = context.oscillators;
    expect(second.frequency.value).toBeGreaterThan(first.frequency.value);
    expect(second.started[0]).toBeGreaterThan(first.started[0]);
  });

  it('makes the wrong note lower than the correct notes', () => {
    const { sound, context } = setup();
    sound.play('correct');
    sound.play('wrong');
    const wrong = context.oscillators[2].frequency.value;
    expect(wrong).toBeLessThan(Math.min(context.oscillators[0].frequency.value, context.oscillators[1].frequency.value));
  });

  it.each([
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
  ])('plays a fanfare of more notes for more stars (%i stars -> %i notes)', (stars, notes) => {
    const { sound, context } = setup();
    sound.play('result', stars);
    expect(context.oscillators).toHaveLength(notes);
  });

  it('makes the fanfare for 5 stars last longer than for 1 star', () => {
    const one = setup();
    one.sound.play('result', 1);
    const five = setup();
    five.sound.play('result', 5);
    const end = (ctx: FakeContext) => Math.max(...ctx.oscillators.flatMap((o) => o.stopped));
    expect(end(five.context)).toBeGreaterThan(end(one.context));
  });

  it('keeps odd star values inside 1-5 notes range (0, 9, NaN)', () => {
    for (const stars of [0, -3, 9, Number.NaN]) {
      const { sound, context } = setup();
      sound.play('result', stars);
      expect(context.oscillators.length).toBeGreaterThanOrEqual(2);
      expect(context.oscillators.length).toBeLessThanOrEqual(6);
    }
  });

  it('routes every note through its own envelope to the master', () => {
    const { sound, context } = setup();
    sound.play('correct');
    const master = context.gains[0];
    // gains[0] is the master, gains[1..] are the per-note envelopes
    expect(context.gains).toHaveLength(3);
    context.gains.slice(1).forEach((envelope) => expect(envelope.connected).toContain(master));
    context.oscillators.forEach((osc) => expect(osc.connected).toHaveLength(1));
  });

  it('creates the context lazily when played before unlock', () => {
    const { sound, createContext, context } = setup();
    sound.play('tap');
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(context.oscillators).toHaveLength(1);
  });
});

describe('mute', () => {
  it('plays nothing and creates no nodes while muted', () => {
    const { sound, context, createContext } = setup();
    sound.setMuted(true);
    ALL_KINDS.forEach((kind) => sound.play(kind, 5));
    expect(context.oscillators).toHaveLength(0);
    expect(createContext).not.toHaveBeenCalled();
  });

  it('plays again after unmuting', () => {
    const { sound, context } = setup();
    sound.setMuted(true);
    sound.setMuted(false);
    sound.play('tap');
    expect(context.oscillators).toHaveLength(1);
  });

  it('remembers the choice for the next visit', () => {
    const storage = new MemoryStorage();
    const first = setup(storage).sound;
    first.setMuted(true);
    expect(storage.getItem(SOUND_STORAGE_KEY)).toBe('off');
    expect(setup(storage).sound.muted).toBe(true);

    first.setMuted(false);
    expect(storage.getItem(SOUND_STORAGE_KEY)).toBe('on');
    expect(setup(storage).sound.muted).toBe(false);
  });
});

describe('when things go wrong, the game stays silent but works', () => {
  it('tolerates a storage that throws on read and on write', () => {
    const broken: StorageLike = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    const { sound } = setup(broken);
    expect(sound.muted).toBe(false);
    expect(() => sound.setMuted(true)).not.toThrow();
    expect(sound.muted).toBe(true); // lasts for this visit
  });

  it('tolerates having no storage at all', () => {
    const { sound } = setup(null);
    expect(() => sound.setMuted(true)).not.toThrow();
    expect(sound.muted).toBe(true);
  });

  it('tolerates a browser without Web Audio (no context)', () => {
    const sound = createSound({ createContext: () => null, storage: null });
    expect(() => sound.unlock()).not.toThrow();
    ALL_KINDS.forEach((kind) => expect(() => sound.play(kind, 4)).not.toThrow());
    expect(() => sound.dispose()).not.toThrow();
  });

  it('tolerates a context factory that throws', () => {
    const sound = createSound({
      createContext: () => {
        throw new Error('no audio');
      },
      storage: null,
    });
    expect(() => sound.unlock()).not.toThrow();
    expect(() => sound.play('correct')).not.toThrow();
  });

  it('tolerates audio nodes that throw while playing', () => {
    const { sound, context } = setup();
    context.createOscillator = () => {
      throw new Error('boom');
    };
    expect(() => ALL_KINDS.forEach((kind) => sound.play(kind, 3))).not.toThrow();
  });

  it('tolerates a resume() that rejects or throws', async () => {
    const rejecting = new FakeContext();
    rejecting.resume = () => Promise.reject(new Error('not allowed'));
    const a = createSound({ createContext: () => rejecting, storage: null });
    expect(() => a.unlock()).not.toThrow();
    await Promise.resolve(); // let the swallowed rejection settle; an unhandled one would fail the run

    const throwing = new FakeContext();
    throwing.resume = () => {
      throw new Error('sync boom');
    };
    const b = createSound({ createContext: () => throwing, storage: null });
    expect(() => b.unlock()).not.toThrow();
  });
});

describe('dispose', () => {
  it('closes the context once and lets the sound be used again later', () => {
    const first = new FakeContext();
    const second = new FakeContext();
    const contexts = [first, second];
    const sound = createSound({ createContext: () => contexts.shift() ?? null, storage: null });

    sound.play('tap');
    expect(first.oscillators).toHaveLength(1);

    sound.dispose();
    sound.dispose(); // a second call does nothing
    expect(first.closeCalls).toBe(1);

    sound.play('tap');
    expect(second.oscillators).toHaveLength(1);
  });

  it('is fine when nothing was ever played', () => {
    const { sound } = setup();
    expect(() => sound.dispose()).not.toThrow();
  });
});
