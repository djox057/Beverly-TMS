import { useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TranslateNoteButtonProps {
  text: string;
  size?: "sm" | "xs";
  className?: string;
  label?: string;
  onReplace?: (translated: string) => void;
}

export function TranslateNoteButton({ text, size = "sm", className, label = "Translate", onReplace }: TranslateNoteButtonProps) {
  const [loading, setLoading] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleTranslate = async () => {
    const value = (text || "").trim();
    if (!value) {
      toast.info("Nothing to translate");
      return;
    }
    setLoading(true);
    if (!onReplace) setOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke("translate-yard-note", {
        body: { text: value },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed");
      if (onReplace) {
        onReplace(data.translation);
        toast.success("Translated to English");
      } else {
        setTranslation(data.translation);
      }
    } catch (e: any) {
      toast.error(e?.message || "Translation failed");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const isXs = size === "xs";

  if (onReplace) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        disabled={loading}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          handleTranslate();
        }}
      >
        {loading ? (
          <Loader2 className={isXs ? "h-3 w-3 animate-spin" : "h-4 w-4 animate-spin"} />
        ) : (
          <Languages className={isXs ? "h-3 w-3" : "h-4 w-4"} />
        )}
        <span className={isXs ? "ml-1 text-[10px]" : "ml-1 text-xs"}>{label}</span>
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={className}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (!translation) {
              handleTranslate();
            } else {
              setOpen(true);
            }
          }}
        >
          {loading ? (
            <Loader2 className={isXs ? "h-3 w-3 animate-spin" : "h-4 w-4 animate-spin"} />
          ) : (
            <Languages className={isXs ? "h-3 w-3" : "h-4 w-4"} />
          )}
          <span className={isXs ? "ml-1 text-[10px]" : "ml-1 text-xs"}>{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="end">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">English translation</div>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Translating...
            </div>
          ) : (
            <div className="whitespace-pre-wrap">{translation || "—"}</div>
          )}
          {translation && !loading && (
            <Button
              size="sm"
              variant="ghost"
              className="w-full h-7 text-xs"
              onClick={() => {
                setTranslation(null);
                handleTranslate();
              }}
            >
              Retranslate
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}