import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, Database, FileStack } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrdersLoadingProgressProps {
  phase: 1 | 2 | "complete";
  unlockedLoaded: number;
  unlockedTotal: number | null;
  lockedLoaded: number;
  lockedTotal: number | null;
  isLoadingLocked: boolean;
  percentComplete: number;
}

export const OrdersLoadingProgress = ({
  phase,
  unlockedLoaded,
  unlockedTotal,
  lockedLoaded,
  lockedTotal,
  isLoadingLocked,
  percentComplete,
}: OrdersLoadingProgressProps) => {
  const phase1Complete = phase !== 1;
  const phase2Complete = phase === "complete";

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-lg shadow-lg p-4 w-80">
      <div className="space-y-3">
        {/* Phase 1: Unlocked Orders */}
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center justify-center w-8 h-8 rounded-full",
            phase1Complete ? "bg-success/20" : "bg-primary/20"
          )}>
            {phase1Complete ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <Loader2 className="h-4 w-4 text-primary animate-spin" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Active Orders</span>
              <span className="text-xs text-muted-foreground">
                {unlockedLoaded.toLocaleString()}
                {unlockedTotal !== null && ` / ${unlockedTotal.toLocaleString()}`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {phase1Complete ? "Ready to display" : "Loading unlocked orders..."}
            </p>
          </div>
        </div>

        {/* Phase 2: Locked Orders */}
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center justify-center w-8 h-8 rounded-full",
            phase2Complete ? "bg-success/20" : isLoadingLocked ? "bg-warning/20" : "bg-muted"
          )}>
            {phase2Complete ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : isLoadingLocked ? (
              <Loader2 className="h-4 w-4 text-warning animate-spin" />
            ) : (
              <FileStack className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Archived Orders</span>
              <span className="text-xs text-muted-foreground">
                {lockedLoaded.toLocaleString()}
                {lockedTotal !== null && ` / ${lockedTotal.toLocaleString()}`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {phase2Complete 
                ? "All orders loaded" 
                : isLoadingLocked 
                  ? "Loading in background..." 
                  : "Waiting..."
              }
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <Progress value={percentComplete} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {phase === 1 && "Phase 1: Loading active orders..."}
              {phase === 2 && "Phase 2: Loading archived orders..."}
              {phase === "complete" && "All orders loaded"}
            </span>
            <span>{percentComplete}%</span>
          </div>
        </div>
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
      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      <span className="text-muted-foreground">
        {phase === 1 ? (
          <>Loading {unlockedLoaded.toLocaleString()} active orders...</>
        ) : (
          <>Background: {lockedLoaded.toLocaleString()} archived ({percentComplete}%)</>
        )}
      </span>
    </div>
  );
};
