import { useState, useCallback } from "react";

export interface SelectedCell {
  id: string;
  value: number;
  type: "driverPay" | "freightAmount";
}

export const useCellSelection = () => {
  const [selectedCells, setSelectedCells] = useState<Map<string, SelectedCell>>(new Map());

  const toggleCell = useCallback((id: string, value: number, type: "driverPay" | "freightAmount") => {
    setSelectedCells((prev) => {
      const newMap = new Map(prev);
      if (newMap.has(id)) {
        newMap.delete(id);
      } else {
        newMap.set(id, { id, value, type });
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

  return {
    selectedCells,
    selectedValues,
    toggleCell,
    clearSelection,
    isSelected,
  };
};
