import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../utils/app-areas';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export default function ForgotPassword() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-navy-900 rounded-[var(--radius-card)] flex items-center justify-center text-white font-bold text-3xl mx-auto mb-4">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-ink">Reset Password</h1>
          <p className="text-muted mt-2">Online password reset is not available yet.</p>
        </div>

        <div className="bg-white rounded-[var(--radius-card)] border border-hairline p-8">
          <p className="text-sm leading-6 text-muted">Contact your PG administrator to verify your identity and reset your login.</p>
          <button
            onClick={() => navigate(ROUTES.ownerLogin)}
            className="w-full btn-primary justify-center py-3.5 mt-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}