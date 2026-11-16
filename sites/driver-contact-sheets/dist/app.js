import {displayName, normalize, driverSheet, departments, validateSheet} from "./model.mjs";
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let client, session, loadedAt = 0, busy = false, generation = 0, model = null, baseModel = null, logoUrl = "";
let data = {drivers:[],companies:[],profiles:[],links:[],trucks:[],info:[]};
const allowedRoles = new Set(["dispatch","afterhours","manager","admin","accounting","supervisor","safety","maintenance","chicago_management","yard"]);
const MAX_AGE = 5 * 60 * 1000;
const COMPANY_FIELDS = [
  ["mc","MC number"],["dot","US DOT number"],["office","Office phone"],
  ["dispatch","Dispatch phone"],["weekend","Weekend phone"],["fax","Fax"],
  ["address","Mailing address"],["dispatchEmail","Dispatch email"],
  ["safetyEmail","Safety email"],["accountingEmail","Accounting email"]
];
const notify = (message, error=false) => {
  $("notice").textContent = message; $("notice").hidden = !message;
  $("notice").classList.toggle("error",error);
};
function clearLogo() {
  if (logoUrl) URL.revokeObjectURL(logoUrl);
  logoUrl = ""; $("logo").value = ""; $("remove-logo").hidden = true;
}
function clearData() {
  generation++; busy = false; loadedAt = 0; model = baseModel = null;
  data = {drivers:[],companies:[],profiles:[],links:[],trucks:[],info:[]};
  clearLogo(); $("driver-list").replaceChildren(); $("driver-search").value = "";
  $("contact-editor").replaceChildren(); $("company-editor").replaceChildren();
  $("department-editor").replaceChildren(); $("extra-contact").replaceChildren();
  $("assigned-company").textContent = ""; $("assigned-dispatcher").textContent = "";
  $("assignment").hidden = true; $("sheet-options").hidden = true; $("sheet").hidden = true;
  $("sheet").replaceChildren(); $("empty-preview").hidden = false; $("sync-time").textContent = "";
  $("sheet-scale").style.height = "0px"; document.body.classList.remove("print-ready");
  $("print").disabled = true; $("refresh").disabled = false; notify("");
}
async function paged(table, fields, order, filter, signal) {
  const rows = [], size = 500;
  for (let page=0;page<100;page++) {
    let query = client.from(table).select(fields).order(order).range(page*size,(page+1)*size-1);
    if (order !== "id" && fields.split(",").includes("id")) query = query.order("id");
    if (filter) query = filter(query);
    const {data: batch, error} = await query.abortSignal(signal);
    if (error) throw new Error("Could not read " + table + " from TMS. Refresh or sign in again.");
    rows.push(...(batch || []));
    if (!batch || batch.length < size) return rows;
  }
  throw new Error("The TMS result exceeds this sheet generator's limit.");
}
async function loadData() {
  if (!session || busy) return;
  busy = true; $("refresh").disabled = true; $("print").disabled = true;
  document.body.classList.remove("print-ready"); notify("Reading current driver assignments from TMS…");
  const run = ++generation, userId = session.user.id, selectedId = model?.driver.id;
  const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),25000);
  try {
    const {data: roles,error: roleError} = await client.from("user_roles").select("role").eq("user_id",userId).abortSignal(controller.signal);
    if (roleError) throw new Error("Could not verify your TMS access.");
    if (!(roles || []).some(r=>allowedRoles.has(r.role))) throw new Error("Your TMS role does not have access to staff contact sheets.");
    const [drivers,companies,profiles,links,trucks,info] = await Promise.all([
      paged("drivers","id,name,company_id,dispatcher_id,is_active","name",null,controller.signal),
      paged("companies","id,name","name",null,controller.signal),
      paged("profiles","user_id,full_name,ext,phone_number","user_id",null,controller.signal),
      paged("dispatcher_supervisors","id,dispatcher_id,supervisor_id","id",null,controller.signal),
      paged("trucks","id,truck_number,driver1_id,driver2_id,company_id,dispatcher_id","id",null,controller.signal),
      // Project only non-secret JSON scalars; never request the credentials object.
      paged("company_info_credentials","company_name,mc:credentials->>mc,dot:credentials->>dot,phone:credentials->>phone,address:credentials->>address","company_name",null,controller.signal)
    ]);
    if (run !== generation || session?.user.id !== userId) return;
    data = {drivers,companies,profiles,links,trucks,info}; loadedAt = Date.now();
    $("workspace").hidden = false; $("login").hidden = true; $("signout").hidden = false;
    $("connection").textContent = "Connected to TMS"; $("connection").classList.add("connected");
    populateDrivers(selectedId);
    if(selectedId && data.drivers.some(d=>d.id===selectedId)) selectDriver(selectedId);
    else {model=baseModel=null; renderSheet(); notify(drivers.length ? "" : "No drivers are visible to this TMS account.");}
    updateSync();
  } catch(error) {
    controller.abort();
    if (run !== generation) return;
    loadedAt = 0; $("login-status").textContent = error.message || "TMS is unavailable. Try again.";
    $("workspace").hidden = false; $("login").hidden = true; $("signout").hidden = false;
    $("connection").textContent = "Refresh needed"; $("connection").classList.remove("connected");
    notify(error.message || "TMS is unavailable. Try again.",true); updateSync();
  } finally {
    clearTimeout(timer);
    if (run === generation) {busy=false; $("refresh").disabled=false; updatePrintState();}
  }
}
function populateDrivers(selectedId) {
  const search=normalize($("driver-search").value);
  const showInactive=$("inactive").checked;
  const visible=data.drivers.filter(d=>{
    if(!showInactive && !d.is_active)return false;
    const company=data.companies.find(c=>c.id===d.company_id);
    const profile=data.profiles.find(p=>p.user_id===d.dispatcher_id);
    const trucks=data.trucks.filter(t=>t.driver1_id===d.id||t.driver2_id===d.id).map(t=>t.truck_number);
    return normalize([d.name,company?.name,profile?.full_name,...trucks].join(" ")).includes(search);
  });
  $("driver-list").innerHTML=visible.map(d=>'<option value="'+escapeHtml(d.id)+'">'+escapeHtml(d.name)+(d.is_active ? "" : " (inactive)")+'</option>').join("");
  $("driver-list").value=selectedId||"";
  $("driver-count").textContent=visible.length+" drivers";
  if(!visible.length){const option=new Option("No matching drivers","");option.disabled=true;$("driver-list").add(option);}
}
function selectDriver(id) {
  const driver=data.drivers.find(d=>d.id===id); if(!driver)return;
  clearLogo(); baseModel=driverSheet(driver,data.companies,data.profiles,data.links,data.trucks,data.info);
  baseModel.departments=departments(baseModel.company);
  model=structuredClone(baseModel);
  $("sheet-options").hidden=false; $("assignment").hidden=false;
  $("assigned-company").textContent=model.company.name||"Missing company";
  $("assigned-dispatcher").textContent=model.contacts.find(c=>c.role==="Assigned dispatcher")?.fullName||"No visible assignment";
  renderEditors(); renderSheet(); showWarnings();
}
function renderEditors() {
  if(!model)return;
  $("contact-editor").innerHTML=model.contacts.map((c,i)=>'<div class="contact-edit" data-index="'+i+'"><p class="role">'+escapeHtml(c.role)+'</p><div><label for="contact-name-'+i+'">Contact name</label><input id="contact-name-'+i+'" data-contact="name" value="'+escapeHtml(c.name)+'" maxlength="60"></div><div><label for="contact-ext-'+i+'">Extension</label><input id="contact-ext-'+i+'" data-contact="ext" value="'+escapeHtml(c.ext)+'" maxlength="12"></div><button type="button" data-remove="'+i+'" aria-label="Remove '+escapeHtml(c.name)+'">×</button><div class="phone-field"><label for="contact-phone-'+i+'">Direct phone (optional)</label><input id="contact-phone-'+i+'" data-contact="phone" value="'+escapeHtml(c.phone)+'" maxlength="30"></div></div>').join("");
  $("company-editor").innerHTML=COMPANY_FIELDS.map(([key,label])=>'<label for="company-'+key+'">'+label+'</label><input id="company-'+key+'" class="detail-input" data-company="'+key+'" value="'+escapeHtml(model.company[key])+'" maxlength="'+(key==="address" ? "200":"100")+'">').join("");
  $("department-editor").innerHTML=model.departments.map(([name,number],i)=>'<div class="department-edit"><label for="dept-'+i+'">'+escapeHtml(name)+'</label><input id="dept-'+i+'" data-department="'+i+'" value="'+escapeHtml(number)+'" maxlength="50"></div>').join("");
  const existing=new Set(model.contacts.map(c=>c.id));
  $("extra-contact").innerHTML='<option value="">Choose a TMS contact…</option>'+data.profiles.filter(p=>!existing.has(p.user_id)&&(p.ext||p.phone_number)).sort((a,b)=>displayName(a.full_name).localeCompare(displayName(b.full_name))).map(p=>'<option value="'+escapeHtml(p.user_id)+'">'+escapeHtml(displayName(p.full_name))+' · '+escapeHtml(p.ext ? "EXT "+p.ext : p.phone_number)+'</option>').join("");
  $("extra-contact").disabled=model.contacts.length>=7;
}
function showWarnings() {
  if(!model)return;
  const messages=[...model.warnings,...validateSheet(model)];
  if(model.driver.is_active===false)messages.unshift("This driver is inactive in TMS.");
  if(loadedAt && Date.now()-loadedAt>MAX_AGE)messages.unshift("Refresh TMS before printing; the data is more than five minutes old.");
  notify([...new Set(messages)].join("\n"));
}
function renderSheet() {
  const sheet=$("sheet");
  if(!model){sheet.hidden=true;$("empty-preview").hidden=false;$("sheet-options").hidden=true;$("assignment").hidden=true;updatePrintState();return;}
  const c=model.company;
  sheet.className="contact-sheet "+$("layout").value+($("paper").value==="a4" ? " a4":"");
  sheet.style.setProperty("--accent",c.accent); sheet.style.setProperty("--ink",c.ink||"#17263d");
  const authority=[["MC",c.mc],["US DOT",c.dot],...(c.kyu ? [["KYU",c.kyu]]:[])].filter(([,value])=>value);
  const phoneRows=[["Office",c.office],["Dispatch",c.dispatch],["Weekend only",c.weekend],["Fax",c.fax]].filter(([,value])=>value);
  sheet.innerHTML='<header class="sheet-top"><div class="wordmark">'+(logoUrl ? '<img src="'+escapeHtml(logoUrl)+'" alt="'+escapeHtml(c.name)+' logo">' : '<h2>'+escapeHtml(c.wordmark)+'</h2><p>'+escapeHtml(c.subtitle)+'</p>')+'</div><div class="authority">'+authority.map(([label,value])=>'<div><b>'+label+'</b><span>'+escapeHtml(value)+'</span></div>').join("")+'</div></header><div class="sheet-divider"></div>'+
  ($("include-driver").checked ? '<div class="sheet-person"><div><b>'+escapeHtml(model.driver.name)+'</b><br><span>'+escapeHtml(c.name)+'</span></div><span>'+escapeHtml(model.truck ? "TRUCK "+model.truck : "")+'</span></div>' : "")+
  '<div class="sheet-details"><section class="sheet-box"><h3>COMPANY CONTACTS</h3>'+phoneRows.map(([label,value])=>'<div><strong>'+escapeHtml(value)+'</strong> &nbsp; '+label+'</div>').join("")+'</section><section class="sheet-box"><h3>'+escapeHtml(c.name)+'</h3><strong>DRIVER CONTACT DIRECTORY</strong>'+(c.address ? '<div class="sheet-address">'+escapeHtml(c.address)+'</div>':"")+'</section></div>'+
  '<div class="sheet-email">'+[c.dispatchEmail,c.safetyEmail,c.accountingEmail].filter(Boolean).map(v=>'<div>'+escapeHtml(v)+'</div>').join("")+'</div>'+
  '<div class="sheet-columns"><section class="sheet-column"><h3>DEPARTMENTS</h3>'+model.departments.map(([name,number])=>'<div class="department-row"><span>'+escapeHtml(name)+'</span><b>'+escapeHtml(number)+'</b></div>').join("")+'</section><section class="sheet-column"><h3>DISPATCH DEPARTMENT</h3>'+model.contacts.map(contact=>'<div class="dispatch-row"><span class="contact-name">'+escapeHtml(contact.name)+'</span><div class="contact-number">'+escapeHtml(contact.ext ? "EXT "+contact.ext : contact.phone)+(contact.ext&&contact.phone ? '<small>'+escapeHtml(contact.phone)+'</small>' : "")+'</div></div>').join("")+'</section></div>'+
  '<section class="afterhours"><div class="arrow">AFTER<br>HOURS</div><div><b>EXT 5</b><p>FROM 4:00 PM UNTIL 7:00 AM</p></div></section><footer class="sheet-footer"><span>'+escapeHtml(c.name)+'</span><span>Driver contact sheet</span></footer>';
  sheet.hidden=false; $("empty-preview").hidden=true;
  const a4=$("paper").value==="a4";
  $("page-label").textContent=(a4 ? "A4":"US Letter")+" · 1 page";
  $("print-page").textContent="@page { size: "+(a4 ? "A4":"letter")+" portrait; margin: 0; }";
  updateScale(); updatePrintState();
}
function updateScale() {
  if(!model||$("sheet").hidden)return;
  const viewport=$("preview-viewport"),sheet=$("sheet");
  const style=getComputedStyle(viewport);
  const available=viewport.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
  const scale=Math.min(1,available/sheet.offsetWidth);
  sheet.style.transform="scale("+scale+")";
  $("sheet-scale").style.width=sheet.offsetWidth*scale+"px";
  $("sheet-scale").style.height=sheet.offsetHeight*scale+"px";
}
function overflowed() {
  const sheet=$("sheet");
  return !sheet.hidden && (sheet.scrollHeight>sheet.clientHeight+2 || sheet.scrollWidth>sheet.clientWidth+2);
}
function updatePrintState() {
  const fresh=loadedAt && Date.now()-loadedAt<MAX_AGE;
  const ready=!!session&&!busy&&fresh&&model&&validateSheet(model).length===0&&!overflowed();
  $("print").disabled=!ready; document.body.classList.toggle("print-ready",!!ready);
  if(model&&overflowed())notify("This sheet is too full for one page. Shorten contact names or company details, or remove an extra contact.");
}
function updateSync() {
  $("sync-time").textContent=loadedAt ? "Last read from TMS: "+new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(loadedAt)+". Company assignments and contact extensions come from TMS. Public department contacts follow your templates." : "";
  updatePrintState();
}
async function startSession(next) {
  const changed=session?.user.id!==next?.user.id;
  if(changed)clearData();
  session=next;
  if(!next){$("workspace").hidden=true;$("login").hidden=false;$("signout").hidden=true;$("connection").textContent="Sign in to connect";$("connection").classList.remove("connected");return;}
  if(changed || !loadedAt)await loadData();
}
$("login-form").addEventListener("submit",async event=>{
  event.preventDefault(); if(!client)return;
  $("signin").disabled=true;$("login-status").textContent="Signing in…";
  try{
    const {data:auth,error}=await client.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
    if(error)throw new Error("Sign-in failed. Check your TMS email and password.");
    $("password").value="";$("login-status").textContent="";await startSession(auth.session);
  }catch(error){$("password").value="";$("login-status").textContent=error.message;}
  finally{$("signin").disabled=false;}
});
$("signout").addEventListener("click",async()=>{
  const {error}=await client.auth.signOut({scope:"local"});
  if(error){notify("Sign-out failed. Try again.",true);return;}
  await startSession(null);
});
$("refresh").addEventListener("click",loadData);
$("driver-list").addEventListener("change",event=>selectDriver(event.target.value));
$("driver-search").addEventListener("input",()=>populateDrivers(model?.driver.id));
$("inactive").addEventListener("change",()=>populateDrivers(model?.driver.id));
for(const id of ["layout","paper","include-driver"])$(id).addEventListener("change",renderSheet);
$("contact-editor").addEventListener("input",event=>{
  if(!model||!event.target.dataset.contact)return;
  const index=Number(event.target.closest("[data-index]").dataset.index);
  model.contacts[index][event.target.dataset.contact]=event.target.value;
  renderSheet();showWarnings();
});
$("contact-editor").addEventListener("click",event=>{
  const remove=event.target.closest("[data-remove]");if(!remove||!model)return;
  model.contacts.splice(Number(remove.dataset.remove),1);renderEditors();renderSheet();showWarnings();
});
$("extra-contact").addEventListener("change",event=>{
  if(!model||model.contacts.length>=7)return;
  const profile=data.profiles.find(p=>p.user_id===event.target.value);if(!profile)return;
  model.contacts.push({id:profile.user_id,name:displayName(profile.full_name),fullName:profile.full_name,ext:profile.ext||"",phone:profile.phone_number||"",role:"Additional contact"});
  renderEditors();renderSheet();showWarnings();
});
$("company-editor").addEventListener("input",event=>{
  if(!model||!event.target.dataset.company)return;
  model.company[event.target.dataset.company]=event.target.value;renderSheet();showWarnings();
});
$("department-editor").addEventListener("input",event=>{
  if(!model||event.target.dataset.department===undefined)return;
  model.departments[Number(event.target.dataset.department)][1]=event.target.value;renderSheet();showWarnings();
});
$("reset").addEventListener("click",()=>{
  if(!baseModel)return;clearLogo();model=structuredClone(baseModel);renderEditors();renderSheet();showWarnings();
});
$("logo").addEventListener("change",async event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>3*1024*1024){event.target.value="";notify("Choose a PNG, JPEG or WebP image under 3 MB.",true);return;}
  const nextUrl=URL.createObjectURL(file), selected=model?.driver.id;
  const img=new Image();img.src=nextUrl;
  try{
    await img.decode();
    if(model?.driver.id!==selected){URL.revokeObjectURL(nextUrl);return;}
    if(logoUrl)URL.revokeObjectURL(logoUrl);logoUrl=nextUrl;$("remove-logo").hidden=false;renderSheet();
  }catch{URL.revokeObjectURL(nextUrl);notify("The logo image could not be opened.",true);}
});
$("remove-logo").addEventListener("click",()=>{clearLogo();renderSheet();});
$("print").addEventListener("click",async()=>{
  updatePrintState(); if($("print").disabled){showWarnings();return;}
  await document.fonts.ready;
  const logo=$("sheet").querySelector("img");if(logo)try{await logo.decode();}catch{notify("Wait for the logo to load before printing.",true);return;}
  const previous=document.title;
  document.title=model.driver.name+" - "+model.company.name+" - Contact sheet";
  window.print(); document.title=previous;
});
window.addEventListener("beforeprint",updatePrintState);
window.addEventListener("resize",updateScale);
new ResizeObserver(updateScale).observe($("preview-viewport"));
setInterval(()=>{updatePrintState();if(model&&loadedAt&&Date.now()-loadedAt>MAX_AGE)showWarnings();},30000);
async function boot(){
  $("signin").disabled=true;
  try{
    const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.78.0/+esm");
    client=createClient("https://wjkbtagwgjniilmgwutb.supabase.co","sb_publishable_fMSxoiotJorbXyZpvE7ezg_oYHRoqh_",{
      auth:{storage:window.sessionStorage,storageKey:"beverly-contact-sheets-auth",persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
    });
    client.auth.onAuthStateChange((event,next)=>{
      // Defer async queries until after the auth client releases its lock.
      if(event==="SIGNED_OUT" || event==="SIGNED_IN")setTimeout(()=>startSession(next),0);
    });
    const {data:auth,error}=await client.auth.getSession();
    if(error)throw new Error("Could not restore your TMS session. Sign in again.");
    $("login-status").textContent="";$("signin").disabled=false;
    await startSession(auth.session);
  }catch(error){$("login-status").textContent="The connection could not start. Reload the page to try again."; $("signin").disabled=true;}
}
boot();
