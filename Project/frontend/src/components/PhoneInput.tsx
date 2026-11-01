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
        <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${error ? 'text-red-400' : 'text-slate-400'}`}>
          {icon}
        </div>
      )}
      <div className={`flex items-center bg-slate-50 border rounded-xl transition-all overflow-hidden ${className} ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${error ? 'border-red-500 ring-2 ring-red-500/20 bg-red-50/30' : 'border-slate-100 focus-within:ring-2 focus-within:ring-[#02224B] focus-within:bg-white'}`}>
        <div className={`flex items-center justify-center px-3 py-3 border-r font-bold text-sm transition-colors ${error ? 'bg-red-50 border-red-100 text-red-500' : 'bg-slate-100 border-slate-200 text-slate-500'} ${icon ? 'pl-11' : ''}`}>
          +91
        </div>
        <input
          type="tel"
          disabled={disabled}
          required={required}
          value={displayValue}
          onChange={handleChange}
          onBlur={onBlur}
          className="w-full bg-transparent border-none py-3 px-4 text-sm focus:ring-0 placeholder:text-slate-300"
          placeholder={placeholder}
          name={name}
          autoComplete={autoComplete}
        />
      </div>
    </div>
  );
};
