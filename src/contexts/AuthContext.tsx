import React, { createContext, useContext, ReactNode } from 'react';
import { useAuth, UserProfile } from '@/hooks/useAuth';
import { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  roles: ('dispatch' | 'afterhours' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting' | 'maintenance' | 'chicago_management' | 'yard' | 'recruiting')[];
  loading: boolean;
  signUp: (email: string, password: string, fullName?: string, role?: 'dispatch' | 'afterhours' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting' | 'maintenance' | 'chicago_management' | 'yard' | 'recruiting') => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  hasRole: (role: 'dispatch' | 'afterhours' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting' | 'maintenance' | 'chicago_management' | 'yard' | 'recruiting') => boolean;
  getPrimaryRole: () => ('dispatch' | 'afterhours' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting' | 'maintenance' | 'chicago_management' | 'yard' | 'recruiting') | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const auth = useAuth();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};