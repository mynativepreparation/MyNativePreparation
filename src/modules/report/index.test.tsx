import { isValidElement } from 'react';
import { matchPath } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import reportModule from './index';
import { ReportScreen } from './ReportScreen';

// P08 T7d: the report module registers the Report route. The module is found by app/boot.ts (glob over modules/*/index.tsx),
// so nothing else lists it; how it sits inside the Shell is tested in app/homeRoutes.test.tsx, the screen in ReportScreen.test.tsx.
describe('report module', () => {
  it('has the id "report" and uses the default layout (inside the Shell)', () => {
    expect(reportModule.id).toBe('report');
    expect(reportModule.layout).toBeUndefined();
  });

  it('registers exactly one route: course/:courseId/report', () => {
    expect(reportModule.routes).toHaveLength(1);
    expect(reportModule.routes[0]?.path).toBe('course/:courseId/report');
  });

  it('the route path matches the address the Report tile opens and passes the course id', () => {
    const path = reportModule.routes[0]?.path ?? '';
    const match = matchPath(`/${path}`, '/course/crs_aaaaaaaa/report');
    expect(match?.params.courseId).toBe('crs_aaaaaaaa');
  });

  it('the route element is the real ReportScreen', () => {
    const element = reportModule.routes[0]?.element;
    expect(isValidElement(element)).toBe(true);
    expect(isValidElement(element) && element.type === ReportScreen).toBe(true);
  });
});
