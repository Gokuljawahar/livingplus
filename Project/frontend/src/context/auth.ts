import { createContext, useContext } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  profileImage?: string;
  propertyAccess?: { propertyId: string; role: string }[];
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: (role?: 'PG_OWNER' | 'PG_TENANT') => void;
  updateUser: (newUser: User) => void;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
