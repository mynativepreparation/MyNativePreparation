import type { AppModule } from '../../core/wire/module';
import { ReaderScreen } from './ReaderScreen';

// Reader (P06): the Overview and Content screens of a course. The paths are the ones CourseScreen (modules/home) already opens.
const readerModule: AppModule = {
  id: 'reader',
  routes: [
    { path: 'course/:courseId/overview', element: <ReaderScreen section="overview" /> },
    { path: 'course/:courseId/content', element: <ReaderScreen section="content" /> },
  ],
};

export default readerModule;
