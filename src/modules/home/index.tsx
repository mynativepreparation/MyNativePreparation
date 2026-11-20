import type { AppModule } from '../../core/wire/module';
import { CourseScreen } from './CourseScreen';
import { HomeScreen } from './HomeScreen';
import { SectionPlaceholder } from './SectionPlaceholder';

// Home = Courses (P05): the course list, a course with its four tiles, and one stand-in screen per tile that has no real screen yet.
// Overview and Content are the reader (modules/reader, P06), Test is the test game (modules/test-game, P07). The stand-in for Report is
// replaced by P08 (report); the path must stay the same, because CourseScreen sends a tile click to /course/<id>/<overview|content|test|report>.
const homeModule: AppModule = {
  id: 'home',
  routes: [
    { index: true, element: <HomeScreen /> },
    { path: 'course/:courseId', element: <CourseScreen /> },
    { path: 'course/:courseId/report', element: <SectionPlaceholder section="report" /> },
  ],
};

export default homeModule;
