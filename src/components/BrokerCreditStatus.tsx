import { useState } from "react";
import { DollarSign, Ban, CreditCard, Loader2 } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { supabase } from "@/integrations/supabase/client";

interface Broker {
  id: string;
  credit_status: string;
  credit_limit_amount: number | null;
}

interface BrokerCreditStatusProps {
  broker: Broker;
}

export const BrokerCreditStatus = ({ broker }: BrokerCreditStatusProps) => {
  const [usedAmount, setUsedAmount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchUsedCredit = async () => {
    if (hasFetched) return;
    setIsLoading(true);
    try {
      // Sum freight_amount from unpaid orders for this broker
      const { data, error } = await supabase
        .from('orders')
        .select('freight_amount')
        .eq('broker_id', broker.id)
        .eq('paid', false);
      
      if (error) throw error;
      
      const total = data?.reduce((sum, order) => sum + (order.freight_amount || 0), 0) || 0;
      setUsedAmount(total);
      setHasFetched(true);
    } catch (error) {
      console.error('Failed to fetch used credit:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const status = broker.credit_status || "buy";

  if (status === "buy") {
    return (
      <span className="inline-flex items-center gap-1 text-green-600">
        <DollarSign className="h-3 w-3" />
        Buy
      </span>
    );
  }

  if (status === "no_buy") {
    return (
      <span className="inline-flex items-center gap-1 text-red-600">
        <Ban className="h-3 w-3" />
        No Buy
      </span>
    );
  }

  if (status === "credit_limit") {
    const limit = broker.credit_limit_amount || 0;
    const used = usedAmount ?? 0;
    const remaining = limit - used;
    const isOverLimit = remaining < 0;

    return (
      <HoverCard onOpenChange={(open) => {
        if (open) fetchUsedCredit();
      }}>
        <HoverCardTrigger asChild>
          <span className={`inline-flex items-center gap-1 cursor-pointer ${isOverLimit && hasFetched ? 'text-red-600' : 'text-amber-600'}`}>
            <CreditCard className="h-3 w-3" />
            {hasFetched 
              ? `$${used.toLocaleString()}/$${limit.toLocaleString()}`
              : `$${limit.toLocaleString()}`
            }
            {isLoading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
          </span>
        </HoverCardTrigger>
        <HoverCardContent className="w-56">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Calculating...
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Credit Limit:</span>
                <span className="font-medium">${limit.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Used (unpaid):</span>
                <span className="font-medium">${used.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Remaining:</span>
                <span className={`font-semibold ${isOverLimit ? 'text-red-600' : 'text-green-600'}`}>
                  ${remaining.toLocaleString()}
                </span>
              </div>
              {isOverLimit && (
                <p className="text-xs text-red-600 mt-1">⚠️ Over credit limit!</p>
              )}
            </div>
          )}
        </HoverCardContent>
      </HoverCard>
    );
  }

  return <span>{status}</span>;
};
