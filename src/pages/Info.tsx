import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCompanyBackgroundColor } from "@/pages/Reports/helpers";
import { CompanyCoiSection } from "@/components/info/CompanyCoiSection";


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
    name: "BF PRIME LLC",
    mc: "1130637",
    dot: "3462417",
    ein: "85-1486023",
    phone: "(574) 544-5447",
    address: "2901 Carlson Dr #300 L, Hammond IN 46323",
    dispatchMail: { user: "dispatch.old@bfprime.net", password: "Prototips$1099" },
    efs: { user: "BFPRIMELLC", password: "Kragujevac123" },
    wex: { user: "dispatch@bfprime.net", password: "Kragujevac@2026" },
    truckStop: { user: "dispatch@bfprime.net", password: "Kragujevac@2025" },
    eldLogs: { user: "BFPrime", password: "123456" },
    eldLiveTracking: { user: "BFPRIME1", password: "123456" },
    samsaraInsured: { user: "accounting@bfprime.net", password: "Bfprime123" },
    samsaraOther: { user: "dispatch@bfprime.net", password: "Dispatchbf123" },
    samsaraTrailers: { user: "dispatch.old@beverlyfreight.net", password: "dispatch.old" },
  },
  {
    name: "AP SILVER TRANS LLC",
    mc: "1770262",
    dot: "4481860",
    address: "100 SAUNDERS ROAD UNIT 192, LAKE FOREST, IL 60045",
    dispatchMail: { user: "dispatch@apsilvertrans.net", password: "Egolastop@332$" },
    transitTracking: { user: "APsliver", password: "123456" },
    efs: { user: "APSILVERTRANSLLC", password: "Sreda2025" },
    wex: { user: "dispatch@apsilvertrans.net", password: "Sreda2025" },
    eldLogs: { user: "APSilver", password: "123456" },
    eldLiveTracking: { user: "APSILVER1", password: "123456" },
    samsaraInsured: { user: "Dispatch@apsilvertrans.net", password: "Kragujevac034" },
    samsaraOther: { user: "dispatch@bfprime.net", password: "Dispatchbf123" },
    samsaraTrailers: { user: "dispatch.old@beverlyfreight.net", password: "dispatch.old" },
  },
  {
    name: "Beverly Freight INC",
    mc: "027435",
    dot: "3007731",
    ein: "36-5058802",
    phone: "(847) 857-6129",
    address: "5665 W 120th St, Alsip, IL 60803",
    dispatchMail: { user: "dispatch.old@beverlyfreight.net", password: "Registration@123" },
    efs: { user: "BEVERLYFREIGHTINC", password: "Beograd567" },
    wex: { user: "dispatch@beverlyfreight.net", password: "Beograd@123456" },
    truckStop: { user: "BEVERLYFREIGHTINC", password: "Kragujevac@2026" },
    eldLogs: { user: "bgprime2", password: "123456" },
    eldLiveTracking: { user: "beverly1", password: "123456" },
    samsaraInsured: { user: "dispatch@beverlyfreight.net", password: "Kgjenajjaci" },
    samsaraOther: { user: "zack@beverlyfreight.net", password: "Kragujevac123" },
    samsaraTrailers: { user: "dispatch.old@beverlyfreight.net", password: "dispatch.old" },
  },
  {
    name: "UNITED ENTERPRISE SOLUTIONS INC",
    mc: "1423086",
    dot: "3879749",
    address: "2340 S RIVER RD STE # 230 DES PLAINES IL 60018",
    dispatchMail: { user: "Dispatch@unitedenterprisesolutions.net", password: "Draloye@5588" },
    transitTracking: { user: "unitedenterprise", password: "123456" },
    efs: { user: "UNITEDENTERPRISEINC", password: "Ponedeljak2025" },
    wex: { user: "dispatch@unitedenterprisesolutions.net", password: "Ponedeljak2025" },
    eldLogs: { user: "united1", password: "123456" },
    eldLiveTracking: { user: "united", password: "123456" },
    samsaraInsured: { user: "Dispatch@unitedenterprisesolutions.net", password: "Registration@123" },
    samsaraOther: { user: "dispatch@bfprime.net", password: "Dispatchbf123" },
    samsaraTrailers: { user: "dispatch.old@beverlyfreight.net", password: "dispatch.old" },
  },
  {
    name: "BG PRIME INC",
    mc: "1442603",
    dot: "3909357",
    ein: "88-2889825",
    phone: "(312) 995-9909",
    address: "1426 W ROSEMONT AVE, CHICAGO, IL 60660",
    dispatchMail: { user: "dispatch@bgprime.net", password: "Sotokoto@3344" },
    efs: { user: "BGPRIMEINC", password: "Subota2025" },
    wex: { user: "dispatch@bgprime.net", password: "Ponedeljak@2026" },
    eldLogs: { user: "bgprime2", password: "123456" },
    eldLiveTracking: { user: "BGPRIME1", password: "123456" },
    samsaraInsured: { user: "dispatch@bgprime.net", password: "Registration@123" },
    samsaraOther: { user: "luka@bgprime.net", password: "Hansotro*3321" },
    samsaraTrailers: { user: "dispatch.old@beverlyfreight.net", password: "dispatch.old" },
  },
  {
    name: "BF PRIME UNITED LLC",
    mc: "1691807",
    dot: "4332597",
    phone: "312-995-0492",
    address: "3069 N Clybourn Ave Chicago, IL 60618",
    note: "Temporarily closed",
    dispatchMail: { user: "dispatch.old@bfprimeunited.net", password: "Dispatch@2024!" },
    transitTracking: { user: "bfunited", password: "bfunited123" },
    efs: { user: "BFPRIMEUNITEDLLC", password: "Petak2025" },
    truckStop: { user: "/", password: "/" },
  },
];

const sharedAccounts: { label: string; user: string; password: string }[] = [
  { label: "WIFI KG", user: "", password: "Beverly@2026" },
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
  { name: "Maintenance", ext: "7" },
  { name: "ELD", ext: "8" },
];

const reps: { mc: string; name: string; contact: string; note?: string }[] = [
  { mc: "595216", name: "PEPSI LOGISTICS COMPANY INC", contact: "alanmccall1234@gmail.com" },
  { mc: "945637", name: "EMERGE TRANSPORTATION", contact: "chadwomack3@gmail.com" },
  { mc: "511639", name: "ECHO GLOBAL LOGISTICS, INC.", contact: "djohnsenecho@gmail.com", note: "Samo na Beverly Freight" },
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
const portalsByCompany: { company: string; portals: Portal[] }[] = [
  {
    company: "BF PRIME LLC",
    portals: [
      { mc: "033945", name: "Flock Freight", user: "dispatch@bfprime.net", password: "Dispatch@2025" },
      { mc: "", name: "Spot Freight", user: "dispatch@bfprime.net", password: "Registration@123" },
    ],
  },
  { company: "BEVERLY FREIGHT INC", portals: [] },
];

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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {companies.map((c) => (
              <CompanyCard key={c.name} c={c} />
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
                  {inspectionEmails.map((e) => <li key={e} className="break-all">{e}</li>)}
                </ul>
              </Card>

              <Card className="p-4 select-text">
                <h3 className="font-semibold mb-2">Accident emails</h3>
                <ul className="text-sm space-y-1">
                  {accidentEmails.map((e) => <li key={e} className="break-all">{e}</li>)}
                </ul>
              </Card>

              <Card className="p-4 select-text">
                <h3 className="font-semibold mb-2">2-week notice emails</h3>
                <ul className="text-sm space-y-1">
                  {twoWeekNoticeEmails.map((e) => <li key={e} className="break-all">{e}</li>)}
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
            <Card key={g.company} className="p-4 select-text border-2" style={{ ...getCompanyBackgroundColor(g.company) }}>
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