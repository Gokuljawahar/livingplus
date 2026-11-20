import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import DepositCompare from '../../components/DepositCompare';

const checkoutSchema = z.object({
  depositDeductions: z.string().refine((val) => {
    const num = Number(val || 0);
    return Number.isFinite(num) && num >= 0;
  }, 'Enter a valid deduction amount'),
  checkoutNote: z.string().max(1000)
});

type CheckoutValues = z.infer<typeof checkoutSchema>;

interface Props {
  tenantId: string;
  depositReceived: number;
  onConfirm: (payload: { depositDeductions: number; checkoutNote: string }) => Promise<void>;
  onCancel: () => void;
}

export default function TenantCheckoutForm({ tenantId, depositReceived, onConfirm, onCancel }: Props) {
  const { register, handleSubmit, setValue, formState: { isSubmitting } } = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { depositDeductions: '0', checkoutNote: '' }
  });

  return (
    <form
      onSubmit={handleSubmit((values) => void onConfirm({
        depositDeductions: Number(values.depositDeductions || 0),
        checkoutNote: values.checkoutNote || ''
      }))}
      className="grid gap-3 rounded-[10px] border border-amber-500/40 bg-amber-50 p-4 sm:grid-cols-[1fr_1.5fr_auto_auto]"
    >
      {depositReceived > 0 && (
        <DepositCompare
          tenantId={tenantId}
          onApply={({ depositDeductions, checkoutNote }) => {
            setValue('depositDeductions', depositDeductions, { shouldDirty: true, shouldValidate: true });
            setValue('checkoutNote', checkoutNote, { shouldDirty: true, shouldValidate: true });
          }}
        />
      )}
      <label className="text-xs font-semibold text-navy-900">
        Deposit deductions (₹, max {depositReceived.toLocaleString('en-IN')})
        <input
          type="number"
          min="0"
          max={depositReceived}
          {...register('depositDeductions')}
          className="mt-1 block w-full rounded-[6px] border border-field-border bg-canvas px-3 py-2 text-xs text-ink outline-none focus:border-navy-900"
        />
      </label>
      <label className="text-xs font-semibold text-navy-900">
        Inspection / checkout note
        <input
          {...register('checkoutNote')}
          placeholder="Room condition, damages…"
          className="mt-1 block w-full rounded-[6px] border border-field-border bg-canvas px-3 py-2 text-xs text-ink outline-none focus:border-navy-900"
        />
      </label>
      <button disabled={isSubmitting} className="self-end rounded-[10px] bg-negative px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
        Confirm check-out
      </button>
      <button type="button" onClick={onCancel} className="btn-secondary self-end min-h-9 px-3.5 py-2 text-xs">
        Cancel
      </button>
      <p className="text-xs text-muted sm:col-span-4">
        Refund due = deposit received − deductions. It stays Pending until you mark it refunded below.
      </p>
    </form>
  );
}
