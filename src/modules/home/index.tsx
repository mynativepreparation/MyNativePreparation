import type { AppModule } from '../../core/wire/module';
import { CourseScreen } from './CourseScreen';
import { HomeScreen } from './HomeScreen';

// Home = Courses (P05): the course list and a course with its four tiles. The tile screens live in their own modules:
// Overview and Content = reader (P06), Test = test-game (P07), Report = report (P08). The paths must stay the same, because
// CourseScreen sends a tile click to /course/<id>/<overview|content|test|report>.
const homeModule: AppModule = {
  id: 'home',
  routes: [
    { index: true, element: <HomeScreen /> },
    { path: 'course/:courseId', element: <CourseScreen /> },
  ],
};

export default homeModule;
