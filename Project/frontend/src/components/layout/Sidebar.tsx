import { LogOut, X, BedDouble } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/auth';
import { useSidebar } from '../../context/sidebar';
import BrandLogo from '../ui/BrandLogo';
import { areaOf, ROUTES } from '../../utils/app-areas';
import { RESIDENT_SITE_KEY } from '../../utils/session';

type NavLink = { label: string; path: string; icon?: LucideIcon; children?: NavLink[] };
type NavItem = NavLink & { icon: LucideIcon };

export default function Sidebar() {
  const location = useLocation();
  const { logout } = useAuth();
  const { isOpen, close, sectionNav } = useSidebar();
  
  // Each area shows only its own links: a resident site never links to the owner workspace and vice versa.
  const area = areaOf(location.pathname);
  // A page that lists its own sections (resident site, owner workspace) needs no extra link.
  const navItems: NavItem[] = area === 'resident' || sectionNav
    ? []
    : [{ icon: BedDouble, label: 'PG Operations', path: ROUTES.ownerHome }];


  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={close}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-hairline flex flex-col h-screen transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-auto
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="relative flex h-16 shrink-0 items-center px-6">
          <Link to={area === 'resident' ? location.pathname : ROUTES.ownerHome} aria-label="Living Plus home"><BrandLogo /></Link>
          <button
            onClick={close}
            aria-label="Close menu"
            className="lg:hidden absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-[10px] text-muted hover:bg-surface"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 pt-4 space-y-6 pb-6 scrollbar-hide">
          {navItems.length > 0 && <div className="space-y-1">
            <p className="px-3 text-[13px] font-medium text-muted mb-2">Main menu</p>
            {navItems.map((item) => {
              if (item.children) {
                return (
                  <div key={item.label} className="mb-2">
                    <div className="flex items-center gap-3 px-3 py-2 text-muted font-medium">
                      <item.icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </div>
                    <div className="pl-6 space-y-1 mt-1">
                      {item.children.map((child) => {
                        if (child.children) {
                          return (
                            <div key={child.label} className="mb-2">
                              <div className="flex items-center gap-3 px-3 py-2 text-muted text-sm font-medium">
                                <span>{child.label}</span>
                              </div>
                              <div className="pl-4 space-y-1 mt-1">
                                {child.children.map((subChild) => {
                                  const isActive = location.pathname === subChild.path;
                                  return (
                                    <Link
                                      key={subChild.path}
                                      to={subChild.path}
                                      onClick={() => {
                                        if (window.innerWidth < 1024) close();
                                      }}
                                      className={`flex items-center gap-3 px-3 py-2 rounded-[var(--radius-button)] transition-all text-sm ${
                                        isActive 
                                          ? 'bg-amber-50 text-navy-900 font-bold border-r-4 border-amber-500 rounded-r-none' 
                                          : 'text-muted hover:bg-surface hover:text-ink font-medium'
                                      }`}
                                    >
                                      {subChild.icon && <subChild.icon className="w-4 h-4" />}
                                      <span className="whitespace-nowrap">{subChild.label}</span>
                                    </Link>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }

                        const isActive = location.pathname === child.path;
                        return (
                          <Link
                            key={child.path}
                            to={child.path || '#'}
                            onClick={() => {
                              if (window.innerWidth < 1024) close();
                            }}
                            className={`flex items-center gap-3 px-3 py-2 rounded-[var(--radius-button)] transition-all text-sm ${
                              isActive 
                                ? 'bg-amber-50 text-navy-900 font-bold border-r-4 border-amber-500 rounded-r-none' 
                                : 'text-muted hover:bg-surface hover:text-ink font-medium'
                            }`}
                          >
                            {child.icon && <child.icon className="w-4 h-4" />}
                            <span className="whitespace-nowrap">{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              const isActive = item.path && location.pathname === item.path;
              return (
                <Link
                  key={item.label}
                  to={item.path || '#'}
                  onClick={() => {
                    if (window.innerWidth < 1024) close();
                  }}
                  className={`flex items-center gap-3 px-3 py-2 rounded-[var(--radius-button)] transition-all text-sm ${
                    isActive 
                      ? 'bg-amber-50 text-navy-900 font-bold border-r-4 border-amber-500 rounded-r-none' 
                      : 'text-muted hover:bg-surface hover:text-ink font-medium'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              );
            })}
          </div>}

          {sectionNav && (
            <div className="space-y-1">
              {!sectionNav.some((item) => item.group) && <p className="px-3 text-[13px] font-medium text-muted mb-2">{area === 'resident' ? 'Your stay' : 'Workspace'}</p>}
              {sectionNav.map((item, index) => (
                <div key={item.id}>
                {item.group && item.group !== sectionNav[index - 1]?.group && (
                  <p className="px-3 pb-1 pt-4 text-[13px] font-medium text-muted">{item.group}</p>
                )}
                <button
                  onClick={() => {
                    item.onSelect();
                    if (window.innerWidth < 1024) close();
                  }}
                  aria-current={item.active ? 'page' : undefined}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-[15px] ${
                    item.active
                      ? 'bg-amber-50 text-navy-900 font-semibold shadow-[inset_3px_0_0_var(--color-amber-500)]'
                      : 'text-ink hover:bg-surface hover:text-navy-900 font-medium'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
                </div>
              ))}
            </div>
          )}

        </nav>

        <div className="p-6 shrink-0 bg-white border-t border-hairline">
          <button 
                onClick={() => {
                  logout();
                  if (area === 'resident') {
                    localStorage.removeItem(RESIDENT_SITE_KEY);
                    window.location.reload();
                  }
                }}
            className="flex items-center gap-3 px-3 py-2 text-muted hover:text-ink w-full transition-colors rounded-[var(--radius-field)] hover:bg-surface"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
