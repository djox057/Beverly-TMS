import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Languages, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TranslatableComplaintTextProps {
  text: string;
  className?: string;
  size?: "sm" | "xs";
}

/**
 * Display-only translate toggle for complaint content / comments.
 * Reuses the `translate-yard-note` edge function (no persistence — id omitted).
 */
export function TranslatableComplaintText({
  text,
  className,
  size = "sm",
}: TranslatableComplaintTextProps) {
  const [showEng, setShowEng] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isXs = size === "xs";

  const handleToggle = async () => {
    if (!showEng && !translation && text.trim()) {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("translate-yard-note", {
          body: { text: text.trim() },
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

  if (!text?.trim()) return null;

  return (
    <div className={`relative ${className ?? ""}`}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${isXs ? "h-5 w-5" : "h-6 w-6"} absolute top-0 right-0`}
        onClick={handleToggle}
        title={showEng ? "Show original" : "Show English translation"}
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Languages className={`h-3 w-3 ${showEng ? "text-primary" : "text-muted-foreground"}`} />
        )}
      </Button>
      <p className="text-sm whitespace-pre-wrap break-words pr-6">
        {showEng ? translation || (loading ? "Translating..." : text) : text}
      </p>
    </div>
  );
}

export default TranslatableComplaintText;
