import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';
import { resolveAppHost } from './utils/pg-host';

// Lazy load PG and account pages.
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const PGOperators = lazy(() => import('./pages/PGOperators'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const PGDiscovery = lazy(() => import('./pages/PGDiscovery'));
const PGManagement = lazy(() => import('./pages/PGManagement'));
const ResidentPortal = lazy(() => import('./pages/ResidentPortal'));

const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsAndConditions = lazy(() => import('./pages/TermsAndConditions'));

const ProtectedRoute = ({ children, roles }: { children: React.ReactNode; roles?: string[] }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFB]">
        <div className="w-10 h-10 border-4 border-[#02224B] border-t-[#FEB109] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'PG_TENANT' ? '/resident' : '/'} replace />;
  }

  return <>{children}</>;
};

function AppRoutes() {
  const { user, isLoading } = useAuth();
  const host = resolveAppHost();
  const isLocalPathMode = host.kind === 'public' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const isPropertyHost = host.kind === 'property';
  const isAdminHost = host.kind === 'platform-admin';
  const ownerPath = isPropertyHost ? '/owner/manage' : '/pg/manage';

  if (host.kind === 'unknown') {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center"><section><h1 className="text-2xl font-bold text-slate-900">PG site not found</h1><p className="mt-2 text-sm text-slate-600">Check the PG address or contact the property owner.</p></section></main>;
  }

  if (isLoading) {
    return null; // AppLayout handles the full-screen loader, we just wait here
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFB]">
        <div className="w-10 h-10 border-4 border-[#02224B] border-t-[#FEB109] rounded-full animate-spin" />
      </div>
    }>
      <Routes>
        <Route path="/login" element={
          host.kind === 'public' && !isLocalPathMode
            ? <Navigate to="/" replace />
            : user
              ? <Navigate to={user.role === 'SUPER_ADMIN' ? '/pg/operators' : user.role === 'PG_TENANT' ? '/resident' : ownerPath} replace />
              : <LoginPage />
        } />
        <Route path="/register" element={host.kind === 'public' ? <RegisterPage /> : <Navigate to={isPropertyHost ? '/' : '/pg/operators'} replace />} />
        <Route path="/forgot-password" element={user ? <Navigate to={ownerPath} replace /> : (host.kind === 'public' || isLocalPathMode ? <ForgotPassword /> : <Navigate to="/login" replace />)} />
        <Route path="/pg" element={host.kind === 'public' || isLocalPathMode ? <PGDiscovery /> : <Navigate to={isPropertyHost ? ownerPath : '/pg/operators'} replace />} />
        <Route path="/resident" element={isPropertyHost || isLocalPathMode ? <ResidentPortal /> : <Navigate to="/" replace />} />
        <Route path="/pg/resident" element={isLocalPathMode ? <ResidentPortal /> : <Navigate to={isPropertyHost ? '/resident' : '/'} replace />} />
        <Route path="/" element={isPropertyHost ? <Navigate to={user ? user.role === 'PG_TENANT' ? '/resident' : ownerPath : '/login'} replace /> : isAdminHost ? <Navigate to="/pg/operators" replace /> : <PGDiscovery />} />

        {/* Legal Pages */}
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsAndConditions />} />

        <Route element={<ProtectedRoute roles={['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN']}><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Navigate to={user?.role === 'SUPER_ADMIN' && isAdminHost ? '/pg/operators' : ownerPath} replace />} />
          <Route path="/pg/operators" element={isAdminHost || isLocalPathMode ? <ProtectedRoute roles={['SUPER_ADMIN']}><PGOperators /></ProtectedRoute> : <Navigate to={ownerPath} replace />} />
          <Route path="/owner/manage" element={isPropertyHost ? <PGManagement /> : <Navigate to={ownerPath} replace />} />
          <Route path="/pg/manage" element={isLocalPathMode ? <PGManagement /> : isPropertyHost ? <Navigate to="/owner/manage" replace /> : <Navigate to="/" replace />} />
          <Route path="/change-password" element={<ChangePassword />} />
        </Route>

        <Route path="*" element={<Navigate to={user ? ownerPath : isPropertyHost ? '/login' : '/'} replace />} />
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
          position={isMobile ? "top-center" : "top-right"}
          toastOptions={{
            className: 'text-sm font-medium',
            duration: 4000,
            style: {
              background: '#fff',
              color: '#1E293B',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            },
            success: {
              iconTheme: {
                primary: '#02224B',
                secondary: '#fff',
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
