import { lazy, Suspense, type ComponentType } from "react";
import { Button } from "@/components/ui/button";

export function lazyPage(load: () => Promise<{ default: ComponentType }>) {
  const Page = lazy(() => load().catch((error: unknown) => {
    console.error("Unable to load page module", error);
    // An open tab can reference a chunk removed by a newer deployment.
    // Reload the current URL only when the user chooses to recover.
    return {
      default: () => (
        <div role="alert" className="space-y-3 p-6">
          <p>This page couldn’t load. Check your connection and reload the page.</p>
          <Button variant="outline" onClick={() => window.location.reload()}>Reload page</Button>
        </div>
      ),
    };
  }));

  return function LazyPage() {
    return (
      <Suspense fallback={<div role="status" className="p-6 text-sm text-muted-foreground">Loading page…</div>}>
        <Page />
      </Suspense>
    );
  };
}
