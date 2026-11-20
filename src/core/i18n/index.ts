import en from './en.json';

export type TextKey = keyof typeof en;

// English only for now. A 'gu' file can be added later without touching callers.
export function t(key: TextKey): string {
  return en[key] ?? key;
}

/** Like `t`, but fills `{name}` placeholders, e.g. tf('login.wrongCount', { count: 11 }). A placeholder without a value stays as written. */
export function tf(key: TextKey, values: Record<string, string | number>): string {
  return t(key).replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : placeholder,
  );
}
