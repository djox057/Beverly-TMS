import { useRef, useState } from "react";

/** The display stays plain until activated. Enter/Tab/blur saves; Escape cancels. */
export function ServiceLogCell({ label, value, display, type = "text", options, editable, disabled, compact = false, onSave }: {
  label: string; value: string; display?: React.ReactNode; type?: "text" | "date" | "number";
  options?: readonly string[]; editable: boolean; disabled?: boolean; compact?: boolean; onSave: (value: string) => Promise<void>;
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
  const padding = compact ? "p-0" : "px-3 py-2";
  const content = display ?? value ?? "";
  if (!editable) return <span className={`absolute inset-0 flex items-center ${padding}`}><span className="block w-full truncate [text-align:inherit]" title={value}>{content}</span></span>;
  if (!active) return <button type="button" aria-label={`Edit ${label}`} title={value} disabled={disabled} className={`absolute inset-0 w-full cursor-text truncate text-inherit [font:inherit] [text-align:inherit] outline-none ${padding}`} onClick={() => { cancelled.current = false; setDraft(value); setError(""); setActive(true); }}>{content}</button>;
  const props = { autoFocus: true, "aria-label": label, value: draft, disabled: saving, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft(e.target.value), onBlur: () => { void commit(); }, onKeyDown: keyboard, className: "block h-full w-full min-w-0 appearance-none rounded-none border-0 bg-transparent p-0 text-inherit [font:inherit] [text-align:inherit] outline-none ring-0 shadow-none focus:outline-none focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" };
  return <span data-cell-editor className={`absolute inset-0 ${padding}`}>
    {options ? <select {...props}>{options.map(option => <option key={option}>{option}</option>)}</select> : <input {...props} type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? 1 : undefined} />}
    {error && <span role="alert" title={error} className="absolute inset-x-0 bottom-0 truncate bg-red-50 px-1 text-[9px] text-red-700">{error}</span>}
  </span>;
}
