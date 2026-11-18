import type { AppModule } from '../../core/wire/module';
import { HomeScreen } from './HomeScreen';

const homeModule: AppModule = {
  id: 'home',
  routes: [{ index: true, element: <HomeScreen /> }],
};

export default homeModule;
