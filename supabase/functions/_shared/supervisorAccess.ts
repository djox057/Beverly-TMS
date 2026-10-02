// Keep the bulk-fetch path for other roles. Supervisors must use their user
// client so the same team RLS applies to counts, pagination and exports.
export async function supervisorScopedClient(service: any, userClient: any, userId: string) {
  const { data, error } = await service.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw error;
  const roles = (data ?? []).map((row: { role: string }) => row.role);
  const elevated = ["admin", "manager", "accounting", "safety", "claims", "maintenance", "chicago_management"];
  return roles.includes("supervisor") && !roles.some((role: string) => elevated.includes(role)) ? userClient : service;
}
