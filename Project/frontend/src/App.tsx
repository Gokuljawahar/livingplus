import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/auth';
import AppLayout from './components/layout/AppLayout';
import { resolveAppHost } from './utils/pg-host';
import { areaOf, loginFor, ROUTES } from './utils/app-areas';

// Lazy load PG and account pages.
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const PGDiscovery = lazy(() => import('./pages/PGDiscovery'));
const PGManagement = lazy(() => import('./pages/PGManagement'));
const ResidentFinder = lazy(() => import('./pages/ResidentFinder'));
const ResidentPortal = lazy(() => import('./pages/ResidentPortal'));

const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsAndConditions = lazy(() => import('./pages/TermsAndConditions'));

const ProtectedRoute = ({ children, roles }: { children: React.ReactNode; roles?: string[] }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-10 h-10 border-4 border-navy-900 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`${loginFor(areaOf(location.pathname), location.pathname)}?redirect=${redirect}`} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'PG_TENANT' ? ROUTES.residentFinder : ROUTES.ownerHome} replace />;
  }

  return <>{children}</>;
};

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-surface">
    <div className="w-10 h-10 border-4 border-navy-900 border-t-amber-500 rounded-full animate-spin" />
  </div>
);

/** Signed-in staff skip their area's login page. */
function StaffLogin() {
  const { user } = useAuth();
  if (user && user.role !== 'PG_TENANT') return <Navigate to={ROUTES.ownerHome} replace />;
  return <LoginPage />;
}

function AppRoutes() {
  const { isLoading } = useAuth();
  const host = resolveAppHost();

  if (host.kind === 'unknown') {
    return <main className="flex min-h-screen items-center justify-center bg-surface p-6 text-center"><section><h1 className="text-2xl font-bold text-navy-900">PG site not found</h1><p className="mt-2 text-sm text-muted">Check the PG address or contact the property owner.</p></section></main>;
  }
  if (isLoading) return null;

  // Optional custom domain: <pg>.domain opens that PG's resident site.
  const home = host.kind === 'property' ? <Navigate to={ROUTES.residentSite(host.slug)} replace />
    : <PGDiscovery />;

  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        {/* Guest site: browse freely, verify a phone only to request a bed. */}
        <Route path="/" element={home} />
        <Route path="/requests" element={<PGDiscovery />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsAndConditions />} />

        {/* Resident site: one per PG (nested section routes support deep links & back button). */}
        <Route path="/stay" element={<ResidentFinder />} />
        <Route path="/stay/:slug" element={<ResidentPortal />} />
        <Route path="/stay/:slug/:section" element={<ResidentPortal />} />

        {/* Owner site (nested section routes support deep links & back button). */}
        <Route path="/owner/login" element={<StaffLogin />} />
        <Route path="/owner/register" element={<RegisterPage />} />
        <Route path="/owner/forgot-password" element={<ForgotPassword />} />
        <Route element={<ProtectedRoute roles={['PG_OWNER', 'PG_WARDEN']}><AppLayout /></ProtectedRoute>}>
          <Route path="/owner" element={<PGManagement />} />
          <Route path="/owner/account" element={<ChangePassword />} />
          <Route path="/owner/:section" element={<PGManagement />} />
        </Route>

        {/* Old addresses keep working. */}
        <Route path="/pg" element={<Navigate to={ROUTES.guestHome} replace />} />
        <Route path="/login" element={<Navigate to={ROUTES.ownerLogin} replace />} />
        <Route path="/register" element={<Navigate to={ROUTES.ownerRegister} replace />} />
        <Route path="/forgot-password" element={<Navigate to={ROUTES.ownerForgotPassword} replace />} />
        <Route path="/change-password" element={<Navigate to={ROUTES.ownerAccount} replace />} />
        <Route path="/dashboard" element={<Navigate to={ROUTES.ownerHome} replace />} />
        <Route path="/pg/manage" element={<Navigate to={ROUTES.ownerHome} replace />} />
        <Route path="/owner/manage" element={<Navigate to={ROUTES.ownerHome} replace />} />
        <Route path="/resident" element={<Navigate to={ROUTES.residentFinder} replace />} />
        <Route path="/pg/resident" element={<Navigate to={ROUTES.residentFinder} replace />} />

        <Route path="*" element={<Navigate to={ROUTES.guestHome} replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <AuthProvider>
      <Toaster
        position="top-center"
        toastOptions={{
          className: 'text-sm font-medium',
          duration: 4000,
          style: {
            background: 'var(--color-canvas)',
            color: 'var(--color-ink)',
            borderRadius: 'var(--radius-card)',
            border: '1px solid var(--color-hairline)',
            boxShadow: 'var(--shadow-float)',
          },
          success: {
            iconTheme: {
              primary: 'var(--color-navy-900)',
              secondary: 'var(--color-canvas)',
            },
          },
        }}
        containerStyle={{
          top: isMobile ? 12 : 20,
          left: 20,
          right: 20,
          bottom: 20,
          zIndex: 999999,
        }}
      />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
