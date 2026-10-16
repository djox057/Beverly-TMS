DO $$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.create_load_batch(jsonb,jsonb,jsonb)'::regprocedure);
  definition := replace(definition, 'p.order_id = create_load_batch.order_id', 'p.order_id = (created->>''id'')::uuid');
  EXECUTE definition;
END $$;
