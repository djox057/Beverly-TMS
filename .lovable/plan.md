

## Cleanup: Remove Unused/Legacy Code (Revised)

Incorporates all feedback. Changes from original plan are marked with **[REVISED]**.

---

### 1. Dead Edge Functions -- Delete 6 function directories

| Function | Status |
|---|---|
| `hello-world` | Delete directory, remove from `config.toml` |
| `cleanup-yard-arrivals` | Delete directory, remove from `config.toml` |
| `samsara-debug` | Delete directory (no config.toml entry exists) |
| `hos-debug` | Delete directory (no config.toml entry exists) |
| `geocode-address` | Delete directory (no config.toml entry exists) |
| `calculate-route` | Delete directory (no config.toml entry exists) |

**[REVISED] Config.toml**: Only 2 entries need removal (`hello-world`, `cleanup-yard-arrivals`). The other 4 functions have no config entries -- confirmed by inspecting the file.

**[REVISED] External webhooks**: None of these 6 functions are registered as external webhooks. `samsara-debug` and `hos-debug` are ad-hoc debug endpoints only ever called manually via `TestHosSync.tsx` or direct curl. The actual Samsara integration uses `samsara-locations`. No external services point at these endpoints.

Also call the `delete_edge_functions` tool to remove deployed instances from Supabase.

---

### 2. Dead Frontend Files -- Delete 2 files

| File | Why |
|---|---|
| `src/components/TestHosSync.tsx` | Unused dev component with hardcoded auth tokens (security liability) |
| `src/App.css` | Vite boilerplate CSS, never imported -- all styling uses Tailwind |

---

### 3. Fix npm Dependencies

**[REVISED] `@playwright/test`**: Move from `dependencies` to `devDependencies` (currently incorrectly in production deps at line 17). This keeps the test infrastructure functional while removing ~50MB from production builds.

**Remove entirely**:
- `@opencvjs/web` (~8MB WASM, zero imports in src/)
- `@types/xlsx` (zero imports, `xlsx` ships its own types)

---

### 4. Remove Wasted Prefetches from App.tsx

Remove the `trucks` and `trailers` prefetch entries from `prefetchData()`. These use simple `select('*')` queries but the actual hooks (`useTrucks`, `useTrailers`) use enriched queryFns under the same keys, causing an immediate refetch that wastes the prefetch entirely.

Keep `brokers` and `companies` prefetches (their query keys and queryFns match their hooks).

---

### 5. What is NOT being removed

- All other edge functions (have active frontend references)
- `DocumentScannerDialog.tsx`, `documentScanner.ts`, `jscanify` (actively used)
- `clear-weekly-plans` (active CRON job with real logic)
- `playwright.config.ts`, `playwright-fixture.ts` (test infrastructure, kept alongside the moved devDependency)

---

### Summary of all file changes

| Change | Files |
|---|---|
| Delete 6 edge function dirs | `supabase/functions/{hello-world,samsara-debug,hos-debug,geocode-address,calculate-route,cleanup-yard-arrivals}/index.ts` |
| Remove 2 config.toml entries | `supabase/config.toml` (lines for `hello-world` and `cleanup-yard-arrivals`) |
| Delete dead component | `src/components/TestHosSync.tsx` |
| Delete dead CSS | `src/App.css` |
| Move Playwright to devDeps | `package.json` (move from dependencies to devDependencies) |
| Remove 2 unused packages | `package.json` (delete `@opencvjs/web`, `@types/xlsx`) |
| Remove wasted prefetches | `src/App.tsx` (remove trucks + trailers from `prefetchData`) |

