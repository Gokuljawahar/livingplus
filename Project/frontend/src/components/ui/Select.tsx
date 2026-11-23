import { forwardRef, useId, type SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, className = '', children, id, ...props },
  ref
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const select = (
    <select
      ref={ref}
      id={selectId}
      aria-invalid={error ? true : undefined}
      className={`block w-full rounded-[6px] border ${error ? 'border-negative' : 'border-field-border'} bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-navy-900 disabled:bg-surface disabled:text-muted ${className}`.trim()}
      {...props}
    >
      {children}
    </select>
  );

  if (!label && !error) return select;

  return (
    <div className="block">
      {label && <label htmlFor={selectId} className="mb-1 block text-sm font-medium text-navy-900">{label}</label>}
      {select}
      {error && <span role="alert" className="mt-1 block text-xs font-medium text-negative">{error}</span>}
    </div>
  );
});

export default Select;
