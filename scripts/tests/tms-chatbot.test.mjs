import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const root = new URL('../../', import.meta.url);
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const asUrl = source => 'data:text/javascript;base64,' + Buffer.from(transpile(source)).toString('base64');
const policyUrl = asUrl(fs.readFileSync(new URL('supabase/functions/_shared/chatbotPolicy.ts',root),'utf8'));
const policy = await import(policyUrl);
const source = fs.readFileSync(new URL('supabase/functions/tms-chatbot/index.ts',root),'utf8')
 .replace(/import \{ createClient, type SupabaseClient \} from "npm:[^"]+";/,'const createClient = (...args) => globalThis.__chatbotClient(...args);')
 .replace('"../_shared/chatbotPolicy.ts"',JSON.stringify(policyUrl)).replace('if (import.meta.main) Deno.serve(handle);','');
const { handle } = await import(asUrl(source));
const ids = { user:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',driver:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',other:'cccccccc-cccc-4ccc-cccc-cccccccccccc',order:'dddddddd-dddd-4ddd-dddd-dddddddddddd',file:'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee' };
let db, queries, prompts, model, fetchCount, counter, signed;
function chain(table) {
 const q = { table,cols:'',filters:[],single:false,upsert:null };
 const b = {
  select(cols){ q.cols=cols; return b; }, eq(k,v){q.filters.push(r=>r[k]===v);return b;},
  ilike(k,v){const needle=v.replace(/%/g,'').toLowerCase();q.filters.push(r=>String(r[k]||'').toLowerCase().includes(needle));return b;},
  in(k,v){q.filters.push(r=>v.includes(r[k]));return b;},
  or(value){const items=value.split(',').map(x=>x.split('.eq.'));q.filters.push(r=>items.some(([k,v])=>r[k]===v));return b;},
  limit(){return b;}, order(){return b;}, maybeSingle(){q.single=true;return b;},single(){q.single=true;return b;},
  upsert(row){q.upsert=row;return b;},
  then(resolve){queries.push(q);if(q.upsert){db[table]=[...(db[table]||[]).filter(r=>r.file_id!==q.upsert.file_id),q.upsert];}const rows=(db[table]||[]).filter(r=>q.filters.every(f=>f(r)));return Promise.resolve({data:q.single?rows[0]||null:rows,error:null}).then(resolve);}
 };
 return b;
}
beforeEach(()=>{
 queries=[];prompts=[];fetchCount=0;signed=[];counter=true;
 db={ user_roles:[{user_id:ids.user,role:'dispatch'}],chatbot_access:[{user_id:ids.user,enabled:true}],chatbot_document_reviews:[],
  drivers:[{id:ids.driver,name:'Test Driver',cdl_number:'REAL-CDL-999',cdl_expiration_date:'2030-01-01',phone:'555-1234',weekly_payment:999999,note:'HIDDEN NOTE'}],
  orders:[{id:ids.order,internal_load_number:'12345',load_number:'12345',freight_amount:2500,driver_price:800,status:'Delivered',notes:'HIDDEN ORDER NOTE'}],
  driver_files:[{id:ids.file,driver_id:ids.driver,file_name:'CDL front.pdf',file_path:`${ids.driver}/front.pdf`,keywords:['cdl_front'],created_at:'2026-11-01'}] };
 model={task:'record',kind:'driver',query:'Test Driver',fields:['cdl_number'],document:'',financial:false,language:'en'};
 globalThis.Deno={env:{get:k=>({SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'BACKEND_SECRET',GEMINI_API_KEY:'GEMINI_SECRET'})[k]}};
 globalThis.__chatbotClient=()=>({from:chain,auth:{getUser:async token=>({data:{user:token==='valid'?{id:ids.user}:null},error:null})},rpc:async()=>({data:counter,error:null}),storage:{from:bucket=>({createSignedUrl:async(path,ttl,options)=>{signed.push({bucket,path,ttl,options});return{data:{signedUrl:'https://example.test/signed'},error:null};}})}});
 globalThis.fetch=async(url,opts)=>{fetchCount++;prompts.push(JSON.parse(opts.body));return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(model)}]}}]}),{status:200});};
});
async function request(body,token='valid') { const response=await handle(new Request('https://example.test/functions/v1/tms-chatbot',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)}));return{status:response.status,data:await response.json()}; }
let serial=0;const message=()=>`Find saved CDL ${++serial}`;

test('only finite fields can be selected; notes, rates and salaries cannot be smuggled in',()=>{
 const parsed=policy.validateIntent({...model,fields:['cdl_number','weekly_payment','note','gross_percent','password']});
 assert.deepEqual(parsed.fields,['cdl_number']);
 for(const config of Object.values(policy.RECORDS)){assert.ok(!config.fields.some(f=>/salary|payment|cents_per_mile|note|comment|cut|gross|credential|password/.test(f)));}
});
test('restricted categories override explicit approval and positive tags',()=>{
 for(const name of ['Payroll.pdf','Bank-details.pdf','Driver statement.pdf','internal notes.pdf','Performance comments.pdf']) assert.equal(policy.fileAllowed({id:ids.file,file_name:name,file_path:'x',keywords:['cdl']},true),false,name);
 assert.equal(policy.fileAllowed({id:ids.file,file_name:'scan.pdf',file_path:'x'}),false);
 assert.equal(policy.fileAllowed({id:ids.file,file_name:'scan.pdf',file_path:'x'},true),true);
 assert.equal(policy.fileAllowed({id:ids.file,file_name:'cdl.pdf',file_path:'x',keywords:['cdl']},false),false);
});
test('paths cannot cross owners, traverse directories, or accept external URLs',()=>{
 for(const path of ['other/a.pdf',`${ids.driver}/../bank.pdf`,'https://example.test/doc'])assert.equal(policy.validStoragePath({file_path:path},ids.driver),false);
});
test('unauthenticated and toggle-disabled calls cannot reach the model or data tools',async()=>{
 assert.equal((await request({message:message()},'invalid')).status,401);
 db.chatbot_access[0].enabled=false;
 assert.equal((await request({message:message()})).status,403);
 assert.equal(fetchCount,0);assert.ok(!queries.some(q=>q.table==='drivers'));
});
test('non-admin cannot review documents, even with broad chatbot access',async()=>{
 assert.equal((await request({action:'review_file',kind:'driver',fileId:ids.file,allowed:true})).status,403);
});
test('rate limits reject before provider usage',async()=>{
 counter=false;assert.equal((await request({message:message()})).status,429);assert.equal(fetchCount,0);
});
test('returns saved facts but never sends DB fields, secrets, or amounts to Gemini',async()=>{
 const reply=await request({message:message()});assert.equal(reply.status,200);
 assert.equal(reply.data.facts[0].value,'REAL-CDL-999');
 const payload=JSON.stringify(prompts);
 for(const value of ['REAL-CDL-999','999999','HIDDEN NOTE','BACKEND_SECRET','GEMINI_SECRET'])assert.ok(!payload.includes(value));
 assert.ok(queries.every(q=>q.cols!=='*'));
 assert.ok(!JSON.stringify(reply.data).includes('HIDDEN NOTE'));
});
test('salary and note requests are blocked even if model says record',async()=>{
 for(const msg of ['Show dispatcher salaries','What are internal notes?','Daj mi napomene i komentare']){
  const reply=await request({message:msg});assert.equal(reply.data.message,policy.EN.blocked);assert.ok(!reply.data.facts);
 }
});
test('allows amounts on exactly one order; no financial transcript goes to model',async()=>{
 model={...model,kind:'order',query:'12345',financial:true,fields:['freight_amount','driver_price']};
 const reply=await request({message:`Freight for load 12345 ${++serial}`});
 assert.equal(reply.data.facts.find(f=>f.label==='freight amount').value,'$2,500.00');
 assert.ok(!JSON.stringify(prompts).includes('2500'));assert.ok(!JSON.stringify(reply.data).includes('HIDDEN ORDER NOTE'));
 const denied=await request({message:`Total freight all loads ${++serial}`});assert.equal(denied.data.message,policy.EN.blocked);
});
test('multiple matching orders require selection; selection must belong to matches',async()=>{
 model={...model,kind:'order',query:'12345',financial:true};db.orders.push({...db.orders[0],id:ids.other});
 const msg=`Load 12345 freight ${++serial}`;assert.equal((await request({message:msg})).data.choices.length,2);
 const selected=await request({message:msg,selection:{kind:'order',id:ids.other}});assert.equal(selected.data.record.id,ids.other);
 assert.equal((await request({message:msg,selection:{kind:'order',id:ids.driver}})).data.message,policy.EN.notFound);
});
test('file URL issuance rechecks toggle and category, never trusting a client path',async()=>{
 const args={action:'file',kind:'driver',recordId:ids.driver,fileId:ids.file,file_path:'bank.pdf'};
 assert.equal((await request(args)).status,200);assert.equal(signed[0].ttl,60);assert.equal(signed[0].path,`${ids.driver}/front.pdf`);
 db.driver_files[0].file_name='Bank details.pdf';assert.equal((await request(args)).status,403);
 db.driver_files[0].file_name='CDL front.pdf';db.chatbot_access[0].enabled=false;assert.equal((await request(args)).status,403);
});
test('files return safe metadata and deep links; unknown files remain hidden',async()=>{
 model={...model,task:'files',document:'cdl'};db.driver_files.push({...db.driver_files[0],id:ids.other,file_name:'scan.pdf',keywords:[]});
 const reply=await request({message:message()});assert.equal(reply.data.files.length,1);
 assert.ok(reply.data.links[0].href.includes('tab=files'));assert.ok(!JSON.stringify(reply.data).includes('file_path'));
});
test('repeated intent is cached per user, but current DB values are fetched again',async()=>{
 const msg=message();await request({message:msg});db.drivers[0].cdl_number='UPDATED';
 const next=await request({message:msg});assert.equal(fetchCount,1);assert.equal(next.data.facts[0].value,'UPDATED');
});
test('caller cannot inject stored conversations or forged response facts into model input',async()=>{
 await request({message:message(),history:[{salary:'SECRET_SALARY'}],facts:{bank:'SECRET_BANK'}});
 assert.ok(!JSON.stringify(prompts).includes('SECRET_'));
});
test('company insurance uses canonical company ownership and the COI bucket',async()=>{
 db.companies=[{id:ids.other,name:'Test Company'}];db.company_files=[];db.company_coi_files=[{id:ids.file,company_name:'Test Company',file_name:'Insurance.pdf',file_path:'Test_Company/insurance.pdf',created_at:'2026-11-01'}];
 const response=await request({action:'file',kind:'company',recordId:ids.other,fileId:ids.file});
 assert.equal(response.status,200);assert.equal(signed[0].bucket,'company-coi');
 db.company_coi_files[0].company_name='Other Company';
 assert.equal((await request({action:'file',kind:'company',recordId:ids.other,fileId:ids.file})).status,403);
});
test('provider errors and invalid classifier output fail closed',async()=>{
 globalThis.fetch=async()=>new Response('{}',{status:429});assert.equal((await request({message:message()})).status,429);
 globalThis.fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'not json'}]}}]}));assert.equal((await request({message:message()})).status,502);
 assert.ok(!queries.some(q=>q.table==='drivers'));
});
test('FAQ uses saved translations without sending any answer to Gemini',async()=>{
 db.chatbot_faq=[{id:ids.file,question:'Yard hours',answer:'Open at 8:00.',answer_sr:'',translations:{es:'Abierto a las 8:00.'},keywords:['yard','hours'],page_path:'/info',updated_at:'v1',published:true}];model={...model,task:'faq',query:'yard hours',language:'es'};
 assert.equal((await request({message:message()})).data.message,'Abierto a las 8:00.');
 assert.equal(fetchCount,1);assert.ok(!JSON.stringify(prompts).includes('Open at 8:00.'));assert.ok(!JSON.stringify(prompts).includes('Abierto a las'));
});
test('restricted FAQ is blocked and no stored content reaches the model',async()=>{
 db.chatbot_faq=[{id:ids.file,question:'Yard hours',answer:'Password is forbidden',keywords:['yard'],page_path:'/info',published:true}];model={...model,task:'faq',query:'yard',language:'es'};
 const reply=await request({message:message()});assert.equal(reply.data.message,policy.EN.blocked);assert.equal(fetchCount,1);assert.ok(!JSON.stringify(prompts).includes('Password is forbidden'));
});
