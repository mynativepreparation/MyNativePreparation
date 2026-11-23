import type { AppModule } from '../../core/wire/module';
import { TestGameScreen } from './TestGameScreen';

// Test game (P07): the Test tile of a course opens this screen. The path is the one CourseScreen (modules/home) already uses.
// A course with several tests (P10 T11t d) shows a short list at that path; a tap opens one test at `.../test/<test id>`.
const testGameModule: AppModule = {
  id: 'test-game',
  routes: [
    { path: 'course/:courseId/test', element: <TestGameScreen /> },
    { path: 'course/:courseId/test/:testId', element: <TestGameScreen /> },
  ],
};

export default testGameModule;
