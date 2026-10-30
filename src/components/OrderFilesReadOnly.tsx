import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getOrderFileSignedUrl } from "@/utils/orderFileSignedUrl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function OrderFilesReadOnly({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const { data: files = [], isLoading, error } = useQuery({
    queryKey: ["order-files-read-only", orderId],
    queryFn: async () => {
      const result = await supabase.from("order_files")
        .select("id, order_id, file_category, file_name, file_path")
        .eq("order_id", orderId).order("created_at");
      if (result.error) throw result.error;
      return result.data;
    },
  });
  return <Card className="max-w-4xl mx-auto">
    <CardHeader><Button variant="outline" className="w-fit" onClick={onBack}>Back</Button>
      <CardTitle>Order files</CardTitle><p className="text-sm text-muted-foreground">View only</p>
    </CardHeader>
    <CardContent className="space-y-4">
      {isLoading && <p>Loading files…</p>}
      {error && <p role="alert">Unable to load files. Please try again.</p>}
      {!isLoading && !error && ["RC", "BOL", "POD", "ADDITIONAL"].map(category => <section key={category}>
        <h2 className="font-semibold mb-2">{category === "ADDITIONAL" ? "Additionals" : category}</h2>
        {files.filter(file => (file.file_category || "ADDITIONAL") === category).map(file =>
          <Button key={file.id} variant="outline" className="mr-2 mb-2 max-w-full" onClick={async () => {
            const viewer = window.open("about:blank", "_blank");
            if (viewer) viewer.opener = null;
            const { signedUrl } = await getOrderFileSignedUrl(file);
            if (!signedUrl) { viewer?.close(); toast.error("Unable to open file"); return; }
            if (viewer) viewer.location.href = signedUrl;
            else toast.error("Please allow popups to view files");
          }}><span className="truncate">{file.file_name}</span></Button>)}
        {!files.some(file => (file.file_category || "ADDITIONAL") === category) &&
          <p className="text-sm text-muted-foreground">No files</p>}
      </section>)}
    </CardContent>
  </Card>;
}
