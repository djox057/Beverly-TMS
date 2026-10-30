import { useQuery } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export type CompanyCredentials = Partial<Record<
  "dispatchMail" | "transitTracking" | "efs" | "wex" | "truckStop" |
  "eldLogs" | "eldLiveTracking" | "samsaraInsured" | "samsaraOther" | "samsaraTrailers",
  { user: string; password: string }
>>;

type CompanyInfoDetails = CompanyCredentials & Partial<Record<
  "mc" | "dot" | "ein" | "phone" | "address", string
>> & {
  sharedAccounts?: { label: string; user: string; password: string }[];
  portals?: { mc: string; name: string; user: string; password: string; rep?: string }[];
};

// Company profiles and passwords are fetched after authentication, never shipped in source.
export const useCompanyInfoCredentials = () => {
  const { user } = useAuthContext();
  return useQuery({
    queryKey: ["company-info-credentials", user?.id],
    enabled: !!user,
    gcTime: 0,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_info_credentials")
        .select("company_name, credentials");
      if (error) throw new Error("Unable to load company account details");
      return Object.fromEntries((data || []).map(row => [
        row.company_name.toLowerCase(), row.credentials as CompanyInfoDetails,
      ]));
    },
  });
};
