import type { AppModule } from '../../core/wire/module';
import { SettingsScreen } from './SettingsScreen';

const settingsModule: AppModule = {
  id: 'settings',
  routes: [{ path: 'settings', element: <SettingsScreen /> }],
};

export default settingsModule;
