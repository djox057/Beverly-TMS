-- Rename Chicago to YARD in reference cities
UPDATE heatmap_reference_cities 
SET city_name = 'YARD', latitude = 41.53803937985626, longitude = -87.57862703756386 
WHERE city_name = 'Chicago' AND state = 'IL';

-- Rename Chicago to YARD in existing heatmap counts
UPDATE heatmap_city_counts 
SET city_name = 'YARD', city_lat = 41.53803937985626, city_lng = -87.57862703756386 
WHERE city_name = 'Chicago' AND city_state = 'IL';