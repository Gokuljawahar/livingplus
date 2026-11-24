import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ADMIN_TOKEN_KEY,
  ADMIN_USER_KEY,
  OWNER_TOKEN_KEY,
  OWNER_USER_KEY,
  RESIDENT_TOKEN_KEY,
  RESIDENT_USER_KEY
} from '../utils/session';
import { AuthContext, type User } from './auth';
import { areaOf, type AppArea } from '../utils/app-areas';

function storageKeysForArea(area: AppArea): { tokenKey: string; userKey: string } {
  if (area === 'resident') return { tokenKey: RESIDENT_TOKEN_KEY, userKey: RESIDENT_USER_KEY };
  if (area === 'admin') return { tokenKey: ADMIN_TOKEN_KEY, userKey: ADMIN_USER_KEY };
  return { tokenKey: OWNER_TOKEN_KEY, userKey: OWNER_USER_KEY };
}

function storageKeysForRole(role?: string | null): { tokenKey: string; userKey: string } {
  if (role === 'PG_TENANT') return { tokenKey: RESIDENT_TOKEN_KEY, userKey: RESIDENT_USER_KEY };
  if (role === 'PLATFORM_ADMIN') return { tokenKey: ADMIN_TOKEN_KEY, userKey: ADMIN_USER_KEY };
  return { tokenKey: OWNER_TOKEN_KEY, userKey: OWNER_USER_KEY };
}

/** Reads the saved session for the current route area, migrating legacy keys. */
function readStoredSession(pathname: string): { token: string | null; user: User | null } {
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const area = areaOf(location.pathname);
  // Bump after login/logout/update so memo re-reads storage cleanly.
  const [revision, setRevision] = useState(0);
  const session = useMemo(() => {
    void revision;
    return readStoredSession(location.pathname);
  }, [location.pathname, area, revision]);

  const login = (newToken: string, newUser: User) => {
    const { tokenKey, userKey } = storageKeysForRole(newUser.role);
    localStorage.setItem(tokenKey, newToken);
    localStorage.setItem(userKey, JSON.stringify(newUser));
    setRevision((n) => n + 1);
  };

  const logout = (role?: 'PG_OWNER' | 'PG_TENANT' | 'PLATFORM_ADMIN') => {
    const targetRole = role || session.user?.role;
    const { tokenKey, userKey } = targetRole ? storageKeysForRole(targetRole) : storageKeysForArea(area);
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    setRevision((n) => n + 1);
  };

  const updateUser = (updatedUser: User) => {
    const { userKey } = storageKeysForRole(updatedUser.role);
    localStorage.setItem(userKey, JSON.stringify(updatedUser));
    setRevision((n) => n + 1);
  };

  return (
    <AuthContext.Provider value={{ user: session.user, token: session.token, login, logout, updateUser, isLoading: false }}>
      {children}
    </AuthContext.Provider>
  );
};
