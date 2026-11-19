import { LogOut, Building2, X, BedDouble } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/auth';
import { useSidebar } from '../../context/sidebar';
import logo from '../../assets/logo_bg_black.png';
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
  const navItems: NavItem[] = area === 'resident'
    ? [{ icon: Building2, label: 'My stay', path: location.pathname }]
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
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col h-screen transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-auto
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="shrink-0 relative">
          <img src={logo} alt="Living Plus" className="w-full h-28 object-contain p-2 block" />
          <button
            onClick={close}
            className="lg:hidden absolute top-1 right-1 p-1 text-white bg-black/20 rounded-md transition-colors hover:bg-black/40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-6 space-y-6 pb-6 scrollbar-hide">
          <div className="space-y-1">
            <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Main Menu</p>
            {navItems.map((item) => {
              if (item.children) {
                return (
                  <div key={item.label} className="mb-2">
                    <div className="flex items-center gap-3 px-3 py-2 text-slate-500 font-medium">
                      <item.icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </div>
                    <div className="pl-6 space-y-1 mt-1">
                      {item.children.map((child) => {
                        if (child.children) {
                          return (
                            <div key={child.label} className="mb-2">
                              <div className="flex items-center gap-3 px-3 py-2 text-slate-500 text-sm font-medium">
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
                                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                                        isActive 
                                          ? 'bg-amber-50/50 text-[#02224B] font-semibold border-r-4 border-[#FEB109] rounded-r-none' 
                                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
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
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                              isActive 
                                ? 'bg-amber-50/50 text-[#02224B] font-semibold border-r-4 border-[#FEB109] rounded-r-none' 
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
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
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                    isActive 
                      ? 'bg-amber-50/50 text-[#02224B] font-semibold border-r-4 border-[#FEB109] rounded-r-none' 
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {sectionNav && (
            <div className="space-y-1">
              <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Workspace</p>
              {sectionNav.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    item.onSelect();
                    if (window.innerWidth < 1024) close();
                  }}
                  aria-current={item.active ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                    item.active
                      ? 'bg-amber-50/50 text-[#02224B] font-semibold border-r-4 border-[#FEB109] rounded-r-none'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              ))}
            </div>
          )}

        </nav>

        <div className="p-6 shrink-0 bg-white border-t border-slate-100">
          <button 
                onClick={() => {
                  logout();
                  if (area === 'resident') {
                    localStorage.removeItem(RESIDENT_SITE_KEY);
                    window.location.reload();
                  }
                }}
            className="flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-slate-900 w-full transition-colors rounded-lg hover:bg-slate-50"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
