import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PAYMENT_METHODS } from '@livingplus/shared';

const recordPaymentSchema = z.object({
  amount: z.string().refine((val) => Number(val) > 0, 'Enter a positive amount'),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().max(120)
});

export type RecordPaymentValues = z.infer<typeof recordPaymentSchema>;

interface Props {
  remaining: number;
  onSubmit: (values: RecordPaymentValues) => Promise<void>;
}

export default function RecordPaymentForm({ remaining, onSubmit }: Props) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<RecordPaymentValues>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: { amount: String(remaining), method: 'CASH', reference: '' }
  });

  const fieldCls = 'rounded-[6px] border border-field-border bg-canvas px-3 py-1.5 text-xs text-ink outline-none focus:border-navy-900';

  return (
    <form onSubmit={handleSubmit((values) => void onSubmit(values))} className="grid gap-2 border-t border-hairline pt-2 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
      <input required type="number" min="1" max={remaining} aria-label="Payment amount" {...register('amount')} className={fieldCls} />
      <select {...register('method')} className={fieldCls}>
        <option value="CASH">Cash</option>
        <option value="NEFT">NEFT</option>
        <option value="UPI">UPI</option>
        <option value="OTHER">Other</option>
      </select>
      <input {...register('reference')} placeholder="Receipt / transaction reference" className={fieldCls} />
      <button disabled={isSubmitting} className="rounded-[10px] bg-positive px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
        Record payment
      </button>
    </form>
  );
}
