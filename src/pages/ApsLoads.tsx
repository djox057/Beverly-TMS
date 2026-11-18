import { CompanyLoads } from "./BgLoads";
import { useCompanies } from "@/hooks/useCompanies";
import { Button } from "@/components/ui/button";

const COMPANY_NAME = "AP Silver Trans LLC";

const ApsLoads = () => {
  const { data: companies, isPending, isError, refetch } = useCompanies();
  const company = companies?.find((company) => company.name === COMPANY_NAME);

  // Do not mount the loads queries until their booking-company scope is known.
  if (isPending) {
    return <div className="p-6" role="status">Loading APS Loads...</div>;
  }

  if (isError || !company) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">APS Loads</h1>
        <p role="alert">{isError ? "Unable to load companies." : "AP Silver Trans LLC could not be found."}</p>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <CompanyLoads
      companyId={company.id}
      companyName={COMPANY_NAME}
      title="APS Loads"
      storagePrefix="apsLoads"
    />
  );
};

export default ApsLoads;
