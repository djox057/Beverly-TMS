## Goal

Replace the current "Cities" view watercolor/blob rendering with a DAT-style choropleth: every 3-digit ZIP zone in the lower 48 is a flat-shaded polygon. Each city's loads are attributed (point-in-polygon, by avg lat/lng) to its containing ZIP3 zone, and the zone is colored by the existing 1–10 rating. Zones with no data render light grey. State borders stay overlaid on top.

## What changes

Only `src/pages/BeverlyHeatmapUsMap.tsx` (Cities tab rendering) plus one bundled GeoJSON asset. No DB changes, no RPC changes, no changes to state view, rating formula, or rating colors.

## User-visible behavior

- Cities tab renders ~920 ZIP3 polygons covering the lower 48.
- Each polygon is one flat color from the existing `RATING_COLORS` palette (1–10) — no gradients, no blur, no bleed.
- Zones containing at least one city's centroid → colored by aggregated rating of cities falling inside them.
- Zones with no cities → light grey (`hsl(var(--muted))`).
- State borders remain drawn on top in a thin contrast line so DAT-style boundaries are still visible.
- Hover a zone → tooltip shows zone code + aggregated metrics (count, freight, rating).
- Click a zone → opens existing city dialog, scoped to cities inside that zone (reuses the dialog component already wired to city data).
- Legend (1–10 color scale) stays as-is.

## How it works

1. **Bundle ZIP3 polygons.** Add `src/assets/us-zip3.geojson` (US 3-digit ZIP boundary file, ~2 MB, lower 48 only, simplified to keep size down). Imported statically so it ships in the bundle.
2. **Aggregate cities → ZIP3.** On city data load, for each city run point-in-polygon (`d3-geo`'s `geoContains`) against the ZIP3 feature collection using the city's avg lat/lng. Accumulate `count`, `freight`, `loaded_miles`, `dh_miles` per ZIP3.
3. **Compute per-zone rating.** Reuse the existing rating function on the aggregated zone totals (same weighted geometric mean used today for cities), producing a 1–10 integer per zone.
4. **Render.** Replace the `<g>` containing the watercolor `<defs>` + blob circles + center dots with a single `<g>` of `<path>` elements — one per ZIP3 feature — generated via `geoPath(projection)`. Fill = `RATING_COLORS[rating]` for zones with data, `hsl(var(--muted))` otherwise. Stroke = very thin neutral border so adjacent zones are distinguishable (DAT-style).
5. **Keep state overlay.** The existing state `<path>` layer is re-rendered above the ZIP3 layer with a slightly thicker stroke and no fill, so state boundaries remain the dominant geographic reference.
6. **Hover / click.** `onMouseEnter` / `onClick` on each ZIP3 path drives the existing tooltip + dialog. Dialog receives the list of cities inside that zone (already in memory from step 2).

## Technical details

- New file: `src/assets/us-zip3.geojson` (sourced from a public ZIP3 boundary dataset, simplified with `mapshaper` to ~2 MB, lower 48 only).
- `BeverlyHeatmapUsMap.tsx`:
  - Remove: `MILE_TO_SVG`, `BLOB_RADIUS`, `centerOpacityFor`, `<defs>` radial gradients, watercolor `<g>` with `mixBlendMode: "multiply"`, per-city center `<circle>` markers.
  - Add: `useMemo` that builds `Map<zip3, { cities: City[], totals, rating }>` from the city array.
  - Add: ZIP3 `<g>` rendered before the state overlay `<g>`.
  - Reuse: existing `projection`, `geoPath`, `RATING_COLORS`, rating function, and city dialog component.
- No new dependencies — `d3-geo` is already used.
- Performance: ~920 simple paths render in well under one frame; one-time point-in-polygon over ~hundreds of cities is negligible.

## Out of scope

- State view, rating formula, RPCs, DB schema, other heatmap tabs.
- KMA market areas or county fallback (rejected — user chose ZIP3).
- 60-mile radius spread across zones (rejected — user chose point-in-polygon).
