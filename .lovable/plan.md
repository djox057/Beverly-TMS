

## Plan: Fix Realtime JWT Token Refresh

### Problem
Realtime WebSocket stops receiving updates ~1 hour after login because the JWT auto-refreshes for REST calls but the persistent WebSocket keeps using the stale token.

### Implementation

**New file: `src/hooks/useRealtimeTokenRefresh.ts`**
- Listen to `supabase.auth.onAuthStateChange` for `TOKEN_REFRESHED`, `SIGNED_IN`, and `INITIAL_SESSION` events
- Call `supabase.realtime.setAuth(session.access_token)` with the fresh token
- Return cleanup subscription in useEffect
- Add debug log with event name for production diagnostics

**Modified file: `src/App.tsx`**
- Import and call `useRealtimeTokenRefresh()` inside `AppContent` (top-level, before routes)

### Technical Detail

```typescript
// src/hooks/useRealtimeTokenRefresh.ts
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useRealtimeTokenRefresh() {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        (event === "TOKEN_REFRESHED" || event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
        session?.access_token
      ) {
        console.log(`[RealtimeAuth] Updating realtime token (${event})`);
        supabase.realtime.setAuth(session.access_token);
      }
    });

    return () => subscription.unsubscribe();
  }, []);
}
```

No database changes. No channel teardown needed — all existing realtime hooks share the same `supabase` singleton and benefit automatically.

