export const POD_MESSAGE_ROLES = ["accounting", "manager", "admin"];
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_SELECTED_PODS = 20;
export interface PodFile {
  id: string;
  file_name: string;
  file_path: string;
  content_type: string | null;
  file_size: number | null;
}
export interface RecipientProfile {
  user_id: string;
  full_name: string | null;
  email: string;
  office: string | null;
}
export function canSendPodMessage(roles: string[]) {
  return roles.some(role => POD_MESSAGE_ROLES.includes(role));
}
export function resolveBooker(bookedBy: string | null, profiles: RecipientProfile[]) {
  const matches = profiles.filter(p => p.user_id === bookedBy || p.full_name === bookedBy);
  if (matches.length !== 1) throw new Error("The load's booking user could not be uniquely identified.");
  return matches[0];
}
export function resolveManager(booker: RecipientProfile, managers: RecipientProfile[]) {
  const matches = managers.filter(p => booker.office && p.office === booker.office);
  if (matches.length !== 1) throw new Error("The booking user's office must have exactly one assigned manager before sending.");
  return matches[0];
}
export function selectPods(files: PodFile[], selectedIds: unknown): PodFile[] {
  if (!Array.isArray(selectedIds) || selectedIds.some(id => typeof id !== "string")) {
    throw new Error("Invalid POD selection.");
  }
  const ids = [...new Set(selectedIds as string[])];
  if (ids.some(id => !files.some(file => file.id === id))) throw new Error("Selected PODs must belong to this load.");
  const selected = files.length === 1 ? files : files.filter(file => ids.includes(file.id));
  if (!selected.length) throw new Error("Select at least one POD.");
  if (selected.length > MAX_SELECTED_PODS) throw new Error(`Select no more than ${MAX_SELECTED_PODS} PODs.`);
  if (selected.reduce((sum, file) => sum + (file.file_size || 0), 0) > MAX_ATTACHMENT_BYTES) {
    throw new Error("Selected PODs exceed the 25 MB email attachment limit.");
  }
  return selected;
}
export function attachmentFilename(name: string, index: number) {
  return `${index + 1}-${name.replace(/^.*[\\/]/, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 150) || "POD"}`;
}
