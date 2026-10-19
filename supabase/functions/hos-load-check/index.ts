import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { z } from 'npm:zod@3.23.8';
import { loadHosPlan, savedDraft } from './model.ts';
import { processHosChecks } from './notifications.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const stop=z.object({type:z.enum(['pickup','delivery']),datetime:z.string().max(60).nullable(),end_datetime:z.string().max(60).nullish(),latitude:z.number().min(-90).max(90).nullish(),longitude:z.number().min(-180).max(180).nullish()});
const draftSchema=z.object({driverId:z.string().uuid().nullish(),teamDriverId:z.string().uuid().nullish(),truckId:z.string().uuid().nullish(),orderId:z.string().uuid().nullish(),dhMiles:z.number().min(0).max(30000).nullable(),loadedMiles:z.number().min(0).max(100000).nullable(),stops:z.array(stop).max(40)});
const bodySchema=z.object({mode:z.enum(['preview','created','process']).default('preview'),orderId:z.string().uuid().optional(),draft:draftSchema.optional()});
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS') return new Response(null,{headers:cors});
  if(req.method!=='POST') return json({error:'Method not allowed'},405);
  try {
    const auth=req.headers.get('Authorization')||'';
    const token=auth.replace(/^Bearer\s+/i,'');
    if(!token) return json({error:'Unauthorized'},401);
    const body=bodySchema.parse(await req.json());
    const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin=createClient(url,service,{auth:{persistSession:false}});
    const cron=Deno.env.get('CRON_SECRET');
    if(body.mode==='process') {
      if(!cron||token!==cron) return json({error:'Unauthorized'},401);
      return json({processed:await processHosChecks(admin)});
    }
    const client=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const {data:user,error}=await client.auth.getUser();
    if(error||!user.user) return json({error:'Unauthorized'},401);
    const roles=await admin.from('user_roles').select('role').eq('user_id',user.user.id);
    if(roles.error) throw new Error(roles.error.message);
    if(!(roles.data||[]).some(r=>['admin','manager','dispatch','supervisor','afterhours','safety','accounting','chicago_management'].includes(r.role))) return json({error:'Forbidden'},403);
    const orderId=body.orderId||body.draft?.orderId;
    if(orderId) {
      const visible=await client.from('orders').select('id').eq('id',orderId).maybeSingle();
      if(visible.error||!visible.data) return json({error:'Load not accessible'},403);
    }
    if(body.mode==='created') {
      if(!body.orderId) return json({error:'Order required'},400);
      // Only an event produced by the database can send a notification. A caller
      // cannot supply a color, recipient, or message, or create a new alert event.
      const events=await admin.from('hos_order_checks').select('id,actor_id,dispatcher_id').eq('order_id',body.orderId);
      if(events.error) throw new Error(events.error.message);
      const staff=(roles.data||[]).some(r=>['admin','manager','supervisor'].includes(r.role));
      if(!staff&&!(events.data||[]).some(e=>e.actor_id===user.user!.id||e.dispatcher_id===user.user!.id)) return json({error:'Forbidden'},403);
      return json({processed:await processHosChecks(admin,body.orderId)});
    }
    let draft=body.draft;
    if(!draft && orderId) draft=(await savedDraft(client,orderId)).draft;
    if(!draft) return json({error:'Draft required'},400);
    if(draft.driverId) {
      const visible=await client.from('drivers').select('id').eq('id',draft.driverId).maybeSingle();
      if(visible.error||!visible.data) return json({error:'Driver not accessible'},403);
    }
    return json(await loadHosPlan(admin,draft));
  } catch(error) {
    if(error instanceof z.ZodError) return json({error:'Invalid HOS request'},400);
    console.error('HOS check failed:',error instanceof Error?error.message:'Unknown error');
    return json({error:'HOS check is temporarily unavailable'},500);
  }
});
