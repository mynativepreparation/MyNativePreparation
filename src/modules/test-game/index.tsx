import type { AppModule } from '../../core/wire/module';
import { TestGameScreen } from './TestGameScreen';

// Test game (P07): the Test tile of a course opens this screen. The path is the one CourseScreen (modules/home) already uses.
const testGameModule: AppModule = {
  id: 'test-game',
  routes: [{ path: 'course/:courseId/test', element: <TestGameScreen /> }],
};

export default testGameModule;
