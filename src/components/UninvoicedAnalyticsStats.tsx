import { useMemo } from "react";

interface Props {
  isAdmin: boolean;
  orders: { invoiced?: boolean; paid?: boolean; totalFreightAmountNoLumper?: number | string | null }[];
}

export function UninvoicedAnalyticsStats({ isAdmin, orders }: Props) {
  const totals = useMemo(() => {
    const result = { freight: 0, loads: 0, unpaidFreight: 0, unpaidLoads: 0 };
    if (!isAdmin) return result;
    for (const order of orders) {
      const freight = Number(order.totalFreightAmountNoLumper) || 0;
      if (order.invoiced !== true) {
        result.freight += freight;
        result.loads++;
      }
      if (order.paid !== true) {
        result.unpaidFreight += freight;
        result.unpaidLoads++;
      }
    }
    return result;
  }, [isAdmin, orders]);

  if (!isAdmin) return null;

  return (
    <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-2 gap-4 sm:gap-8 lg:grid-cols-4">
      <div className="text-center">
        <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Uninvoiced Total Freight</p>
        <p className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400">
          ${totals.freight.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
      <div className="text-center">
        <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Uninvoiced Loads</p>
        <p className="text-lg sm:text-2xl font-bold">{totals.loads.toLocaleString()}</p>
      </div>
      <div className="text-center">
        <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Not Paid Freight</p>
        <p className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400">
          ${totals.unpaidFreight.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
      <div className="text-center">
        <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Not Paid Loads</p>
        <p className="text-lg sm:text-2xl font-bold">{totals.unpaidLoads.toLocaleString()}</p>
      </div>
    </div>
  );
}
