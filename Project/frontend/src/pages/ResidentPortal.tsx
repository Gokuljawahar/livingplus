import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Bell, Building2, History, Loader2, LogOut, Menu, ShoppingBag, UserRound, UtensilsCrossed, Wallet, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import { queryKeys } from '../api/query-keys';
import AIChatPanel from '../components/AIChatPanel';
import FoodPreferences from '../components/FoodPreferences';
import Sidebar from '../components/layout/Sidebar';
import MoneyOverview from '../components/MoneyOverview';
import RoomChange from '../components/RoomChange';
import ServiceOrders from '../components/ServiceOrders';
import StayServices from '../components/StayServices';
import { Card } from '../components/ui';
import { useAuth } from '../context/auth';
import { SidebarProvider } from '../context/SidebarContext';
import { useSidebar } from '../context/sidebar';
import ResidentMaintenanceView from '../features/resident/ResidentMaintenanceView';
import ResidentNotificationsView from '../features/resident/ResidentNotificationsView';
import ResidentProfileView from '../features/resident/ResidentProfileView';
import ResidentSignIn from '../features/resident/ResidentSignIn';
import ResidentStaysView from '../features/resident/ResidentStaysView';
import {
  RESIDENT_TAB_BY_SLUG,
  RESIDENT_TAB_SLUGS,
  type MaintenanceTicket,
  type PaymentClaim,
  type PgSite,
  type ResidentNotification,
  type ResidentTab,
  type Stay
} from '../features/resident/types';
import { apiErrorMessage } from '../utils/api-error';
import { ROUTES } from '../utils/app-areas';
import { RESIDENT_SITE_KEY, RESIDENT_TOKEN_KEY } from '../utils/session';

const NO_STAYS: Stay[] = [];
const NO_TICKETS: MaintenanceTicket[] = [];
const NO_NOTIFICATIONS: ResidentNotification[] = [];
const NO_CLAIMS: PaymentClaim[] = [];

/** A saved resident session counts only on the PG site it was opened on. */
const hasSessionFor = (slug: string) => Boolean(localStorage.getItem(RESIDENT_TOKEN_KEY)) && localStorage.getItem(RESIDENT_SITE_KEY) === slug;

/** The resident site of one PG: /stay/<slug>. */
export default function ResidentPortal() {
  const slug = String(useParams().slug || '').toLowerCase();
  const { data: site, isPending, isError } = useQuery({
    queryKey: queryKeys.pgSite(slug),
    queryFn: async (): Promise<PgSite> => (await api.get(`/pg/sites/${encodeURIComponent(slug)}`)).data,
    retry: false
  });
  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Loader2 className="h-8 w-8 animate-spin text-navy-900" />
      </div>
    );
  }
  if (isError || !site) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface p-6 text-center">
        <section>
          <h1 className="text-2xl font-bold text-ink">PG site not found</h1>
          <p className="mt-2 text-sm text-muted">This resident link doesn't match any PG. Check the link your PG shared, or find your PG.</p>
          <Link to={ROUTES.residentFinder} className="mt-4 inline-block font-bold text-navy-900 hover:underline">Find your PG</Link>
        </section>
      </main>
    );
  }
  return (
    <SidebarProvider>
      <ResidentPortalView key={site.slug} site={site} />
    </SidebarProvider>
  );
}

function ResidentPortalView({ site }: { site: PgSite }) {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const { logout: clearSession } = useAuth();
  const { setSectionNav, toggle } = useSidebar();
  const [signedIn, setSignedIn] = useState(() => hasSessionFor(site.slug));

  const activeTab: ResidentTab = (section && RESIDENT_TAB_BY_SLUG[section]) || 'stays';
  const setActiveTab = useCallback(
    (next: ResidentTab) => {
      const tabSlug = RESIDENT_TAB_SLUGS[next];
      navigate(tabSlug ? `/stay/${site.slug}/${tabSlug}` : `/stay/${site.slug}`);
    },
    [navigate, site.slug]
  );

  const queryClient = useQueryClient();
  const { data: portal } = useQuery({
    queryKey: queryKeys.resident.portal(),
    queryFn: async () => {
      const [stayResponse, ticketResponse, notificationResponse, claimResponse] = await Promise.all([
        api.get('/pg/tenant/stays'),
        api.get('/pg/tenant/maintenance'),
        api.get('/pg/tenant/notifications'),
        api.get('/pg/tenant/payment-claims')
      ]);
      return {
        stays: stayResponse.data as Stay[],
        tickets: ticketResponse.data as MaintenanceTicket[],
        notifications: (notificationResponse.data.notifications || []) as ResidentNotification[],
        paymentClaims: (claimResponse.data || []) as PaymentClaim[]
      };
    },
    enabled: signedIn,
    refetchInterval: 30_000,
    meta: { errorMessage: 'Could not load resident account' }
  });

  const stays = portal?.stays ?? NO_STAYS;
  const tickets = portal?.tickets ?? NO_TICKETS;
  const notifications = portal?.notifications ?? NO_NOTIFICATIONS;
  const paymentClaims = portal?.paymentClaims ?? NO_CLAIMS;
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  const refreshResidentData = () => queryClient.invalidateQueries({ queryKey: queryKeys.resident.portal() });

  const markNotificationRead = async (notificationId: string) => {
    try {
      await api.patch(`/pg/tenant/notifications/${notificationId}/read`);
      queryClient.setQueryData(queryKeys.resident.portal(), (current: typeof portal) => current && {
        ...current,
        notifications: current.notifications.map((notification) =>
          notification.id === notificationId ? { ...notification, readAt: new Date().toISOString() } : notification
        )
      });
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update notification'));
    }
  };

  const logout = () => {
    clearSession('PG_TENANT');
    localStorage.removeItem(RESIDENT_SITE_KEY);
    queryClient.removeQueries({ queryKey: queryKeys.resident.all() });
    setSignedIn(false);
  };

  const sections = useMemo(
    () => [
      { id: 'stays', label: 'Home', icon: Building2 },
      { id: 'money', label: 'Money', icon: Wallet },
      { id: 'food', label: 'Food', icon: UtensilsCrossed },
      { id: 'orders', label: 'Meals & cleaning', icon: ShoppingBag },
      { id: 'services', label: 'Services', icon: History },
      { id: 'maintenance', label: 'Maintenance', icon: Wrench },
      { id: 'roomchange', label: 'Room change', icon: ArrowLeftRight },
      { id: 'notifications', label: 'Notifications', icon: Bell },
      { id: 'profile', label: 'Profile', icon: UserRound }
    ] as const,
    []
  );

  useEffect(() => {
    if (!signedIn) return;
    setSectionNav(sections.map(({ id, label, icon }) => ({ id, label, icon, active: id === activeTab, onSelect: () => setActiveTab(id) })));
    return () => setSectionNav(null);
  }, [sections, activeTab, signedIn, setSectionNav, setActiveTab]);

  if (!signedIn) {
    return <ResidentSignIn site={site} onAuthenticated={() => setSignedIn(true)} />;
  }

  return (
    <div className="flex h-[100dvh] bg-surface text-ink">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-hairline bg-canvas px-4 md:px-8">
          <div className="flex items-center gap-3">
            <button onClick={toggle} aria-label="Open navigation" className="rounded-[var(--radius-button)] p-2 text-muted transition-colors hover:bg-surface lg:hidden">
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-field)] bg-navy-900 text-amber-500">
                <Building2 className="h-4.5 w-4.5" />
              </div>
              <span className="text-sm font-bold text-ink sm:text-base">{site.name}</span>
            </div>
            {stays[0] && (
              <span className="ml-2 hidden items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted md:inline-flex">
                <UserRound className="h-3.5 w-3.5 text-navy-900" />
                {stays[0].name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm md:gap-3">
            <button
              onClick={() => setActiveTab('notifications')}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink"
              aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
            >
              <Bell className="h-4 w-4 text-muted" />
              {unreadCount > 0 && <span className="tabular rounded-full bg-negative px-1.5 text-[11px] font-semibold text-canvas">{unreadCount}</span>}
            </button>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-negative/30 hover:text-negative"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-8 lg:pb-8">
          <div className="mx-auto max-w-5xl">
            {activeTab === 'orders' && (() => {
              const current = stays.find((stay) => ['ACTIVE', 'NOTICE_PERIOD'].includes(stay.status));
              return current
                ? <ServiceOrders tenantId={current.id} />
                : <Card><p className="text-muted">Meal and cleaning orders open once you have checked in.</p></Card>;
            })()}
            {activeTab === 'stays' && (
              <ResidentStaysView
                stays={stays}
                tickets={tickets}
                paymentClaims={paymentClaims}
                onNavigate={setActiveTab}
                onChanged={refreshResidentData}
              />
            )}
            {activeTab === 'profile' && <ResidentProfileView stays={stays} onChanged={refreshResidentData} />}
            {activeTab === 'maintenance' && (
              <ResidentMaintenanceView stays={stays} tickets={tickets} onChanged={refreshResidentData} />
            )}
            {activeTab === 'roomchange' && <RoomChange />}
            {activeTab === 'money' && <MoneyOverview stays={stays} claims={paymentClaims} />}
            {activeTab === 'food' && <FoodPreferences stays={stays} onChanged={() => void refreshResidentData()} />}
            {activeTab === 'services' && <StayServices stays={stays} />}
            {activeTab === 'notifications' && (
              <ResidentNotificationsView notifications={notifications} onMarkRead={markNotificationRead} />
            )}
          </div>
        </main>

        <nav aria-label="Resident" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)] lg:hidden">
          {([
            ['stays', 'Home', Building2],
            ['money', 'Money', Wallet],
            ['maintenance', 'Requests', Wrench],
            ['profile', 'Profile', UserRound]
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[13px] font-medium ${activeTab === id ? 'text-navy-900' : 'text-muted'}`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <AIChatPanel />
      </div>
    </div>
  );
}
