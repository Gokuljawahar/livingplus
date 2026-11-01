import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';

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

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFB]">
        <div className="w-10 h-10 border-4 border-[#02224B] border-t-[#FEB109] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

function AppRoutes() {
  const { user, isLoading } = useAuth();

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
        <Route path="/login" element={user ? <Navigate to={user.role === 'SUPER_ADMIN' ? "/pg/operators" : "/pg/manage"} replace /> : <LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={user ? <Navigate to={user.role === 'SUPER_ADMIN' ? "/pg/operators" : "/pg/manage"} replace /> : <ForgotPassword />} />
        <Route path="/pg" element={<PGDiscovery />} />
        <Route path="/pg/resident" element={<ResidentPortal />} />
        <Route path="/" element={<PGDiscovery />} />

        {/* Legal Pages */}
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsAndConditions />} />

        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Navigate to={user?.role === 'SUPER_ADMIN' ? "/pg/operators" : "/pg/manage"} replace />} />
          <Route path="/pg/operators" element={user?.role === 'SUPER_ADMIN' ? <PGOperators /> : <Navigate to="/pg/manage" replace />} />
          <Route path="/pg/manage" element={<PGManagement />} />
          <Route path="/change-password" element={<ChangePassword />} />
        </Route>

        <Route path="*" element={<Navigate to={user ? (user.role === 'SUPER_ADMIN' ? "/pg/operators" : "/pg/manage") : "/"} replace />} />
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
