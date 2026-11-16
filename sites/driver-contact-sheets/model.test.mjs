import assert from "node:assert/strict";
import test from "node:test";
import {displayName,companySheet,driverSheet,validateSheet,departments} from "./dist/model.mjs";
const companies=[{id:"c",name:"BF Prime LLC"},{id:"c2",name:"AP Silver Trans LLC"}];
const profiles=[{user_id:"p",full_name:"Filip Petrovic-Kane",ext:"1018"},{user_id:"s",full_name:"Supervisor-Sam",phone_number:"555"}];
const driver={id:"d",name:"Driver",company_id:"c",dispatcher_id:"p",is_active:true};
const make=()=>driverSheet(driver,companies,profiles,[
  {dispatcher_id:"p",supervisor_id:"s"},{dispatcher_id:"p",supervisor_id:"p"},{dispatcher_id:"p",supervisor_id:"s"}
],[{driver2_id:"d",truck_number:"03212",company_id:"c2",dispatcher_id:"s"}],[
  {company_name:"BF PRIME LLC",mc:"027435",dot:"1234",address:"New address"}
]);
test("dispatch aliases and names without aliases",()=>{
  assert.equal(displayName("Filip Petrovic-Kane"),"Kane");
  assert.equal(displayName("Ben"),"Ben");
});
test("assigned contact comes first and supervisors are deduplicated",()=>{
  const model=make();assert.equal(model.contacts.length,2);
  assert.equal(model.contacts[0].name,"Kane");assert.equal(model.contacts[1].name,"Sam");
});
test("driver company and dispatcher stay authoritative when the truck differs",()=>{
  const model=make();assert.equal(model.company.companyId,"c");
  assert.equal(model.contacts[0].id,"p");assert.equal(model.warnings.length,2);
});
test("second team driver gets the assigned truck with leading zero preserved",()=>{
  assert.equal(make().truck,"03212");
});
test("current TMS company details override reference values",()=>{
  const model=make();assert.equal(model.company.mc,"027435");
  assert.equal(model.company.address,"New address");assert.equal(model.company.detailsSource,"TMS");
});
test("complete sheet passes print validation",()=>assert.deepEqual(validateSheet(make()),[]));
test("missing dispatcher contact blocks printing",()=>{
  assert.ok(validateSheet({...make(),contacts:[]}).includes("Add at least one dispatch contact."));
});
test("missing extension and direct phone blocks printing",()=>{
  assert.ok(validateSheet({...make(),contacts:[{name:"Kane",ext:"",phone:""}]}).length);
});
test("missing company does not silently use the truck company",()=>{
  const model=driverSheet({...driver,company_id:null},companies,profiles,[],[],[]);
  assert.ok(validateSheet(model).includes("Company is missing."));
});
test("preserve MC leading zeros and normalize only display prefixes",()=>{
  const company=companySheet(companies[0],{mc:"MC01822766",dot:"USDOT# 4579508"});
  assert.equal(company.mc,"01822766");assert.equal(company.dot,"4579508");
});
test("Beverly Group has its own ELD and maintenance extensions",()=>{
  const rows=departments(companySheet({id:"bg",name:"Beverly group"}));
  assert.deepEqual(rows.find(r=>r[0]==="ELD"),["ELD","EXT 11"]);
  assert.deepEqual(rows.find(r=>r[0]==="Maintenance"),["Maintenance","EXT 7"]);
});
test("company without a TMS contact profile is explicitly marked",()=>{
  const model=driverSheet(driver,companies,profiles,[],[],[]);
  assert.equal(model.company.detailsSource,"Reference template");
  assert.ok(model.warnings.some(w=>w.includes("no company contact profile")));
});
test("more than seven contacts blocks a single-page sheet",()=>{
  assert.ok(validateSheet({...make(),contacts:Array.from({length:8},()=>({name:"Contact",ext:"123",phone:""}))}).some(e=>e.includes("seven")));
});
