import { beforeEach, describe, expect, it } from 'vitest';
import { gposSkippedCount, installGposGuard, isGposGuardInstalled, resetGposSkippedCount, type FontkitLike } from './gposGuard';

// A stand-in for the fontkit classes, shaped like the real internals the guard walks through:
// font.layout() creates font._layoutEngine.engine.GPOSProcessor (an instance of a class whose prototype has applyAnchor).
function makeFakeFontkit() {
  const calls: unknown[][] = [];
  class FakeGposProcessor {
    applyAnchor(...args: unknown[]) {
      const [markRecord, baseAnchor] = args as [{ markAnchor: { xCoordinate: number } }, { xCoordinate: number }];
      calls.push(args);
      // like the real fontkit: reads xCoordinate and crashes on a null anchor
      return markRecord.markAnchor.xCoordinate + baseAnchor.xCoordinate;
    }
  }
  class FakeFont {
    _layoutEngine: unknown = null;
    layout() {
      this._layoutEngine = { engine: { GPOSProcessor: new FakeGposProcessor() } };
      throw new Error('layout of the sample text may fail, only the engine object matters');
    }
  }
  const fontkit: FontkitLike = { create: () => new FakeFont() };
  return { fontkit, calls, Processor: FakeGposProcessor };
}

const sample = new Uint8Array([0]);

describe('installGposGuard', () => {
  beforeEach(() => {
    resetGposSkippedCount();
  });

  it('turns a null anchor from a crash into a skipped mark', () => {
    const { fontkit, Processor } = makeFakeFontkit();
    const unguarded = new Processor();
    expect(() => unguarded.applyAnchor({ markAnchor: null }, { xCoordinate: 1 })).toThrow();

    expect(installGposGuard(fontkit, sample)).toBe(true);
    expect(isGposGuardInstalled()).toBe(true);

    const proc = new Processor();
    expect(proc.applyAnchor({ markAnchor: { xCoordinate: 2 } }, null)).toBeUndefined();
    expect(proc.applyAnchor({ markAnchor: null }, { xCoordinate: 1 })).toBeUndefined();
    expect(proc.applyAnchor(null, { xCoordinate: 1 })).toBeUndefined();
    expect(gposSkippedCount()).toBe(3);
  });

  it('passes a normal call through to the original with the same arguments and result', () => {
    const { fontkit, calls, Processor } = makeFakeFontkit();
    installGposGuard(fontkit, sample);
    const mark = { markAnchor: { xCoordinate: 2 } };
    const base = { xCoordinate: 5 };
    expect(new Processor().applyAnchor(mark, base, 7)).toBe(7);
    expect(calls).toEqual([[mark, base, 7]]);
    expect(gposSkippedCount()).toBe(0);
  });

  it('does not wrap twice when installed again', () => {
    const { fontkit, calls, Processor } = makeFakeFontkit();
    expect(installGposGuard(fontkit, sample)).toBe(true);
    const wrapped = Processor.prototype.applyAnchor;
    expect(installGposGuard(fontkit, sample)).toBe(true);
    expect(Processor.prototype.applyAnchor).toBe(wrapped);
    new Processor().applyAnchor({ markAnchor: { xCoordinate: 1 } }, { xCoordinate: 1 });
    expect(calls).toHaveLength(1);
  });

  it('returns false when the fontkit internals are not found', () => {
    expect(installGposGuard({ create: () => ({}) }, sample)).toBe(false);
    expect(installGposGuard({ create: () => null }, sample)).toBe(false);
    expect(
      installGposGuard(
        {
          create: () => {
            throw new Error('not a font');
          },
        },
        sample,
      ),
    ).toBe(false);
  });
});
