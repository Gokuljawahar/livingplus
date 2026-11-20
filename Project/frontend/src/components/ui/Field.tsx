import { forwardRef, useId, type InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, className = '', id, ...props },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const input = (
    <input
      ref={ref}
      id={inputId}
      aria-invalid={error ? true : undefined}
      className={`block w-full rounded-[6px] border ${error ? 'border-negative' : 'border-field-border'} bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted outline-none focus:border-navy-900 disabled:bg-surface disabled:text-muted ${className}`.trim()}
      {...props}
    />
  );

  if (!label && !error) return input;

  return (
    <div className="block">
      {label && <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-navy-900">{label}</label>}
      {input}
      {error && <span role="alert" className="mt-1 block text-xs font-medium text-negative">{error}</span>}
    </div>
  );
});

export default Field;
