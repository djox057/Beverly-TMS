import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, FileStack, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrdersLoadingProgressProps {
  phase: 1 | 2 | "complete";
  unlockedLoaded: number;
  unlockedTotal: number | null;
  lockedLoaded: number;
  lockedTotal: number | null;
  isLoadingLocked: boolean;
  percentComplete: number;
  onLoadArchived?: () => void;
}

export const OrdersLoadingProgress = ({
  phase,
  unlockedLoaded,
  unlockedTotal,
  lockedLoaded,
  lockedTotal,
  isLoadingLocked,
  percentComplete,
  onLoadArchived,
}: OrdersLoadingProgressProps) => {
  const phase1Complete = phase !== 1;
  const phase2Complete = phase === "complete";

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-card/95 backdrop-blur-sm border border-border rounded-md shadow-md p-3 w-72">
      <div className="space-y-2">
        {/* Phase 1: Unlocked Orders */}
        <div className="flex items-center gap-2">
          <div className={cn(
            "flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0",
            phase1Complete ? "bg-success/20" : "bg-primary/20"
          )}>
            {phase1Complete ? (
              <CheckCircle2 className="h-3 w-3 text-success" />
            ) : (
              <Loader2 className="h-3 w-3 text-primary animate-spin" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium truncate">Active</span>
              <span className="text-muted-foreground">
                {unlockedLoaded.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Phase 2: Locked Orders */}
        <div className="flex items-center gap-2">
          <div className={cn(
            "flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0",
            phase2Complete ? "bg-success/20" : isLoadingLocked ? "bg-warning/20" : "bg-muted"
          )}>
            {phase2Complete ? (
              <CheckCircle2 className="h-3 w-3 text-success" />
            ) : isLoadingLocked ? (
              <Loader2 className="h-3 w-3 text-warning animate-spin" />
            ) : (
              <FileStack className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium truncate">Archived</span>
              <span className="text-muted-foreground">
                {isLoadingLocked ? (
                  "Loading..."
                ) : phase2Complete ? (
                  lockedLoaded.toLocaleString()
                ) : (
                  "Not loaded"
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Load Archived Button - only show when phase 2 hasn't started */}
        {phase === 2 && !isLoadingLocked && lockedLoaded === 0 && onLoadArchived && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full mt-2 h-7 text-xs"
            onClick={onLoadArchived}
          >
            <Download className="h-3 w-3 mr-1.5" />
            Load Archived Orders
          </Button>
        )}

        {/* Progress Bar - only show when loading */}
        {(phase === 1 || isLoadingLocked) && (
          <Progress value={percentComplete} className="h-1.5" />
        )}
      </div>
    </div>
  );
};

// Compact version for header display
export const OrdersLoadingBadge = ({
  phase,
  unlockedLoaded,
  lockedLoaded,
  isLoadingLocked,
  percentComplete,
}: Pick<OrdersLoadingProgressProps, 'phase' | 'unlockedLoaded' | 'lockedLoaded' | 'isLoadingLocked' | 'percentComplete'>) => {
  if (phase === "complete") {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border border-border rounded-lg text-sm">
      {phase === 1 || isLoadingLocked ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      ) : (
        <FileStack className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span className="text-muted-foreground">
        {phase === 1 ? (
          <>Loading {unlockedLoaded.toLocaleString()} active...</>
        ) : isLoadingLocked ? (
          <>Loading archived ({percentComplete}%)</>
        ) : (
          <>{unlockedLoaded.toLocaleString()} active loaded</>
        )}
      </span>
    </div>
  );
};