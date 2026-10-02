import { describe, expect, it, vi } from "vitest";
import { supervisorScopedClient } from "../../supabase/functions/_shared/supervisorAccess";

describe("supervisor bulk request scope", () => {
  const userClient = { name: "authenticated-client" };
  const serviceFor = (roles: string[], error: Error | null = null) => ({
    from: vi.fn(() => ({ select: () => ({ eq: async () => ({ data: roles.map(role => ({ role })), error }) }) })),
  });
  it.each([{ roles: ["supervisor"] }, { roles: ["supervisor", "dispatch"] }])("uses RLS for supervisor roles %j", async ({ roles }) => {
    expect(await supervisorScopedClient(serviceFor(roles), userClient, "self")).toBe(userClient);
  });
  it.each([{ roles: ["dispatch"] }, { roles: ["admin"] }, { roles: ["supervisor", "manager"] }])("preserves existing access for %j", async ({ roles }) => {
    const service = serviceFor(roles);
    expect(await supervisorScopedClient(service, userClient, "self")).toBe(service);
  });
  it("fails closed when role lookup fails", async () => {
    await expect(supervisorScopedClient(serviceFor([], new Error("role lookup failed")), userClient, "self")).rejects.toThrow("role lookup failed");
  });
});
