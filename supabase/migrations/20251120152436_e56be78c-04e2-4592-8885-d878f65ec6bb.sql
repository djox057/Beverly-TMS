-- Create materialized view that pre-computes all order data with joins
CREATE MATERIALIZED VIEW orders_materialized_view AS
SELECT 
  o.id,
  o.created_at,
  o.updated_at,
  o.load_number,
  o.internal_load_number,
  o.broker_load_number,
  o.truck_id,
  o.trailer_id,
  o.driver1_id,
  o.driver2_id,
  o.original_driver1_id,
  o.original_driver2_id,
  o.original_truck_id,
  o.original_trailer_id,
  o.broker_id,
  o.company_id,
  o.booked_by_company_id,
  o.pickup_datetime,
  o.pickup_end_datetime,
  o.delivery_datetime,
  o.delivery_end_datetime,
  o.freight_amount,
  o.driver_price,
  o.tonu,
  o.tonu_driver,
  o.loaded_miles,
  o.dh_miles,
  o.mileage,
  o.booked_by,
  o.detention,
  o.detention_driver,
  o.layover,
  o.layover_driver,
  o.extra_stop,
  o.extra_stop_driver,
  o.lumper,
  o.lumper_driver,
  o.late_fee,
  o.late_fee_driver,
  o.wrong_address_fee,
  o.wrong_address_fee_driver,
  o.no_tracking_fee,
  o.no_tracking_fee_driver,
  o.other_charges,
  o.other_charges_driver,
  o.notes,
  o.invoiced,
  o.locked,
  o.status,
  o.escort_fee,
  o.escort_fee_broker_paid,
  o.is_recovery,
  o.original_miles,
  o.original_freight_amount,
  o.original_driver_price,
  o.original_loaded_miles,
  o.original_dh_miles,
  o.original_detention,
  o.original_detention_driver,
  o.original_layover,
  o.original_layover_driver,
  o.original_extra_stop,
  o.original_extra_stop_driver,
  o.original_lumper,
  o.original_lumper_driver,
  o.original_late_fee,
  o.original_late_fee_driver,
  o.original_wrong_address_fee,
  o.original_wrong_address_fee_driver,
  o.original_no_tracking_fee,
  o.original_no_tracking_fee_driver,
  o.original_other_charges,
  o.original_other_charges_driver,
  o.original_tonu,
  o.original_tonu_driver,
  o.original_escort_fee,
  o.original_escort_fee_broker_paid,
  o.original_notes,
  o.recovery_miles,
  o.recovery_freight_amount,
  o.recovery_driver_price,
  o.recovery_date,
  o.canceled,
  o.weight,
  o.commodity,
  o.po_number,
  o.pu_number,
  o.reference_number,
  o.date_change_notes,
  
  -- Truck data
  t.truck_number,
  t.company_id as truck_company_id,
  
  -- Truck company data
  tc.name as truck_company_name,
  
  -- Trailer data
  tr.trailer_number,
  
  -- Driver 1 data
  d1.name as driver1_name,
  
  -- Driver 2 data
  d2.name as driver2_name,
  
  -- Original driver 1 data
  od1.name as original_driver1_name,
  
  -- Original driver 2 data
  od2.name as original_driver2_name,
  
  -- Original truck data
  ot.truck_number as original_truck_number,
  
  -- Original trailer data
  otr.trailer_number as original_trailer_number,
  
  -- Broker data
  b.name as broker_name,
  b.address as broker_address,
  b.mc_number as broker_mc_number,
  
  -- Company data
  c.name as company_name,
  
  -- Booked by company data
  bc.name as booked_by_company_name,
  
  -- Pickup/Drop data (aggregated as JSONB)
  COALESCE(
    (SELECT jsonb_agg(
      jsonb_build_object(
        'id', pd.id,
        'type', pd.type,
        'city', pd.city,
        'state', pd.state,
        'zip_code', pd.zip_code,
        'datetime', pd.datetime,
        'end_datetime', pd.end_datetime,
        'address', pd.address,
        'company_name', pd.company_name,
        'contact_name', pd.contact_name,
        'contact_phone', pd.contact_phone,
        'special_instructions', pd.special_instructions,
        'sequence_number', pd.sequence_number,
        'arrived_at', pd.arrived_at,
        'checked_out_at', pd.checked_out_at,
        'going_to_at', pd.going_to_at
      ) ORDER BY pd.sequence_number, pd.type, pd.datetime
    )
    FROM pickup_drops pd
    WHERE pd.order_id = o.id),
    '[]'::jsonb
  ) as pickup_drops,
  
  -- Order files data (aggregated as JSONB)
  COALESCE(
    (SELECT jsonb_agg(
      jsonb_build_object(
        'id', of.id,
        'file_name', of.file_name,
        'file_path', of.file_path,
        'file_size', of.file_size,
        'content_type', of.content_type,
        'file_category', of.file_category,
        'created_at', of.created_at
      )
    )
    FROM order_files of
    WHERE of.order_id = o.id),
    '[]'::jsonb
  ) as order_files
  
FROM orders o
LEFT JOIN trucks t ON o.truck_id = t.id
LEFT JOIN companies tc ON t.company_id = tc.id
LEFT JOIN trailers tr ON o.trailer_id = tr.id
LEFT JOIN drivers d1 ON o.driver1_id = d1.id
LEFT JOIN drivers d2 ON o.driver2_id = d2.id
LEFT JOIN drivers od1 ON o.original_driver1_id = od1.id
LEFT JOIN drivers od2 ON o.original_driver2_id = od2.id
LEFT JOIN trucks ot ON o.original_truck_id = ot.id
LEFT JOIN trailers otr ON o.original_trailer_id = otr.id
LEFT JOIN brokers b ON o.broker_id = b.id
LEFT JOIN companies c ON o.company_id = c.id
LEFT JOIN companies bc ON o.booked_by_company_id = bc.id;

-- Create unique index required for CONCURRENT refresh
CREATE UNIQUE INDEX idx_orders_mv_id ON orders_materialized_view(id);

-- Create performance indexes
CREATE INDEX idx_orders_mv_created_at ON orders_materialized_view(created_at DESC);
CREATE INDEX idx_orders_mv_booked_by ON orders_materialized_view(booked_by);
CREATE INDEX idx_orders_mv_company_id ON orders_materialized_view(company_id);
CREATE INDEX idx_orders_mv_truck_id ON orders_materialized_view(truck_id);
CREATE INDEX idx_orders_mv_driver1_id ON orders_materialized_view(driver1_id);
CREATE INDEX idx_orders_mv_status ON orders_materialized_view(status);
CREATE INDEX idx_orders_mv_locked_invoiced ON orders_materialized_view(locked, invoiced);
CREATE INDEX idx_orders_mv_canceled ON orders_materialized_view(canceled);

-- Schedule refresh every 5 minutes using pg_cron
SELECT cron.schedule(
  'refresh-orders-materialized-view',
  '*/5 * * * *',
  $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY orders_materialized_view;
  $$
);