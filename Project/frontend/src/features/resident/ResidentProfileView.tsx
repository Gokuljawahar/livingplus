import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import KycAiSummary, { type KycAiCheck } from '../../components/KycAiSummary';
import { Button, Card, EmptyState, StatusPill } from '../../components/ui';
import { usePlatformCatalog } from '../../hooks/usePlatformCatalog';
import { apiErrorMessage } from '../../utils/api-error';
import { residentProfileSchema, type ResidentProfileForm } from '../../validation/forms';
import type { Stay } from './types';

const EMPTY_PROFILE: ResidentProfileForm = {
  permanentAddress: '',
  bloodGroup: '',
  institutionOrEmployer: '',
  emergencyName: '',
  emergencyPhone: '',
  kycType: '',
  foodOptOut: false
};

interface Props {
  stays: Stay[];
  onChanged: () => Promise<unknown>;
}

export default function ResidentProfileView({ stays, onChanged }: Props) {
  const { catalog } = usePlatformCatalog();
  const [profileEditingFor, setProfileEditingFor] = useState('');
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const profileFormApi = useForm<ResidentProfileForm>({
    resolver: zodResolver(residentProfileSchema),
    defaultValues: EMPTY_PROFILE
  });
  const savingProfile = profileFormApi.formState.isSubmitting;

  const editProfile = (stay: Stay) => {
    setProfileEditingFor(stay.id);
    setProfileFile(null);
    profileFormApi.reset({
      permanentAddress: stay.permanentAddress || '',
      bloodGroup: (stay.bloodGroup || '') as ResidentProfileForm['bloodGroup'],
      institutionOrEmployer: stay.institutionOrEmployer || '',
      emergencyName: stay.emergencyName || '',
      emergencyPhone: stay.emergencyPhone || '',
      kycType: stay.kycType || '',
      foodOptOut: Boolean(stay.foodOptOut)
    });
  };

  const saveProfile = (stayId: string) =>
    profileFormApi.handleSubmit(async (form) => {
      try {
        let kycDocumentUrl: string | undefined;
        if (profileFile) {
          const upload = new FormData();
          upload.append('image', profileFile);
          const result = await api.post('/upload-s3', upload, { headers: { 'Content-Type': 'multipart/form-data' } });
          kycDocumentUrl = result.data.fileKey;
        }
        await api.patch(`/pg/tenant/${stayId}/profile`, { ...form, ...(kycDocumentUrl ? { kycDocumentUrl } : {}) });
        if (kycDocumentUrl) {
          try {
            const check = (await api.post(`/pg/tenant/${stayId}/kyc-check`)).data as KycAiCheck;
            if (check.flags.length) toast.error(`Check your document: ${check.flags[0]}`);
            else toast.success('Profile saved. Your ID looks clear; the owner will verify it.');
          } catch {
            toast.success('Profile saved. Your PG owner will review your ID.');
          }
        } else {
          toast.success('Profile saved.');
        }
        setProfileEditingFor('');
        setProfileFile(null);
        await onChanged();
      } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not save profile'));
      }
    });

  return (
    <div className="space-y-6">
      {!stays.length && <EmptyState title="No stays found for this number." />}
      {stays.map((stay) => (
        <Card key={stay.id} className="p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline pb-4">
            <div>
              <h2 className="text-lg font-bold text-navy-900">{stay.property.name}</h2>
              <p className="mt-0.5 text-xs text-muted">{stay.property.locality}, {stay.property.city}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill status={stay.status} />
              {stay.bed && <span className="text-xs font-semibold text-muted">Room {stay.bed.room.roomNumber}, {stay.bed.label}</span>}
            </div>
          </div>

          <section className="pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 font-bold text-ink">
                  <ShieldCheck className="h-4 w-4 text-positive" /> Resident verification & identity
                </h3>
                <p className="mt-0.5 text-xs text-muted">Government KYC documents remain confidential and protected under privacy policies.</p>
              </div>
              {profileEditingFor !== stay.id && (
                <Button variant="secondary" size="sm" onClick={() => editProfile(stay)}>
                  <UserRound className="h-3.5 w-3.5" /> Edit details
                </Button>
              )}
            </div>

            <div className="mt-4 grid gap-3 rounded-[var(--radius-card)] border border-hairline bg-surface p-4 text-xs text-ink sm:grid-cols-2">
              <div>
                <span className="block font-medium text-muted">Permanent address</span>
                <span className="font-semibold text-ink">{stay.permanentAddress || 'Not provided'}</span>
              </div>
              <div>
                <span className="block font-medium text-muted">College / employer</span>
                <span className="font-semibold text-ink">{stay.institutionOrEmployer || 'Not provided'}</span>
              </div>
              <div>
                <span className="block font-medium text-muted">Emergency contact</span>
                <span className="font-semibold text-ink">{stay.emergencyName ? `${stay.emergencyName} (${stay.emergencyPhone || '—'})` : 'Not provided'}</span>
              </div>
              <div>
                <span className="block font-medium text-muted">KYC verification status</span>
                <span className={`inline-flex items-center gap-1 font-bold ${stay.kycVerified ? 'text-positive' : stay.kycDocumentUrl ? 'text-amber-600' : 'text-muted'}`}>
                  {stay.kycVerified ? 'Verified by your PG owner' : stay.kycDocumentUrl ? 'Waiting for owner review' : 'Not uploaded yet'}
                </span>
                {!stay.kycVerified && <KycAiSummary check={stay.kycAiCheck} audience="resident" />}
              </div>
            </div>

            {profileEditingFor === stay.id && (
              <form onSubmit={saveProfile(stay.id)} className="mt-5 grid gap-3.5 border-t border-hairline pt-5 sm:grid-cols-2">
                <label className="text-xs font-bold text-muted">Permanent address
                  <input maxLength={200} {...profileFormApi.register('permanentAddress')} className="mt-1 block w-full rounded-[var(--radius-field)] border border-hairline px-3 py-2 text-sm font-medium text-ink outline-none focus:border-navy-900" />
                </label>
                <label className="text-xs font-bold text-muted">College / employer
                  <input maxLength={200} {...profileFormApi.register('institutionOrEmployer')} className="mt-1 block w-full rounded-[var(--radius-field)] border border-hairline px-3 py-2 text-sm font-medium text-ink outline-none focus:border-navy-900" />
                </label>
                <label className="text-xs font-bold text-muted">Emergency contact name
                  <input maxLength={200} {...profileFormApi.register('emergencyName')} className="mt-1 block w-full rounded-[var(--radius-field)] border border-hairline px-3 py-2 text-sm font-medium text-ink outline-none focus:border-navy-900" />
                </label>
                <label className="text-xs font-bold text-muted">Emergency contact phone
                  <input type="tel" maxLength={20} {...profileFormApi.register('emergencyPhone')} className="mt-1 block w-full rounded-[var(--radius-field)] border border-hairline px-3 py-2 text-sm font-medium text-ink outline-none focus:border-navy-900" />
                </label>
                <label className="text-xs font-bold text-muted">Blood group
                  <select {...profileFormApi.register('bloodGroup')} className="mt-1 block w-full rounded-[var(--radius-field)] border border-hairline bg-canvas px-3 py-2 text-sm font-medium text-ink outline-none focus:border-navy-900">
                    <option value="">Not provided</option>
                    {catalog.bloodGroups.map((group) => <option key={group} value={group}>{group}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-muted">KYC document type
                  <select {...profileFormApi.register('kycType')} className="mt-1 block w-full rounded-[var(--radius-field)] border border-hairline bg-canvas px-3 py-2 text-sm font-medium text-ink outline-none focus:border-navy-900">
                    <option value="">Select document</option>
                    {catalog.kycTypes.map((doc) => <option key={doc.value} value={doc.value}>{doc.label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-muted sm:col-span-2">Replace KYC document
                  <input type="file" accept="image/*,application/pdf" onChange={(event) => setProfileFile(event.target.files?.[0] || null)} className="mt-1 block w-full rounded-[var(--radius-field)] border border-hairline px-3 py-2 text-xs text-ink file:mr-3 file:rounded-[var(--radius-field)] file:border-0 file:bg-surface file:px-3 file:py-1 file:font-semibold" />
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-ink sm:col-span-2">
                  <input type="checkbox" {...profileFormApi.register('foodOptOut')} className="h-4 w-4 rounded accent-navy-900" />
                  Opt out of included food / mess charges
                </label>
                <div className="mt-2 flex gap-2 sm:col-span-2">
                  <Button type="submit" size="sm" disabled={savingProfile}>
                    {savingProfile ? 'Saving…' : 'Save profile'}
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setProfileEditingFor('')}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </section>
        </Card>
      ))}
    </div>
  );
}
