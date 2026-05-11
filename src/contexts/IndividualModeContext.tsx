import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuthContext } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface IndividualModeContextType {
  individualMode: boolean;
  setIndividualMode: (enabled: boolean) => Promise<void>;
  canUseIndividualMode: boolean;
  isLoading: boolean;
  /** The current user's dispatcher ID (user_id from profile) for filtering */
  currentUserDispatcherId: string | null;
  /**
   * For afterhours users: explicit list of driver IDs from their weekend
   * assignments. When set (and individualMode is on), the Reports scope
   * filters by these driver IDs instead of by dispatcher_id.
   */
  individualOverrideDriverIds: string[] | null;
}

const IndividualModeContext = createContext<IndividualModeContextType | undefined>(undefined);

export const IndividualModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile, getPrimaryRole, loading: authLoading } = useAuthContext();
  const [individualMode, setIndividualModeState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [afterhoursDriverIds, setAfterhoursDriverIds] = useState<string[] | null>(null);

  const primaryRole = getPrimaryRole();

  // Dispatch can always use individual mode.
  // Afterhours can use it only when they have at least one weekend assignment.
  const isDispatch = primaryRole === 'dispatch';
  const isAfterhours = primaryRole === 'afterhours';
  const canUseIndividualMode =
    isDispatch || (isAfterhours && (afterhoursDriverIds?.length ?? 0) > 0);

  // Fetch this afterhours user's weekend assignments (today + upcoming Sat/Sun)
  useEffect(() => {
    if (!isAfterhours || !profile?.user_id) {
      setAfterhoursDriverIds(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      const today = new Date();
      const dow = today.getDay(); // 0=Sun .. 6=Sat
      const daysUntilSat = dow === 6 ? 0 : dow === 0 ? -1 : (6 - dow);
      const sat = new Date(today);
      sat.setDate(today.getDate() + daysUntilSat);
      const sun = new Date(sat);
      sun.setDate(sat.getDate() + 1);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dates = Array.from(new Set([fmt(today), fmt(sat), fmt(sun)]));

      const { data, error } = await supabase
        .from('afterhours_assignments')
        .select('driver_id, scheduled_date')
        .eq('afterhours_user_id', profile.user_id)
        .in('scheduled_date', dates);

      if (cancelled) return;
      if (error) {
        console.error('Failed to load afterhours assignments for individual mode:', error);
        setAfterhoursDriverIds([]);
        return;
      }
      const ids = Array.from(new Set((data || []).map((r: any) => r.driver_id).filter(Boolean)));
      setAfterhoursDriverIds(ids);
    };
    load();
    return () => { cancelled = true; };
  }, [isAfterhours, profile?.user_id]);

  // Load initial state from profile
  useEffect(() => {
    if (authLoading) return;

    if (profile && canUseIndividualMode) {
      // Cast profile to include individual_mode since types may not be updated yet
      const profileWithMode = profile as typeof profile & { individual_mode?: boolean };
      setIndividualModeState(profileWithMode.individual_mode ?? false);
    } else {
      setIndividualModeState(false);
    }
    setIsLoading(false);
  }, [profile, canUseIndividualMode, authLoading]);

  const setIndividualMode = useCallback(async (enabled: boolean) => {
    if (!profile?.user_id || !canUseIndividualMode) return;

    // Optimistic update
    setIndividualModeState(enabled);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ individual_mode: enabled })
        .eq('user_id', profile.user_id);

      if (error) {
        console.error('Failed to update individual mode:', error);
        // Revert on error
        setIndividualModeState(!enabled);
      }
    } catch (err) {
      console.error('Failed to update individual mode:', err);
      // Revert on error
      setIndividualModeState(!enabled);
    }
  }, [profile?.user_id, canUseIndividualMode]);

  // If user can't use individual mode, always return false
  const effectiveIndividualMode = canUseIndividualMode ? individualMode : false;

  return (
    <IndividualModeContext.Provider
      value={{
        individualMode: effectiveIndividualMode,
        setIndividualMode,
        canUseIndividualMode,
        isLoading,
        currentUserDispatcherId: profile?.user_id ?? null,
        individualOverrideDriverIds: isAfterhours ? afterhoursDriverIds : null,
      }}
    >
      {children}
    </IndividualModeContext.Provider>
  );
};

export const useIndividualMode = () => {
  const context = useContext(IndividualModeContext);
  if (context === undefined) {
    throw new Error('useIndividualMode must be used within an IndividualModeProvider');
  }
  return context;
};
