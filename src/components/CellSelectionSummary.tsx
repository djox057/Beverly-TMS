import { formatCurrency } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectedCell } from "@/hooks/useCellSelection";

interface CellSelectionSummaryProps {
  selectedCellsArray: SelectedCell[];
  onClear: () => void;
}

const SummaryCard = ({
  label,
  cells,
  milesCells,
  onClear,
}: {
  label: string;
  cells: SelectedCell[];
  milesCells: SelectedCell[];
  onClear: () => void;
}) => {
  const sum = cells.reduce((acc, c) => acc + c.value, 0);
  const avg = cells.length > 0 ? sum / cells.length : 0;
  const directMiles = milesCells.reduce((acc, c) => acc + c.value, 0);
  const associatedMiles = cells.reduce((acc, c) => acc + (c.rowMiles || 0), 0);
  // If miles cells are explicitly selected, use them as the source of truth.
  // Otherwise fall back to row-associated miles to keep RPM working when only $ cells are selected.
  const totalMiles = directMiles > 0 ? directMiles : associatedMiles;
  const rpm = totalMiles > 0 ? sum / totalMiles : 0;

  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 min-w-[200px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label} · {cells.length} cell{cells.length > 1 ? "s" : ""}
        </span>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onClear}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Sum:</span>
          <span className="text-sm font-semibold text-green-600 dark:text-green-400">{formatCurrency(sum)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Average:</span>
          <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{formatCurrency(avg)}</span>
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

const MilesSummaryCard = ({ cells, onClear }: { cells: SelectedCell[]; onClear: () => void }) => {
  const sum = cells.reduce((acc, c) => acc + c.value, 0);
  const avg = cells.length > 0 ? sum / cells.length : 0;

  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 min-w-[200px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">
          Miles · {cells.length} cell{cells.length > 1 ? "s" : ""}
        </span>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onClear}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Sum:</span>
          <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">
            {sum.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Average:</span>
          <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
            {avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  );
};

export const CellSelectionSummary = ({ selectedCellsArray, onClear }: CellSelectionSummaryProps) => {
  if (selectedCellsArray.length === 0) return null;

  const driverPayCells = selectedCellsArray.filter((c) => c.type === "driverPay");
  const freightCells = selectedCellsArray.filter((c) => c.type === "freightAmount");
  const milesCells = selectedCellsArray.filter((c) => c.type === "miles");

  const hasDriverPay = driverPayCells.length > 0;
  const hasFreight = freightCells.length > 0;
  const hasMiles = milesCells.length > 0;

  return (
    <div className="fixed z-50 flex gap-2" style={{ bottom: 24, right: 24 }}>
      {hasDriverPay && (
        <SummaryCard label="Stop Amt" cells={driverPayCells} milesCells={milesCells} onClear={onClear} />
      )}
      {hasFreight && <SummaryCard label="Freight Amt" cells={freightCells} milesCells={milesCells} onClear={onClear} />}
      {hasMiles && <MilesSummaryCard cells={milesCells} onClear={onClear} />}
    </div>
  );
};
