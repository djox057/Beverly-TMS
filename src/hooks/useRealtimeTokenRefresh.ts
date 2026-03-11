import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps the Supabase realtime WebSocket authenticated by pushing
 * fresh JWT tokens whenever the auth session refreshes.
 *
 * Without this, the persistent WebSocket connection continues using
 * the stale token from initial login and stops receiving events
 * after ~1 hour when the JWT expires.
 */
export function useRealtimeTokenRefresh() {
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        (event === "TOKEN_REFRESHED" ||
          event === "SIGNED_IN" ||
          event === "INITIAL_SESSION") &&
        session?.access_token
      ) {
        console.log(`[RealtimeAuth] Updating realtime token (${event})`);
        supabase.realtime.setAuth(session.access_token);
      }
    });

    return () => subscription.unsubscribe();
  }, []);
}
