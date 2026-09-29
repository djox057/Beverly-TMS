import { CompanyLoads } from "./BgLoads";
import { UES_BOOKED_BY_COMPANY_ID } from "@/lib/constants";

const UesLoads = () => (
  <CompanyLoads
    companyId={UES_BOOKED_BY_COMPANY_ID}
    companyName="United Enterprise Solutions INC"
    title="UES Loads"
    storagePrefix="uesLoads"
  />
);

export default UesLoads;
