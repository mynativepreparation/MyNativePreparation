import type { AppModule } from '../../core/wire/module';
import { CourseScreen } from './CourseScreen';
import { HomeScreen } from './HomeScreen';
import { SectionPlaceholder } from './SectionPlaceholder';

// Home = Courses (P05): the course list, a course with its four tiles, and one stand-in screen per tile.
// The stand-ins are replaced by P06 (overview + content reader), P07 (test game) and P08 (report); the paths must stay the same,
// because CourseScreen sends a tile click to /course/<id>/<overview|content|test|report>.
const homeModule: AppModule = {
  id: 'home',
  routes: [
    { index: true, element: <HomeScreen /> },
    { path: 'course/:courseId', element: <CourseScreen /> },
    { path: 'course/:courseId/overview', element: <SectionPlaceholder section="overview" /> },
    { path: 'course/:courseId/content', element: <SectionPlaceholder section="content" /> },
    { path: 'course/:courseId/test', element: <SectionPlaceholder section="test" /> },
    { path: 'course/:courseId/report', element: <SectionPlaceholder section="report" /> },
  ],
};

export default homeModule;
