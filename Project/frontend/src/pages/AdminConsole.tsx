import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  ClipboardList,
  Database,
  ExternalLink,
  LogOut,
  Menu,
  PlusCircle,
  ShieldCheck,
  X
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { queryKeys } from '../api/query-keys';
import BrandLogo from '../components/ui/BrandLogo';
import { useAuth } from '../context/auth';
import AdminCatalogView from '../features/admin/AdminCatalogView';
import AdminLeadsView from '../features/admin/AdminLeadsView';
import AdminPropertiesView from '../features/admin/AdminPropertiesView';
import ConciergeOnboardWizard from '../features/admin/ConciergeOnboardWizard';
import type { AdminOverview, AdminOwner, AdminProperty, OwnerLead } from '../features/admin/types';
import { ROUTES } from '../utils/app-areas';

type AdminTab = 'leads' | 'onboard' | 'properties' | 'catalog';

export default function AdminConsole() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const activeTab: AdminTab =
    location.pathname.startsWith('/admin/onboard')
      ? 'onboard'
      : location.pathname.startsWith('/admin/properties')
      ? 'properties'
      : location.pathname.startsWith('/admin/catalog')
      ? 'catalog'
      : 'leads';

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [leadStatusFilter, setLeadStatusFilter] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [propStatusFilter, setPropStatusFilter] = useState('');
  const [propSearch, setPropSearch] = useState('');
  const [prefillLead, setPrefillLead] = useState<OwnerLead | null>(null);

  const { data: overview } = useQuery({
    queryKey: queryKeys.admin.overview(),
    queryFn: async (): Promise<AdminOverview> => (await api.get('/admin/overview')).data
  });

  const { data: leads = [], isPending: leadsLoading } = useQuery({
    queryKey: queryKeys.admin.leads(leadStatusFilter, leadSearch),
    queryFn: async (): Promise<OwnerLead[]> =>
      (await api.get('/admin/leads', { params: { status: leadStatusFilter || undefined, search: leadSearch || undefined } })).data
  });

  const { data: owners = [] } = useQuery({
    queryKey: queryKeys.admin.owners(),
    queryFn: async (): Promise<AdminOwner[]> => (await api.get('/admin/owners')).data
  });

  const { data: properties = [], isPending: propertiesLoading } = useQuery({
    queryKey: queryKeys.admin.properties(propStatusFilter, propSearch),
    queryFn: async (): Promise<AdminProperty[]> =>
      (await api.get('/admin/properties', { params: { status: propStatusFilter || undefined, search: propSearch || undefined } })).data
  });

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.properties() });
  };

  const navItems: { id: AdminTab; label: string; to: string; icon: typeof ClipboardList }[] = [
    { id: 'leads', label: 'Leads Inbox', to: ROUTES.adminHome, icon: ClipboardList },
    { id: 'onboard', label: 'Onboard New PG', to: ROUTES.adminOnboard, icon: PlusCircle },
    { id: 'properties', label: 'All PGs', to: ROUTES.adminProperties, icon: Building2 },
    { id: 'catalog', label: 'Platform Catalog', to: ROUTES.adminCatalog, icon: Database }
  ];

  const startOnboardFromLead = (lead: OwnerLead) => {
    setPrefillLead(lead);
    navigate(ROUTES.adminOnboard);
  };

  return (
    <div className="flex h-[100dvh] bg-surface text-ink">
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileNavOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-hairline bg-canvas transition-transform lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-hairline px-5">
          <Link to={ROUTES.adminHome} aria-label="Living Plus Onboarding Ops">
            <BrandLogo />
          </Link>
          <button type="button" onClick={() => setMobileNavOpen(false)} className="lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 pt-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-navy-900">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-600" /> Onboarding Ops
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-4 pt-4">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <Link
                key={item.id}
                to={item.to}
                onClick={() => setMobileNavOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] ${
                  active
                    ? 'bg-amber-50 font-semibold text-navy-900 shadow-[inset_3px_0_0_var(--color-amber-500)]'
                    : 'font-medium text-ink hover:bg-surface hover:text-navy-900'
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-hairline p-4">
          <a
            href={ROUTES.guestHome}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-[var(--radius-field)] px-3 py-2 text-sm font-medium text-navy-900 hover:bg-surface"
          >
            <span>Open live marketplace</span>
            <ExternalLink className="h-4 w-4 text-muted" />
          </a>
          <button
            type="button"
            onClick={() => {
              logout('PLATFORM_ADMIN');
              navigate(ROUTES.adminLogin, { replace: true });
            }}
            className="flex w-full items-center gap-2 rounded-[var(--radius-field)] px-3 py-2 text-sm font-medium text-negative hover:bg-negative-bg"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-hairline bg-canvas px-4 sm:px-8">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMobileNavOpen(true)} className="rounded p-2 hover:bg-surface lg:hidden">
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold text-navy-900 sm:text-xl">
              {activeTab === 'leads'
                ? 'Owner Onboarding Leads'
                : activeTab === 'onboard'
                ? 'Concierge PG Onboarding'
                : activeTab === 'catalog'
                ? 'Dynamic Platform Catalog'
                : 'Marketplace PG Catalog'}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{user?.name || 'Living Plus Ops'}</span>
            {activeTab !== 'onboard' && (
              <Link to={ROUTES.adminOnboard} className="btn-primary min-h-9 px-3.5 py-1.5 text-xs">
                <PlusCircle className="h-4 w-4" /> Onboard New PG
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-16 sm:p-8">
          {activeTab === 'leads' && (
            <AdminLeadsView
              overview={overview}
              leads={leads}
              loading={leadsLoading}
              statusFilter={leadStatusFilter}
              setStatusFilter={setLeadStatusFilter}
              search={leadSearch}
              setSearch={setLeadSearch}
              onStartOnboard={startOnboardFromLead}
              onChanged={refreshAll}
            />
          )}
          {activeTab === 'onboard' && (
            <ConciergeOnboardWizard
              key={prefillLead?.id || 'manual'}
              owners={owners}
              prefillLead={prefillLead}
              onClearLead={() => setPrefillLead(null)}
              onCompleted={refreshAll}
            />
          )}
          {activeTab === 'properties' && (
            <AdminPropertiesView
              properties={properties}
              loading={propertiesLoading}
              statusFilter={propStatusFilter}
              setStatusFilter={setPropStatusFilter}
              search={propSearch}
              setSearch={setPropSearch}
              onChanged={refreshAll}
            />
          )}
          {activeTab === 'catalog' && <AdminCatalogView />}
        </main>
      </div>
    </div>
  );
}
