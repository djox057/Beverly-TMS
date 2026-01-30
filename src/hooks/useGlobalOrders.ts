import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOrdersLoadingContext } from '@/contexts/OrdersLoadingContext';
import { useIndividualMode } from '@/contexts/IndividualModeContext';
import { useAuthContext } from '@/contexts/AuthContext';

interface GlobalOrdersCacheData {
  orders: any[];
  isPartialData: boolean;
  totalUnlocked: number;
  totalLocked: number;
}

/**
 * Hook to consume global orders data.
 * 
 * Features:
 * - Triggers loading on first call (lazy loading)
 * - Returns data from React Query cache
 * - Client-side filtering for Individual Mode (instant, no reload)
 * - Progress tracking for UI indicators
 */
export const useGlobalOrders = () => {
  const { startLoading, progress, isLoading, isLoadingLocked } = useOrdersLoadingContext();
  const { individualMode } = useIndividualMode();
  const { profile } = useAuthContext();
  const queryClient = useQueryClient();
  
  // Trigger loading on first mount (idempotent - only runs once globally)
  useEffect(() => {
    startLoading();
  }, [startLoading]);
  
  // Read orders from React Query cache
  const cachedData = queryClient.getQueryData<GlobalOrdersCacheData>(['orders']);
  
  // Get all orders from cache
  const allOrders = cachedData?.orders || [];
  
  // Client-side filter for Individual Mode (instant, no reload)
  // This filters ~11k orders in memory in ~1-2ms
  const filteredOrders = useMemo(() => {
    if (!individualMode) return allOrders;
    
    // Filter to show only user's booked orders and orders for drivers assigned to them
    const userFullName = profile?.full_name;
    const userId = profile?.user_id;
    
    if (!userFullName && !userId) return allOrders;
    
    return allOrders.filter(order => {
      // Match by booked_by (can be full_name or user_id depending on when order was created)
      const matchesBookedBy = order.bookedBy === userFullName || order.bookedBy === userId;
      return matchesBookedBy;
    });
  }, [allOrders, individualMode, profile?.full_name, profile?.user_id]);
  
  return {
    orders: filteredOrders,
    allOrders, // Expose unfiltered orders for cross-user lookups if needed
    isPartialData: cachedData?.isPartialData ?? true,
    progress,
    isLoading,
    isLoadingLocked,
    totalUnlocked: cachedData?.totalUnlocked || 0,
    totalLocked: cachedData?.totalLocked || 0,
    // Convenience computed values
    totalCount: filteredOrders.length,
    isComplete: progress.phase === 'complete',
  };
};
