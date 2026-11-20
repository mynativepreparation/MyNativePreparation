import { Info } from 'lucide-react';
import { t } from '../../core/i18n';
import './NotAvailable.css';

/** The owner's "not available" message (SPEC C3), shared by the Home course cards and the course tiles. */
export function NotAvailable({ id }: { id?: string }) {
  return (
    <p className="np-not-available" id={id}>
      <Info size={16} aria-hidden="true" />
      <span>{t('course.unavailable')}</span>
    </p>
  );
}
