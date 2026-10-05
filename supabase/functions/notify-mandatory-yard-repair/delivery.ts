import { FROM, escapeHtml, formatDate } from "../_shared/reminders.ts";

// Matches send-document-reminders (including its oil-change reminders).
export const MAINTENANCE_REPLY_TO = [
  "matt@bfprime.net", "connor@bfprime.net", "joel@bfprime.net",
  "Tommy@beverlyfreight.net", "Bob.i@bfprime.net",
];
export interface RepairEmailContext {
  unit: string; driverName: string; dispatcherEmail: string;
  description: string; dueDate: string; reportedDate: string; reportedBy: string;
}
export function repairEmail(context: RepairEmailContext) {
  if (!context.driverName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(context.dispatcherEmail)) {
    throw new Error("Assigned driver or dispatcher email is missing.");
  }
  return {
    from: FROM, to: [context.dispatcherEmail], reply_to: MAINTENANCE_REPLY_TO,
    subject: `Mandatory Yard Repair — Unit ${context.unit.replace(/[\r\n]/g, " ")} — Due ${formatDate(context.dueDate)}`,
    html: `<div style="font-family:Arial,sans-serif;color:#111827;max-width:640px">
      <h2>Mandatory Yard Repair</h2><p>Please arrange for this unit to arrive at the yard before the due date.</p>
      <p><strong>Unit:</strong> ${escapeHtml(context.unit)}<br><strong>Driver:</strong> ${escapeHtml(context.driverName)}<br>
      <strong>Due date:</strong> ${escapeHtml(formatDate(context.dueDate))}<br><strong>Reported:</strong> ${escapeHtml(formatDate(context.reportedDate))}<br>
      <strong>Reported by:</strong> ${escapeHtml(context.reportedBy)}</p>
      <p style="white-space:pre-wrap;overflow-wrap:anywhere"><strong>Description:</strong><br>${escapeHtml(context.description)}</p>
      <p><a href="https://beverlytms.com/mandatory-yard-repair">Open Mandatory Yard Repair in TMS</a></p></div>`,
  };
}
export async function sendRepairEmail(payload: ReturnType<typeof repairEmail>, taskId: string, apiKey: string, transport: typeof fetch = fetch) {
  const response = await transport("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `mandatory-yard-repair/${taskId}` },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  if (!response.ok || !result?.id) throw new Error("Email provider did not accept the notification. Please retry.");
  return result.id as string;
}
