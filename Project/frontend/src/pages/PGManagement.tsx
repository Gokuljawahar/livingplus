import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  BedDouble,
  Building2,
  ClipboardList,
  Clock,
  FileText,
  IndianRupee,
  Loader2,
  Users,
  UtensilsCrossed,
  Wallet,
  Wrench,
  Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { viewsForRoles } from '@livingplus/shared';
import api from '../api/axios';
import { queryKeys } from '../api/query-keys';
import KitchenForecast from '../components/KitchenForecast';
import OwnerServices from '../components/OwnerServices';
import PgPulse from '../components/PgPulse';
import { useSidebar } from '../context/sidebar';
import { BookingsView, RoomChangesView } from '../features/owner/BookingsRoomChangesViews';
import { ExpensesView, PaymentsView, RentView, ReportsView, UtilitiesView } from '../features/owner/FinanceViews';
import { MaintenanceView, StaffView } from '../features/owner/OperationsViews';
import OverviewView from '../features/owner/OverviewView';
import PropertiesView from '../features/owner/PropertiesView';
import TenantsView from '../features/owner/TenantsView';
import {
  EMPTY_WORKSPACE,
  OWNER_ROUTE_SLUGS,
  OWNER_VIEW_BY_SLUG,
  type Activity,
  type RoomChangeRow,
  type Workspace,
  type WorkspaceView
} from '../features/owner/types';
import { apiErrorMessage } from '../utils/api-error';

async function fetchWorkspace(): Promise<Workspace> {
  const [propertyResponse, bookingResponse, ticketResponse, summaryResponse, tenantResponse] = await Promise.all([
    api.get('/pg/owner/properties'),
    api.get('/pg/owner/bookings'),
    api.get('/pg/owner/maintenance'),
    api.get('/pg/owner/summary'),
    api.get('/pg/owner/tenants')
  ]);
  const activity = await api.get('/pg/owner/activity').then((r) => r.data as Activity[]).catch(() => []);
  const roomChanges = await api.get('/pg/owner/room-changes').then((r) => (r.data || []) as RoomChangeRow[]).catch(() => []);
  const base = {
    ...EMPTY_WORKSPACE,
    properties: propertyResponse.data,
    bookings: bookingResponse.data,
    tickets: ticketResponse.data,
    summary: summaryResponse.data,
    tenants: tenantResponse.data,
    activity,
    roomChanges
  };
  if (!summaryResponse.data.canManageStaff) return base;
  const [rentResponse, expenseResponse, billResponse, reportResponse, staffResponse, claimResponse] = await Promise.all([
    api.get('/pg/owner/rent'),
    api.get('/pg/owner/expenses'),
    api.get('/pg/owner/electricity/bills'),
    api.get('/pg/owner/reports'),
    api.get('/pg/owner/staff'),
    api.get('/pg/owner/payment-claims')
  ]);
  return {
    ...base,
    rentEntries: rentResponse.data,
    expenses: expenseResponse.data.entries || [],
    expenseTotal: expenseResponse.data.total || 0,
    bills: billResponse.data || [],
    report: reportResponse.data,
    staff: staffResponse.data,
    paymentClaims: claimResponse.data || []
  };
}

export default function PGManagement() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const chosenView: WorkspaceView = (section && OWNER_VIEW_BY_SLUG[section]) || 'overview';
  const setView = useCallback(
    (next: WorkspaceView) => {
      const slug = OWNER_ROUTE_SLUGS[next];
      navigate(slug ? `/owner/${slug}` : '/owner');
    },
    [navigate]
  );

  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const queryClient = useQueryClient();
  const { data: workspace, isPending: loading } = useQuery({
    queryKey: queryKeys.owner.workspace(),
    queryFn: fetchWorkspace,
    meta: { errorMessage: 'Could not load PG operations' }
  });
  const {
    properties,
    bookings,
    tickets,
    summary,
    tenants,
    roomChanges,
    rentEntries,
    expenses,
    expenseTotal,
    bills,
    report,
    staff,
    paymentClaims
  } = workspace ?? EMPTY_WORKSPACE;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.owner.workspace() });
  };

  if (!selectedPropertyId && properties[0]) setSelectedPropertyId(properties[0].id);

  const updateTenantStay = async (
    tenantId: string,
    action: 'check-in' | 'check-out',
    checkout?: { depositDeductions: number; checkoutNote: string }
  ) => {
    try {
      await api.post(`/pg/owner/tenants/${tenantId}/${action}`, checkout || {});
      toast.success(action === 'check-in' ? 'Tenant checked in' : 'Tenant checked out; bed released');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, `Could not ${action} tenant`));
    }
  };

  const roleKey = (summary.staffRoles ?? []).join(',');
  const allowedViews = useMemo(() => viewsForRoles(roleKey ? roleKey.split(',') : ['WARDEN']), [roleKey]);
  const view: WorkspaceView = allowedViews.includes(chosenView) ? chosenView : ((allowedViews[0] ?? 'overview') as WorkspaceView);
  const views = useMemo(
    () =>
      [
        { id: 'overview', label: 'Today', icon: Building2 },
        { id: 'bookings', label: 'Bed requests', icon: ClipboardList, group: 'Residents' },
        { id: 'tenants', label: 'Residents & KYC', icon: Users, group: 'Residents' },
        { id: 'roomchanges', label: 'Room changes', icon: ArrowLeftRight, group: 'Residents' },
        { id: 'rent', label: 'Rent', icon: Wallet, group: 'Money' },
        { id: 'payments', label: 'Payments', icon: IndianRupee, group: 'Money' },
        { id: 'expenses', label: 'Expenses', icon: IndianRupee, group: 'Money' },
        { id: 'utilities', label: 'Utilities', icon: Zap, group: 'Money' },
        { id: 'reports', label: 'Reports', icon: FileText, group: 'Money' },
        { id: 'maintenance', label: 'Maintenance', icon: Wrench, group: 'Operations' },
        { id: 'services', label: 'Meals & cleaning', icon: UtensilsCrossed, group: 'Operations' },
        { id: 'activity', label: 'PG pulse', icon: Clock, group: 'Operations' },
        { id: 'properties', label: 'PGs & beds', icon: BedDouble, group: 'Setup' },
        { id: 'staff', label: 'Staff', icon: Users, group: 'Setup' }
      ].filter((item) => allowedViews.includes(item.id)) as {
        id: WorkspaceView;
        label: string;
        icon: typeof Users;
        group?: string;
      }[],
    [allowedViews]
  );

  const { setSectionNav } = useSidebar();
  useEffect(() => {
    setSectionNav(
      views.map(({ id, label, icon, group }) => ({
        id,
        label,
        icon,
        ...(group ? { group } : {}),
        active: id === view,
        onSelect: () => setView(id)
      }))
    );
    return () => setSectionNav(null);
  }, [views, view, setSectionNav, setView]);

  return (
    <div className="space-y-6 text-ink">
      {view !== 'overview' && <h1 className="text-2xl font-bold">{views.find((item) => item.id === view)?.label}</h1>}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-navy-900" />
        </div>
      ) : (
        <>
          {view === 'overview' && (
            <OverviewView
              summary={summary}
              rentEntries={rentEntries}
              tickets={tickets}
              paymentClaims={paymentClaims}
              bookings={bookings}
              onNavigate={setView}
            />
          )}
          {view === 'services' && (
            <div className="space-y-6">
              <KitchenForecast
                properties={[...properties]
                  .sort(
                    (a, b) =>
                      Number(b.rooms.some((room) => room.foodCharge > 0 || room.foodIncluded)) -
                      Number(a.rooms.some((room) => room.foodCharge > 0 || room.foodIncluded))
                  )
                  .map((property) => ({ id: property.id, name: property.name }))}
              />
              <OwnerServices canEditSettings={summary.canManageStaff} />
            </div>
          )}
          {view === 'properties' && (
            <PropertiesView
              properties={properties}
              selectedPropertyId={selectedPropertyId}
              setSelectedPropertyId={setSelectedPropertyId}
              canManageStaff={summary.canManageStaff}
              onChanged={refresh}
            />
          )}
          {view === 'bookings' && (
            <BookingsView
              bookings={bookings}
              properties={properties}
              onCheckIn={(tenantId) => updateTenantStay(tenantId, 'check-in')}
              onChanged={refresh}
            />
          )}
          {view === 'roomchanges' && <RoomChangesView roomChanges={roomChanges} onChanged={refresh} />}
          {view === 'tenants' && (
            <TenantsView
              tenants={tenants}
              canManageStaff={summary.canManageStaff}
              onStayAction={updateTenantStay}
              onChanged={refresh}
            />
          )}
          {view === 'rent' && <RentView rentEntries={rentEntries} tenants={tenants} onChanged={refresh} />}
          {view === 'payments' && <PaymentsView paymentClaims={paymentClaims} onChanged={refresh} />}
          {view === 'expenses' && (
            <ExpensesView
              expenses={expenses}
              expenseTotal={expenseTotal}
              properties={properties}
              selectedPropertyId={selectedPropertyId}
              setSelectedPropertyId={setSelectedPropertyId}
              onChanged={refresh}
            />
          )}
          {view === 'utilities' && (
            <UtilitiesView
              bills={bills}
              properties={properties}
              selectedPropertyId={selectedPropertyId}
              setSelectedPropertyId={setSelectedPropertyId}
              onChanged={refresh}
            />
          )}
          {view === 'reports' && report && <ReportsView report={report} />}
          {view === 'activity' && <PgPulse onGo={(target) => setView(target)} />}
          {view === 'staff' && summary.canManageStaff && (
            <StaffView staff={staff} properties={properties} onChanged={refresh} />
          )}
          {view === 'maintenance' && (
            <MaintenanceView
              tickets={tickets}
              properties={properties}
              staff={staff}
              selectedPropertyId={selectedPropertyId}
              setSelectedPropertyId={setSelectedPropertyId}
              onChanged={refresh}
            />
          )}
        </>
      )}
    </div>
  );
}