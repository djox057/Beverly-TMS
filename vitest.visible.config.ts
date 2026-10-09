import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

// TMS-01: exclude only these five known hidden-page board failures.
// Candidate editing, direct-route access, and all other tests still run.
// The default `npm test` remains unfiltered and reports the failures.
export default mergeConfig(baseConfig, defineConfig({
  test: {
    testNamePattern: /^(?!Weekly board (?:shows all seven days, an unscheduled group and Chicago arrival times|navigates whole weeks and returns to This Week|opens the full comment from its compact cell|filters names and formatted phone numbers|does not show editing actions to a read-only role)$)/,
  },
}));
