import { normalize, isUuid, type Context, type Ui } from "./chatbotPolicy.ts";

type Page = { id: string; title: string; path: string; aliases: string[]; steps: string[]; sr: string[]; truck?: boolean; strict?: string[]; excluded?: string[] };
// Reviewed UI instructions only. No database values, private notes, financial reports or arbitrary URLs.
export const NAVIGATION_PAGES: Page[] = [
  { id: "oil_change", title: "Live Oil Change", path: "/live-oil-change", truck: true, aliases: ["oil change","oilchange","zamena ulja","zamenu ulja","promena ulja","ulje"], steps: ["Open Live Oil Change", "Search for the truck and click its number", "Add log entry → Entry type: Oil Change", "Enter Log date and Total odometer → Save entry"], sr: ["Otvori Live Oil Change", "Pronađi kamion i klikni njegov broj", "Add log entry → Entry type: Oil Change", "Unesi Log date i Total odometer → Save entry"], excluded: ["afterhours","accounting","safety","claims"] },
  { id: "air_filter", title: "Air Filter", path: "/live-oil-change", truck: true, aliases: ["air filter","filter vazduha","filtera vazduha"], steps: ["Open Live Oil Change → select the truck", "Add log entry → Entry type: Air Filter", "Enter date and odometer → Save entry"], sr: ["Otvori Live Oil Change → izaberi kamion", "Add log entry → Entry type: Air Filter", "Unesi datum i kilometražu → Save entry"], excluded: ["afterhours","accounting","safety","claims"] },
  { id: "mileage", title: "Mileage Check", path: "/live-oil-change", truck: true, aliases: ["mileage check","odometer","kilometraza","kilometrazu","update mileage","mileage"], steps: ["Open Live Oil Change → select the truck", "Add log entry → Entry type: Mileage Check", "Enter Log date and Total odometer → Save entry"], sr: ["Otvori Live Oil Change → izaberi kamion", "Add log entry → Entry type: Mileage Check", "Unesi Log date i Total odometer → Save entry"], excluded: ["afterhours","accounting","safety","claims"] },
  { id: "driver_files", title: "Driver Files", path: "/drivers", aliases: ["cdl","medical card","vozacka dozvola","driver files","driver documents","dokumenti vozaca"], steps: ["Open Drivers → search for the driver", "Open the driver → Driver Files", "Select the document type → open or download the file"], sr: ["Otvori Drivers → pronađi vozača", "Otvori vozača → Driver Files", "Izaberi vrstu dokumenta → otvori ili preuzmi fajl"] },
  { id: "truck_files", title: "Truck Files", path: "/trucks", aliases: ["cab card","cabcard","truck files","truck documents","registration","registracija","annual dot","dot inspection"], steps: ["Open Trucks → search for the truck", "Open the truck → Truck Files", "Select Registration for a cab card, or the appropriate document type"], sr: ["Otvori Trucks → pronađi kamion", "Otvori kamion → Truck Files", "Za cab card izaberi Registration ili odgovarajuću vrstu dokumenta"] },
  { id: "trailer_files", title: "Trailer Files", path: "/trailers", aliases: ["trailer files","trailer documents","dokumenti prikolice"], steps: ["Open Trailers → search for the trailer", "Open the trailer → Trailer Files → select the document"], sr: ["Otvori Trailers → pronađi prikolicu", "Otvori prikolicu → Trailer Files → izaberi dokument"] },
  { id: "drivers", title: "Drivers", path: "/drivers", aliases: ["drivers","driver","vozaci","vozaca","vozac"], steps: ["Open Drivers → search for the driver", "Open the driver to view details or make permitted changes"], sr: ["Otvori Drivers → pronađi vozača", "Otvori vozača za detalje ili dozvoljene izmene"] },
  { id: "trucks", title: "Trucks", path: "/trucks", aliases: ["trucks","truck","kamion","kamione","kamioni","kamiona"], steps: ["Open Trucks → search for the truck", "Open the truck to view details or make permitted changes"], sr: ["Otvori Trucks → pronađi kamion", "Otvori kamion za detalje ili dozvoljene izmene"] },
  { id: "trailers", title: "Trailers", path: "/trailers", aliases: ["trailers","trailer","prikolice","prikolicu","prikolica"], steps: ["Open Trailers → search for the trailer", "Open the trailer to view details or make permitted changes"], sr: ["Otvori Trailers → pronađi prikolicu", "Otvori prikolicu za detalje ili dozvoljene izmene"] },
  { id: "new_load", title: "New Load", path: "/new-order", aliases: ["new load","new order","novu turu","nova tura","dodam turu"], steps: ["Open New Load", "Enter load details and required documents", "Review and save using your existing permissions"], sr: ["Otvori New Load", "Unesi detalje ture i potrebne dokumente", "Proveri podatke i sačuvaj ako imaš dozvolu"] },
  { id: "loads", title: "Loads", path: "/orders", aliases: ["loads","orders","ture","turu","load","order"], steps: ["Open Loads → search by load number", "Open the load for its details and files"], sr: ["Otvori Loads → pretraži broj ture", "Otvori turu za detalje i fajlove"] },
  { id: "prebook", title: "Prebook loads", path: "/recovery-loads", aliases: ["prebook","pre book"], steps: ["Open Recovery Loads & Prebook", "Select Prebook loads"], sr: ["Otvori Recovery Loads & Prebook", "Izaberi Prebook loads"], strict: ["dispatch","supervisor","manager","admin"] },
  { id: "recovery", title: "Recovery loads", path: "/recovery-loads", aliases: ["recovery loads","recovery"], steps: ["Open Recovery Loads & Prebook", "Select Recovery loads"], sr: ["Otvori Recovery Loads & Prebook", "Izaberi Recovery loads"], strict: ["dispatch","supervisor","manager","admin"] },
  { id: "eld", title: "ELD", path: "/eld", aliases: ["eld","eld assignments","eld dodele"], steps: ["Open ELD", "Use the overview or assignment controls available to your role"], sr: ["Otvori ELD", "Koristi pregled ili dodele koje tvoja uloga dozvoljava"], strict: ["admin","maintenance","manager"] },
  { id: "pretrip", title: "Pre Trip Inspection", path: "/pretrip-inspection", aliases: ["pre trip","pretrip","pti"], steps: ["Open Pre Trip Inspection", "Select the relevant week and available view"], sr: ["Otvori Pre Trip Inspection", "Izaberi nedelju i odgovarajući pregled"], strict: ["admin","maintenance","manager","supervisor","dispatch","safety"] },
  { id: "efs", title: "EFS Requests", path: "/efs-requests", aliases: ["efs","fuel request","zahtev za gorivo","cash advance"], steps: ["Open EFS Requests", "Use the request controls available to your role"], sr: ["Otvori EFS Requests", "Koristi opcije zahteva koje tvoja uloga dozvoljava"] },
  { id: "info", title: "Info", path: "/info", aliases: ["info","company info","kompanije"], steps: ["Open Info → Company Info", "Find the yard address or relevant company"], sr: ["Otvori Info → Company Info", "Pronađi adresu jarda ili odgovarajuću kompaniju"] },
  { id: "brokers", title: "Brokers", path: "/brokers", aliases: ["brokers","brokeri","broker"], steps: ["Open Brokers → search for the broker"], sr: ["Otvori Brokers → pronađi brokera"] },
  { id: "fleets", title: "Fleets", path: "/fleets", aliases: ["fleets","fleet","flote","flota"], steps: ["Open Fleets → select the relevant fleet"], sr: ["Otvori Fleets → izaberi flotu"] },
  { id: "reports", title: "Reports", path: "/reports", aliases: ["reports","izvestaji","izvestaje"], steps: ["Open Reports → choose the date and filters"], sr: ["Otvori Reports → izaberi datum i filtere"], excluded: ["yard"] },
  { id: "yard_arrivals", title: "Yard Arrivals", path: "/yard-arrivals", aliases: ["yard arrivals","dolazak na jard","dolasci na jard"], steps: ["Open Yard Arrivals → find the relevant arrival"], sr: ["Otvori Yard Arrivals → pronađi dolazak"] },
  { id: "yard_repair", title: "Mandatory Yard Repair", path: "/mandatory-yard-repair", aliases: ["mandatory yard repair","yard repair","popravka na jardu"], steps: ["Open Mandatory Yard Repair → find the truck or repair"], sr: ["Otvori Mandatory Yard Repair → pronađi kamion ili popravku"], strict: ["admin","manager","maintenance","safety","yard","dispatch","supervisor","afterhours","chicago_management","accounting","claims"] },
  { id: "daily_report", title: "Daily Report", path: "/daily-report", aliases: ["daily report","dnevni izvestaj"], steps: ["Open Daily Report using your existing report permissions"], sr: ["Otvori Daily Report ako imaš dozvolu za taj izveštaj"] },
  { id: "alerts", title: "Alerts", path: "/alerts", aliases: ["alerts","upozorenja","alerti"], steps: ["Open Alerts → review the relevant alert"], sr: ["Otvori Alerts → pronađi upozorenje"] },
  { id: "admin_users", title: "Admin Users", path: "/admin/users", aliases: ["admin users","manage users","chatbot access","korisnici","korisnika"], steps: ["Open Admin Users → find the user → Edit", "Change the permitted settings → save"], sr: ["Otvori Admin Users → pronađi korisnika → Edit", "Promeni podešavanja → sačuvaj"], strict: ["admin"] },
];
export const NAVIGATION_IDS = NAVIGATION_PAGES.map(p => p.id);
export const getNavigationPage = (id: unknown) => NAVIGATION_PAGES.find(p => p.id === id);
export const serbianRequest = (text: string, language = "") => /^(sr|hr|bs)(-|$)/i.test(language) || /\b(gde|gdje|kako|otvori|stranic\w*|azurir\w*|updejt\w*|nadji|pronadji|vozaca|kamione)\b/.test(normalize(text)) || /[ђјљњћџЂЈЉЊЋЏ]/.test(text);
export function matchNavigationPage(message: string, force = false): Page | undefined {
  const text = normalize(message).replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim();
  if (!force && !/\b(gde|gdje|kako|where|how|open|otvori\w*|navigate|navigation|which page|what page|na kojoj|azurir\w*|updejt\w*|update|edit|add|dodam|promenim)\b/.test(text)) return;
  return NAVIGATION_PAGES.map(page => ({ page,score: Math.max(0,...page.aliases.filter(alias => (` ${text} `).includes(` ${alias} `)).map(alias => alias.length)) })).filter(p => p.score).sort((a,b) => b.score-a.score)[0]?.page;
}
const primaryRole = (roles: readonly string[]) => ["admin","safety","claims","accounting","manager","supervisor","chicago_management","maintenance","dispatch","afterhours","yard","driver","recruiting"].find(r => roles.includes(r));
export function canNavigate(page: Page, roles: readonly string[], email: string) {
  const primary = primaryRole(roles);
  if (page.truck && email.toLowerCase() === "ella@bfprime.net") return true;
  return !!primary && (!page.strict || page.strict.includes(primary)) && !page.excluded?.includes(primary);
}
export function navigationReply(page: Page, roles: readonly string[], email: string, message: string, language: string, context: Context | null, ui: Ui) {
  const sr = serbianRequest(message,language);
  if (!canNavigate(page,roles,email)) return { message: sr ? "Tvoja uloga nema pristup ovoj stranici." : "Your role cannot access this page.",ui };
  const steps = [...(sr ? page.sr : page.steps)];
  const primary = primaryRole(roles);
  if (page.truck && (primary === "dispatch" || primary === "supervisor") && page.id !== "mileage") {
    steps.splice(2);
    steps.push(sr ? "Tvoja uloga može da doda Mileage Check. Za Oil Change ili Air Filter obrati se Maintenance/Admin korisniku." : "Your role can add Mileage Check. Ask Maintenance/Admin to record Oil Change or Air Filter.");
  }
  const href = page.truck && context?.kind === "truck" && isUuid(context.id) ? `${page.path}/${context.id}` : page.path;
  return { message: page.title,ui: { ...ui,manual: sr ? "Koraci" : ui.manual,open: sr ? "Otvori stranicu" : ui.open },links: [{ label: sr ? `Otvori ${page.title}` : `Open ${page.title}`,href }],steps };
}
