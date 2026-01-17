import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Award, Medal, Trophy, Star, Sparkles } from "lucide-react";
import crownImage from "@/assets/crown.png";

interface Dispatcher {
  id: string;
  full_name: string | null;
  email: string;
}

interface BonusAssignment {
  rank: number;
  amount: number;
  dispatcherId: string;
}

interface DispatcherBonusesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatchers: Dispatcher[];
  selectedMonth: string; // Format: 'YYYY-MM'
}

const BONUS_RANKS = [
  { rank: 1, amount: 1000, icon: null, useImage: true, color: "text-yellow-500" },
  { rank: 2, amount: 800, icon: Medal, useImage: false, color: "text-gray-400" },
  { rank: 3, amount: 600, icon: Award, useImage: false, color: "text-amber-600" },
  { rank: 4, amount: 400, icon: Trophy, useImage: false, color: "text-blue-500" },
  { rank: 5, amount: 200, icon: Star, useImage: false, color: "text-purple-500" },
];

export function DispatcherBonusesDialog({
  open,
  onOpenChange,
  dispatchers,
  selectedMonth,
}: DispatcherBonusesDialogProps) {
  const [assignments, setAssignments] = useState<Record<number, string>>({
    1: "",
    2: "",
    3: "",
    4: "",
    5: "",
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load existing bonuses for the selected month
  useEffect(() => {
    if (open && selectedMonth) {
      loadExistingBonuses();
    }
  }, [open, selectedMonth]);

  const loadExistingBonuses = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("dispatcher_monthly_bonuses")
        .select("*")
        .eq("month", selectedMonth);

      if (error) throw error;

      const newAssignments: Record<number, string> = { 1: "", 2: "", 3: "", 4: "", 5: "" };
      data?.forEach((bonus: any) => {
        newAssignments[bonus.bonus_rank] = bonus.dispatcher_id;
      });
      setAssignments(newAssignments);
    } catch (error) {
      console.error("Error loading bonuses:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignmentChange = (rank: number, dispatcherId: string) => {
    setAssignments((prev) => ({
      ...prev,
      [rank]: dispatcherId,
    }));
  };

  // Get available dispatchers for a specific rank (exclude already assigned ones)
  const getAvailableDispatchers = (currentRank: number) => {
    const assignedIds = Object.entries(assignments)
      .filter(([rank, id]) => parseInt(rank) !== currentRank && id)
      .map(([_, id]) => id);

    return dispatchers.filter((d) => !assignedIds.includes(d.id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete existing bonuses for this month
      await supabase
        .from("dispatcher_monthly_bonuses")
        .delete()
        .eq("month", selectedMonth);

      // Insert new bonuses
      const bonusesToInsert = Object.entries(assignments)
        .filter(([_, dispatcherId]) => dispatcherId)
        .map(([rank, dispatcherId]) => {
          const rankNum = parseInt(rank);
          const bonusConfig = BONUS_RANKS.find((b) => b.rank === rankNum);
          return {
            month: selectedMonth,
            dispatcher_id: dispatcherId,
            bonus_rank: rankNum,
            bonus_amount: bonusConfig?.amount || 0,
          };
        });

      if (bonusesToInsert.length > 0) {
        const { error } = await supabase
          .from("dispatcher_monthly_bonuses")
          .insert(bonusesToInsert);

        if (error) throw error;
      }

      toast.success("Bonuses saved successfully");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving bonuses:", error);
      toast.error("Failed to save bonuses: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const formatMonthDisplay = (month: string) => {
    if (!month) return "";
    const [year, monthNum] = month.split("-");
    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            Monthly Bonuses
          </DialogTitle>
          <DialogDescription>
            Assign bonuses to dispatchers for {formatMonthDisplay(selectedMonth)}. Each bonus can only be assigned to one dispatcher.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {BONUS_RANKS.map((bonus) => {
            const IconComponent = bonus.icon;
            return (
              <div
                key={bonus.rank}
                className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30"
              >
                <div className="flex items-center gap-2 min-w-[120px]">
                  {bonus.useImage ? (
                    <img src={crownImage} alt="Crown" className="h-6 w-6" />
                  ) : (
                    IconComponent && <IconComponent className={`h-5 w-5 ${bonus.color}`} />
                  )}
                  <span className="font-semibold text-lg">${bonus.amount}</span>
                </div>
                <div className="flex-1">
                  <Combobox
                    options={getAvailableDispatchers(bonus.rank).map((d) => ({
                      value: d.id,
                      label: d.full_name || d.email,
                    }))}
                    value={assignments[bonus.rank]}
                    onValueChange={(value) => handleAssignmentChange(bonus.rank, value)}
                    placeholder="Select dispatcher..."
                    emptyText="No dispatcher available"
                    searchPlaceholder="Search..."
                    disabled={loading}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Bonuses"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
