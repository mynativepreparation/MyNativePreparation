import type { AppModule } from '../../core/wire/module';
import { ReportScreen } from './ReportScreen';

// Report (P08): the Report tile of a course opens this screen. The path is the one CourseScreen (modules/home) already uses.
const reportModule: AppModule = {
  id: 'report',
  routes: [{ path: 'course/:courseId/report', element: <ReportScreen /> }],
};

export default reportModule;
