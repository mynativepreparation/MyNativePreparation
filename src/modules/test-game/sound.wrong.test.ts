// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createSound, type AudioContextLike } from './sound';

// Owner check (P07 T10): the first "wrong answer" sound (a 196 Hz sine that faded out at once) was played by the code but
// could not be heard on a phone or laptop speaker. The real loudness is judged on the device; this guards the numbers that
// made it silent: a pitch below what small speakers can play, a plain sine without overtones, and a note that was too short.

const makeParam = () => ({
  value: 0,
  setValueAtTime: () => undefined,
  linearRampToValueAtTime: () => undefined,
  exponentialRampToValueAtTime: () => undefined,
});

class FakeOscillator {
  type: OscillatorType = 'sine';
  frequency = makeParam();
  startAt = 0;
  stopAt = 0;
  connect(): undefined {
    return undefined;
  }
  start(when = 0): void {
    this.startAt = when;
  }
  stop(when = 0): void {
    this.stopAt = when;
  }
}

function setup() {
  const oscillators: FakeOscillator[] = [];
  const context: AudioContextLike = {
    state: 'running',
    currentTime: 10,
    destination: {},
    resume: () => Promise.resolve(),
    createOscillator: () => {
      const osc = new FakeOscillator();
      oscillators.push(osc);
      return osc;
    },
    createGain: () => ({ gain: makeParam(), connect: () => undefined }),
  };
  const sound = createSound({ createContext: () => context, storage: null });
  return { sound, oscillators };
}

describe('the wrong-answer sound', () => {
  it('is one note in a pitch that small speakers can play, still lower than the correct notes', () => {
    const { sound, oscillators } = setup();
    sound.play('wrong');
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].frequency.value).toBeGreaterThanOrEqual(250);
    expect(oscillators[0].frequency.value).toBeLessThan(500);
  });

  it('lasts long enough to be heard (at least 0.3 s)', () => {
    const { sound, oscillators } = setup();
    sound.play('wrong');
    expect(oscillators[0].stopAt - oscillators[0].startAt).toBeGreaterThanOrEqual(0.3);
  });

  it('is not a plain sine wave (the overtones carry on weak speakers)', () => {
    const { sound, oscillators } = setup();
    sound.play('wrong');
    expect(oscillators[0].type).not.toBe('sine');
  });
});
