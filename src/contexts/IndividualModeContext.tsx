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
}

const IndividualModeContext = createContext<IndividualModeContextType | undefined>(undefined);

export const IndividualModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile, getPrimaryRole, loading: authLoading } = useAuthContext();
  const [individualMode, setIndividualModeState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const primaryRole = getPrimaryRole();

  // Only dispatch and afterhours roles can use individual mode
  const canUseIndividualMode = primaryRole === 'dispatch' || primaryRole === 'afterhours';

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
