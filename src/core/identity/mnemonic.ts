import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

/** The key is exactly 12 words (128 bits of randomness plus a 4-bit checksum). */
export const WORD_COUNT = 12;

const KNOWN_WORDS: ReadonlySet<string> = new Set(wordlist);

/** Why a phrase was rejected. Codes only: error values never contain the words the person typed. */
export type MnemonicProblem = 'wrong_count' | 'unknown_word' | 'bad_checksum';

export type MnemonicCheck =
  | { ok: true; words: string }
  | {
      ok: false;
      reason: MnemonicProblem;
      /** For `wrong_count`: how many words were found. */
      count?: number;
      /** For `unknown_word`: 1-based position of the first word that is not on the list (never the word itself). */
      wordNumber?: number;
    };

/** Creates a new random 12-word key (English BIP39 list, cryptographically secure randomness). */
export function generateMnemonic12(): string {
  return generateMnemonic(wordlist, 128);
}

/**
 * Cleans what a person pasted or typed: Unicode NFKD, lower case, any whitespace (spaces, tabs, line breaks)
 * collapsed to single spaces, no leading or trailing space. Anything that is not a string becomes ''.
 */
export function normalizeMnemonic(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .normalize('NFKD')
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .join(' ');
}

/** Checks a phrase and tells the caller exactly what is wrong (as a code). Never throws, whatever the input. */
export function checkMnemonic(input: unknown): MnemonicCheck {
  const words = normalizeMnemonic(input);
  const list = words === '' ? [] : words.split(' ');

  if (list.length !== WORD_COUNT) {
    return { ok: false, reason: 'wrong_count', count: list.length };
  }
  const unknownAt = list.findIndex((word) => !KNOWN_WORDS.has(word));
  if (unknownAt !== -1) {
    return { ok: false, reason: 'unknown_word', wordNumber: unknownAt + 1 };
  }
  let valid: boolean;
  try {
    valid = validateMnemonic(words, wordlist);
  } catch {
    valid = false;
  }
  return valid ? { ok: true, words } : { ok: false, reason: 'bad_checksum' };
}
