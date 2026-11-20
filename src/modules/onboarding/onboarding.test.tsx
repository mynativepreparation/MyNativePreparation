import { describe, expect, it } from 'vitest';
import { AUTH_ROUTES } from '../../core/identity/status';
import onboardingModule from './index';

describe('onboarding module', () => {
  it('is a plain (no bottom navigation) module', () => {
    expect(onboardingModule.id).toBe('onboarding');
    expect(onboardingModule.layout).toBe('plain');
  });

  it('serves exactly the screens that the route guard knows (AUTH_ROUTES)', () => {
    const served = onboardingModule.routes.map((r) => `/${r.path ?? ''}`).sort();
    const known = [
      AUTH_ROUTES.welcome,
      AUTH_ROUTES.register,
      AUTH_ROUTES.login,
      AUTH_ROUTES.fingerprint,
      AUTH_ROUTES.pin,
      AUTH_ROUTES.pinSetup,
      AUTH_ROUTES.info,
      AUTH_ROUTES.privacy,
    ].sort();
    expect(served).toEqual(known);
  });
});
