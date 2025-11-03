import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface MissingField {
  location: string;
  type: 'pickup' | 'delivery';
  missingFields: string[];
}

interface MissingDataConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missingData: MissingField[];
  onConfirm: () => void;
}

export function MissingDataConfirmDialog({
  open,
  onOpenChange,
  missingData,
  onConfirm,
}: MissingDataConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">Missing Required Data</AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <p className="font-semibold">
              The following pickup/delivery locations have missing information:
            </p>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {missingData.map((item, index) => (
                <div key={index} className="border-l-4 border-destructive pl-3 py-1">
                  <div className="font-semibold capitalize">
                    {item.type} {index + 1}: {item.location || 'Unknown Location'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Missing: <span className="text-destructive">{item.missingFields.join(', ')}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm font-semibold text-destructive">
              Creating a load with missing data may cause tracking and reporting issues.
            </p>
            <p className="text-sm">
              Do you want to continue anyway?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go Back and Fix</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive hover:bg-destructive/90">
            Create Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
