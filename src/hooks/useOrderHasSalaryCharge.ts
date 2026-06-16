import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function formatChicagoMonth(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value || "";
  const month = parts.find((p) => p.type === "month")?.value || "";
  return `${year}-${month}`;
}

/**
 * Returns true when the given order already has at least one salary charge
 * recorded on its booker's monthly salary row.
 */
export function useOrderHasSalaryCharge(orderId: string | null | undefined, refreshKey: number = 0) {
  const [hasCharge, setHasCharge] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setHasCharge(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: ord } = await supabase
        .from("orders")
        .select("id, booked_by, delivery_datetime")
        .eq("id", orderId)
        .maybeSingle();
      if (cancelled || !ord?.booked_by || !ord?.delivery_datetime) {
        if (!cancelled) setHasCharge(false);
        return;
      }
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let uid: string | null = null;
      if (uuidRe.test(ord.booked_by)) {
        const { data: p } = await supabase
          .from("profiles").select("user_id").eq("user_id", ord.booked_by).maybeSingle();
        uid = (p as any)?.user_id || null;
      }
      if (!uid) {
        const { data: p2 } = await supabase
          .from("profiles").select("user_id").eq("full_name", ord.booked_by).maybeSingle();
        uid = (p2 as any)?.user_id || null;
      }
      if (!uid) {
        if (!cancelled) setHasCharge(false);
        return;
      }
      const monthStr = formatChicagoMonth(ord.delivery_datetime);
      const { data: row } = await supabase
        .from("dispatcher_salary_payments" as any)
        .select("additionals")
        .eq("user_id", uid)
        .eq("month", monthStr)
        .maybeSingle();
      const adds = Array.isArray((row as any)?.additionals) ? ((row as any).additionals as any[]) : [];
      const has = adds.some((a) => a?.order_id === ord.id);
      if (!cancelled) setHasCharge(has);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, refreshKey]);

  return hasCharge;
}
