-- The invoker preview wrapper needs schema USAGE to reach its explicitly granted helper.
-- USAGE does not grant table access or execution of other private functions.
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
