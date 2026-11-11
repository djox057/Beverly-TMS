import { useId, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface SupervisorFilterProps {
  supervisors: Record<string, string>;
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function SupervisorFilter({ supervisors, selected, onChange }: SupervisorFilterProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const instanceId = useId();
  const entries = Object.entries(supervisors).filter(([, name]) =>
    name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const label = selected.length === 0 ? "All supervisors"
    : selected.length === 1 ? supervisors[selected[0]] || "1 supervisor"
    : `${selected.length} supervisors`;

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label="Supervisor filter" aria-expanded={open}
          className="max-w-full w-64 justify-between">
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-2">
        <Input aria-label="Search supervisors" placeholder="Search supervisors..." value={search}
          onChange={(event) => setSearch(event.target.value)} className="mb-2 h-8" />
        <div role="group" aria-label="Supervisors" className="max-h-64 overflow-y-auto">
          {entries.map(([id, name]) => (
            <label key={id} htmlFor={`${instanceId}-${id}`}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent">
              <Checkbox id={`${instanceId}-${id}`} checked={selected.includes(id)} onCheckedChange={(checked) => {
                onChange(checked === true ? [...selected.filter((value) => value !== id), id]
                  : selected.filter((value) => value !== id));
              }} />
              <span>{name}</span>
            </label>
          ))}
          {entries.length === 0 && <p className="p-2 text-sm text-muted-foreground">No supervisors found.</p>}
        </div>
        <Button type="button" variant="ghost" size="sm" className="mt-2 w-full" disabled={selected.length === 0}
          onClick={() => onChange([])}>Clear selection</Button>
      </PopoverContent>
    </Popover>
  );
}
