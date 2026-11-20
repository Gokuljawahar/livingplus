import { Controller, useForm } from 'react-hook-form';
import { ROUTES } from '../utils/app-areas';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/auth';
import { Lock, Loader2, ArrowLeft } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';
import { apiErrorMessage } from '../utils/api-error';
import { changePasswordSchema, type ChangePasswordForm } from '../validation/forms';
import GoogleLinkSection from '../components/GoogleLinkSection';
import PhoneVerifySection from '../components/PhoneVerifySection';

function FieldError({ message }: { message?: string | undefined }) {
  return message ? <p role="alert" className="mt-1 text-xs font-medium text-negative">{message}</p> : null;
}

export default function ChangePassword() {
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' }
  });
  const { logout } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (form: ChangePasswordForm) => {
    try {
      await api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword
      });
      toast.success('Password updated successfully. Please log in again.');

      // Force logout after password change
      setTimeout(() => {
        logout();
        navigate(ROUTES.ownerLogin);
      }, 1500);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to update password.'));
    }
  };

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-navy-900 rounded-[var(--radius-card)] flex items-center justify-center text-white font-bold text-3xl mx-auto mb-4">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-ink">Change Password</h1>
        <p className="text-muted mt-2">Update your account security</p>
      </div>

      <div className="bg-white rounded-3xl border border-hairline p-8">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-muted mb-2">Current Password</label>
            <Controller
              name="currentPassword"
              control={control}
              render={({ field }) => (
                <PasswordInput value={field.value} onChange={field.onChange} autoComplete="current-password" ariaLabel="Current password" required={false} />
              )}
            />
            <FieldError message={errors.currentPassword?.message} />
          </div>

          <div className="space-y-4 pt-4 border-t border-hairline">
            <div>
              <label className="block text-xs font-bold text-muted mb-2">New Password</label>
              <Controller
                name="newPassword"
                control={control}
                render={({ field }) => (
                  <PasswordInput value={field.value} onChange={field.onChange} autoComplete="new-password" ariaLabel="New password" required={false} />
                )}
              />
              <FieldError message={errors.newPassword?.message} />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted mb-2">Confirm New Password</label>
              <Controller
                name="confirmPassword"
                control={control}
                render={({ field }) => (
                  <PasswordInput value={field.value} onChange={field.onChange} autoComplete="new-password" ariaLabel="Confirm new password" required={false} />
                )}
              />
              <FieldError message={errors.confirmPassword?.message} />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full btn-primary justify-center py-3.5 disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Update Password'
            )}
          </button>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-muted hover:text-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </form>
      </div>

      <PhoneVerifySection />
        <GoogleLinkSection />
    </div>
  );
}