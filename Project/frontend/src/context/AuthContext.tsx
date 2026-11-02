import React, { createContext, useContext, useState, useEffect } from 'react';
import { OWNER_TOKEN_KEY, OWNER_USER_KEY, RESIDENT_TOKEN_KEY, RESIDENT_USER_KEY } from '../utils/session';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  profileImage?: string;
  propertyAccess?: { propertyId: string; role: string }[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: (role?: 'PG_OWNER' | 'PG_TENANT') => void;
  updateUser: (newUser: User) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const residentRoute = window.location.pathname === '/resident' || window.location.pathname.startsWith('/pg/resident');
    let savedToken = localStorage.getItem(residentRoute ? RESIDENT_TOKEN_KEY : OWNER_TOKEN_KEY);
    let savedUser = localStorage.getItem(residentRoute ? RESIDENT_USER_KEY : OWNER_USER_KEY);
    const legacyToken = localStorage.getItem('token');
    const legacyUser = localStorage.getItem('user');
    if ((!savedToken || !savedUser) && legacyToken && legacyUser) {
      try {
        const legacyAccount = JSON.parse(legacyUser) as User;
        const resident = legacyAccount.role === 'PG_TENANT';
        const tokenKey = resident ? RESIDENT_TOKEN_KEY : OWNER_TOKEN_KEY;
        const userKey = resident ? RESIDENT_USER_KEY : OWNER_USER_KEY;
        localStorage.setItem(tokenKey, legacyToken);
        localStorage.setItem(userKey, legacyUser);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (residentRoute === resident) {
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
          // Corrupted state (e.g. token saved as user)
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
        } else {
          setToken(savedToken);
          setUser(parsedUser);
        }
      } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = (newToken: string, newUser: User) => {
    const resident = newUser.role === 'PG_TENANT';
    const tokenKey = resident ? RESIDENT_TOKEN_KEY : OWNER_TOKEN_KEY;
    const userKey = resident ? RESIDENT_USER_KEY : OWNER_USER_KEY;
    localStorage.setItem(tokenKey, newToken);
    localStorage.setItem(userKey, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = (role?: 'PG_OWNER' | 'PG_TENANT') => {
    const resident = (role || user?.role) === 'PG_TENANT';
    setToken(null);
    setUser(null);
    localStorage.removeItem(resident ? RESIDENT_TOKEN_KEY : OWNER_TOKEN_KEY);
    localStorage.removeItem(resident ? RESIDENT_USER_KEY : OWNER_USER_KEY);
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    const userKey = updatedUser.role === 'PG_TENANT' ? RESIDENT_USER_KEY : OWNER_USER_KEY;
    localStorage.setItem(userKey, JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
