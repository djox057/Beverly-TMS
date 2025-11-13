import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export const useRecoveryTrucks = () => {
  const queryClient = useQueryClient();

  // Set up real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("recovery-trucks-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trucks",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["recovery-trucks"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["recovery-trucks"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lost_day_notes",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["recovery-trucks"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["recovery-trucks"],
    queryFn: async () => {
      // Fetch trucks that need recovery
      const { data: trucks, error } = await supabase
        .from("trucks")
        .select(
          `
          *,
          company:companies(name),
          trailer:trailers(trailer_number),
          driver:drivers!trucks_driver1_id_fkey(id, name, is_recovery, company:companies!company_id(name)),
          left_by_driver:drivers!trucks_left_by_driver_id_fkey(id, name),
          dispatcher:drivers!trucks_dispatcher_id_fkey(name)
        `
        )
        .eq("needs_recovery", true)
        .order("truck_number");

      if (error) throw error;

      // Fetch lost day notes separately (by driver_id from trucks)
      const driverIds = trucks?.map((t) => t.driver1_id).filter(Boolean) || [];
      const leftByDriverIds = trucks?.map((t) => t.left_by_driver_id).filter(Boolean) || [];
      const allDriverIds = [...new Set([...driverIds, ...leftByDriverIds])];
      
      const { data: lostDayNotes } = await supabase
        .from("lost_day_notes")
        .select("*")
        .in("driver_id", allDriverIds);

      // Fetch active orders for these trucks
      const truckIds = trucks?.map((t) => t.id) || [];
      const { data: orders } = await supabase
        .from("orders")
        .select(
          `
          *,
          pickup_drops(*)
        `
        )
        .in("truck_id", truckIds)
        .order("pickup_datetime");

      // Process and return data
      return (
        trucks?.map((truck) => {
          const truckOrders = orders?.filter((o) => o.truck_id === truck.id) || [];
          const lastLoad = truckOrders[truckOrders.length - 1];
          
          // Find lost day notes for this truck's driver or left_by_driver
          const driverId = truck.driver1_id || truck.left_by_driver_id;
          const truckLostDayNotes = lostDayNotes?.filter((n) => n.driver_id === driverId) || [];

          // Find when truck entered recovery (from lost_day_notes)
          const gameOverNote = truckLostDayNotes.find((note: any) =>
            note.note?.toLowerCase().includes("game over")
          );

          return {
            ...truck,
            companyName: truck.company?.name,
            trailerNumber: truck.trailer?.trailer_number,
            currentDriver: truck.driver,
            leftByDriver: truck.left_by_driver,
            dispatcherName: (truck as any).dispatcher?.name || "Unassigned",
            lastLoad,
            activeOrders: truckOrders,
            enteredRecoveryDate: gameOverNote?.date,
          };
        }) || []
      );
    },
    staleTime: 30000,
  });
};
