## TS 7 Prep — 4 Safe Non-Blocking Changes

TypeScript stays on 5.8.3. typescript-eslint stays on 8.38.0. No compiler upgrade in this PR.

---

### 1. Explicit `types` arrays

**`tsconfig.app.json`** — add `"types": ["vite/client", "node"]` inside `compilerOptions`.
- `vite/client` replaces the ambient reference currently in `src/vite-env.d.ts` (harmless to keep both; the triple-slash reference will remain and works either way).
- `node` is included because a handful of files touch `process.env` / Node globals via Vite's `import.meta.env` shim resolution and to keep parity with what implicit inclusion gives us today.
- `@types/react` and `@types/react-dom` are **not** added — React is only used through explicit `import` statements, no ambient `JSX.*` usage. If the type-check surfaces `JSX` global errors, I'll add `react` to the array and note it in the summary.

**`tsconfig.node.json`** — add `"types": ["node"]` inside `compilerOptions`. This config only covers Node-side files, so `node` is the only ambient package needed.

**`tsconfig.json`** (root) — no change; it has no `files`/`include`.

### 2. `typecheck` script + baseline

Add to `package.json` scripts:
```
"typecheck": "tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json"
```
Then run it twice and report cold/warm times and any errors. Expected: clean pass. If item 1 introduces errors I fix them in the same PR and note what I added.

### 3. `scripts/upload-template.ts` — fold into `tsconfig.node.json`

Inspection: it's a plain Node ESM script that imports `@supabase/supabase-js` and Node built-ins (`fs`, `process`). Its needs (Node runtime, bundler-style module resolution, no DOM) fully overlap with `vite.config.ts`. A separate `tsconfig.scripts.json` would duplicate every option of `tsconfig.node.json` for no benefit.

**Change:** update `tsconfig.node.json` `include` from `["vite.config.ts"]` to `["vite.config.ts", "scripts/**/*.ts"]`. No new tsconfig file. Since `typecheck` already invokes `tsconfig.node.json`, the script is automatically type-checked from now on — no separate script entry needed.

Note: `tsconfig.node.json` has `strict: true`. If the script has latent strict-mode errors under TS 5.8 today, I will fix them in-place (they're likely just `any` on error catches) and note them in the summary. If the diff gets non-trivial, I'll stop and report instead of quietly rewriting the script.

### 4. Package manager consolidation

**Investigation findings:**
- `bun.lock` (325 KB, text format, current), `bun.lockb` (197 KB, legacy binary format), and `package-lock.json` (349 KB) all exist with identical mtimes — Lovable's platform appears to regenerate them together, so mtime is not a tiebreaker.
- No CI configs (`.github/`, `Dockerfile`, etc.) exist in the repo — nothing to check against.
- `README.md` is empty.
- `.gitignore` has no lockfile entries.
- The presence of `bun.lock` (Bun's newer text lockfile, added in Bun 1.1+) alongside `bun.lockb` is itself a sign someone recently ran `bun install` — Bun writes the text lock automatically.

**Recommendation:** standardize on **Bun**.
- Bun is the newer, faster manager and is what Lovable's sandbox uses by default (`bun add` / `bun install` are the documented commands).
- Its peer-dependency resolution is stricter about version ranges than `npm --legacy-peer-deps`, which is exactly the property we want when the TS 7 bump lands — we want `typescript-eslint`'s narrow peer range to cause a visible failure, not a silent forced install.
- Keeping `bun.lock` (text, diffable) over `bun.lockb` (binary, deprecated for source control).

**Changes:**
- Delete `bun.lockb` and `package-lock.json`.
- Add both to `.gitignore` so a stray `npm install` / older `bun` doesn't reintroduce them:
  ```
  # Package manager lockfiles (project uses Bun; bun.lock is the source of truth)
  package-lock.json
  bun.lockb
  yarn.lock
  pnpm-lock.yaml
  ```
- Keep `bun.lock` committed.

**Blast-radius flag:** if Lovable's cloud build path specifically looks for `package-lock.json` (some hosting integrations do), removing it could break deploys. I'll delete both files in the last step and verify the dev server still comes up cleanly before finalizing. If the dev server fails, I revert just the deletion and leave the `.gitignore` prep in place, then report back.

---

## Execution order (once in build mode)

1. Edit `tsconfig.app.json` — add `types`.
2. Edit `tsconfig.node.json` — add `types` and extend `include` to cover `scripts/**/*.ts`.
3. Edit `package.json` — add `typecheck` script.
4. Run `bun run typecheck` twice; capture cold + warm times and any errors.
5. Fix any surfaced errors (expected: none, or trivial script-level fixes).
6. Update `.gitignore` with lockfile entries.
7. Delete `bun.lockb` and `package-lock.json` via `rm`.
8. Restart dev server; confirm it still boots.
9. Summarize: what changed, timings, any surprises.

## Non-goals

- No `typescript` or `typescript-eslint` version changes.
- No TS 7 upgrade.
- No source-file refactors beyond fixing errors caused strictly by items 1 or 3.