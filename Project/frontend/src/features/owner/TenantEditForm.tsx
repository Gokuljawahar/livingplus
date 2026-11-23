import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BLOOD_GROUPS, KYC_TYPES } from '@livingplus/shared';

const tenantEditSchema = z.object({
  permanentAddress: z.string().max(500),
  institutionOrEmployer: z.string().max(200),
  emergencyName: z.string().max(200),
  emergencyPhone: z.string().max(30),
  bloodGroup: z.string().max(10),
  kycType: z.string().max(30)
});

export type TenantEditValues = z.infer<typeof tenantEditSchema>;

interface Props {
  initial: {
    permanentAddress?: string | null;
    institutionOrEmployer?: string | null;
    emergencyName?: string | null;
    emergencyPhone?: string | null;
    bloodGroup?: string | null;
    kycType?: string | null;
  };
  saving: boolean;
  onSubmit: (values: TenantEditValues, kycDocument: File | null) => Promise<void>;
}

export default function TenantEditForm({ initial, saving, onSubmit }: Props) {
  const [kycFile, setKycFile] = useState<File | null>(null);
  const { register, handleSubmit } = useForm<TenantEditValues>({
    resolver: zodResolver(tenantEditSchema),
    defaultValues: {
      permanentAddress: initial.permanentAddress || '',
      institutionOrEmployer: initial.institutionOrEmployer || '',
      emergencyName: initial.emergencyName || '',
      emergencyPhone: initial.emergencyPhone || '',
      bloodGroup: initial.bloodGroup || '',
      kycType: initial.kycType || ''
    }
  });

  const fieldCls = 'rounded-[6px] border border-field-border bg-canvas px-3 py-2 text-xs text-ink outline-none focus:border-navy-900';

  return (
    <form onSubmit={handleSubmit((values) => void onSubmit(values, kycFile))} className="grid gap-3 border-t border-hairline pt-4 sm:grid-cols-2 xl:grid-cols-4">
      <input {...register('permanentAddress')} placeholder="Permanent address" className={fieldCls} />
      <input {...register('institutionOrEmployer')} placeholder="College / employer" className={fieldCls} />
      <input {...register('emergencyName')} placeholder="Emergency contact name" className={fieldCls} />
      <input {...register('emergencyPhone')} placeholder="Emergency contact phone" className={fieldCls} />
      <select {...register('bloodGroup')} className={fieldCls}>
        <option value="">Blood group</option>
        {BLOOD_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
      </select>
      <select {...register('kycType')} className={fieldCls}>
        <option value="">KYC document type</option>
        {KYC_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
      </select>
      <input
        type="file"
        accept="image/*,application/pdf"
        onChange={(event) => setKycFile(event.target.files?.[0] ?? null)}
        className="rounded-[6px] border border-field-border bg-canvas px-2 py-1.5 text-xs sm:col-span-2 file:mr-2 file:rounded-[6px] file:border-0 file:bg-surface file:px-2.5 file:py-1 file:text-xs file:font-semibold"
      />
      <button disabled={saving} className="btn-secondary bg-navy-900 text-white hover:bg-navy-700 disabled:opacity-60">Save resident record</button>
    </form>
  );
}
