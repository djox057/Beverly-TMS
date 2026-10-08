import { useRef, useState } from "react";

/** The display stays plain until activated. Enter/Tab/blur saves; Escape cancels. */
export function ServiceLogCell({ label, value, display, type = "text", options, editable, disabled, onSave }: {
  label: string; value: string; display?: React.ReactNode; type?: "text" | "date" | "number";
  options?: readonly string[]; editable: boolean; disabled?: boolean; onSave: (value: string) => Promise<void>;
}) {
  const [active, setActive] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const cancelled = useRef(false);
  const inFlight = useRef(false);
  const commit = async () => {
    if (cancelled.current || inFlight.current) return;
    if (draft === value) { setActive(false); return; }
    inFlight.current = true; setSaving(true); setError("");
    try { await onSave(draft); setActive(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save"); }
    finally { inFlight.current = false; setSaving(false); }
  };
  const keyboard = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { cancelled.current = true; setActive(false); e.preventDefault(); }
    if (e.key === "Enter") { e.preventDefault(); void commit(); }
  };
  if (!editable) return <>{display ?? value}</>;
  if (!active) return <button type="button" aria-label={`Edit ${label}`} disabled={disabled} className="min-h-4 w-full cursor-text text-inherit font-inherit text-left [text-align:inherit]" onClick={() => { cancelled.current = false; setDraft(value); setError(""); setActive(true); }}>{display ?? value ?? ""}</button>;
  const props = { autoFocus: true, "aria-label": label, value: draft, disabled: saving, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft(e.target.value), onBlur: () => { void commit(); }, onKeyDown: keyboard, className: "w-full min-w-[90px] rounded-none border border-blue-500 bg-white px-1 text-xs text-slate-900 outline-none" };
  return <span>{options ? <select {...props}>{options.map(option => <option key={option}>{option}</option>)}</select> : <input {...props} type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? 1 : undefined} />} {error && <span role="alert" className="block text-[10px] text-red-700">{error}</span>}</span>;
}
