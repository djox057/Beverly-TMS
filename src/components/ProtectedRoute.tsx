import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'dispatch' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting';
  excludedRoles?: Array<'dispatch' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting'>;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole, excludedRoles }) => {
  const { user, loading, hasRole, getPrimaryRole } = useAuthContext();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (excludedRoles && excludedRoles.some(role => hasRole(role))) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You don't have permission to access this page.</p>
          <p className="text-sm text-muted-foreground">Your role: {getPrimaryRole() || 'none'}</p>
        </div>
      </div>
    );
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You don't have permission to access this page.</p>
          <p className="text-sm text-muted-foreground mt-2">Required role: {requiredRole}</p>
          <p className="text-sm text-muted-foreground">Your role: {getPrimaryRole() || 'none'}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};