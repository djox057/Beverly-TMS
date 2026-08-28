import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const normalizeVin = (vin?: string | null): string =>
  String(vin ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export type CoiVinRow = { company_name: string; vin: string };

/**
 * All VINs listed on uploaded COI documents, keyed by normalized VIN.
 * A truck is considered insured when its VIN appears on a company's COI.
 */
export const useCoiInsuredVins = () => {
  const query = useQuery({
    queryKey: ["coi-insured-vins"],
    queryFn: async (): Promise<CoiVinRow[]> => {
      const { data, error } = await supabase
        .from("company_coi_vins")
        .select("company_name, vin");
      if (error) throw error;
      return (data as CoiVinRow[]) || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const vinToCompany = new Map<string, string>();
  for (const row of query.data || []) {
    vinToCompany.set(normalizeVin(row.vin), row.company_name);
  }

  return {
    ...query,
    vinToCompany,
    isInsured: (vin?: string | null) => {
      const key = normalizeVin(vin);
      return key ? vinToCompany.has(key) : false;
    },
    insuredCompanyForVin: (vin?: string | null) => {
      const key = normalizeVin(vin);
      return key ? vinToCompany.get(key) ?? null : null;
    },
  };
};
