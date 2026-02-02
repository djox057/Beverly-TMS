import { Tenure, formatTenureDateRange, formatTenureDuration } from "@/utils/tenureCalculator";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Truck, Container, Calendar, Clock, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface TenureCardProps {
  tenure: Tenure;
  entityType: 'driver' | 'truck' | 'trailer';
  /** Percentage of total timeline this tenure represents (0-100) */
  timelinePercentage?: number;
}

export const TenureCard = ({ tenure, entityType, timelinePercentage }: TenureCardProps) => {
  const isCurrent = tenure.endDate === null;
  const isGap = tenure.isGap;
  
  const getIcon = () => {
    switch (entityType) {
      case 'driver':
        return <User className="h-4 w-4" />;
      case 'truck':
        return <Truck className="h-4 w-4" />;
      case 'trailer':
        return <Container className="h-4 w-4" />;
    }
  };

  const getDisplayName = () => {
    if (isGap) {
      switch (entityType) {
        case 'driver':
          return 'No driver assigned';
        case 'truck':
          return 'No truck assigned';
        case 'trailer':
          return 'No trailer attached';
      }
    }
    
    return tenure.entityName || `Unknown ${entityType}`;
  };

  return (
    <Card className={cn(
      "transition-all",
      isCurrent && "border-green-500/50 bg-green-50/30 dark:bg-green-950/20",
      isGap && "border-dashed opacity-60"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Entity name with icon */}
            <div className="flex items-center gap-2">
              <span className={cn(
                "flex-shrink-0",
                isCurrent ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
              )}>
                {getIcon()}
              </span>
              <span className={cn(
                "font-semibold truncate",
                isGap && "text-muted-foreground italic font-normal"
              )}>
                {getDisplayName()}
              </span>
              {isCurrent && (
                <Badge 
                  variant="default" 
                  className="bg-green-600 hover:bg-green-600 text-white text-xs flex-shrink-0"
                >
                  Current
                </Badge>
              )}
            </div>

            {/* Date range and duration */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>{formatTenureDateRange(tenure)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>{formatTenureDuration(tenure.durationDays)}</span>
              </div>
            </div>

            {/* Timeline bar */}
            {timelinePercentage !== undefined && timelinePercentage > 0 && (
              <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all",
                    isCurrent 
                      ? "bg-green-500" 
                      : isGap 
                        ? "bg-muted-foreground/30" 
                        : "bg-primary/60"
                  )}
                  style={{ width: `${Math.min(100, Math.max(5, timelinePercentage))}%` }}
                />
              </div>
            )}

            {/* End reason */}
            {tenure.endReason && !isCurrent && (
              <div className="flex items-start gap-1.5 text-sm">
                <MessageSquare className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-600" />
                <span className="text-muted-foreground italic">
                  Reason: {tenure.endReason}
                </span>
              </div>
            )}

            {/* Changed by */}
            {tenure.changedByName && (
              <div className="text-xs text-muted-foreground">
                Assigned by: {tenure.changedByName}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

interface TenureListProps {
  tenures: Tenure[];
  entityType: 'driver' | 'truck' | 'trailer';
  emptyMessage?: string;
}

export const TenureList = ({ tenures, entityType, emptyMessage }: TenureListProps) => {
  if (tenures.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {emptyMessage || `No ${entityType} history found`}
      </div>
    );
  }

  // Calculate timeline percentages based on total duration span
  const totalDays = tenures.reduce((sum, t) => sum + t.durationDays, 0);
  
  return (
    <div className="space-y-3">
      {tenures.map((tenure, index) => (
        <TenureCard
          key={`${tenure.entityId || 'gap'}-${tenure.startDate}-${index}`}
          tenure={tenure}
          entityType={entityType}
          timelinePercentage={totalDays > 0 ? (tenure.durationDays / totalDays) * 100 : undefined}
        />
      ))}
    </div>
  );
};
