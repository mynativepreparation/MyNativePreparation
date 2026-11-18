import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
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
          <NavLink to="/" end className="np-nav__link">
            <BookOpen size={24} aria-hidden="true" />
            <span>{t('nav.courses')}</span>
          </NavLink>
          <NavLink to="/settings" className="np-nav__link">
            <Settings size={24} aria-hidden="true" />
            <span>{t('nav.settings')}</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
