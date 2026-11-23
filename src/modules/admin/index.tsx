import { lazy, Suspense } from 'react';
import { t } from '../../core/i18n';
import type { AppModule } from '../../core/wire/module';

// Hidden Admin page (P10): route `admin`, no tile, no menu entry. The screen is a lazy chunk, so normal users never
// download the admin code (JS budget, DECISIONS Q22). Only this small file is loaded at start.
const AdminScreen = lazy(() => import('./AdminScreen'));

const adminModule: AppModule = {
  id: 'admin',
  routes: [
    {
      path: 'admin',
      element: (
        <Suspense fallback={<p role="status">{t('admin.loading')}</p>}>
          <AdminScreen />
        </Suspense>
      ),
    },
  ],
};

export default adminModule;
