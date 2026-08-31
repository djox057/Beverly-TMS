import React, { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { setTruckOosOverride } from "@/hooks/useTruckOosOverrides";

interface TruckOosCheckboxProps {
  truckId: string;
  checked: boolean;
}

/**
 * OOS (out of service due to insurance) toggle shown inside the truck
 * VIN/Plate popover in Reports. Managers/admins/dispatchers — gate at call site.
 */
export const TruckOosCheckbox: React.FC<TruckOosCheckboxProps> = ({ truckId, checked }) => {
  const [value, setValue] = useState(checked);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setValue(checked);
  }, [checked]);

  const handleChange = async (next: boolean) => {
    setValue(next);
    setTruckOosOverride(truckId, next);
    setSaving(true);
    const { error } = await (supabase as any).rpc("dispatcher_update_truck_oos", {
      _truck_id: truckId,
      _oos: next,
    });
    setSaving(false);
    if (error) {
      setValue(!next);
      setTruckOosOverride(truckId, !next);
      toast.error("Failed to update OOS status");
      return;
    }
    toast.success(next ? "Truck marked out of service" : "OOS removed");
    queryClient.invalidateQueries({ queryKey: ["reports"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["trucks"], exact: false });
  };

  return (
    <label className="flex items-center gap-1.5 pt-1 mt-1 border-t cursor-pointer">
      <Checkbox
        checked={value}
        disabled={saving}
        onCheckedChange={(c) => handleChange(c === true)}
        onClick={(e) => e.stopPropagation()}
      />
      <span className="text-xs">OOS (insurance)</span>
    </label>
  );
};
