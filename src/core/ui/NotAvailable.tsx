import { Info } from 'lucide-react';
import { t } from '../i18n';
import './NotAvailable.css';

/**
 * The owner's "not available" message (SPEC C3), shared by the Home course cards, the course tiles and the reader.
 * It lives in core/ui because modules may not import each other.
 */
export function NotAvailable({ id }: { id?: string }) {
  return (
    <p className="np-not-available" id={id}>
      <Info size={16} aria-hidden="true" />
      <span>{t('course.unavailable')}</span>
    </p>
  );
}
