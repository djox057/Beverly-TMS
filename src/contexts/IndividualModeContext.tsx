import { getAfterhoursShiftTime } from '@/lib/afterhoursShiftTime';
import { isDispatcherRole } from "@/lib/dispatchAccess";
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuthContext } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();
  const modeRef = React.useRef(false);
  const initializedUserRef = React.useRef<string | null>(null);
  const autoInitializedRef = React.useRef(false);
  const saveQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const changeVersionRef = React.useRef(0);
  const savedModesRef = React.useRef(new Map<string, boolean>());
  const activeUserRef = React.useRef(profile?.user_id);
  activeUserRef.current = profile?.user_id;

  const primaryRole = getPrimaryRole();

  // Dispatch can always use individual mode.
  // Afterhours can use it only when they have at least one weekend assignment.
  const isDispatch = isDispatcherRole(primaryRole);
  const isAfterhours = primaryRole === 'afterhours';
  const canUseIndividualMode =
    isDispatch || (isAfterhours && (afterhoursDriverIds?.length ?? 0) > 0);

  // Fetch this afterhours user's weekend assignments (today + upcoming Sat/Sun)
  useEffect(() => {
    setAfterhoursDriverIds(null);
    if (!isAfterhours || !profile?.user_id) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      // Weekend coverage keeps Chicago dates; afterhours shifts use Serbia time.
      const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const todayStr = fmt(today);
      const shiftTime = getAfterhoursShiftTime();

      const [weekendRes, shiftRes] = await Promise.all([
        supabase
          .from('afterhours_assignments')
          .select('driver_id, scheduled_date')
          .eq('afterhours_user_id', profile.user_id)
          .eq('scheduled_date', todayStr)
          .range(0, 4999),
        shiftTime.shift
          ? supabase
              .from('afterhours_shift_assignments')
              .select('driver_id, scheduled_date, shift')
              .eq('afterhours_user_id', profile.user_id)
              .in('scheduled_date', [shiftTime.yesterday, shiftTime.today])
              .range(0, 4999)
          : Promise.resolve({ data: [], error: null } as any),
      ]);


      if (cancelled) return;
      if (weekendRes.error || shiftRes.error) {
        console.error(
          'Failed to load afterhours assignments for individual mode:',
          weekendRes.error || shiftRes.error
        );
        // A failed refresh is not evidence that coverage was removed.
        return;
      }
      const shiftRows = ((shiftRes.data || []) as any[]).filter(r =>
        r.shift === shiftTime.shift && r.scheduled_date === shiftTime.scheduledDate);
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
    const refresh = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(refresh); };
  }, [isAfterhours, profile?.user_id]);

  // Tracks whether the user changed the toggle themselves in this session
  const userToggledRef = React.useRef(false);

  // Initialize once per account. Profile/token and assignment refreshes must not
  // overwrite a user's in-session choice with a stale profile preference.
  useEffect(() => {
    if (authLoading) return;
    const userId = profile?.user_id ?? null;
    if (initializedUserRef.current !== userId) {
      initializedUserRef.current = userId;
      userToggledRef.current = false;
      autoInitializedRef.current = false;
      changeVersionRef.current += 1;
      modeRef.current = profile?.individual_mode ?? false;
      setIndividualModeState(modeRef.current);
    }
    if (isAfterhours && canUseIndividualMode && !autoInitializedRef.current) {
      autoInitializedRef.current = true;
      if (!userToggledRef.current) {
        modeRef.current = true;
        setIndividualModeState(true);
      }
    }
    setIsLoading(false);
  }, [profile, canUseIndividualMode, authLoading, isAfterhours, afterhoursDriverIds]);


  const setIndividualMode = useCallback(async (enabled: boolean) => {
    if (!profile?.user_id || !canUseIndividualMode) return;

    userToggledRef.current = true;
    const userId = profile.user_id;
    if (!savedModesRef.current.has(userId)) savedModesRef.current.set(userId, modeRef.current);
    const version = ++changeVersionRef.current;
    modeRef.current = enabled;
    // Optimistic update
    setIndividualModeState(enabled);


    // Serialize writes so rapid clicks cannot persist in reverse order.
    const save = saveQueueRef.current.then(async () => {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ individual_mode: enabled })
          .eq('user_id', userId);

        if (error) {
          throw error;
        }
        savedModesRef.current.set(userId, enabled);
      } catch (err) {
        console.error('Failed to update individual mode:', err);
        if (activeUserRef.current === userId && changeVersionRef.current === version) {
          const previous = savedModesRef.current.get(userId) ?? false;
          modeRef.current = previous;
          setIndividualModeState(previous);
          toast({ title: 'Could not save Individual Mode', description: 'Your previous setting has been restored. Please try again.', variant: 'destructive' });
        }
      }
    });
    saveQueueRef.current = save;
    await save;
  }, [profile?.user_id, canUseIndividualMode, toast]);

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
