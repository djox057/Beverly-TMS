import { formatCurrency } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectedCell } from "@/hooks/useCellSelection";

interface CellSelectionSummaryProps {
  selectedCellsArray: SelectedCell[];
  onClear: () => void;
}

export const CellSelectionSummary = ({ selectedCellsArray, onClear }: CellSelectionSummaryProps) => {
  // Only show when there are selected values
  if (selectedCellsArray.length === 0) return null;

  // Separate miles selections from monetary selections
  const milesCells = selectedCellsArray.filter(cell => cell.type === "miles");
  const monetaryCells = selectedCellsArray.filter(cell => cell.type !== "miles");
  
  // Calculate sum of monetary values (driver pay + freight amount)
  const monetarySum = monetaryCells.reduce((acc, cell) => acc + cell.value, 0);
  const monetaryAvg = monetaryCells.length > 0 ? monetarySum / monetaryCells.length : 0;
  
  // Calculate total miles from:
  // 1. Directly selected miles cells
  // 2. rowMiles from monetary cells (freight/driver pay selections)
  const directMiles = milesCells.reduce((acc, cell) => acc + cell.value, 0);
  const associatedMiles = monetaryCells.reduce((acc, cell) => acc + (cell.rowMiles || 0), 0);
  const totalMiles = directMiles + associatedMiles;
  
  // Calculate RPM (Rate Per Mile) = Sum / Total Miles
  const rpm = totalMiles > 0 ? monetarySum / totalMiles : 0;
  
  const count = selectedCellsArray.length;

  return (
    <div
      className="fixed z-50 bg-card border border-border rounded-lg shadow-lg p-3 min-w-[220px]"
      style={{ bottom: 24, right: 24 }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">
          {count} cell{count > 1 ? "s" : ""} selected
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={onClear}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Sum:</span>
          <span className="text-sm font-semibold text-green-600 dark:text-green-400">
            {formatCurrency(monetarySum)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Average:</span>
          <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
            {formatCurrency(monetaryAvg)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Total Miles:</span>
          <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">
            {totalMiles.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">RPM:</span>
          <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">
            {rpm > 0 ? `$${rpm.toFixed(2)}` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
};
