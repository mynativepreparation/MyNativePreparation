import en from './en.json';

export type TextKey = keyof typeof en;

// English only for now. A 'gu' file can be added later without touching callers.
export function t(key: TextKey): string {
  return en[key] ?? key;
}
