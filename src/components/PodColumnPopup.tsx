import { Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Shared POD column heading for all load tables. The popup is intentionally empty. */
export function PodColumnPopup() {
  return <Dialog>
    <DialogTrigger asChild>
      <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" title="Open POD popup" aria-label="Open POD popup">
        <Edit className="h-4 w-4" />POD
      </Button>
    </DialogTrigger>
    <DialogContent className="min-h-72 max-w-xl">
      <DialogTitle className="sr-only">POD</DialogTitle>
      <DialogDescription className="sr-only">Empty POD popup.</DialogDescription>
    </DialogContent>
  </Dialog>;
}
