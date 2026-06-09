
-- 1. Reset reference markets to the curated list
DELETE FROM public.heatmap_reference_cities;

INSERT INTO public.heatmap_reference_cities (city_name, state, latitude, longitude, population) VALUES
('Birmingham','AL',33.5207,-86.8025,0),('Montgomery','AL',32.3668,-86.3000,0),('Mobile','AL',30.6954,-88.0399,0),('Huntsville','AL',34.7304,-86.5861,0),('Tuscaloosa','AL',33.2098,-87.5692,0),
('Phoenix','AZ',33.4484,-112.0740,0),('Tucson','AZ',32.2226,-110.9747,0),('Flagstaff','AZ',35.1983,-111.6513,0),('Yuma','AZ',32.6927,-114.6277,0),('Kingman','AZ',35.1894,-114.0530,0),
('Little Rock','AR',34.7465,-92.2896,0),('Fort Smith','AR',35.3859,-94.3985,0),('Fayetteville','AR',36.0822,-94.1719,0),('Jonesboro','AR',35.8423,-90.7043,0),('Texarkana','AR',33.4418,-94.0377,0),
('Los Angeles','CA',34.0522,-118.2437,0),('San Francisco / Oakland','CA',37.7749,-122.4194,0),('San Diego','CA',32.7157,-117.1611,0),('Sacramento','CA',38.5816,-121.4944,0),('Fresno','CA',36.7378,-119.7871,0),('Bakersfield','CA',35.3733,-119.0187,0),('San Bernardino / Riverside','CA',34.0083,-117.3961,0),
('Denver','CO',39.7392,-104.9903,0),('Colorado Springs','CO',38.8339,-104.8214,0),('Pueblo','CO',38.2544,-104.6091,0),('Fort Collins','CO',40.5853,-105.0844,0),('Grand Junction','CO',39.0639,-108.5506,0),
('Hartford','CT',41.7658,-72.6734,0),('New Haven','CT',41.3083,-72.9279,0),('Bridgeport','CT',41.1865,-73.1952,0),('Stamford','CT',41.0534,-73.5387,0),('Waterbury','CT',41.5582,-73.0515,0),
('Wilmington','DE',39.7391,-75.5398,0),('Dover','DE',39.1582,-75.5244,0),('Newark','DE',39.6837,-75.7497,0),
('Miami','FL',25.7617,-80.1918,0),('Orlando','FL',28.5383,-81.3792,0),('Tampa','FL',27.9506,-82.4572,0),('Jacksonville','FL',30.3322,-81.6557,0),('Fort Myers','FL',26.6406,-81.8723,0),('Tallahassee','FL',30.4383,-84.2807,0),
('Atlanta','GA',33.7490,-84.3880,0),('Savannah','GA',32.0809,-81.0912,0),('Augusta','GA',33.4735,-82.0105,0),('Macon','GA',32.8407,-83.6324,0),('Columbus','GA',32.4610,-84.9877,0),
('Boise','ID',43.6150,-116.2023,0),('Idaho Falls','ID',43.4917,-112.0339,0),('Twin Falls','ID',42.5630,-114.4609,0),('Pocatello','ID',42.8713,-112.4455,0),('Coeur d''Alene','ID',47.6777,-116.7805,0),
('Chicago','IL',41.8781,-87.6298,0),('Springfield','IL',39.7817,-89.6501,0),('Peoria','IL',40.6936,-89.5890,0),('Rockford','IL',42.2711,-89.0940,0),('Champaign','IL',40.1164,-88.2434,0),
('Indianapolis','IN',39.7684,-86.1581,0),('Fort Wayne','IN',41.0793,-85.1394,0),('South Bend','IN',41.6764,-86.2520,0),('Evansville','IN',37.9716,-87.5711,0),('Gary / Northwest Indiana','IN',41.5934,-87.3464,0),
('Des Moines','IA',41.5868,-93.6250,0),('Cedar Rapids','IA',41.9779,-91.6656,0),('Davenport','IA',41.5236,-90.5776,0),('Sioux City','IA',42.4999,-96.4003,0),('Council Bluffs','IA',41.2619,-95.8608,0),
('Kansas City','KS',39.1142,-94.6275,0),('Wichita','KS',37.6872,-97.3301,0),('Topeka','KS',39.0473,-95.6752,0),('Salina','KS',38.8403,-97.6114,0),('Dodge City','KS',37.7528,-100.0171,0),
('Louisville','KY',38.2527,-85.7585,0),('Lexington','KY',38.0406,-84.5037,0),('Bowling Green','KY',36.9685,-86.4808,0),('Paducah','KY',37.0834,-88.6000,0),('Owensboro','KY',37.7742,-87.1133,0),
('New Orleans','LA',29.9511,-90.0715,0),('Baton Rouge','LA',30.4515,-91.1871,0),('Shreveport','LA',32.5252,-93.7502,0),('Lafayette','LA',30.2241,-92.0198,0),('Lake Charles','LA',30.2266,-93.2174,0),
('Portland','ME',43.6591,-70.2568,0),('Bangor','ME',44.8016,-68.7712,0),('Augusta','ME',44.3106,-69.7795,0),('Lewiston','ME',44.1004,-70.2148,0),('Presque Isle','ME',46.6812,-68.0159,0),
('Baltimore','MD',39.2904,-76.6122,0),('Frederick','MD',39.4143,-77.4105,0),('Hagerstown','MD',39.6418,-77.7200,0),('Salisbury','MD',38.3607,-75.5994,0),('Rockville / Gaithersburg','MD',39.0840,-77.1528,0),
('Boston','MA',42.3601,-71.0589,0),('Worcester','MA',42.2626,-71.8023,0),('Springfield','MA',42.1015,-72.5898,0),('Lowell / Lawrence','MA',42.6334,-71.3162,0),('New Bedford','MA',41.6362,-70.9342,0),
('Detroit','MI',42.3314,-83.0458,0),('Grand Rapids','MI',42.9634,-85.6681,0),('Lansing','MI',42.7325,-84.5555,0),('Flint','MI',43.0125,-83.6875,0),('Kalamazoo','MI',42.2917,-85.5872,0),('Saginaw','MI',43.4195,-83.9508,0),
('Minneapolis / St. Paul','MN',44.9778,-93.2650,0),('Duluth','MN',46.7867,-92.1005,0),('Rochester','MN',44.0121,-92.4802,0),('St. Cloud','MN',45.5579,-94.1632,0),('Mankato','MN',44.1636,-93.9994,0),
('Jackson','MS',32.2988,-90.1848,0),('Gulfport','MS',30.3674,-89.0928,0),('Hattiesburg','MS',31.3271,-89.2903,0),('Tupelo','MS',34.2576,-88.7034,0),('Meridian','MS',32.3643,-88.7037,0),
('St. Louis','MO',38.6270,-90.1994,0),('Kansas City','MO',39.0997,-94.5786,0),('Springfield','MO',37.2090,-93.2923,0),('Columbia','MO',38.9517,-92.3341,0),('Joplin','MO',37.0842,-94.5133,0),
('Billings','MT',45.7833,-108.5007,0),('Missoula','MT',46.8721,-113.9940,0),('Great Falls','MT',47.4941,-111.2833,0),('Bozeman','MT',45.6770,-111.0429,0),('Butte','MT',46.0038,-112.5347,0),
('Omaha','NE',41.2565,-95.9345,0),('Lincoln','NE',40.8136,-96.7026,0),('Grand Island','NE',40.9264,-98.3420,0),('Kearney','NE',40.6994,-99.0817,0),('North Platte','NE',41.1239,-100.7654,0),
('Las Vegas','NV',36.1699,-115.1398,0),('Reno','NV',39.5296,-119.8138,0),('Carson City','NV',39.1638,-119.7674,0),('Elko','NV',40.8324,-115.7631,0),('Mesquite','NV',36.8055,-114.0672,0),
('Manchester','NH',42.9956,-71.4548,0),('Nashua','NH',42.7654,-71.4676,0),('Concord','NH',43.2081,-71.5376,0),('Portsmouth','NH',43.0718,-70.7626,0),('Lebanon','NH',43.6423,-72.2518,0),
('Newark','NJ',40.7357,-74.1724,0),('Jersey City','NJ',40.7178,-74.0431,0),('Elizabeth','NJ',40.6640,-74.2107,0),('Trenton','NJ',40.2206,-74.7597,0),('Camden','NJ',39.9259,-75.1196,0),
('Albuquerque','NM',35.0844,-106.6504,0),('Las Cruces','NM',32.3199,-106.7637,0),('Santa Fe','NM',35.6870,-105.9378,0),('Roswell','NM',33.3943,-104.5230,0),('Farmington','NM',36.7281,-108.2187,0),
('New York City','NY',40.7128,-74.0060,0),('Buffalo','NY',42.8864,-78.8784,0),('Rochester','NY',43.1566,-77.6088,0),('Syracuse','NY',43.0481,-76.1474,0),('Albany','NY',42.6526,-73.7562,0),('Binghamton','NY',42.0987,-75.9180,0),
('Charlotte','NC',35.2271,-80.8431,0),('Raleigh / Durham','NC',35.7796,-78.6382,0),('Greensboro','NC',36.0726,-79.7920,0),('Wilmington','NC',34.2257,-77.9447,0),('Asheville','NC',35.5951,-82.5515,0),('Fayetteville','NC',35.0527,-78.8784,0),
('Fargo','ND',46.8772,-96.7898,0),('Bismarck','ND',46.8083,-100.7837,0),('Grand Forks','ND',47.9253,-97.0329,0),('Minot','ND',48.2330,-101.2957,0),('Williston','ND',48.1470,-103.6180,0),
('Columbus','OH',39.9612,-82.9988,0),('Cleveland','OH',41.4993,-81.6944,0),('Cincinnati','OH',39.1031,-84.5120,0),('Toledo','OH',41.6528,-83.5379,0),('Dayton','OH',39.7589,-84.1916,0),('Akron','OH',41.0814,-81.5190,0),
('Oklahoma City','OK',35.4676,-97.5164,0),('Tulsa','OK',36.1540,-95.9928,0),('Lawton','OK',34.6087,-98.3903,0),('Enid','OK',36.3956,-97.8784,0),('Ardmore','OK',34.1743,-97.1436,0),
('Portland','OR',45.5152,-122.6784,0),('Eugene','OR',44.0521,-123.0868,0),('Salem','OR',44.9429,-123.0351,0),('Medford','OR',42.3265,-122.8756,0),('Bend','OR',44.0582,-121.3153,0),
('Philadelphia','PA',39.9526,-75.1652,0),('Pittsburgh','PA',40.4406,-79.9959,0),('Harrisburg','PA',40.2732,-76.8867,0),('Allentown','PA',40.6084,-75.4902,0),('Scranton / Wilkes-Barre','PA',41.4090,-75.6624,0),('Erie','PA',42.1292,-80.0851,0),
('Providence','RI',41.8240,-71.4128,0),('Warwick','RI',41.7001,-71.4162,0),('Pawtucket','RI',41.8787,-71.3826,0),('Newport','RI',41.4901,-71.3128,0),
('Charleston','SC',32.7765,-79.9311,0),('Columbia','SC',34.0007,-81.0348,0),('Greenville / Spartanburg','SC',34.8526,-82.3940,0),('Florence','SC',34.1954,-79.7626,0),('Myrtle Beach','SC',33.6891,-78.8867,0),
('Sioux Falls','SD',43.5446,-96.7311,0),('Rapid City','SD',44.0805,-103.2310,0),('Aberdeen','SD',45.4647,-98.4865,0),('Watertown','SD',44.8997,-97.1142,0),('Pierre','SD',44.3683,-100.3510,0),
('Nashville','TN',36.1627,-86.7816,0),('Memphis','TN',35.1495,-90.0490,0),('Knoxville','TN',35.9606,-83.9207,0),('Chattanooga','TN',35.0456,-85.3097,0),('Jackson','TN',35.6145,-88.8139,0),
('Dallas / Fort Worth','TX',32.7767,-96.7970,0),('Houston','TX',29.7604,-95.3698,0),('San Antonio','TX',29.4241,-98.4936,0),('Austin','TX',30.2672,-97.7431,0),('El Paso','TX',31.7619,-106.4850,0),('Laredo','TX',27.5306,-99.4803,0),('McAllen','TX',26.2034,-98.2300,0),('Amarillo','TX',35.2220,-101.8313,0),
('Salt Lake City','UT',40.7608,-111.8910,0),('Provo','UT',40.2338,-111.6585,0),('Ogden','UT',41.2230,-111.9738,0),('St. George','UT',37.0965,-113.5684,0),('Logan','UT',41.7370,-111.8338,0),
('Burlington','VT',44.4759,-73.2121,0),('Montpelier','VT',44.2601,-72.5754,0),('Rutland','VT',43.6106,-72.9726,0),('Brattleboro','VT',42.8509,-72.5579,0),('St. Albans','VT',44.8109,-73.0832,0),
('Northern Virginia','VA',38.8462,-77.3064,0),('Richmond','VA',37.5407,-77.4360,0),('Norfolk / Virginia Beach','VA',36.8508,-76.2859,0),('Roanoke','VA',37.2710,-79.9414,0),('Charlottesville','VA',38.0293,-78.4767,0),('Bristol','VA',36.5951,-82.1887,0),
('Seattle / Tacoma','WA',47.6062,-122.3321,0),('Spokane','WA',47.6588,-117.4260,0),('Vancouver','WA',45.6280,-122.6739,0),('Yakima','WA',46.6021,-120.5059,0),('Tri-Cities','WA',46.2087,-119.1372,0),('Bellingham','WA',48.7519,-122.4787,0),
('Charleston','WV',38.3498,-81.6326,0),('Huntington','WV',38.4192,-82.4452,0),('Morgantown','WV',39.6295,-79.9559,0),('Parkersburg','WV',39.2667,-81.5615,0),('Martinsburg','WV',39.4562,-77.9636,0),
('Milwaukee','WI',43.0389,-87.9065,0),('Madison','WI',43.0731,-89.4012,0),('Green Bay','WI',44.5133,-88.0133,0),('Appleton','WI',44.2619,-88.4154,0),('Eau Claire','WI',44.8113,-91.4985,0),('La Crosse','WI',43.8014,-91.2396,0),
('Cheyenne','WY',41.1400,-104.8202,0),('Casper','WY',42.8666,-106.3131,0),('Laramie','WY',41.3114,-105.5911,0),('Rock Springs','WY',41.5875,-109.2029,0),('Gillette','WY',44.2911,-105.5022,0);

-- 2. New RPC: aggregate orders within p_radius_miles of each reference market
CREATE OR REPLACE FUNCTION public.get_us_map_market_stats(
  p_direction text,
  p_from timestamptz,
  p_radius_miles numeric DEFAULT 60
)
RETURNS TABLE(
  market text,
  state text,
  latitude numeric,
  longitude numeric,
  count bigint,
  freight numeric,
  loaded_miles numeric,
  dh_miles numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH chosen AS (
    SELECT DISTINCT ON (pd.order_id)
      pd.order_id,
      pd.latitude AS lat,
      pd.longitude AS lng
    FROM pickup_drops pd
    JOIN orders o ON o.id = pd.order_id
    WHERE o.canceled = false
      AND o.pickup_datetime >= p_from
      AND pd.type = CASE WHEN p_direction = 'inbound' THEN 'delivery' ELSE 'pickup' END
      AND pd.latitude IS NOT NULL
      AND pd.longitude IS NOT NULL
    ORDER BY pd.order_id,
             CASE WHEN p_direction = 'inbound'
                  THEN -COALESCE(pd.sequence_number, 0)
                  ELSE COALESCE(pd.sequence_number, 0) END
  ),
  -- Coarse bounding-box prefilter, then exact Haversine; pick nearest market per order
  matched AS (
    SELECT DISTINCT ON (c.order_id)
      c.order_id,
      m.city_name AS market_name,
      m.state AS market_state,
      m.latitude AS market_lat,
      m.longitude AS market_lng,
      ( 3959 * 2 * asin(sqrt(
          power(sin(radians((m.latitude - c.lat) / 2)), 2)
          + cos(radians(c.lat)) * cos(radians(m.latitude))
          * power(sin(radians((m.longitude - c.lng) / 2)), 2)
        ))
      ) AS dist_miles
    FROM chosen c
    JOIN heatmap_reference_cities m
      ON abs(m.latitude  - c.lat) < 1.2
     AND abs(m.longitude - c.lng) < 1.5
    WHERE ( 3959 * 2 * asin(sqrt(
            power(sin(radians((m.latitude - c.lat) / 2)), 2)
            + cos(radians(c.lat)) * cos(radians(m.latitude))
            * power(sin(radians((m.longitude - c.lng) / 2)), 2)
          ))
        ) <= p_radius_miles
    ORDER BY c.order_id, dist_miles ASC
  )
  SELECT
    mt.market_name AS market,
    mt.market_state AS state,
    mt.market_lat AS latitude,
    mt.market_lng AS longitude,
    COUNT(*)::bigint AS count,
    COALESCE(SUM(o.freight_amount), 0)::numeric AS freight,
    COALESCE(SUM(o.loaded_miles), 0)::numeric AS loaded_miles,
    COALESCE(SUM(o.dh_miles), 0)::numeric AS dh_miles
  FROM matched mt
  JOIN orders o ON o.id = mt.order_id
  GROUP BY mt.market_name, mt.market_state, mt.market_lat, mt.market_lng;
$function$;

GRANT EXECUTE ON FUNCTION public.get_us_map_market_stats(text, timestamptz, numeric) TO authenticated, service_role;
