export { pretripPhotoHash } from "../../supabase/functions/_shared/pretripPhotoHash";

export type PretripPhotoReuse = {
  photo_id: string;
  previous_photo_id: string;
  previous_inspection_date: string;
  previous_driver_name: string | null;
  previous_truck_number: string;
};

export function photoReuseMessage(reuse: PretripPhotoReuse): string {
  const [year, month, day] = reuse.previous_inspection_date.split("-");
  const driver = reuse.previous_driver_name ? ` · ${reuse.previous_driver_name}` : "";
  return `Same photo submitted on ${month}/${day}/${year} · Unit ${reuse.previous_truck_number}${driver}`;
}
