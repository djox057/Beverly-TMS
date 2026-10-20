import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { processReminders } from './worker.ts';
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', {status:405});
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', {status:401});
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth:{persistSession:false}});
    const body = await req.json().catch(() => ({}));
    const result = await processReminders(db, {dryRun:body.dryRun === true, apiKey:Deno.env.get('RESEND_API_KEY')});
    return Response.json(result);
  } catch (error) {
    console.error('Low-drive reminder failed', error instanceof Error ? error.message : 'Unknown error');
    return Response.json({error:'Low-drive reminder failed'}, {status:500});
  }
});
