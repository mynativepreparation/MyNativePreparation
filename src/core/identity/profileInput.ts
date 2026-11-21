import type { Profile } from '../storage/repo';

// The ONE copy of the profile input rule (P09 T3). Used by the onboarding InfoScreen and the Settings ProfileCard,
// so both screens accept and store the same thing.

/** Light check only: something@something.something with no spaces. Real validation is impossible without sending mail. */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Keeps only the fields the person really filled in (trimmed). Empty fields are left out of the profile,
 * so an empty form gives `{}`. Nothing else is changed: a Gujarati name, a phone with spaces or a "+" stay as typed.
 */
export function buildProfile(name: string, email: string, phone: string): Profile {
  const profile: Profile = {};
  if (name.trim()) profile.name = name.trim();
  if (email.trim()) profile.email = email.trim();
  if (phone.trim()) profile.phone = phone.trim();
  return profile;
}
