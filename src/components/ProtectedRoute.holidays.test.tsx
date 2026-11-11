import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { HOLIDAYS_ROLES } from '@/lib/holidays';
import type { UserRole } from '@/hooks/useAuth';

const auth = vi.hoisted(() => ({ role: 'dispatch' as UserRole }));
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({
  user: { id: 'test' }, loading: false, getPrimaryRole: () => auth.role,
  // Deliberately simulate inherited access: strict checks must ignore this.
  hasRole: () => true,
}) }));
afterEach(cleanup);
it.each(['admin', 'manager', 'supervisor', 'dispatch', 'afterhours', 'accounting', 'safety', 'claims', 'maintenance', 'chicago_management', 'yard', 'recruiting', 'driver'] as const)('protects holiday deep links for %s even with inherited manager access', role => {
  auth.role = role;
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ProtectedRoute strictAllowedRoles={HOLIDAYS_ROLES}><div>Private holiday notes</div></ProtectedRoute></MemoryRouter>);
  if (role === 'admin' || role === 'manager') expect(screen.getByText('Private holiday notes')).toBeInTheDocument();
  else { expect(screen.queryByText('Private holiday notes')).not.toBeInTheDocument(); expect(screen.getByText('Access Denied')).toBeInTheDocument(); }
});
