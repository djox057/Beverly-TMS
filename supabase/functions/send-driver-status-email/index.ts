import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { processEmails } from './worker.ts';

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST') return new Response('Method not allowed',{status:405});
  const secret=Deno.env.get('CRON_SECRET');
  if(!secret || req.headers.get('Authorization')!==`Bearer ${secret}`) return new Response('Unauthorized',{status:401});
  try {
    const body=await req.json();
    if(body.eventId!==undefined && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.eventId)) return new Response('Invalid event ID',{status:400});
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
    return Response.json(await processEmails(db,Deno.env.get('RESEND_API_KEY'),body.eventId));
  } catch {
    console.error('Driver status email worker failed');
    return Response.json({error:'Driver status email worker failed'},{status:500});
  }
});
