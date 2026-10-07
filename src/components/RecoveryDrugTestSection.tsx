import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type CompanyOption = { id: string; name: string };
type DrugTestCompanyRow = { company_id: string; is_tested: boolean };

export function RecoveryDrugTestSection({
  driverId,
  isRecovery,
  companies,
  canManage,
}: {
  driverId?: string;
  isRecovery: boolean;
  companies: CompanyOption[];
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const companyIds = companies.map((company) => company.id);
  const queryKey = ["recovery-drug-test-companies", driverId, companyIds];
  const { data: rows = [], isLoading, isError } = useQuery({
    queryKey,
    enabled: !!driverId && isRecovery && canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recovery_driver_drug_test_companies")
        .select("company_id, is_tested")
        .eq("driver_id", driverId);
      if (error) throw error;

      const existing = new Set((data ?? []).map((row: DrugTestCompanyRow) => row.company_id));
      const missing = companies.filter((company) => !existing.has(company.id));
      if (missing.length) {
        const { error: seedError } = await supabase
          .from("recovery_driver_drug_test_companies")
          .upsert(missing.map((company) => ({ driver_id: driverId, company_id: company.id, is_tested: false })));
        if (seedError) throw seedError;
        return [...(data ?? []), ...missing.map((company) => ({ company_id: company.id, is_tested: false }))] as DrugTestCompanyRow[];
      }
      return (data ?? []) as DrugTestCompanyRow[];
    },
  });
  const updateTest = useMutation({
    mutationFn: async ({ companyId, isTested }: { companyId: string; isTested: boolean }) => {
      const { error } = await supabase
        .from("recovery_driver_drug_test_companies")
        .upsert({ driver_id: driverId, company_id: companyId, is_tested: isTested });
      if (error) throw error;
      return { companyId, isTested };
    },
    onSuccess: async ({ companyId, isTested }) => {
      queryClient.setQueryData<DrugTestCompanyRow[]>(queryKey, (current = []) =>
        current.map((row) => row.company_id === companyId ? { ...row, is_tested: isTested } : row));
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast({ title: "Could not update drug test", description: error.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (isError) toast({ title: "Could not load company drug tests", variant: "destructive" });
  }, [isError]);

  if (!driverId || !isRecovery || !canManage) return null;

  const checked = new Map(rows.map((row) => [row.company_id, row.is_tested]));
  return (
    <section className="space-y-3 rounded-md border p-4">
      <div>
        <h3 className="font-semibold">Drug Tests by Company</h3>
        <p className="text-sm text-muted-foreground">Check each company where this recovery driver completed a drug test.</p>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading company drug tests…</p> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <div key={company.id} className="flex items-center gap-2">
              <Checkbox
                id={`recovery-drug-test-${driverId}-${company.id}`}
                checked={checked.get(company.id) ?? false}
                disabled={updateTest.isPending}
                onCheckedChange={(value) => updateTest.mutate({ companyId: company.id, isTested: value === true })}
              />
              <Label htmlFor={`recovery-drug-test-${driverId}-${company.id}`} className="cursor-pointer">{company.name}</Label>
            </div>
          ))}
        </div>
      )}
      {companies.length === 0 && !isLoading && <p className="text-sm text-muted-foreground">No companies found.</p>}
    </section>
  );
}
