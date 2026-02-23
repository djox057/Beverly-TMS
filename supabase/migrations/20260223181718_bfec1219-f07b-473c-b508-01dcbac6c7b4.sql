ALTER TABLE heatmap_city_counts
  ADD COLUMN IF NOT EXISTS total_freight numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_miles numeric DEFAULT 0;