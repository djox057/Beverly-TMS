import type { QueryClient } from "@tanstack/react-query";

// Fields consumed by normal, team, and off-duty report rows. Driver editing
// deliberately uses a separate single-record query.
export const REPORT_DRIVER_SELECT = "id, name, is_active, company_id, dispatcher_id, created_at, phone, email, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, hazmat, tanker, twic, citizen, criminal, straps, load_bars, home_city, home_state, home_latitude, home_longitude, hos_drive_minutes, hos_shift_minutes, hos_break_minutes, hos_cycle_minutes, hos_status, hos_last_updated, two_week_block_date, random_drug_test_date, do_not_touch_hos, going_yard, hire_date, cdl_expiration_date, mvr_date, clearing_house, medical_card_expiration_date";
export const REPORT_TRUCK_SELECT = "id, is_active, driver1_id, driver2_id, trailer_id, truck_number, vin, plate, oos, samsara_insured, samsara_account, samsara_insured_updated_at, oil_change_date, tires_swap_date, maintenance_check_date, last_oil_change_miles, miles, source, dot_inspection_date, plate_expiration_date, insurance_expiration_date, fuel_level, miles_away";

export type ReportReference = "drivers" | "trucks";

const fields = {
  drivers: REPORT_DRIVER_SELECT.split(", "),
  trucks: REPORT_TRUCK_SELECT.split(", "),
};

/** Compare actual report inputs, independent of row order or object identity. */
function fingerprint(kind: ReportReference, data: unknown): string | undefined {
  if (!Array.isArray(data)) return undefined;
  return JSON.stringify(
    [...data]
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map(row => fields[kind].map(field => row[field])),
  );
}

/** A successful refetch with unchanged report fields must not cause more reads. */
export function watchReportReferenceChanges(
  queryClient: QueryClient,
  onChange: (kind: ReportReference) => void,
): () => void {
  const snapshots = new Map<string, string | undefined>();
  const cache = queryClient.getQueryCache();

  for (const query of cache.getAll()) {
    const kind = query.queryKey[0];
    if (kind === "drivers" || kind === "trucks") {
      snapshots.set(query.queryHash, fingerprint(kind, query.state.data));
    }
  }

  return cache.subscribe(event => {
    if (event.type === "removed") {
      snapshots.delete(event.query.queryHash);
      return;
    }
    if (event.type !== "updated" || event.action.type !== "success") return;
    const kind = event.query.queryKey[0];
    if (kind !== "drivers" && kind !== "trucks") return;
    const next = fingerprint(kind, event.query.state.data);
    if (next === undefined) return;
    const previous = snapshots.get(event.query.queryHash);
    snapshots.set(event.query.queryHash, next);
    if (next !== previous) onChange(kind);
  });
}

