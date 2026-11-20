import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, Settings } from 'lucide-react';
import { t } from '../core/i18n';
import { Toast } from '../core/ui';
import { wire } from '../core/wire/wire';
import './Shell.css';

const TOAST_MS = 4000;

// App frame: screen area, toast, and bottom navigation (icon + label, never icon alone).
export function Shell() {
  const [toast, setToast] = useState<string | null>(null);
  const { pathname } = useLocation();
  // Courses stays highlighted on the course screens too (/course/...), not only on the list itself.
  const onCourses = pathname === '/' || pathname.startsWith('/course/');

  useEffect(() => wire.on('ui.toast', ({ message }) => setToast(message)), []);

  // The toast hides itself after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <div className="np-shell">
      <main key={pathname} className="np-shell__main">
        <Outlet />
      </main>
      {toast && <Toast message={toast} />}
      <nav className="np-nav" aria-label="Main">
        <div className="np-nav__inner">
          <Link
            to="/"
            className={onCourses ? 'np-nav__link active' : 'np-nav__link'}
            aria-current={onCourses ? (pathname === '/' ? 'page' : 'true') : undefined}
          >
            <BookOpen size={24} aria-hidden="true" />
            <span>{t('nav.courses')}</span>
          </Link>
          <NavLink to="/settings" className="np-nav__link">
            <Settings size={24} aria-hidden="true" />
            <span>{t('nav.settings')}</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
