import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCompanyBackgroundColor } from "@/pages/Reports/helpers";
import { CompanyCoiSection } from "@/components/info/CompanyCoiSection";
import { useCompanyInfoCredentials } from "@/hooks/useCompanyInfoCredentials";

type Cred = { user: string; password: string };

type Company = {
  name: string;
  mc?: string;
  dot?: string;
  ein?: string;
  phone?: string;
  address?: string;
  dispatchMail?: Cred;
  transitTracking?: Cred;
  efs?: Cred;
  wex?: Cred;
  truckStop?: Cred;
  eldLogs?: Cred;
  eldLiveTracking?: Cred;
  samsaraInsured?: Cred;
  samsaraOther?: Cred;
  samsaraTrailers?: Cred;
  note?: string;
};

const companies: Company[] = [
  {
    name: "BF PRIME LLC"
  },
  {
    name: "AP SILVER TRANS LLC"
  },
  {
    name: "Beverly Freight INC"
  },
  {
    name: "UNITED ENTERPRISE SOLUTIONS INC"
  },
  {
    name: "BG PRIME INC"
  },
  {
    name: "LALE Transport LLC"
  },
  {
    name: "Jones Freight Lines LLC"
  },
  {
    name: "GD Trucking Solutions LLC",
    note: "Operating company only"
  },
  {
    name: "Hart Freight Solutions LLC",
    note: "Operating company only"
  }
];

const inspectionEmails = [
  "safety@bfprime.net",
  "Tommy@beverlyfreight.net",
  "ross.m@beverlyfreight.net",
  "Bob.i@bfprime.net",
];

const accidentEmails = [
  "claims@bfprime.net",
  "Tommy@beverlyfreight.net",
  "ross.m@beverlyfreight.net",
  "Bob.i@bfprime.net",
];

const twoWeekNoticeEmails = [
  "accounting@bfprime.net",
  "ap@beverlyfreight.net",
  "accounting@bgprime.net",
  "accounting@unitedenterprisesolutions.net",
  "accounting@bfprimeunited.net",
  "accounting@apsilvertrans.net",
];

const extensions = [
  { name: "Accounting", ext: "1" },
  { name: "Dispatch", ext: "2" },
  { name: "Safety", ext: "3" },
  { name: "Recruiting", ext: "4" },
  { name: "Claims", ext: "6" },
  { name: "Maintenance", ext: "11" },
  { name: "ELD", ext: "8" },
];

const reps: { mc: string; name: string; contact: string; note?: string }[] = [
  { mc: "595216", name: "PEPSI LOGISTICS COMPANY INC", contact: "alanmccall1234@gmail.com" },
  { mc: "945637", name: "EMERGE TRANSPORTATION", contact: "chadwomack3@gmail.com" },
  {
    mc: "511639",
    name: "ECHO GLOBAL LOGISTICS, INC.",
    contact: "djohnsenecho@gmail.com",
    note: "Samo na Beverly Freight",
  },
  { mc: "304386", name: "BLUE-GRACE LOGISTICS LLC", contact: "hhaakerbg@gmail.com" },
  { mc: "412533", name: "Redwood", contact: "kendalloliver1994@gmail.com" },
  { mc: "131029", name: "C.H. ROBINSON COMPANY, LLC", contact: "mcarusiello99@gmail.com" },
  { mc: "23783", name: "MOLO SOLUTIONS, LLC", contact: "matthew.robbinsarcb@gmail.com" },
  { mc: "711250", name: "AVENUE LOGISTICS, LLC", contact: "cnieto@avenuelogistics.com" },
  { mc: "508966", name: "VENTURE CONNECT LLC", contact: "coopruss92@gmail.com" },
  { mc: "878933", name: "JAKE TRANS, LLC", contact: "nemanja@jaketrans.com" },
  { mc: "872918", name: "LOADSMART, INC", contact: "andrija.aleksandric@loadsmart.com" },
  { mc: "567093", name: "NOLAN TRANSPORTATION GROUP, LLC", contact: "W3IRDH0NG0@gmail.com" },
  { mc: "133655", name: "SCHNEIDER NATIONAL INC", contact: "Jortiz.2014.JO@gmail.com" },
  { mc: "702342", name: "TRANSPORTATION ONE, LLC", contact: "mlattner@transportationone.com" },
  { mc: "33945", name: "FLOCK FREIGHT, INC.", contact: "ryan.offman@flockfreight.com" },
  { mc: "256862", name: "TRAFFIC TECH INC.", contact: "Derdman1993@gmail.com" },
  { mc: "197598", name: "GRANE LOGISTICS EXPRESS LLC", contact: "dstojkovic.grane@gmail.com" },
  { mc: "555609", name: "ARMSTRONG TRANSPORT GROUP, LLC", contact: "sullivanjohnson23@gmail.com" },
  { mc: "1096595", name: "ATN LLC", contact: "frank@atnglobal.com" },
  { mc: "\u2014", name: "LIV Enterprises INC", contact: "danny@liventerprises.com" },
  { mc: "644047", name: "BMM LOGISTICS INC.", contact: "sladjanzec14@gmail.com" },
];

type Portal = { mc: string; name: string; user: string; password: string; rep?: string };

const Field = ({ label, value }: { label: string; value?: string }) => (
  <div className="flex gap-2 text-sm">
    <span className="text-black font-semibold min-w-[120px]">{label}</span>
    <span className="font-medium break-all">{value || "—"}</span>
  </div>
);

const CredRow = ({ label, cred }: { label: string; cred?: Cred }) =>
  cred ? <Field label={label} value={`${cred.user || "\u2014"} / ${cred.password || "\u2014"}`} /> : null;

const CompanyCard = ({ c }: { c: Company }) => (
  <Card className="p-4 space-y-2 select-text border-2" style={{ ...getCompanyBackgroundColor(c.name) }}>
    <h3 className="font-semibold text-base border-b border-current/30 pb-2">
      {c.name}
      {c.note && <span className="ml-2 text-xs font-normal italic">({c.note})</span>}
    </h3>
    <Field label="MC#" value={c.mc} />
    <Field label="DOT#" value={c.dot} />
    <Field label="EIN" value={c.ein} />
    <Field label="Phone" value={c.phone} />
    <Field label="Address" value={c.address} />
    <div className="pt-2 border-t space-y-1">
      <CredRow label="Dispatch mail" cred={c.dispatchMail} />
      <CredRow label="Transit Tracking" cred={c.transitTracking} />
      <CredRow label="EFS" cred={c.efs} />
      <CredRow label="WEX" cred={c.wex} />
      <CredRow label="Truck stop" cred={c.truckStop} />
      <CredRow label="ELD - Logs" cred={c.eldLogs} />
      <CredRow label="ELD - Live Track" cred={c.eldLiveTracking} />
      <CredRow label="Samsara osigurani" cred={c.samsaraInsured} />
      <CredRow label="Samsara ostali" cred={c.samsaraOther} />
      <CredRow label="Samsara prikolice" cred={c.samsaraTrailers} />
    </div>
    <CompanyCoiSection companyName={c.name} />
  </Card>
);

export default function Info() {
  const { data: companyCredentials, isLoading, isError, refetch } = useCompanyInfoCredentials();
  const sharedAccounts = companyCredentials?.["bf prime llc"]?.sharedAccounts ?? [];
  const portalsByCompany: { company: string; portals: Portal[] }[] = [
    { company: "BF PRIME LLC", portals: companyCredentials?.["bf prime llc"]?.portals ?? [] },
    { company: "BEVERLY FREIGHT INC", portals: companyCredentials?.["beverly freight inc"]?.portals ?? [] },
  ];
  return (
    <div className="p-6 space-y-4 max-w-[1600px] mx-auto">
      <h1 className="text-2xl font-bold">Info</h1>
      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company">Company Info</TabsTrigger>
          <TabsTrigger value="reps">Reprezentativi</TabsTrigger>
          <TabsTrigger value="portals">Portali</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Loading company account details…</p>}
          {isError && (
            <p role="alert" className="text-sm text-destructive">
              Unable to load company account details.{' '}
              <button type="button" className="underline" onClick={() => refetch()}>Retry</button>
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {companies.map((c) => (
              <CompanyCard key={c.name} c={{ ...c, ...companyCredentials?.[c.name.toLowerCase()] }} />
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4 select-text">
              <h3 className="font-semibold mb-2">Shared accounts</h3>
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Service</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead className="w-[180px]">Password</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sharedAccounts.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell>{s.label}</TableCell>
                      <TableCell className="break-all">{s.user || "—"}</TableCell>
                      <TableCell className="break-all">{s.password}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <div className="space-y-4">
              <Card className="p-4 select-text">
                <h3 className="font-semibold mb-2">Phone Extensions — (574) 544-5447</h3>
                <div className="grid grid-cols-2 gap-1 text-sm">
                  {extensions.map((e) => (
                    <div key={e.ext} className="flex justify-between border-b py-1">
                      <span>{e.name}</span>
                      <span className="font-mono">EXT {e.ext}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-4 select-text">
                <h3 className="font-semibold mb-2">Inspection emails</h3>
                <ul className="text-sm space-y-1">
                  {inspectionEmails.map((e) => (
                    <li key={e} className="break-all">
                      {e}
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="p-4 select-text">
                <h3 className="font-semibold mb-2">Accident emails</h3>
                <ul className="text-sm space-y-1">
                  {accidentEmails.map((e) => (
                    <li key={e} className="break-all">
                      {e}
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="p-4 select-text">
                <h3 className="font-semibold mb-2">2-week notice emails</h3>
                <ul className="text-sm space-y-1">
                  {twoWeekNoticeEmails.map((e) => (
                    <li key={e} className="break-all">
                      {e}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="reps">
          <Card className="p-4 select-text">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">MC#</TableHead>
                  <TableHead className="w-[320px]">Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="w-[240px]">Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reps.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-mono">{r.mc}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="break-all">{r.contact}</TableCell>
                    <TableCell className="text-muted-foreground">{r.note || ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="portals" className="space-y-4">
          {portalsByCompany.map((g) => (
            <Card
              key={g.company}
              className="p-4 select-text border-2"
              style={{ ...getCompanyBackgroundColor(g.company) }}
            >
              <h3 className="font-semibold mb-2">{g.company}</h3>
              {g.portals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No portals listed.</p>
              ) : (
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">MC#</TableHead>
                      <TableHead className="w-[240px]">Name</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="w-[200px]">Password</TableHead>
                      <TableHead className="w-[180px]">Rep</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.portals.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono">{p.mc || "—"}</TableCell>
                        <TableCell>{p.name}</TableCell>
                        <TableCell className="break-all">{p.user}</TableCell>
                        <TableCell className="break-all">{p.password}</TableCell>
                        <TableCell>{p.rep || ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
