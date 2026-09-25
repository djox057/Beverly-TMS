import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const PretripProblemsCell = ({
  value,
  onSave,
  placeholder = "Add problems...",
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  placeholder?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    if (!open) setDraft(value ?? "");
  }, [value, open]);

  const stored = value?.trim() ?? "";
  const hasContent = stored !== "";

  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : trimmed;
    if (next !== (value ?? null)) onSave(next);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(value ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={hasContent ? "Click to view full text" : "Click to add problems"}
          className={cn(
            "w-full h-7 px-1 leading-7 text-left truncate rounded-none border-0 bg-transparent",
            "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors",
            hasContent ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {hasContent ? value : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[440px] p-3 pointer-events-auto" align="start">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          rows={7}
          className="min-h-[150px] max-h-[320px] resize-y"
          autoFocus
        />
        <div className="flex items-center justify-between gap-2 mt-2">
          <span className="text-xs text-muted-foreground">{draft.trim().length} characters</span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(value ?? "");
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={commit}>
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
