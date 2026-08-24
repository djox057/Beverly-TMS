import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DriverComplaintIndicator {
  id: string;
  driver_id: string | null;
  complaint_type: string;
  content: string;
  created_at: string;
  created_by_name: string | null;
  is_resolved: boolean;
}

export function useDriverComplaintIndicators() {
  const { data: complaints = [], isLoading } = useQuery({
    queryKey: ["driver-complaints", "indicators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_complaints")
        .select("id, driver_id, complaint_type, content, created_at, created_by_name, is_resolved")
        .eq("is_resolved", false)
        .not("driver_id", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as DriverComplaintIndicator[];
    },
    staleTime: 60_000,
  });

  const getComplaintsForDriver = (driverId: string) => {
    const forDriver = complaints.filter((c) => c.driver_id === driverId);
    const norm = (s: string) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();
    const nonReportingContents = new Set(
      forDriver
        .filter((c) => c.complaint_type !== "dispatcher_reporting")
        .map((c) => norm(c.content))
    );
    // Hide dispatcher reportings that duplicate a categorized complaint
    return forDriver.filter(
      (c) =>
        c.complaint_type !== "dispatcher_reporting" ||
        !nonReportingContents.has(norm(c.content))
    );
  };

  const hasDriverComplaint = (driverId: string) =>
    complaints.some((c) => c.driver_id === driverId);

  return { complaints, isLoading, getComplaintsForDriver, hasDriverComplaint };
}
