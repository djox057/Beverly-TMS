// These MCP tool modules run in the Supabase Edge (Deno) runtime, not in the browser bundle.
// `moduleDetection: "force"` treats every file as a module, so the ambient `Deno`
// declaration must be placed inside `declare global` to be visible project-wide.
export {};

declare global {
  const Deno: {
    env: { get(name: string): string | undefined };
  };
}
