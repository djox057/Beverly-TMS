export type MaintenanceNoteMetadata = {
  oil_change_note_author?: string | null;
  oil_change_note_updated_at?: string | null;
};

export const MAINTENANCE_NOTE_SELECT = "oil_change_note, oil_change_note_author, oil_change_note_updated_at";

export function MaintenanceNoteAttribution({ note }: { note: MaintenanceNoteMetadata }) {
  const timestamp = note.oil_change_note_updated_at;
  return <p className="text-[10px] leading-tight text-muted-foreground">
    {note.oil_change_note_author || "Author unavailable"}
    {timestamp ? ` · ${new Date(timestamp).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} CT` : " · Time unavailable"}
  </p>;
}
