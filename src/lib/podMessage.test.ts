import { describe, expect, it } from "vitest";
import { attachmentFilename, canSendPodMessage, MAX_ATTACHMENT_BYTES, resolveBooker, resolveManager, selectPods } from "../../supabase/functions/send-pod-message/model";
const booker = { user_id: "booker1", full_name: "Jane Booker", email: "jane@example.test", office: "Čačak" };
const manager = { ...booker, user_id: "manager1", full_name: "Office Manager", email: "manager@example.test" };
const file = (id: string, file_size = 100) => ({ id, file_name: `${id}.jpg`, file_path: `load/${id}.jpg`, file_size, content_type: "image/jpeg" });
describe("POD message server rules", () => {
  it("permits only the requested roles including multi-role users", () => {
    expect(canSendPodMessage(["dispatch", "admin"])).toBe(true);
    expect(canSendPodMessage(["accounting"])).toBe(true);
    expect(canSendPodMessage(["manager"])).toBe(true);
    expect(canSendPodMessage(["dispatch", "supervisor", "claims"])).toBe(false);
    expect(canSendPodMessage([])).toBe(false);
  });
  it("matches bookers by exact name or ID and rejects ambiguous names", () => {
    expect(resolveBooker("Jane Booker", [booker])).toEqual(booker);
    expect(resolveBooker("booker1", [booker])).toEqual(booker);
    expect(() => resolveBooker("Jane", [booker])).toThrow();
    expect(() => resolveBooker("Jane Booker", [booker, { ...booker, user_id: "other" }])).toThrow();
  });
  it("uses the booker's unique office manager and refuses arbitrary fallback recipients", () => {
    expect(resolveManager(booker, [manager, { ...manager, user_id: "other", office: "Recovery" }])).toEqual(manager);
    expect(() => resolveManager(booker, [])).toThrow();
    expect(() => resolveManager({ ...booker, office: null }, [manager])).toThrow();
    expect(() => resolveManager(booker, [manager, { ...manager, user_id: "other" }])).toThrow();
  });
  it("auto-selects a single POD but requires explicit selection for multiple PODs", () => {
    expect(selectPods([file("1")], [])).toEqual([file("1")]);
    expect(selectPods([file("1"), file("2")], ["2", "2"])).toEqual([file("2")]);
    expect(() => selectPods([file("1"), file("2")], [])).toThrow();
  });
  it("rejects foreign files, non-POD IDs, missing documents, invalid selections and oversized attachments", () => {
    expect(() => selectPods([file("1")], ["other-load-file"])).toThrow();
    expect(() => selectPods([], [])).toThrow();
    expect(() => selectPods([file("1")], "1")).toThrow();
    expect(() => selectPods([file("1", MAX_ATTACHMENT_BYTES + 1)], ["1"])).toThrow();
    expect(attachmentFilename("../signature (final).pdf", 0)).toBe("1-signature__final_.pdf");
  });
});
