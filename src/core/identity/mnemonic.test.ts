// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { checkMnemonic, generateMnemonic12, normalizeMnemonic, WORD_COUNT } from './mnemonic';

// Official BIP39 test vectors (entropy 00..00 and 7f..7f, 128 bits each).
const ZERO_VECTOR = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const SEVEN_F_VECTOR = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

describe('generateMnemonic12', () => {
  it('returns 12 words that all pass the checker', () => {
    const words = generateMnemonic12();
    expect(words.split(' ')).toHaveLength(WORD_COUNT);
    expect(checkMnemonic(words)).toEqual({ ok: true, words });
  });

  it('gives 100 valid and different phrases', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const words = generateMnemonic12();
      expect(checkMnemonic(words).ok).toBe(true);
      seen.add(words);
    }
    expect(seen.size).toBe(100);
  });

  it('uses only words of the English list', () => {
    const known = new Set(wordlist);
    for (const word of generateMnemonic12().split(' ')) expect(known.has(word)).toBe(true);
  });
});

describe('official vectors', () => {
  it('accepts the all-zero vector and decodes to 16 zero bytes', () => {
    expect(checkMnemonic(ZERO_VECTOR)).toEqual({ ok: true, words: ZERO_VECTOR });
    expect(Array.from(mnemonicToEntropy(ZERO_VECTOR, wordlist))).toEqual(new Array(16).fill(0));
  });

  it('accepts the 7f vector and decodes to 16 bytes of 0x7f', () => {
    expect(checkMnemonic(SEVEN_F_VECTOR).ok).toBe(true);
    expect(Array.from(mnemonicToEntropy(SEVEN_F_VECTOR, wordlist))).toEqual(new Array(16).fill(0x7f));
  });
});

describe('normalizeMnemonic', () => {
  it('trims, lower-cases and collapses spaces, tabs and line breaks', () => {
    expect(normalizeMnemonic('  LEGAL \t winner\nthank\r\nyear wave sausage worth useful legal winner thank yellow  ')).toBe(
      SEVEN_F_VECTOR,
    );
  });

  it('turns full-width letters into plain letters', () => {
    expect(normalizeMnemonic('ＬＥＧＡＬ winner')).toBe('legal winner');
  });

  it('returns an empty string for anything that is not text', () => {
    for (const bad of [null, undefined, 42, {}, [], true]) expect(normalizeMnemonic(bad)).toBe('');
  });

  it('lets messy input pass the checker', () => {
    expect(checkMnemonic(`\n  ${SEVEN_F_VECTOR.toUpperCase()}  \n`)).toEqual({ ok: true, words: SEVEN_F_VECTOR });
  });
});

describe('checkMnemonic problems', () => {
  const eleven = SEVEN_F_VECTOR.split(' ').slice(0, 11).join(' ');
  const thirteen = `${SEVEN_F_VECTOR} legal`;

  it('reports a wrong word count with the count found', () => {
    expect(checkMnemonic(eleven)).toEqual({ ok: false, reason: 'wrong_count', count: 11 });
    expect(checkMnemonic(thirteen)).toEqual({ ok: false, reason: 'wrong_count', count: 13 });
    expect(checkMnemonic('')).toEqual({ ok: false, reason: 'wrong_count', count: 0 });
    expect(checkMnemonic('   ')).toEqual({ ok: false, reason: 'wrong_count', count: 0 });
  });

  it('reports the position of the first unknown word', () => {
    const words = SEVEN_F_VECTOR.split(' ');
    words[4] = 'zzzzzz';
    words[8] = 'qqqqqq';
    expect(checkMnemonic(words.join(' '))).toEqual({ ok: false, reason: 'unknown_word', wordNumber: 5 });
  });

  it('reports a bad checksum when all words are known but the last one is wrong', () => {
    const words = ZERO_VECTOR.split(' ');
    words[11] = 'abandon';
    expect(checkMnemonic(words.join(' '))).toEqual({ ok: false, reason: 'bad_checksum' });
  });

  it('never puts the typed words into the result', () => {
    const words = SEVEN_F_VECTOR.split(' ');
    words[2] = 'secretwordxyz';
    const text = JSON.stringify(checkMnemonic(words.join(' ')));
    expect(text).not.toContain('secretwordxyz');
    expect(text).not.toContain('legal');
    expect(text).not.toContain('winner');
  });

  it('never throws on garbage and says wrong_count for non-text', () => {
    for (const bad of [null, undefined, 42, {}, [], true, Symbol('x'), () => 1, NaN]) {
      expect(() => checkMnemonic(bad)).not.toThrow();
      expect(checkMnemonic(bad)).toEqual({ ok: false, reason: 'wrong_count', count: 0 });
    }
  });
});
