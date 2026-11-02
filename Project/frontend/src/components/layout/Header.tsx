import { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Menu, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSidebar } from '../../context/SidebarContext';
import { SecureImage } from '../SecureImage';
import { resolveAppHost } from '../../utils/pg-host';

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
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
        <span className="flex items-center gap-2 font-semibold text-[#02224B]">
          <Building2 className="h-5 w-5" />
          PG Operations
        </span>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {/* User Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <div
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 md:gap-3 cursor-pointer group p-1 rounded-xl hover:bg-slate-50 transition-all"
          >
            <div className="text-right hidden xs:block">
              <p className="text-sm font-semibold text-slate-900 leading-none truncate max-w-[100px] group-hover:text-[#02224B] transition-colors">
                {user?.name?.split(' ')[0] || 'Admin'}
              </p>
              <p className="text-[10px] text-green-600 font-bold uppercase tracking-wider mt-1">
                {user?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'PG Operator'}
              </p>
            </div>
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg overflow-hidden border border-slate-200 group-hover:border-[#FEB109] transition-colors">
              <SecureImage
                srcKey={user?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=02224B&color=feb109&bold=true`}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <ChevronDown className={`hidden sm:block w-4 h-4 text-slate-400 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
          </div>

          {/* Dropdown Menu */}
          {showDropdown && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
              <div className="px-4 py-3 border-b border-slate-50 mb-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Account</p>
                <p className="text-sm font-bold text-slate-900 mt-1 truncate">{user?.name || user?.email}</p>
              </div>

              <Link
                to={resolveAppHost().kind === 'property' ? '/owner/manage' : '/pg/manage'}
                onClick={() => setShowDropdown(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-[#02224B]/5 hover:text-[#02224B] transition-colors"
              >
                <Building2 className="w-4 h-4" />
                <span className="font-medium">PG Operations</span>
              </Link>

              <div className="h-px bg-slate-50 my-1" />

              <button
                onClick={() => {
                  setShowDropdown(false);
                  logout();
                }}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 w-full transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="font-bold">Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
