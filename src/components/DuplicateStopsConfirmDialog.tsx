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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface DuplicateStop {
  type: string;
  address: string;
  city?: string;
  state?: string;
  companyName?: string;
  datetime?: string;
  indices: number[];
}

interface DuplicateStopsConfirmDialogProps {
  open: boolean;
  duplicates: DuplicateStop[];
  onConfirm: (e?: React.MouseEvent) => void;
  onCancel: () => void;
}

export const DuplicateStopsConfirmDialog = ({
  open,
  duplicates,
  onConfirm,
  onCancel,
}: DuplicateStopsConfirmDialogProps) => {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Multiple Stops at Same Address Detected
          </AlertDialogTitle>
          <AlertDialogDescription>
            The following locations appear multiple times. This is normal for multi-delivery/pickup scenarios, but please verify this is correct:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {duplicates.map((dup, idx) => (
            <Alert key={idx} variant="default" className="border-amber-200 bg-amber-50">
              <AlertDescription>
                <div className="space-y-1">
                  <div className="font-semibold text-foreground">
                    {dup.type.toUpperCase()} #{dup.indices.join(', #')}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <div>{dup.address}</div>
                    {dup.city && dup.state && (
                      <div>{dup.city}, {dup.state}</div>
                    )}
                    {dup.companyName && (
                      <div>Company: {dup.companyName}</div>
                    )}
                    {dup.datetime && (
                      <div>Time: {new Date(dup.datetime).toLocaleString()}</div>
                    )}
                  </div>
                  <div className="text-xs text-amber-700 mt-1">
                    Found {dup.indices.length} stops at this location
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            Cancel & Review
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Continue - This is Correct
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
