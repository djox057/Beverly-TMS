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
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      // Work in Chicago time so the day boundary matches the schedules.
      const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const hour = today.getHours();
      const todayStr = fmt(today);
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const yesterdayStr = fmt(yesterday);

      // Only coverage that is live right now counts — never a future weekend or
      // an expired shift, otherwise removed drivers appear to stick around.
      const inShiftWindow = hour >= 16 || hour < 7;

      const [weekendRes, shiftRes] = await Promise.all([
        supabase
          .from('afterhours_assignments')
          .select('driver_id, scheduled_date')
          .eq('afterhours_user_id', profile.user_id)
          .eq('scheduled_date', todayStr)
          .range(0, 4999),
        inShiftWindow
          ? supabase
              .from('afterhours_shift_assignments')
              .select('driver_id, scheduled_date, shift')
              .eq('afterhours_user_id', profile.user_id)
              .in('scheduled_date', [yesterdayStr, todayStr])
              .range(0, 4999)
          : Promise.resolve({ data: [], error: null } as any),
      ]);


      if (cancelled) return;
      if (weekendRes.error || shiftRes.error) {
        console.error(
          'Failed to load afterhours assignments for individual mode:',
          weekendRes.error || shiftRes.error
        );
      }
      const shiftRows = ((shiftRes.data || []) as any[]).filter((r) => {
        if (hour >= 16) return r.scheduled_date === todayStr;
        // early morning: last night's night shift + this morning's shift
        return (
          (r.scheduled_date === yesterdayStr && r.shift === 'night') ||
          (r.scheduled_date === todayStr && r.shift === 'morning')
        );
      });
      const ids = Array.from(
        new Set(
          [...(weekendRes.data || []), ...shiftRows]
            .map((r: any) => r.driver_id)
            .filter(Boolean)
        )
      );
      setAfterhoursDriverIds(ids);
    };

    load();
    return () => { cancelled = true; };
  }, [isAfterhours, profile?.user_id]);

  // Tracks whether the user changed the toggle themselves in this session
  const userToggledRef = React.useRef(false);

  // Load initial state from profile
  useEffect(() => {
    if (authLoading) return;

    if (profile && canUseIndividualMode) {
      // Cast profile to include individual_mode since types may not be updated yet
      const profileWithMode = profile as typeof profile & { individual_mode?: boolean };
      const stored = profileWithMode.individual_mode ?? false;
      // Afterhours coverage is an explicit driver list, so scope to it by default —
      // same behaviour as weekend coverage. The user can still switch it off.
      const autoOn =
        isAfterhours && !userToggledRef.current && (afterhoursDriverIds?.length ?? 0) > 0;
      setIndividualModeState(stored || autoOn);
    } else {
      setIndividualModeState(false);
    }
    setIsLoading(false);
  }, [profile, canUseIndividualMode, authLoading, isAfterhours, afterhoursDriverIds]);


  const setIndividualMode = useCallback(async (enabled: boolean) => {
    if (!profile?.user_id || !canUseIndividualMode) return;

    userToggledRef.current = true;
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
