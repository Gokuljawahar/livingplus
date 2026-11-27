import { useLocation } from 'react-router-dom';
import { create } from 'zustand';
import { areaOf, type AppArea } from '../utils/app-areas';
import {
  ADMIN_TOKEN_KEY,
  ADMIN_USER_KEY,
  OWNER_TOKEN_KEY,
  OWNER_USER_KEY,
  RESIDENT_TOKEN_KEY,
  RESIDENT_USER_KEY
} from '../utils/session';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  profileImage?: string;
  /** A Google account is linked for "Sign in with Google". */
  googleLinked?: boolean;
  phone?: string | null;
  phoneVerified?: boolean;
  propertyAccess?: { propertyId: string; role: string }[];
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: (role?: 'PG_OWNER' | 'PG_TENANT' | 'PLATFORM_ADMIN') => void;
  updateUser: (newUser: User) => void;
  isLoading: boolean;
}

export function storageKeysForArea(area: AppArea): { tokenKey: string; userKey: string } {
  if (area === 'resident') return { tokenKey: RESIDENT_TOKEN_KEY, userKey: RESIDENT_USER_KEY };
  if (area === 'admin') return { tokenKey: ADMIN_TOKEN_KEY, userKey: ADMIN_USER_KEY };
  return { tokenKey: OWNER_TOKEN_KEY, userKey: OWNER_USER_KEY };
}

export function storageKeysForRole(role?: string | null): { tokenKey: string; userKey: string } {
  if (role === 'PG_TENANT') return { tokenKey: RESIDENT_TOKEN_KEY, userKey: RESIDENT_USER_KEY };
  if (role === 'PLATFORM_ADMIN') return { tokenKey: ADMIN_TOKEN_KEY, userKey: ADMIN_USER_KEY };
  return { tokenKey: OWNER_TOKEN_KEY, userKey: OWNER_USER_KEY };
}

/** Reads the saved session for the current route area, migrating legacy keys. */
export function readStoredSession(pathname: string): { token: string | null; user: User | null } {
  const area = areaOf(pathname);
  const { tokenKey, userKey } = storageKeysForArea(area);
  let savedToken = localStorage.getItem(tokenKey);
  let savedUser = localStorage.getItem(userKey);

  const legacyToken = localStorage.getItem('token');
  const legacyUser = localStorage.getItem('user');
  if ((!savedToken || !savedUser) && legacyToken && legacyUser) {
    try {
      const legacyAccount = JSON.parse(legacyUser) as User;
      const legacyKeys = storageKeysForRole(legacyAccount.role);
      localStorage.setItem(legacyKeys.tokenKey, legacyToken);
      localStorage.setItem(legacyKeys.userKey, legacyUser);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (legacyKeys.tokenKey === tokenKey) {
        savedToken = legacyToken;
        savedUser = legacyUser;
      }
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }
  if (savedToken && savedUser) {
    try {
      const parsedUser = JSON.parse(savedUser);
      if (typeof parsedUser === 'string' || !parsedUser.id) {
        localStorage.removeItem(tokenKey);
        localStorage.removeItem(userKey);
      } else {
        return { token: savedToken, user: parsedUser };
      }
    } catch {
      localStorage.removeItem(tokenKey);
      localStorage.removeItem(userKey);
    }
  }
  return { token: null, user: null };
}

interface AuthStoreState {
  revision: number;
  bump: () => void;
  login: (newToken: string, newUser: User) => void;
  logoutForArea: (area: AppArea, currentRole?: string | null, explicitRole?: 'PG_OWNER' | 'PG_TENANT' | 'PLATFORM_ADMIN') => void;
  updateUser: (updatedUser: User) => void;
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  revision: 0,
  bump: () => set((s) => ({ revision: s.revision + 1 })),
  login: (newToken, newUser) => {
    const { tokenKey, userKey } = storageKeysForRole(newUser.role);
    localStorage.setItem(tokenKey, newToken);
    localStorage.setItem(userKey, JSON.stringify(newUser));
    set((s) => ({ revision: s.revision + 1 }));
  },
  logoutForArea: (area, currentRole, explicitRole) => {
    const targetRole = explicitRole || currentRole;
    const { tokenKey, userKey } = targetRole ? storageKeysForRole(targetRole) : storageKeysForArea(area);
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    set((s) => ({ revision: s.revision + 1 }));
  },
  updateUser: (updatedUser) => {
    const { userKey } = storageKeysForRole(updatedUser.role);
    localStorage.setItem(userKey, JSON.stringify(updatedUser));
    set((s) => ({ revision: s.revision + 1 }));
  }
}));

export const useAuth = (): AuthContextType => {
  const location = useLocation();
  const area = areaOf(location.pathname);
  const revision = useAuthStore((s) => s.revision);
  const login = useAuthStore((s) => s.login);
  const logoutForArea = useAuthStore((s) => s.logoutForArea);
  const updateUser = useAuthStore((s) => s.updateUser);

  void revision;
  const session = readStoredSession(location.pathname);

  return {
    user: session.user,
    token: session.token,
    login,
    logout: (role) => logoutForArea(area, session.user?.role, role),
    updateUser,
    isLoading: false
  };
};

export function _resetAuthStoreForTests(): void {
  useAuthStore.setState({ revision: 0 });
}
