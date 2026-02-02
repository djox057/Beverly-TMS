import { useState, useCallback } from "react";

export interface SelectedCell {
  id: string;
  value: number;
  type: "driverPay" | "freightAmount" | "miles";
  rowMiles?: number; // Miles associated with this row (for freight/driver pay selections)
}

export const useCellSelection = () => {
  const [selectedCells, setSelectedCells] = useState<Map<string, SelectedCell>>(new Map());

  const toggleCell = useCallback((id: string, value: number, type: "driverPay" | "freightAmount" | "miles", rowMiles?: number) => {
    setSelectedCells((prev) => {
      const newMap = new Map(prev);
      if (newMap.has(id)) {
        newMap.delete(id);
      } else {
        newMap.set(id, { id, value, type, rowMiles });
      }
      return newMap;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedCells(new Map());
  }, []);

  const isSelected = useCallback((id: string) => {
    return selectedCells.has(id);
  }, [selectedCells]);

  const selectedValues = Array.from(selectedCells.values()).map((cell) => cell.value);
  
  // Get all selected cells for more detailed calculations
  const selectedCellsArray = Array.from(selectedCells.values());

  return {
    selectedCells,
    selectedValues,
    selectedCellsArray,
    toggleCell,
    clearSelection,
    isSelected,
  };
};
