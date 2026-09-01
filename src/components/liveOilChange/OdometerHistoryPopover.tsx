import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";

type Props = {
  truckId: string;
};

export const OdometerHistoryPopover = ({ truckId }: Props) => {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["odometer-file-history", truckId],
    enabled: open,
    staleTime: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("truck-odometer-files")
        .list(truckId, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      if (error) throw error;
      return data ?? [];
    },
  });

  const openFile = async (fileName: string) => {
    const { data, error } = await supabase.storage
      .from("truck-odometer-files")
      .createSignedUrl(`${truckId}/${fileName}`, 300);
    if (error || !data?.signedUrl) {
      toast({ title: "Cannot open file", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
          title="Odometer upload history"
        >
          <History className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b px-3 py-2 text-sm font-semibold">Odometer history</div>
        <div className="max-h-72 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">Loading…</div>
          ) : !data || data.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">No odometer files yet.</div>
          ) : (
            <ul className="divide-y">
              {data.map((f: any) => (
                <li key={f.name}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                    onClick={() => openFile(f.name)}
                  >
                    <span className="truncate">{f.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {(() => {
                        try {
                          return f.created_at ? format(parseISO(f.created_at), "MM/dd/yyyy HH:mm") : "";
                        } catch {
                          return "";
                        }
                      })()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
