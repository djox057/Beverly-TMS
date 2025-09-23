-- Insert sample companies
INSERT INTO public.companies (name) VALUES 
('BF Prime'),
('Beverly group'), 
('Beverly Freight'),
('BF Prime Unite'),
('BG Prime Inc');

-- Insert sample brokers
INSERT INTO public.brokers (name, mc_number, address, city, state, zip_code, phone, email) VALUES 
('ABC Logistics', 'MC123456', '123 Commerce St', 'Chicago', 'IL', '60601', '(312) 555-0123', 'dispatch@abclogistics.com'),
('XYZ Transport', 'MC789012', '456 Freight Ave', 'Dallas', 'TX', '75201', '(214) 555-0456', 'loads@xyztransport.com'),
('QuickMove Inc', 'MC345678', '789 Logistics Blvd', 'Atlanta', 'GA', '30303', '(404) 555-0789', 'booking@quickmove.com'),
('National Freight', 'MC901234', '321 Trucking Way', 'Phoenix', 'AZ', '85001', '(602) 555-0321', 'orders@nationalfreight.com'),
('Prime Carriers', 'MC567890', '654 Highway Dr', 'Denver', 'CO', '80202', '(303) 555-0654', 'dispatch@primecarriers.com');

-- Insert sample drivers
INSERT INTO public.drivers (name, phone, email, home_address, home_city, home_state, home_latitude, home_longitude, license_number) VALUES 
('John Smith', '(555) 123-4567', 'john.smith@email.com', '1234 Oak Street', 'Springfield', 'IL', 39.7817, -89.6501, 'DL123456789'),
('Mike Johnson', '(555) 234-5678', 'mike.johnson@email.com', '5678 Pine Ave', 'Columbus', 'OH', 39.9612, -82.9988, 'DL234567890'),
('David Wilson', '(555) 345-6789', 'david.wilson@email.com', '9012 Elm Dr', 'Indianapolis', 'IN', 39.7684, -86.1581, 'DL345678901'),
('Robert Brown', '(555) 456-7890', 'robert.brown@email.com', '3456 Maple St', 'Kansas City', 'MO', 39.0997, -94.5786, 'DL456789012'),
('James Davis', '(555) 567-8901', 'james.davis@email.com', '7890 Cedar Ln', 'Memphis', 'TN', 35.1495, -90.0490, 'DL567890123'),
('William Miller', '(555) 678-9012', 'william.miller@email.com', '2468 Birch Rd', 'Louisville', 'KY', 38.2527, -85.7585, 'DL678901234'),
('Thomas Garcia', '(555) 789-0123', 'thomas.garcia@email.com', '1357 Ash Way', 'Nashville', 'TN', 36.1627, -86.7816, 'DL789012345'),
('Christopher Martinez', '(555) 890-1234', 'chris.martinez@email.com', '9753 Willow St', 'Little Rock', 'AR', 34.7465, -92.2896, 'DL890123456');

-- Insert sample trailers
INSERT INTO public.trailers (trailer_number, trailer_type, capacity, status) VALUES 
('TRL-001', 'Dry Van', 48000, 'available'),
('TRL-002', 'Refrigerated', 45000, 'available'), 
('TRL-003', 'Flatbed', 48000, 'available'),
('TRL-004', 'Dry Van', 48000, 'in_use'),
('TRL-005', 'Refrigerated', 45000, 'in_use'),
('TRL-006', 'Flatbed', 48000, 'maintenance'),
('TRL-007', 'Dry Van', 48000, 'available'),
('TRL-008', 'Container', 50000, 'available');

-- Insert sample trucks with driver and trailer assignments
INSERT INTO public.trucks (truck_number, trailer_id, driver1_id, driver2_id, fleet_assignment, truck_type, year, make, model, status) VALUES 
('TRK-001', 
  (SELECT id FROM public.trailers WHERE trailer_number = 'TRL-001'), 
  (SELECT id FROM public.drivers WHERE name = 'John Smith'), 
  NULL, 
  'Fleet A', 'Semi-Truck', 2022, 'Freightliner', 'Cascadia', 'available'),
('TRK-002', 
  (SELECT id FROM public.trailers WHERE trailer_number = 'TRL-002'), 
  (SELECT id FROM public.drivers WHERE name = 'Mike Johnson'), 
  (SELECT id FROM public.drivers WHERE name = 'David Wilson'), 
  'Fleet A', 'Semi-Truck', 2021, 'Peterbilt', '579', 'in_use'),
('TRK-003', 
  (SELECT id FROM public.trailers WHERE trailer_number = 'TRL-003'), 
  (SELECT id FROM public.drivers WHERE name = 'Robert Brown'), 
  NULL, 
  'Fleet B', 'Semi-Truck', 2023, 'Kenworth', 'T680', 'available'),
('TRK-004', 
  (SELECT id FROM public.trailers WHERE trailer_number = 'TRL-004'), 
  (SELECT id FROM public.drivers WHERE name = 'James Davis'), 
  (SELECT id FROM public.drivers WHERE name = 'William Miller'), 
  'Fleet B', 'Semi-Truck', 2020, 'Volvo', 'VNL', 'in_use'),
('TRK-005', 
  (SELECT id FROM public.trailers WHERE trailer_number = 'TRL-005'), 
  (SELECT id FROM public.drivers WHERE name = 'Thomas Garcia'), 
  NULL, 
  'Fleet C', 'Semi-Truck', 2022, 'Mack', 'Anthem', 'available'),
('TRK-006', 
  NULL, 
  (SELECT id FROM public.drivers WHERE name = 'Christopher Martinez'), 
  NULL, 
  'Fleet C', 'Semi-Truck', 2021, 'International', 'LT', 'maintenance');

-- Insert sample orders
INSERT INTO public.orders (load_number, company_id, broker_id, truck_id, driver1_id, driver2_id, trailer_id, pickup_datetime, delivery_datetime, freight_amount, driver_price, status, mileage, invoiced, notes, booked_by) VALUES 
('LD001234', 
  (SELECT id FROM public.companies WHERE name = 'BF Prime'), 
  (SELECT id FROM public.brokers WHERE name = 'ABC Logistics'), 
  (SELECT id FROM public.trucks WHERE truck_number = 'TRK-002'), 
  (SELECT id FROM public.drivers WHERE name = 'Mike Johnson'), 
  (SELECT id FROM public.drivers WHERE name = 'David Wilson'), 
  (SELECT id FROM public.trailers WHERE trailer_number = 'TRL-002'), 
  '2024-01-15 08:00:00', 
  '2024-01-17 16:00:00', 
  4500.00, 
  2800.00, 
  'in_transit', 
  1250, 
  false, 
  'Temperature controlled load - maintain 34-36°F', 
  'Sarah Johnson'),
('LD001235', 
  (SELECT id FROM public.companies WHERE name = 'Beverly Freight'), 
  (SELECT id FROM public.brokers WHERE name = 'XYZ Transport'), 
  (SELECT id FROM public.trucks WHERE truck_number = 'TRK-004'), 
  (SELECT id FROM public.drivers WHERE name = 'James Davis'), 
  (SELECT id FROM public.drivers WHERE name = 'William Miller'), 
  (SELECT id FROM public.trailers WHERE trailer_number = 'TRL-004'), 
  '2024-01-16 06:00:00', 
  '2024-01-18 14:00:00', 
  3200.00, 
  2100.00, 
  'delivered', 
  890, 
  true, 
  'Completed successfully - no issues', 
  'Mark Thompson'),
('LD001236', 
  (SELECT id FROM public.companies WHERE name = 'BG Prime Inc'), 
  (SELECT id FROM public.brokers WHERE name = 'QuickMove Inc'), 
  (SELECT id FROM public.trucks WHERE truck_number = 'TRK-001'), 
  (SELECT id FROM public.drivers WHERE name = 'John Smith'), 
  NULL, 
  (SELECT id FROM public.trailers WHERE trailer_number = 'TRL-001'), 
  '2024-01-18 10:00:00', 
  '2024-01-20 12:00:00', 
  2800.00, 
  1800.00, 
  'pending', 
  650, 
  false, 
  'Standard dry goods shipment', 
  'Lisa Rodriguez');

-- Insert pickup and delivery locations for the orders
INSERT INTO public.pickup_drops (order_id, type, address, city, state, zip_code, datetime, contact_name, contact_phone, sequence_number) VALUES 
-- Order LD001234 pickup and delivery
((SELECT id FROM public.orders WHERE load_number = 'LD001234'), 'pickup', '1500 Industrial Blvd', 'Chicago', 'IL', '60616', '2024-01-15 08:00:00', 'Tony Warehouse', '(312) 555-1111', 1),
((SELECT id FROM public.orders WHERE load_number = 'LD001234'), 'delivery', '2200 Distribution Center Dr', 'Atlanta', 'GA', '30309', '2024-01-17 16:00:00', 'Maria Gonzalez', '(404) 555-2222', 2),

-- Order LD001235 pickup and delivery  
((SELECT id FROM public.orders WHERE load_number = 'LD001235'), 'pickup', '800 Manufacturing Way', 'Detroit', 'MI', '48201', '2024-01-16 06:00:00', 'Steve Factory', '(313) 555-3333', 1),
((SELECT id FROM public.orders WHERE load_number = 'LD001235'), 'delivery', '3400 Retail Plaza', 'Miami', 'FL', '33101', '2024-01-18 14:00:00', 'Jennifer Store', '(305) 555-4444', 2),

-- Order LD001236 pickup and delivery
((SELECT id FROM public.orders WHERE load_number = 'LD001236'), 'pickup', '950 Port Authority Rd', 'Long Beach', 'CA', '90802', '2024-01-18 10:00:00', 'Carlos Shipping', '(562) 555-5555', 1),
((SELECT id FROM public.orders WHERE load_number = 'LD001236'), 'delivery', '1800 Commerce St', 'Phoenix', 'AZ', '85003', '2024-01-20 12:00:00', 'Amanda Logistics', '(602) 555-6666', 2);