import { describe, expect, it, vi } from "vitest";
import { repairEmail, sendRepairEmail, MAINTENANCE_REPLY_TO } from "../../supabase/functions/notify-mandatory-yard-repair/delivery";
import { readFileSync } from "node:fs";

const context = { unit: "7346", driverName: "Assigned Driver", dispatcherEmail: "dispatch@example.com", description: '<script>alert("test")</script>', dueDate: "2026-10-12", reportedDate: "2026-10-05", reportedBy: "Maintenance Worker" };
describe("mandatory yard repair email", () => {
  it("routes only to the dispatcher with the exact oil-change Reply-To list", () => {
    const mail = repairEmail(context);
    expect(mail.to).toEqual(["dispatch@example.com"]);
    const source = readFileSync("supabase/functions/send-document-reminders/index.ts", "utf8");
    const reference = source.match(/const MAINTENANCE_REPLY_TO = \[([\s\S]*?)\];/)![1].match(/"([^"\n]+)"/g)!.map(value => JSON.parse(value));
    expect(mail.reply_to).toEqual(reference);
    expect(MAINTENANCE_REPLY_TO).toEqual(reference);
    expect(mail).not.toHaveProperty("cc");
  });
  it("includes the unit, driver, deadline and reporter and escapes entered HTML", () => {
    const mail = repairEmail(context);
    expect(mail.subject).toContain("7346"); expect(mail.subject).toContain("10/12/2026");
    for (const value of ["Assigned Driver", "Maintenance Worker", "10/05/2026", "&lt;script&gt;"]) expect(mail.html).toContain(value);
    expect(mail.html).not.toContain("<script>");
  });
  it("rejects missing driver or dispatcher instead of sending to an unrelated fallback", () => {
    expect(() => repairEmail({ ...context, driverName: "" })).toThrow();
    expect(() => repairEmail({ ...context, dispatcherEmail: "" })).toThrow();
  });
  it("uses the same idempotency key on retries and detects provider failures", async () => {
    const transport = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "mail-id" }) });
    await sendRepairEmail(repairEmail(context), "task-id", "test-key", transport);
    await sendRepairEmail(repairEmail(context), "task-id", "test-key", transport);
    expect(transport.mock.calls[0][1].headers["Idempotency-Key"]).toBe("mandatory-yard-repair/task-id");
    expect(transport.mock.calls[1][1].headers["Idempotency-Key"]).toBe("mandatory-yard-repair/task-id");
    transport.mockResolvedValue({ ok: false, json: async () => ({ message: "failure" }) });
    await expect(sendRepairEmail(repairEmail(context), "task-id", "test-key", transport)).rejects.toThrow("did not accept");
  });
});
