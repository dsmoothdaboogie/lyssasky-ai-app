import { Navigate, Route, Routes } from 'react-router-dom';
import { Button } from '../components/Button';
import { LoginPage } from './LoginPage';
import { LeadsListPage } from './LeadsListPage';
import { LeadCardPage } from './LeadCardPage';
import { StylesListPage } from './StylesListPage';
import { StyleEditPage } from './StyleEditPage';
import { TestBenchPage } from './TestBenchPage';
import { ConfigPage } from './ConfigPage';
import { AnalyticsPage } from './AnalyticsPage';
import { AdminNav } from './AdminNav';
import { useAdminAuth } from './useAdminAuth';

/**
 * Guard + shell for the `/admin` area.
 *
 *  - loading  -> a small "checking access" placeholder.
 *  - no user  -> the login form.
 *  - user, but not an admin -> a no-access notice + sign-out (never the
 *    admin tools).
 *  - admin    -> the admin shell with its own routes below.
 *
 * `/admin` redirects straight to the leads list; `/admin/leads/:id` opens
 * the pre-consult briefing card for a single lead.
 *
 * App.tsx mounts this component at `path="/admin/*"`. React Router strips
 * the matched `/admin` prefix before matching this nested `<Routes>`, so
 * the routes below must be relative ("", "leads", "leads/:id") — absolute
 * paths here (e.g. "/admin/leads") would never match against the stripped
 * pathname and would silently render nothing.
 */
export function AdminApp() {
  const { user, isAdmin, loading, signOut } = useAdminAuth();

  if (loading) {
    return (
      <div className="admin-shell admin-shell-centered">
        <p role="status">Checking access…</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (!isAdmin) {
    return (
      <div className="admin-shell admin-shell-centered">
        <div className="card admin-login-card">
          <p role="alert">You don't have admin access.</p>
          <Button onClick={() => void signOut()} variant="secondary">
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <span className="funnel-wordmark">Lyssasky Admin</span>
        <Button onClick={() => void signOut()} variant="secondary">
          Sign out
        </Button>
      </header>
      <AdminNav />
      <main className="admin-main">
        <Routes>
          <Route index element={<Navigate to="leads" replace />} />
          <Route path="leads" element={<LeadsListPage />} />
          <Route path="leads/:id" element={<LeadCardPage />} />
          <Route path="styles" element={<StylesListPage />} />
          <Route path="styles/new" element={<StyleEditPage />} />
          <Route path="styles/:slug" element={<StyleEditPage />} />
          <Route path="testbench" element={<TestBenchPage />} />
          <Route path="config" element={<ConfigPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
        </Routes>
      </main>
    </div>
  );
}
