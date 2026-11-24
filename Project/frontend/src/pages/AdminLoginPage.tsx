import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, LogIn, Phone, ShieldCheck } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import PasswordInput from '../components/PasswordInput';
import BrandLogo from '../components/ui/BrandLogo';
import { useAuth, type User } from '../context/auth';
import { apiErrorMessage } from '../utils/api-error';
import { areaOf, ROUTES } from '../utils/app-areas';
import { loginSchema, type LoginForm } from '../validation/forms';

function safeAdminRedirect(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return ROUTES.adminHome;
  return areaOf(raw) === 'admin' ? raw : ROUTES.adminHome;
}

export default function AdminLoginPage() {
  const {
    register,
    control,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting: loading }
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });
  const error = errors.root?.server?.message || errors.email?.message || errors.password?.message || '';
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [signedInMismatch] = useState(() => Boolean(user && user.role !== 'PLATFORM_ADMIN'));

  const onSubmit = async ({ email, password }: LoginForm) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const loggedUser = response.data.user as User;
      if (loggedUser?.role !== 'PLATFORM_ADMIN') {
        setError('root.server', { message: 'This portal is restricted to Living Plus onboarding ops accounts.' });
        return;
      }
      login(response.data.token, loggedUser);
      navigate(safeAdminRedirect(new URLSearchParams(location.search).get('redirect')), { replace: true });
    } catch (err) {
      setError('root.server', { message: apiErrorMessage(err, 'Invalid credentials') });
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full bg-navy-900 px-3.5 py-1.5 text-xs font-bold text-amber-500">
            <ShieldCheck className="h-4 w-4" /> Living Plus Internal Ops
          </div>
          <div className="flex justify-center"><BrandLogo /></div>
          <h1 className="mt-3 text-2xl font-bold text-navy-900">Concierge Onboarding Console</h1>
          <p className="mt-1 text-sm text-muted">
            Sign in to review PG owner inquiries, configure properties & rooms, and publish listings.
          </p>
        </div>

        <div className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-7">
          {signedInMismatch && (
            <p className="mb-4 rounded-[var(--radius-field)] bg-amber-50 px-3 py-2 text-xs font-medium text-navy-900">
              Sign in with your Living Plus Ops credentials.
            </p>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted" htmlFor="admin-phone">
                Mobile number or Ops email
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  id="admin-phone"
                  type="text"
                  {...register('email', { onChange: () => clearErrors('root.server') })}
                  placeholder="9800000000 or ops@livingplus.in"
                  className="w-full rounded-[var(--radius-button)] border border-hairline bg-surface py-2.5 pl-10 pr-3 text-sm outline-none focus:border-navy-900 focus:bg-canvas"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted">Password</label>
              <Controller
                name="password"
                control={control}
                render={({ field }) => (
                  <PasswordInput
                    value={field.value}
                    autoComplete="current-password"
                    required={false}
                    onChange={(value) => {
                      field.onChange(value);
                      clearErrors('root.server');
                    }}
                    inputClassName={error ? 'border-negative/40 focus:ring-negative' : 'focus:ring-navy-900'}
                  />
                )}
              />
              {error && (
                <p role="alert" className="mt-2 text-xs font-medium text-negative">
                  {error}
                </p>
              )}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 text-sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Sign in to Onboarding Ops
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between border-t border-hairline pt-4 text-xs text-muted">
            <Link to={ROUTES.guestHome} className="inline-flex items-center gap-1 font-semibold text-navy-900 hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Marketplace
            </Link>
            <Link to={ROUTES.ownerLogin} className="font-semibold text-navy-900 hover:underline">
              PG Owner Sign In →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
