-- Create companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create brokers table
CREATE TABLE public.brokers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  mc_number TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create drivers table
CREATE TABLE public.drivers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  home_address TEXT,
  home_city TEXT,
  home_state TEXT,
  home_latitude DECIMAL(10,8),
  home_longitude DECIMAL(11,8),
  license_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create trailers table
CREATE TABLE public.trailers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trailer_number TEXT NOT NULL UNIQUE,
  trailer_type TEXT,
  capacity INTEGER,
  status TEXT DEFAULT 'available',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create trucks table
CREATE TABLE public.trucks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_number TEXT NOT NULL UNIQUE,
  trailer_id UUID REFERENCES public.trailers(id),
  driver1_id UUID REFERENCES public.drivers(id),
  driver2_id UUID REFERENCES public.drivers(id),
  fleet_assignment TEXT,
  truck_type TEXT,
  year INTEGER,
  make TEXT,
  model TEXT,
  vin TEXT,
  status TEXT DEFAULT 'available',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  load_number TEXT NOT NULL UNIQUE,
  company_id UUID REFERENCES public.companies(id) NOT NULL,
  broker_id UUID REFERENCES public.brokers(id),
  truck_id UUID REFERENCES public.trucks(id),
  driver1_id UUID REFERENCES public.drivers(id),
  driver2_id UUID REFERENCES public.drivers(id),
  trailer_id UUID REFERENCES public.trailers(id),
  pickup_datetime TIMESTAMP WITH TIME ZONE,
  delivery_datetime TIMESTAMP WITH TIME ZONE,
  freight_amount DECIMAL(10,2),
  driver_price DECIMAL(10,2),
  status TEXT DEFAULT 'pending',
  mileage INTEGER,
  invoiced BOOLEAN DEFAULT false,
  notes TEXT,
  booked_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create pickup_drops table for multiple pickups/deliveries per order
CREATE TABLE public.pickup_drops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pickup', 'delivery')),
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT,
  datetime TIMESTAMP WITH TIME ZONE,
  contact_name TEXT,
  contact_phone TEXT,
  special_instructions TEXT,
  sequence_number INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trailers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickup_drops ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allowing all operations for authenticated users for now)
-- Companies policies
CREATE POLICY "Allow all operations on companies" ON public.companies FOR ALL USING (true);

-- Brokers policies  
CREATE POLICY "Allow all operations on brokers" ON public.brokers FOR ALL USING (true);

-- Drivers policies
CREATE POLICY "Allow all operations on drivers" ON public.drivers FOR ALL USING (true);

-- Trailers policies
CREATE POLICY "Allow all operations on trailers" ON public.trailers FOR ALL USING (true);

-- Trucks policies
CREATE POLICY "Allow all operations on trucks" ON public.trucks FOR ALL USING (true);

-- Orders policies
CREATE POLICY "Allow all operations on orders" ON public.orders FOR ALL USING (true);

-- Pickup drops policies
CREATE POLICY "Allow all operations on pickup_drops" ON public.pickup_drops FOR ALL USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_brokers_updated_at BEFORE UPDATE ON public.brokers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_trailers_updated_at BEFORE UPDATE ON public.trailers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_trucks_updated_at BEFORE UPDATE ON public.trucks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pickup_drops_updated_at BEFORE UPDATE ON public.pickup_drops FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();