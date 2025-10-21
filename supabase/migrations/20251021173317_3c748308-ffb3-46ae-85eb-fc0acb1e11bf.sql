-- Add missing safety role policies for file management

-- Safety can update driver files (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'driver_files' 
    AND policyname = 'Safety can update driver_files'
  ) THEN
    CREATE POLICY "Safety can update driver_files"
    ON public.driver_files
    FOR UPDATE
    USING (has_role(auth.uid(), 'safety'::app_role));
  END IF;
END $$;

-- Safety can update truck files (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'truck_files' 
    AND policyname = 'Safety can update truck_files'
  ) THEN
    CREATE POLICY "Safety can update truck_files"
    ON public.truck_files
    FOR UPDATE
    USING (has_role(auth.uid(), 'safety'::app_role));
  END IF;
END $$;

-- Safety can create order files (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'order_files' 
    AND policyname = 'Safety can create order_files'
  ) THEN
    CREATE POLICY "Safety can create order_files"
    ON public.order_files
    FOR INSERT
    WITH CHECK (has_role(auth.uid(), 'safety'::app_role));
  END IF;
END $$;

-- Safety can update order files (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'order_files' 
    AND policyname = 'Safety can update order_files'
  ) THEN
    CREATE POLICY "Safety can update order_files"
    ON public.order_files
    FOR UPDATE
    USING (has_role(auth.uid(), 'safety'::app_role));
  END IF;
END $$;

-- Safety can delete order files (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'order_files' 
    AND policyname = 'Safety can delete order_files'
  ) THEN
    CREATE POLICY "Safety can delete order_files"
    ON public.order_files
    FOR DELETE
    USING (has_role(auth.uid(), 'safety'::app_role));
  END IF;
END $$;

-- Safety can update trailer files (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'trailer_files' 
    AND policyname = 'Safety can update trailer_files'
  ) THEN
    CREATE POLICY "Safety can update trailer_files"
    ON public.trailer_files
    FOR UPDATE
    USING (has_role(auth.uid(), 'safety'::app_role));
  END IF;
END $$;

-- Safety can view trailer files (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'trailer_files' 
    AND policyname = 'Safety can view trailer_files'
  ) THEN
    CREATE POLICY "Safety can view trailer_files"
    ON public.trailer_files
    FOR SELECT
    USING (has_role(auth.uid(), 'safety'::app_role));
  END IF;
END $$;

-- Safety can delete trailer files (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'trailer_files' 
    AND policyname = 'Safety can delete trailer_files'
  ) THEN
    CREATE POLICY "Safety can delete trailer_files"
    ON public.trailer_files
    FOR DELETE
    USING (has_role(auth.uid(), 'safety'::app_role));
  END IF;
END $$;