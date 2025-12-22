import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Database } from "lucide-react";
import { getCacheStats, clearCache } from "@/utils/ordersCache";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const OrdersCacheStatus = () => {
  const [cacheStats, setCacheStats] = useState<{
    orders: {
      hasCachedData: boolean;
      cacheAge: number | null;
      isValid: boolean;
      itemCount: number;
    };
    pickupDrops: {
      hasCachedData: boolean;
      cacheAge: number | null;
      isValid: boolean;
      itemCount: number;
    };
    orderFiles: {
      hasCachedData: boolean;
      cacheAge: number | null;
      isValid: boolean;
      itemCount: number;
    };
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadStats = async () => {
      const stats = await getCacheStats();
      setCacheStats(stats);
    };
    loadStats();
    
    // Refresh stats every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefreshCache = async () => {
    setIsRefreshing(true);
    try {
      await clearCache();
      // Invalidate both orders and reports queries to refresh all data
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success("Cache cleared. Refreshing orders and reports...");
      
      // Reload stats after a short delay
      setTimeout(async () => {
        const stats = await getCacheStats();
        setCacheStats(stats);
        setIsRefreshing(false);
      }, 2000);
    } catch (error) {
      console.error("Error refreshing cache:", error);
      toast.error("Failed to refresh cache");
      setIsRefreshing(false);
    }
  };

  if (!cacheStats?.orders.hasCachedData) {
    return null;
  }

  const ageHours = cacheStats.orders.cacheAge ? Math.floor(cacheStats.orders.cacheAge / (1000 * 60 * 60)) : 0;
  const ageMinutes = cacheStats.orders.cacheAge ? Math.floor((cacheStats.orders.cacheAge % (1000 * 60 * 60)) / (1000 * 60)) : 0;
  
  const ageDisplay = ageHours > 0 
    ? `${ageHours}h ${ageMinutes}m ago` 
    : `${ageMinutes}m ago`;

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-border bg-muted/30">
      <div className="flex items-center gap-3">
        <Database className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {cacheStats.orders.itemCount} archived orders cached
          </span>
          <Badge variant={cacheStats.orders.isValid ? "secondary" : "destructive"} className="text-xs">
            {cacheStats.orders.isValid ? ageDisplay : "Expired"}
          </Badge>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleRefreshCache}
        disabled={isRefreshing}
        className="gap-2"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        Refresh Archived
      </Button>
    </div>
  );
};
