// Only used by mounted state-based Reports widgets; query caches are handled centrally.
export const REPORTS_SOURCE_CHANGED = "reports-source-changed";
export function notifyReportsSource(source: string) {
  window.dispatchEvent(new CustomEvent(REPORTS_SOURCE_CHANGED, { detail: source }));
}
export function listenReportsSources(sources: string[], refresh: () => void) {
  const listener = (event: Event) => {
    if (sources.includes((event as CustomEvent<string>).detail)) refresh();
  };
  window.addEventListener(REPORTS_SOURCE_CHANGED, listener);
  return () => window.removeEventListener(REPORTS_SOURCE_CHANGED, listener);
}
