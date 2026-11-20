import { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Menu, LogOut, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/auth';
import { useSidebar } from '../../context/sidebar';
import { SecureImage } from '../SecureImage';
import { ROUTES } from '../../utils/app-areas';

export default function Header() {
  const { user, logout } = useAuth();
  const { toggle } = useSidebar();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 bg-white/90 backdrop-blur-md border-b border-hairline/80 flex items-center justify-between px-4 md:px-8 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          className="lg:hidden p-2 text-muted hover:bg-surface rounded-[var(--radius-field)] transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
        <span className="flex items-center gap-2 font-semibold text-navy-900">
          <Building2 className="h-5 w-5" />
          PG Operations
        </span>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {/* User Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <div
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 md:gap-3 cursor-pointer group p-1 rounded-[var(--radius-button)] hover:bg-surface transition-all"
          >
            <div className="text-right hidden xs:block">
              <p className="text-sm font-semibold text-ink leading-none truncate max-w-[100px] group-hover:text-navy-900 transition-colors">
                {user?.name?.split(' ')[0] || 'Owner'}
              </p>
              <p className="text-xs text-positive font-bold mt-1">
                {user?.role === 'PG_WARDEN' ? 'Warden' : 'PG Owner'}
              </p>
            </div>
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-[var(--radius-field)] overflow-hidden border border-hairline group-hover:border-amber-500 transition-colors">
              <SecureImage
                srcKey={user?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=02224B&color=feb109&bold=true`}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <ChevronDown className={`hidden sm:block w-4 h-4 text-muted transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
          </div>

          {/* Dropdown Menu */}
          {showDropdown && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-[var(--radius-card)] shadow-2xl border border-hairline py-2 z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
              <div className="px-4 py-3 border-b border-hairline mb-1">
                <p className="text-xs font-bold text-muted ">Account</p>
                <p className="text-sm font-bold text-ink mt-1 truncate">{user?.name || user?.email}</p>
              </div>

              <Link
                to={ROUTES.ownerHome}
                onClick={() => setShowDropdown(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted hover:bg-navy-900/5 hover:text-navy-900 transition-colors"
              >
                <Building2 className="w-4 h-4" />
                <span className="font-medium">PG Operations</span>
              </Link>

              <Link
                to={`${ROUTES.ownerHome}/account`}
                onClick={() => setShowDropdown(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted hover:bg-navy-900/5 hover:text-navy-900 transition-colors"
              >
                <KeyRound className="w-4 h-4" />
                <span className="font-medium">Account security</span>
              </Link>

              <div className="h-px bg-surface my-1" />

              <button
                onClick={() => {
                  setShowDropdown(false);
                  logout();
                }}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-negative hover:bg-negative-bg w-full transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="font-bold">Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
