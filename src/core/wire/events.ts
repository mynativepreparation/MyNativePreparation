// Every message that modules may send to each other through the wire.
// Add new events here; never import one module from another.
// Payloads never carry secrets: no 12 words, no keys, no personal data.
export interface WireEvents {
  'ui.toast': { message: string };
  'course.open': { courseId: string };
  'test.finished': { courseId: string; testId: string; score: number; total: number };
  /** Someone logged in, registered, or the saved login was restored on app open. */
  'identity:unlocked': Record<string, never>;
  /** The store key left memory (lock or Log out). */
  'identity:locked': Record<string, never>;
  /** The onboarding (info and privacy screens) was finished, or a returning user logged in. */
  'identity:onboarded': Record<string, never>;
}
