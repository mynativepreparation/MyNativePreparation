import type { AppModule } from '../../core/wire/module';
import { FingerprintScreen } from './FingerprintScreen';
import { InfoScreen } from './InfoScreen';
import { LoginScreen } from './LoginScreen';
import { PinScreen } from './PinScreen';
import { PinSetupScreen } from './PinSetupScreen';
import { PrivacyScreen } from './PrivacyScreen';
import { RegisterScreen } from './RegisterScreen';
import { WelcomeScreen } from './WelcomeScreen';

// Onboarding: Welcome -> Register -> Fingerprint offer (skipped -> PIN offer) -> Basic info -> Privacy -> Home, and Login for returning users.
// /pin is the front door of an app locked with a PIN (T12c).
// Paths must match AUTH_ROUTES in src/core/identity/status.ts (the route guard uses them). Screens fill in during T7-T12b.
const onboardingModule: AppModule = {
  id: 'onboarding',
  layout: 'plain',
  routes: [
    { path: 'welcome', element: <WelcomeScreen /> },
    { path: 'register', element: <RegisterScreen /> },
    { path: 'fingerprint', element: <FingerprintScreen /> },
    { path: 'pin-setup', element: <PinSetupScreen /> },
    { path: 'pin', element: <PinScreen /> },
    { path: 'info', element: <InfoScreen /> },
    { path: 'privacy', element: <PrivacyScreen /> },
    { path: 'login', element: <LoginScreen /> },
  ],
};

export default onboardingModule;
