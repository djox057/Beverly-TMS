// These MCP tool modules run in the Supabase Edge (Deno) runtime, not in the browser bundle.
// Minimal ambient declaration so the app's TypeScript build can still typecheck them.
declare const Deno: {
  env: { get(name: string): string | undefined };
};
