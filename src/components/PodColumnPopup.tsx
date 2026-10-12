import { Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** An independent popup action on each row's POD rectangle. */
export function PodColumnPopup({ loadId }: { loadId: string }) {
  return <Dialog>
    <DialogTrigger asChild>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="absolute right-0 top-0 h-8 w-6 rounded-l-none px-0"
        title="Open POD popup"
        aria-label={`Open POD popup for load ${loadId}`}
      >
        <Edit className="h-4 w-4" />
      </Button>
    </DialogTrigger>
    <DialogContent className="min-h-72 max-w-xl">
      <DialogTitle className="sr-only">POD</DialogTitle>
      <DialogDescription className="sr-only">Empty POD popup.</DialogDescription>
    </DialogContent>
  </Dialog>;
}
