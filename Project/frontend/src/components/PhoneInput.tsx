import React from 'react';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  className?: string;
  icon?: React.ReactNode;
  name?: string;
  autoComplete?: string;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChange,
  onBlur,
  placeholder = "1234567890",
  required = false,
  disabled = false,
  error = false,
  className = "",
  icon,
  name,
  autoComplete
}) => {
  // Extract number without 91 prefix for the input field display
  const displayValue = value.startsWith('91') ? value.slice(2) : value;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const rawValue = e.target.value.replace(/\D/g, '');
    // Ensure we don't exceed 10 digits for the main number
    const limitedValue = rawValue.slice(0, 10);
    // Always store with 91 prefix
    onChange(limitedValue ? `91${limitedValue}` : '');
  };

  return (
    <div className="relative">
      {icon && (
        <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${error ? 'text-negative' : 'text-muted'}`}>
          {icon}
        </div>
      )}
      <div className={`flex items-center bg-surface border rounded-[var(--radius-button)] transition-all overflow-hidden ${className} ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${error ? 'border-negative ring-2 ring-negative/20 bg-negative-bg/30' : 'border-hairline focus-within:ring-2 focus-within:ring-navy-900 focus-within:bg-white'}`}>
        <div className={`flex items-center justify-center px-3 py-3 border-r font-bold text-sm transition-colors ${error ? 'bg-negative-bg border-negative/30 text-negative' : 'bg-surface border-hairline text-muted'} ${icon ? 'pl-11' : ''}`}>
          +91
        </div>
        <input
          type="tel"
          disabled={disabled}
          required={required}
          value={displayValue}
          onChange={handleChange}
          onBlur={onBlur}
          className="w-full bg-transparent border-none py-3 px-4 text-sm focus:ring-0 placeholder:text-muted"
          placeholder={placeholder}
          name={name}
          autoComplete={autoComplete}
        />
      </div>
    </div>
  );
};
