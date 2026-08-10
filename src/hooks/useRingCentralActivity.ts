import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface RcCallTotals {
  total: number;
  inbound: number;
  outbound: number;
  answered: number;
  missed: number;
  totalDurationSeconds: number;
  liveTalkSeconds: number;
  averageAnsweredDurationSeconds: number;
}

export interface RcMessageTotals {
  total: number;
  inbound: number;
  outbound: number;
  failed: number;
}

export interface RcExtensionRow {
  extensionId: string;
  label: string;
  phoneNumber: string | null;
  userId: string | null;
  calls: RcCallTotals;
  messages: RcMessageTotals;
}

export interface RcActivityResponse {
  period: { from: string; to: string; timezone: string };
  phoneNumber: string | null;
  extensionId: string | null;
  calls: RcCallTotals;
  messages: RcMessageTotals;
  byExtension: RcExtensionRow[];
  daily: Array<{ date: string; calls: RcCallTotals; messages: RcMessageTotals }>;
  extensions: Array<{
    rc_extension_id: string;
    extension_number: string | null;
    rc_name: string | null;
    primary_phone_number: string | null;
    user_id: string | null;
    match_method: string;
    is_active: boolean;
  }>;
  sync: {
    lastSuccessfulSync: string | null;
    lastAttemptedSync: string | null;
    status: string;
    errorCategory: string | null;
    errorMessage: string | null;
  };
}

export interface RcActivityParams {
  dateFrom: string;
  dateTo: string;
  userId?: string | null;
  extensionId?: string | null;
  phoneNumber?: string | null;
  externalNumber?: string | null;
  enabled?: boolean;
}

/** Phone analytics are restricted to admin and manager roles. */
export const useCanViewPhoneActivity = () => {
  const { roles } = useAuth();
  return roles.includes("admin") || roles.includes("manager");
};

export const useRingCentralActivity = (params: RcActivityParams) => {
  const canView = useCanViewPhoneActivity();
  const enabled = (params.enabled ?? true) && canView;

  return useQuery<RcActivityResponse>({
    queryKey: [
      "ringcentral-activity",
      params.dateFrom,
      params.dateTo,
      params.userId ?? null,
      params.extensionId ?? null,
      params.phoneNumber ?? null,
      params.externalNumber ?? null,
    ],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ringcentral-activity", {
        body: {
          dateFrom: params.dateFrom,
          dateTo: params.dateTo,
          userId: params.userId ?? null,
          extensionId: params.extensionId ?? null,
          phoneNumber: params.phoneNumber ?? null,
          externalNumber: params.externalNumber ?? null,
        },
      });
      if (error) throw error;
      return data as RcActivityResponse;
    },
  });
};

/**
 * One request that returns per-extension totals for the whole account, mapped
 * by Beverly user id so dispatcher cards can render badges without N requests.
 */
export const useRingCentralActivityByUser = (dateFrom: string, dateTo: string) => {
  const query = useRingCentralActivity({ dateFrom, dateTo });

  const byUser = new Map<string, { calls: RcCallTotals; messages: RcMessageTotals }>();
  for (const row of query.data?.byExtension ?? []) {
    if (!row.userId) continue;
    const existing = byUser.get(row.userId);
    if (!existing) {
      byUser.set(row.userId, { calls: { ...row.calls }, messages: { ...row.messages } });
      continue;
    }
    // A user may own more than one extension.
    existing.calls.total += row.calls.total;
    existing.calls.inbound += row.calls.inbound;
    existing.calls.outbound += row.calls.outbound;
    existing.calls.answered += row.calls.answered;
    existing.calls.missed += row.calls.missed;
    existing.calls.totalDurationSeconds += row.calls.totalDurationSeconds;
    existing.calls.liveTalkSeconds += row.calls.liveTalkSeconds;
    existing.messages.total += row.messages.total;
    existing.messages.inbound += row.messages.inbound;
    existing.messages.outbound += row.messages.outbound;
    existing.messages.failed += row.messages.failed;
  }

  return { ...query, byUser };
};