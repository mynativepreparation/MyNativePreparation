import { t, tf } from '../../core/i18n';
import type { ReportLabels } from './layout';

/** The texts of the PDF report from the app's text file (strings live only in core/i18n/en.json). */
export function reportLabels(): ReportLabels {
  return {
    title: t('reportPdf.title'),
    coursesOpened: t('reportPdf.coursesOpened'),
    testsTaken: t('reportPdf.testsTaken'),
    stars: t('reportPdf.stars'),
    opened: t('reportPdf.opened'),
    notOpened: t('reportPdf.notOpened'),
    best: t('reportPdf.best'),
    last: t('reportPdf.last'),
    noTest: t('reportPdf.noTest'),
    pageOf: (page, total) => tf('reportPdf.pageOf', { page, total }),
  };
}
