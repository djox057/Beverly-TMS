---
name: Anon access policies
description: Lists which public-facing (anon role) RLS SELECT policies exist and why
type: constraint
---
**Removed (2026-05-04):** "Allow anon select" on `public.trucks` and `public.trailers`.

These policies previously exposed sensitive fleet data (VINs, plates, insurance dates, driver/dispatcher assignments) to unauthenticated users via the REST API. They were dropped after a security scan. Authenticated role-scoped policies remain and provide proper access for dispatchers, drivers, and management.

**Why:** Trucks and trailers contain sensitive fleet data that must never be readable by anonymous users. Do NOT recreate `TO anon` policies on `trucks` or `trailers`.

If a feature genuinely needs unauthenticated access to equipment data, route it through an edge function with explicit field allow-listing instead of opening RLS to `anon`.
