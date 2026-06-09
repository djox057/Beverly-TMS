# Cities heatmap (weighted density surface)

Add a second view to `BeverlyHeatmapUsMap` that renders a smooth, topographic-style freight density surface from city-level stats — like an elevation map of market strength — instead of bubbles per city.

## UX

- Add a view toggle next to the existing Inbound/Outbound toggle: **States** | **Cities**.
- States view stays exactly as is.
- Cities view renders the same US base map, but with the state choropleth replaced by a smooth heat surface. Tooltip on hover shows the nearest city's stats (count, freight, RPM, rating).
- Color scale (low → high):
  ```text
  red → orange → yellow → light green → green
  ```
- Legend updates to match.

## Data

Use the existing `get_us_map_city_stats` RPC (same Mon→now Chicago window, same Inbound/Outbound semantics as states). Per row: `city, state, count, freight, loaded_miles, dh_miles, latitude, longitude`.

Compute per-city derived metrics client-side (cheap, < a few hundred cities):
- `rpm = freight / max(loaded_miles, 1)`
- `dhPerLoad = dh_miles / count`
- `avgGross = freight / count`
- `rating` — reuse the same 1–10 composite scoring used for states so the scales are comparable.

Heatmap weight per city:
```ts
weight = rating * Math.log(count + 1)
```
This is what gets fed into the density layer (so one lucky $5k load on a single order can't paint a region green).

## Rendering approach

Use **deck.gl `HeatmapLayer`** overlaid on the existing `react-simple-maps` SVG via a `DeckGL` canvas matched to the same Albers USA projection. Why deck.gl:
- Built-in GPU kernel density, smooth blending between nearby cities (Dallas+Houston corridor effect).
- Configurable `radiusPixels`, `intensity`, `threshold`, custom `colorRange`.
- Handles a few thousand weighted points trivially.

Add deps: `deck.gl @deck.gl/react @deck.gl/aggregation-layers @deck.gl/core`.

Projection alignment:
- Continue using `react-simple-maps` `geoAlbersUsa` for the state outlines underneath.
- Mount a `DeckGL` canvas absolutely positioned over the SVG with an orthographic/identity view, projecting each city's `[lng, lat]` through the same `geoAlbersUsa` projection (using `d3-geo`) to screen-space `[x, y]` before passing into `HeatmapLayer`. This avoids needing Mapbox/tiles entirely (no tokens, no postMessage origin issue).

`HeatmapLayer` config:
```ts
new HeatmapLayer({
  data: cities,
  getPosition: c => [c.screenX, c.screenY], // pre-projected
  getWeight: c => c.rating * Math.log(c.count + 1),
  radiusPixels: 60,
  intensity: 1,
  threshold: 0.03,
  colorRange: [
    [139,0,0],     // red
    [255,102,0],   // orange
    [255,170,0],   // yellow
    [182,217,0],   // light green
    [102,204,51],  // green
    [0,160,0],     // strong green
  ],
})
```

State borders remain visible on top with low-opacity strokes so users still see geography.

## Interaction

- Hover: small floating tooltip showing the closest city within ~80 px (computed from the same screen-projected points) with `city, state, rating, count, freight, RPM`.
- Click optional (skip for v1).
- Direction toggle continues to work; prefetch opposite direction in background like states.

## Performance

- Server aggregation already done by `get_us_map_city_stats`. One RPC call per direction.
- React Query: 10 min `staleTime`, `keepPreviousData`, background prefetch of opposite direction.
- City projection runs once per `(direction, container size)` change; HeatmapLayer is GPU.

## Files

- `src/pages/BeverlyHeatmapUsMap.tsx` — add view toggle, cities data hook (`useCityRatings`), composite rating fn shared with states (extract to local helper), deck.gl overlay, tooltip, updated legend.
- `package.json` — add deck.gl deps.

No new tables or RPCs; no edge functions.
