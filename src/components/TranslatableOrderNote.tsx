import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Languages, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TranslatableOrderNoteProps {
  note: string;
  className?: string;
}

/**
 * Displays an order note with a translate-to-English toggle button.
 * Reuses the `translate-yard-note` edge function (no DB persistence — id omitted).
 */
export function TranslatableOrderNote({ note, className }: TranslatableOrderNoteProps) {
  const [showEng, setShowEng] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (!showEng && !translation && note.trim()) {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("translate-yard-note", {
          body: { text: note.trim() },
        });
        if (error) throw error;
        if (data?.translation) setTranslation(data.translation);
      } catch (e) {
        console.error("translate-yard-note failed:", e);
      } finally {
        setLoading(false);
      }
    }
    setShowEng((v) => !v);
  };

  return (
    <div className={`relative p-3 bg-muted rounded-lg ${className ?? ""}`}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 absolute top-1 right-1"
        onClick={handleToggle}
        title={showEng ? "Show original" : "Show English translation"}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Languages className={`h-3.5 w-3.5 ${showEng ? "text-primary" : "text-muted-foreground"}`} />
        )}
      </Button>
      <p className="text-sm break-words whitespace-pre-wrap pr-7">
        {showEng ? translation || (loading ? "Translating..." : note) : note}
      </p>
    </div>
  );
}