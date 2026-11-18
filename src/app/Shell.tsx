import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { t } from '../core/i18n';
import { wire } from '../core/wire/wire';

// Plain layout. Design comes in phase P02.
export function Shell() {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => wire.on('ui.toast', ({ message }) => setToast(message)), []);

  return (
    <div>
      <main>
        <Outlet />
      </main>
      {toast && <p role="status">{toast}</p>}
      <nav>
        <NavLink to="/">{t('nav.courses')}</NavLink> <NavLink to="/settings">{t('nav.settings')}</NavLink>
      </nav>
    </div>
  );
}
