import { Tenure, formatTenureDateRange, formatTenureDuration } from "@/utils/tenureCalculator";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Truck, Container, Calendar, Clock, MessageSquare, UserCog, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface TenureCardProps {
  tenure: Tenure;
  entityType: 'driver' | 'truck' | 'trailer' | 'dispatcher' | 'company';
  /** Percentage of total timeline this tenure represents (0-100) */
  timelinePercentage?: number;
  /** Custom icon to override default */
  icon?: ReactNode;
}

export const TenureCard = ({ tenure, entityType, timelinePercentage, icon }: TenureCardProps) => {
  const isCurrent = tenure.endDate === null;
  const isGap = tenure.isGap;
  
  const getIcon = () => {
    if (icon) return icon;
    switch (entityType) {
      case 'driver':
        return <User className="h-4 w-4" />;
      case 'truck':
        return <Truck className="h-4 w-4" />;
      case 'trailer':
        return <Container className="h-4 w-4" />;
      case 'dispatcher':
        return <UserCog className="h-4 w-4" />;
      case 'company':
        return <Building2 className="h-4 w-4" />;
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
        case 'dispatcher':
          return 'No dispatcher assigned';
        case 'company':
          return 'No company assigned';
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
  entityType: 'driver' | 'truck' | 'trailer' | 'dispatcher' | 'company';
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
