import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  ariaLabel?: string;
  required?: boolean;
  inputClassName?: string;
  minLength?: number;
}

/**
 * Single-visibility-toggle password field used across every auth form.
 * Exactly one eye button is rendered here; the browser-native reveal icon
 * is suppressed globally in index.css so two eyes can never appear.
 */
export default function PasswordInput({
  value,
  onChange,
  placeholder = '••••••••',
  autoComplete = 'current-password',
  ariaLabel = 'Password',
  required = true,
  inputClassName = '',
  minLength,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
      <input
        type={visible ? 'text' : 'password'}
        required={required}
        value={value}
        minLength={minLength}
        autoComplete={autoComplete}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-xl border-slate-100 bg-slate-50 py-3 pl-11 pr-12 text-sm transition-all focus:bg-white focus:ring-2 focus:ring-[#02224B] ${inputClassName}`}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? `Hide ${ariaLabel.toLowerCase()}` : `Show ${ariaLabel.toLowerCase()}`}
        aria-pressed={visible}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 transition-colors hover:text-slate-600"
      >
        {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
}
