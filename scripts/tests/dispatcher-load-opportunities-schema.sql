CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE companies(id uuid PRIMARY KEY, name text);
CREATE TABLE user_roles(user_id uuid,role text);
CREATE TABLE drivers(id uuid PRIMARY KEY,dispatcher_id uuid, is_active boolean DEFAULT true);
CREATE TABLE trucks(id uuid PRIMARY KEY,driver1_id uuid,company_id uuid,is_active boolean DEFAULT true);
CREATE TABLE orders(id uuid PRIMARY KEY,truck_id uuid,driver1_id uuid,driver2_id uuid,booked_by_company_id uuid,
prebook boolean DEFAULT false,retrieval boolean DEFAULT false,recovery_assigned boolean DEFAULT false,
canceled boolean DEFAULT false,p_status text DEFAULT 'Available',recovery_auto_cancel_at timestamptz,
pickup_datetime timestamptz,delivery_datetime timestamptz,delivery_end_datetime timestamptz,notes text);
CREATE TABLE pickup_drops(id uuid PRIMARY KEY,order_id uuid,type text,sequence_number integer,datetime timestamptz,end_datetime timestamptz,latitude numeric,longitude numeric);
CREATE TABLE order_files(id uuid PRIMARY KEY,order_id uuid,file_category text);
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
