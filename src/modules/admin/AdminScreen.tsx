import { useState, useSyncExternalStore } from 'react';
import { LogOut } from 'lucide-react';
import { openDraftStore, type DraftStore } from '../../core/admin/draftStore';
import type { GithubFetch } from '../../core/admin/github';
import { t, tf } from '../../core/i18n';
import { Button, Card } from '../../core/ui';
import { CourseManager } from './CourseManager';
import { LoginScreen } from './LoginScreen';
import { getInfo, logout, subscribe, type AdminInfo } from './session';
import './AdminScreen.css';

// Hidden Admin page (P10, SPEC D): no tile and no menu entry; it is reached only by the `#/admin` address.
// This file is the lazy chunk's entry (default export): everything admin loads only when this page is opened.
// T5 = login. T6 = course list and course form. The block and test editors are added in T7-T9.

function AdminHome({ info, draftStore }: { info: AdminInfo; draftStore?: DraftStore | undefined }) {
  // One draft store for this page; it opens its database only when the first call is made.
  const [store] = useState(() => draftStore ?? openDraftStore());
  return (
    <div className="np-admin-stack">
      <Card className="np-admin-home">
        <p className="np-admin-home__text">{tf('admin.home.signedIn', { repo: info.fullName })}</p>
        {!info.branchOk && (
          <p role="alert" className="np-admin-home__warn">
            <span aria-hidden="true">! </span>
            {tf('admin.home.branchWarn', { branch: info.defaultBranch })}
          </p>
        )}
        <Button variant="secondary" icon={<LogOut size={20} aria-hidden="true" />} onClick={logout}>
          {t('admin.home.logout')}
        </Button>
      </Card>
      <CourseManager store={store} />
    </div>
  );
}

interface AdminScreenProps {
  /** Tests pass fakes; the app uses the browser's fetch and its own IndexedDB. */
  fetchImpl?: GithubFetch | undefined;
  draftStore?: DraftStore | undefined;
}

export default function AdminScreen({ fetchImpl, draftStore }: AdminScreenProps) {
  const info = useSyncExternalStore(subscribe, getInfo);
  return (
    <section>
      <h1>{t('admin.title')}</h1>
      {info === null ? <LoginScreen fetchImpl={fetchImpl} /> : <AdminHome info={info} draftStore={draftStore} />}
    </section>
  );
}
