import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import ConditionRecords from '../../components/ConditionRecords';
import KycAiSummary, { type KycAiCheck } from '../../components/KycAiSummary';
import { Button, Card, EmptyState, StatusPill } from '../../components/ui';
import { apiErrorMessage } from '../../utils/api-error';
import { statusLabel } from '../../utils/status';
import TenantCheckoutForm from './TenantCheckoutForm';
import TenantEditForm, { type TenantEditValues } from './TenantEditForm';
import { ownerInputClass, type Tenant } from './types';

interface Props {
  tenants: Tenant[];
  canManageStaff: boolean;
  onStayAction: (tenantId: string, action: 'check-in' | 'check-out', checkout?: { depositDeductions: number; checkoutNote: string }) => Promise<void>;
  onChanged: () => void;
}

export default function TenantsView({ tenants, canManageStaff, onStayAction, onChanged }: Props) {
  const [tenantFilter, setTenantFilter] = useState('');
  const [editingTenantId, setEditingTenantId] = useState('');
  const [savingTenant, setSavingTenant] = useState(false);
  const [checkoutTenantId, setCheckoutTenantId] = useState('');
  const [refundReference, setRefundReference] = useState('');
  const [kycChecking, setKycChecking] = useState('');
  const [recordsFor, setRecordsFor] = useState('');

  const updateTenant = async (tenantId: string, values: TenantEditValues, document: File | null) => {
    setSavingTenant(true);
    try {
      let kycDocumentUrl: string | undefined;
      if (document?.size) {
        const upload = new FormData();
        upload.append('image', document);
        const result = await api.post('/upload-s3', upload, { headers: { 'Content-Type': 'multipart/form-data' } });
        kycDocumentUrl = result.data.fileKey;
      }
      await api.patch(`/pg/owner/tenants/${tenantId}`, {
        permanentAddress: values.permanentAddress,
        bloodGroup: values.bloodGroup,
        institutionOrEmployer: values.institutionOrEmployer,
        emergencyName: values.emergencyName,
        emergencyPhone: values.emergencyPhone,
        kycType: values.kycType,
        ...(kycDocumentUrl ? { kycDocumentUrl } : {})
      });
      toast.success('Tenant profile updated');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update tenant profile'));
    } finally {
      setSavingTenant(false);
    }
  };

  const viewKycDocument = async (fileKey: string) => {
    const preview = window.open('about:blank', '_blank');
    try {
      const response = await api.get(`/view-image/${encodeURIComponent(fileKey)}`);
      if (preview) preview.location.href = response.data.viewUrl;
      else toast.error('Allow pop-ups to open the KYC document');
    } catch (error) {
      preview?.close();
      toast.error(apiErrorMessage(error, 'Could not open KYC document'));
    }
  };

  const runKycCheck = async (tenantId: string) => {
    setKycChecking(tenantId);
    try {
      const check = (await api.post(`/pg/owner/tenants/${tenantId}/kyc-check`)).data as KycAiCheck;
      if (check.flags.length) toast.error(`ID check: ${check.flags[0]}`);
      else toast.success('ID check found no problems');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not check the ID just now'));
    } finally {
      setKycChecking('');
    }
  };

  const verifyKyc = async (tenantId: string, verified: boolean) => {
    try {
      await api.patch(`/pg/owner/tenants/${tenantId}`, { kycVerified: verified });
      toast.success(verified ? 'KYC marked verified' : 'KYC verification revoked');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update KYC status'));
    }
  };

  const setFoodOptOut = async (tenantId: string, optOut: boolean) => {
    try {
      await api.patch(`/pg/owner/tenants/${tenantId}`, { foodOptOut: optOut });
      toast.success(optOut ? 'Tenant opted out of food' : 'Tenant opted back in to food');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update food preference'));
    }
  };

  const markDepositRefunded = async (tenantId: string) => {
    try {
      await api.patch(`/pg/owner/tenants/${tenantId}/deposit-refund`, { reference: refundReference.trim() });
      toast.success('Deposit refund recorded');
      setRefundReference('');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not record deposit refund'));
    }
  };

  return (
    <section className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">{tenants.length} {tenants.length === 1 ? 'resident' : 'residents'}</p>
        <div className="flex flex-wrap gap-1.5 rounded-[var(--radius-button)] bg-surface p-1">
          {['', 'ACTIVE', 'NOTICE_PERIOD', 'RESERVED', 'CHECKED_OUT'].map((status) => (
            <button
              key={status}
              onClick={() => setTenantFilter(status)}
              className={`rounded-[var(--radius-chip)] px-3 py-1.5 text-xs font-bold transition-all ${
                tenantFilter === status ? 'bg-canvas text-navy-900 shadow-xs' : 'text-muted hover:text-ink'
              }`}
            >
              {status ? statusLabel(status) : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {tenants
          .filter((tenant) => !tenantFilter || tenant.status === tenantFilter)
          .map((tenant) => (
            <Card key={tenant.id} className="space-y-4 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-navy-900">{tenant.name}</h3>
                    <StatusPill status={tenant.status} />
                  </div>
                  <p className="mt-1 text-xs font-medium text-muted">
                    {tenant.property.name} · {tenant.bed ? `Room ${tenant.bed.room.roomNumber}, ${tenant.bed.label}` : 'No bed assigned'}
                  </p>
                  <p className="mt-1 text-xs font-medium text-ink">
                    {tenant.phone} · ₹{tenant.monthlyRent.toLocaleString('en-IN')} / month · Deposit ₹{tenant.depositReceived.toLocaleString('en-IN')} / ₹{tenant.depositAmount.toLocaleString('en-IN')}
                  </p>
                  {tenant.kycDocumentUrl && !tenant.kycVerified && <KycAiSummary check={tenant.kycAiCheck} audience="owner" />}
                </div>
                <div className="flex flex-wrap gap-2">
                  {tenant.status === 'RESERVED' && (
                    <Button size="sm" onClick={() => void onStayAction(tenant.id, 'check-in')}>Check in</Button>
                  )}
                  {tenant.status === 'ACTIVE' && (
                    <Button variant="secondary" size="sm" onClick={() => setCheckoutTenantId(checkoutTenantId === tenant.id ? '' : tenant.id)}>
                      Check out
                    </Button>
                  )}
                  {tenant.status === 'CHECKED_OUT' && tenant.depositRefundStatus === 'PENDING' && (
                    <span className="inline-flex items-center rounded-[var(--radius-button)] border border-amber-500/30 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-600">
                      Refund due ₹{(tenant.depositRefundAmount || 0).toLocaleString('en-IN')}
                    </span>
                  )}
                  <Button type="button" variant="secondary" size="sm" aria-expanded={editingTenantId === tenant.id} onClick={() => setEditingTenantId(editingTenantId === tenant.id ? '' : tenant.id)}>
                    Edit details
                  </Button>
                  <Button type="button" variant="secondary" size="sm" aria-expanded={recordsFor === tenant.id} onClick={() => setRecordsFor(recordsFor === tenant.id ? '' : tenant.id)}>
                    Condition records
                  </Button>
                  {tenant.kycDocumentUrl && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => void viewKycDocument(tenant.kycDocumentUrl!)}>
                      View KYC
                    </Button>
                  )}
                  {tenant.kycDocumentUrl && !tenant.kycVerified && (
                    <Button type="button" variant="secondary" size="sm" disabled={kycChecking === tenant.id} onClick={() => void runKycCheck(tenant.id)}>
                      {kycChecking === tenant.id ? 'Checking…' : tenant.kycAiCheck ? 'Check ID again' : 'Check ID'}
                    </Button>
                  )}
                  {tenant.kycDocumentUrl && !tenant.kycVerified && (
                    <Button type="button" size="sm" onClick={() => void verifyKyc(tenant.id, true)}>
                      Verify KYC
                    </Button>
                  )}
                  {tenant.kycVerified && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => void verifyKyc(tenant.id, false)}>
                      KYC verified · revoke
                    </Button>
                  )}
                  {tenant.foodOptOut ? (
                    <Button type="button" variant="secondary" size="sm" onClick={() => void setFoodOptOut(tenant.id, false)}>
                      Food off · turn on
                    </Button>
                  ) : (
                    <Button type="button" variant="secondary" size="sm" onClick={() => void setFoodOptOut(tenant.id, true)}>
                      Food on · opt out
                    </Button>
                  )}
                </div>
              </div>

              {recordsFor === tenant.id && <ConditionRecords tenantId={tenant.id} viewer="staff" />}
              {editingTenantId === tenant.id && (
                <TenantEditForm initial={tenant} saving={savingTenant} onSubmit={(values, file) => updateTenant(tenant.id, values, file)} />
              )}
              {checkoutTenantId === tenant.id && tenant.status === 'ACTIVE' && (
                <TenantCheckoutForm
                  tenantId={tenant.id}
                  depositReceived={tenant.depositReceived || 0}
                  onConfirm={async (payload) => {
                    await onStayAction(tenant.id, 'check-out', payload);
                    setCheckoutTenantId('');
                  }}
                  onCancel={() => setCheckoutTenantId('')}
                />
              )}
              {tenant.status === 'CHECKED_OUT' && (tenant.depositDeductions || tenant.checkoutNote) ? (
                <p className="rounded-[var(--radius-chip)] border border-hairline bg-surface p-3 text-xs text-muted">
                  Check-out: deductions ₹{(tenant.depositDeductions || 0).toLocaleString('en-IN')}
                  {tenant.checkoutNote ? ` · ${tenant.checkoutNote}` : ''} · Refund {tenant.depositRefundStatus?.toLowerCase().replace('_', ' ')}
                  {(tenant.depositRefundAmount ?? 0) > 0 ? ` ₹${(tenant.depositRefundAmount || 0).toLocaleString('en-IN')}` : ''}
                  {tenant.depositRefundReference ? ` · Ref ${tenant.depositRefundReference}` : ''}
                </p>
              ) : null}
              {tenant.status === 'CHECKED_OUT' && tenant.depositRefundStatus === 'PENDING' && canManageStaff && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void markDepositRefunded(tenant.id);
                  }}
                  className="flex flex-col gap-2 sm:flex-row"
                >
                  <input
                    value={refundReference}
                    onChange={(event) => setRefundReference(event.target.value)}
                    placeholder="Refund UPI / transaction reference"
                    className={`${ownerInputClass} sm:w-80`}
                  />
                  <Button type="submit" size="sm">Mark refunded</Button>
                </form>
              )}
            </Card>
          ))}
        {!tenants.length && <EmptyState title="Approved bookings will appear here for check-in." />}
      </div>
    </section>
  );
}
