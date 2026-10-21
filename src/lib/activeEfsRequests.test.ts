import { expect, it, vi } from "vitest";
import { fetchActiveEfsRows } from "./activeEfsRequests";

it("keeps the active-only filter when the migration is available", async () => {
  const result = { data: [{ id: "active" }], error: null };
  const query = vi.fn().mockResolvedValue(result);
  expect(await fetchActiveEfsRows(query)).toBe(result);
  expect(query.mock.calls).toEqual([[true]]);
});
it.each(["42703", "PGRST204"])("keeps existing queries working before the migration (%s)", async code => {
  const result = { data: [{ id: "existing" }], error: null };
  const query = vi.fn().mockResolvedValueOnce({ data: null, error: { code, message: 'column voided_at does not exist' } }).mockResolvedValueOnce(result);
  expect(await fetchActiveEfsRows(query)).toBe(result);
  expect(query.mock.calls).toEqual([[true], [false]]);
});
it.each([
  { code: "42501", message: "permission denied for voided_at" },
  { code: "42703", message: "column receipt_path does not exist" },
  { code: "PGRST301", message: "JWT expired" },
])("preserves errors instead of retrying without filters: $code $message", async error => {
  const result = { data: null, error };
  const query = vi.fn().mockResolvedValue(result);
  expect(await fetchActiveEfsRows(query)).toBe(result);
  expect(query).toHaveBeenCalledOnce();
});
