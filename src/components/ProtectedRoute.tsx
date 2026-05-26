import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

type AppRole = 'dispatch' | 'afterhours' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting' | 'maintenance' | 'chicago_management' | 'yard' | 'recruiting' | 'claims';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: AppRole;
  excludedRoles?: AppRole[];
  allowedRoles?: AppRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole, excludedRoles, allowedRoles }) => {
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

  // Check excluded roles using getPrimaryRole to avoid hasRole's privilege escalation
  const primaryRole = getPrimaryRole();
  if (excludedRoles && primaryRole && excludedRoles.includes(primaryRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You don't have permission to access this page.</p>
          <p className="text-sm text-muted-foreground">Your role: {primaryRole}</p>
        </div>
      </div>
    );
  }

  // Check allowed roles - user must have at least one of the allowed roles
  if (allowedRoles && allowedRoles.length > 0) {
    const hasAllowedRole = allowedRoles.some(role => hasRole(role));
    if (!hasAllowedRole) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to access this page.</p>
            <p className="text-sm text-muted-foreground mt-2">Required roles: {allowedRoles.join(', ')}</p>
            <p className="text-sm text-muted-foreground">Your role: {primaryRole || 'none'}</p>
          </div>
        </div>
      );
    }
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