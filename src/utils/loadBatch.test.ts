import { expect, it } from "vitest";
import { validateBatchEntries, type BatchLoadEntry } from "./loadBatch";
const rc = new File(["rc"], "rc.pdf", { type: "application/pdf" });
const entries = (): BatchLoadEntry[] => [
  { id: "a", loadNumber: "LOAD-A", rc },
  { id: "b", loadNumber: "LOAD-B", rc },
  { id: "c", loadNumber: "LOAD-C", rc },
];
it("accepts three individually numbered loads with an RC for each", () => expect(validateBatchEntries(entries())).toBeNull());
it("requires an RC and number for every copy", () => {
  const rows = entries(); rows[1].rc = null;
  expect(validateBatchEntries(rows)).toMatch(/one RC/);
  rows[1].loadNumber = "";
  expect(validateBatchEntries(rows)).toMatch(/number for every/);
});
it("rejects duplicate load numbers ignoring whitespace, case and #", () => {
  const rows = entries(); rows[1].loadNumber = " # load-a ";
  expect(validateBatchEntries(rows)).toMatch(/different load number/);
});
it("rejects invalid batch sizes", () => {
  expect(validateBatchEntries(entries().slice(0, 1))).toMatch(/2 and 50/);
  expect(validateBatchEntries(Array(51).fill(entries()[0]))).toMatch(/2 and 50/);
});
