import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CellSelectionSummaryProps {
  selectedValues: number[];
  onClear: () => void;
}

export const CellSelectionSummary = ({ selectedValues, onClear }: CellSelectionSummaryProps) => {
  const [position, setPosition] = useState({ bottom: 24, right: 24 });

  // Only show when there are selected values
  if (selectedValues.length === 0) return null;

  const sum = selectedValues.reduce((acc, val) => acc + val, 0);
  const average = sum / selectedValues.length;
  const count = selectedValues.length;

  return (
    <div
      className="fixed z-50 bg-card border border-border rounded-lg shadow-lg p-3 min-w-[200px]"
      style={{ bottom: position.bottom, right: position.right }}
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
            {formatCurrency(sum)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Average:</span>
          <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
            {formatCurrency(average)}
          </span>
        </div>
      </div>
    </div>
  );
};
