import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

// TMS-01: the visible-page suite excludes these five hidden-page board tests.
// Candidate editing, direct-route access, and all other tests still run.
// The default `npm test` runs the complete board suite.
export default mergeConfig(baseConfig, defineConfig({
  test: {
    testNamePattern: /^(?!Weekly board (?:shows all seven days, an unscheduled group and Chicago arrival times|navigates whole weeks and returns to This Week|opens the full comment from its compact cell|filters names and formatted phone numbers|does not show editing actions to a read-only role)$)/,
  },
}));
