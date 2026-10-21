// Run against an isolated PostgreSQL engine, never a remote project:
// PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/tests/efs-request-void.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
  CREATE ROLE authenticated;
  CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
  CREATE TYPE public.app_role AS ENUM ('admin','accounting','manager','supervisor','dispatch','afterhours','safety','claims','maintenance','chicago_management','driver');
  CREATE TABLE public.user_roles (user_id uuid, role public.app_role);
  CREATE FUNCTION public.has_role(uid uuid, requested app_role) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=uid AND (role=requested
       OR (requested='accounting' AND role IN ('safety','claims')))) $$;
  CREATE TABLE public.efs_other_requests (id uuid PRIMARY KEY, amount numeric, purpose text);
  CREATE TABLE public.driver_cash_advances (id uuid PRIMARY KEY, amount numeric, resend_email_id text);
  CREATE TABLE public.driver_expenses (id uuid PRIMARY KEY, cash_advance_id uuid REFERENCES public.driver_cash_advances ON DELETE CASCADE);
  GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
  ALTER TABLE public.efs_other_requests ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.driver_cash_advances ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.driver_expenses ENABLE ROW LEVEL SECURITY;
  CREATE POLICY read_efs ON public.efs_other_requests FOR SELECT TO authenticated USING (true);
  CREATE POLICY read_cash ON public.driver_cash_advances FOR SELECT TO authenticated USING (true);
  CREATE POLICY read_expenses ON public.driver_expenses FOR SELECT TO authenticated USING (true);
  -- Reproduce the current broad policies to prove the migration constrains them.
  CREATE POLICY delete_efs ON public.efs_other_requests FOR DELETE TO authenticated
    USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'accounting'));
  CREATE POLICY delete_cash ON public.driver_cash_advances FOR DELETE TO authenticated
    USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accounting'));
  CREATE POLICY update_efs ON public.efs_other_requests FOR UPDATE TO authenticated
    USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'accounting') OR has_role(auth.uid(),'dispatch') OR has_role(auth.uid(),'afterhours'));
  CREATE POLICY insert_efs ON public.efs_other_requests FOR INSERT TO authenticated WITH CHECK (true);
`);
const migration = new URL('../../supabase/migrations/20261021160923_efs_request_void_and_admin_delete.sql', import.meta.url);
await db.exec(await readFile(migration, 'utf8'));
const requestId = '00000000-0000-4000-8000-000000000001';
const cashId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000003';
const expenseId = '00000000-0000-4000-8000-000000000004';
await db.exec(`INSERT INTO efs_other_requests VALUES ('${requestId}',100,'Fuel',null,null,null);
  INSERT INTO driver_cash_advances VALUES ('${cashId}',100,null,null,null,null);
  INSERT INTO driver_expenses VALUES ('${expenseId}','${cashId}');`);
let passed = 0;
async function check(name, role, callback, service = false) {
  await db.exec('BEGIN');
  try {
    if (role) await db.query('INSERT INTO user_roles VALUES ($1,$2)',[userId,role]);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",[userId,service?'service_role':'authenticated']);
    await db.exec(`SET LOCAL ROLE ${service?'service_role':'authenticated'}`);
    await callback();
    passed++; console.log('PASS',name);
  } finally { await db.exec('ROLLBACK'); }
}
const voidRequest = (table,id,reason='  Duplicate request  ') => db.query(`UPDATE ${table} SET voided_at=now(),void_reason=$1 WHERE id=$2 RETURNING *`,[reason,id]);
for (const role of ['admin','accounting','manager','supervisor','dispatch','afterhours']) {
  for (const [table,id] of [['efs_other_requests',requestId],['driver_cash_advances',cashId]]) {
    await check(`${role} can void ${table} with server audit`,role,async()=>{
      const result=await voidRequest(table,id);
      assert.equal(result.rows.length,1);
      assert.equal(result.rows[0].void_reason,'Duplicate request');
      assert.equal(result.rows[0].voided_by,userId);
      assert.equal(Number(result.rows[0].amount),100);
      assert.ok(result.rows[0].voided_at);
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE voided_at IS NULL`)).rows[0].n,0);
    });
    await check(`${role} ${role==='admin'?'can':'cannot'} delete ${table}`,role,async()=>{
      const result=await db.query(`DELETE FROM ${table} WHERE id=$1 RETURNING id`,[id]);
      assert.equal(result.rows.length,role==='admin'?1:0);
    });
  }
}
for (const role of ['safety','claims','maintenance','chicago_management','driver']) {
  for (const [table,id] of [['efs_other_requests',requestId],['driver_cash_advances',cashId]]) {
    await check(`${role} cannot void ${table}`,role,async()=>{
      try { const result=await voidRequest(table,id); assert.equal(result.rows.length,0); }
      catch(error) { assert.match(error.message,/permission to void/); }
    });
  }
}
for (const [table,id] of [['efs_other_requests',requestId],['driver_cash_advances',cashId]]) {
  await check(`blank reason denied for ${table}`,'admin',async()=>{
    await assert.rejects(voidRequest(table,id,'   '),/reason is required/);
  });
  await check(`other fields cannot change while voiding ${table}`,'dispatch',async()=>{
    await assert.rejects(db.query(`UPDATE ${table} SET voided_at=now(),void_reason='Reason',amount=1 WHERE id=$1`,[id]),/cannot change other/);
  });
  await check(`voided ${table} is immutable`,'admin',async()=>{
    await voidRequest(table,id);
    await assert.rejects(db.query(`UPDATE ${table} SET voided_at=null,void_reason=null,voided_by=null WHERE id=$1`,[id]),/cannot be changed/);
  });
}
await check('voided cash advance no longer contributes a deduction','accounting',async()=>{
  assert.equal((await db.query('SELECT count(*)::int n FROM driver_expenses')).rows[0].n,1);
  await voidRequest('driver_cash_advances',cashId);
  assert.equal((await db.query('SELECT count(*)::int n FROM driver_expenses')).rows[0].n,0);
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int n FROM driver_expenses')).rows[0].n,1);
});
await check('normal EFS receipt updates remain possible','accounting',async()=>{
  assert.equal((await db.query('UPDATE efs_other_requests SET purpose=$1 WHERE id=$2 RETURNING id',['Lumper',requestId])).rows.length,1);
});
await check('service can still save cash advance email ID',null,async()=>{
  assert.equal((await db.query('UPDATE driver_cash_advances SET resend_email_id=$1 WHERE id=$2 RETURNING id',['email-id',cashId])).rows.length,1);
},true);
await check('cash advance values cannot be edited by void permission','dispatch',async()=>{
  await assert.rejects(db.query('UPDATE driver_cash_advances SET amount=1 WHERE id=$1',[cashId]),/only be updated to void/);
});
await check('cannot create pre-voided request','admin',async()=>{
  await assert.rejects(db.query("INSERT INTO efs_other_requests (id,amount,purpose,voided_at,void_reason,voided_by) VALUES (gen_random_uuid(),1,'Fuel',now(),'Reason',$1)",[userId]),/cannot be created as voided/);
});
await db.exec(await readFile(new URL('../../supabase/migrations/20261021165254_efs_money_code_details_and_stuff.sql', import.meta.url), 'utf8'));
for (const role of ['admin','accounting','manager','supervisor','dispatch','afterhours']) {
  for (const [table,id] of [['efs_other_requests',requestId],['driver_cash_advances',cashId]]) {
    await check(`${role} can save money code details and Stuff audit on ${table}`,role,async()=>{
      const result=await db.query(`UPDATE ${table} SET purpose_detail='Trailer alignment',is_trailer_repair=true,trailer_number='407613',location_name='Shop',location_address='4425 Stickney Ave, Toledo, OH 43612',entered_in_stuff=true WHERE id=$1 RETURNING *`,[id]);
      assert.equal(result.rows.length,1);
      assert.equal(result.rows[0].purpose_detail,'Trailer alignment');
      assert.equal(result.rows[0].stuff_entered_by,userId);
      assert.ok(result.rows[0].stuff_entered_at);
      assert.equal(Number(result.rows[0].amount),100);
      const cleared=await db.query(`UPDATE ${table} SET entered_in_stuff=false WHERE id=$1 RETURNING *`,[id]);
      assert.equal(cleared.rows[0].stuff_entered_by,null);
      assert.equal(cleared.rows[0].stuff_entered_at,null);
    });
  }
}
for (const role of ['safety','claims','maintenance','chicago_management','driver']) {
  await check(`${role} cannot change money code details`,role,async()=>{
    try { const result=await db.query('UPDATE efs_other_requests SET entered_in_stuff=true WHERE id=$1 RETURNING id',[requestId]); assert.equal(result.rows.length,0); }
    catch(error) { assert.match(error.message,/permission to update money code details/); }
  });
}
await check('cash money code permission cannot change its financial amount','dispatch',async()=>{
  await assert.rejects(db.query("UPDATE driver_cash_advances SET purpose_detail='Personal meals',amount=1 WHERE id=$1",[cashId]),/only be updated/);
});
await check('Stuff actor cannot be forged','admin',async()=>{
  await assert.rejects(db.query('UPDATE driver_cash_advances SET stuff_entered_by=$1 WHERE id=$2',[userId,cashId]),/audit fields/);
});
await check('voiding still works after the metadata migration','dispatch',async()=>{
  await voidRequest('driver_cash_advances',cashId);
  await assert.rejects(db.query('UPDATE driver_cash_advances SET entered_in_stuff=true WHERE id=$1',[cashId]),/cannot be changed/);
});
await db.close();
console.log(`${passed} database permission and void lifecycle checks passed`);
