// Isolated PostgreSQL/RLS regression checks; never connects to production.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(await readFile(new URL('./dispatcher-load-opportunities-schema.sql', import.meta.url), 'utf8'));
await db.exec(`
CREATE TYPE public.app_role AS ENUM ('supervisor', 'dispatch', 'admin', 'accounting', 'manager');
ALTER TABLE user_roles ALTER COLUMN role TYPE app_role USING role::app_role;
ALTER TABLE drivers ADD COLUMN name text;
ALTER TABLE trucks ADD COLUMN truck_number text;
ALTER TABLE orders ADD COLUMN original_driver1_id uuid, ADD COLUMN original_driver2_id uuid, ADD COLUMN booked_by text;
CREATE TABLE profiles(user_id uuid, full_name text);
CREATE TABLE dispatcher_supervisors(supervisor_id uuid, dispatcher_id uuid);
CREATE FUNCTION supervisor_team_user_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$
 SELECT ARRAY(SELECT auth.uid() UNION SELECT dispatcher_id FROM dispatcher_supervisors WHERE supervisor_id=auth.uid())
$$;
GRANT SELECT ON profiles,dispatcher_supervisors TO authenticated;
CREATE TABLE trip_week_statements(id int,truck_number text,driver_name text,file_path text,paid_amount numeric);
CREATE SCHEMA storage;
CREATE TABLE storage.objects(name text,bucket_id text);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY visible_orders ON orders FOR SELECT TO authenticated USING
  (true);
ALTER TABLE trip_week_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON trip_week_statements,storage.objects TO authenticated;
`);
const migration = await readFile(new URL('../../supabase/migrations/20261111145347_supervisor_dispatch_remaining_gaps.sql', import.meta.url), 'utf8');
await db.exec(migration);
const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const supervisor=uuid(1),other=uuid(2),ownDriver=uuid(3),otherDriver=uuid(4),truck=uuid(5);
await db.query("INSERT INTO user_roles VALUES ($1,'supervisor'),($2,'dispatch')",[supervisor,other]);
await db.query('INSERT INTO drivers(id,dispatcher_id,name) VALUES ($1,$2,\'Own Driver\'),($3,$4,\'Other Driver\')',[ownDriver,supervisor,otherDriver,other]);
await db.query("INSERT INTO trucks(id,truck_number) VALUES ($1,'03212')",[truck]);
await db.query('INSERT INTO orders(id,truck_id,driver1_id) VALUES ($1,$2,$3),($4,$2,$5)',[uuid(6),truck,ownDriver,uuid(7),otherDriver]);
await db.exec(`INSERT INTO trip_week_statements VALUES
 (1,'03212','Own Driver','own.pdf',123.45),
 (2,'03212','Other Driver','other.pdf',999),
 (3,'3212','Own Driver','wrong-truck.pdf',999);
INSERT INTO storage.objects VALUES ('own.pdf','trip-statements'),('other.pdf','trip-statements'),('wrong-truck.pdf','trip-statements'),('own.pdf','other-bucket');`);
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[supervisor]);
await db.exec('SET ROLE authenticated');
assert.deepEqual((await db.query('SELECT id,paid_amount FROM trip_week_statements')).rows,[{id:1,paid_amount:'123.45'}]);
assert.deepEqual((await db.query('SELECT name,bucket_id FROM storage.objects')).rows,[{name:'own.pdf',bucket_id:'trip-statements'}]);
assert.equal((await db.query('UPDATE trip_week_statements SET paid_amount=1 RETURNING id')).rows.length,0);
await assert.rejects(db.exec("INSERT INTO trip_week_statements VALUES (4,'03212','Own Driver','new.pdf',1)"),/row-level security/);
await assert.rejects(db.exec("INSERT INTO storage.objects VALUES ('new.pdf','trip-statements')"),/row-level security/);
assert.equal((await db.query('DELETE FROM storage.objects RETURNING name')).rows.length,0);
// Adding/removing a Fleets assignment expands/revokes statement and file access.
await db.exec('RESET ROLE');
await db.query('INSERT INTO dispatcher_supervisors VALUES ($1,$2)',[supervisor,other]);
await db.exec('SET ROLE authenticated');
assert.deepEqual((await db.query('SELECT id FROM trip_week_statements ORDER BY id')).rows,[{id:1},{id:2}]);
assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,2);
await db.exec('RESET ROLE; DELETE FROM dispatcher_supervisors; SET ROLE authenticated');
assert.deepEqual((await db.query('SELECT id FROM trip_week_statements')).rows,[{id:1}]);
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[other]);
assert.equal((await db.query('SELECT * FROM trip_week_statements')).rows.length,0);
assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,0);
console.log('Supervisor reads visible trip payment/file; other driver, truck, bucket, dispatch and writes remain denied.');
await db.close();
