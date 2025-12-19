import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Link2, Loader2, Check, X } from "lucide-react";
import { useFuelDriverMappings } from "@/hooks/useFuelDriverMappings";

interface FuelDriverMappingDialogProps {
  unmatchedCount: number;
}

export const FuelDriverMappingDialog = ({ unmatchedCount }: FuelDriverMappingDialogProps) => {
  const [open, setOpen] = useState(false);
  const [selectedMappings, setSelectedMappings] = useState<Record<string, string>>({});

  const {
    drivers,
    unmatchedDrivers,
    mappings,
    isLoading,
    saveMapping,
    isSaving,
    deleteMapping,
    isDeleting,
  } = useFuelDriverMappings();

  const driverOptions = [
    { value: "", label: "Select a driver..." },
    ...drivers.map((d) => ({
      value: d.id,
      label: d.name || `${d.first_name} ${d.last_name}`,
    })),
  ];

  const handleSaveMapping = (fuelDriverName: string) => {
    const driverId = selectedMappings[fuelDriverName];
    if (driverId) {
      saveMapping({ fuelDriverName, driverId });
      setSelectedMappings((prev) => {
        const next = { ...prev };
        delete next[fuelDriverName];
        return next;
      });
    }
  };

  // Get driver name by id
  const getDriverName = (driverId: string | null) => {
    if (!driverId) return "Unknown";
    const driver = drivers.find((d) => d.id === driverId);
    return driver?.name || `${driver?.first_name} ${driver?.last_name}` || "Unknown";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={unmatchedCount > 0 ? "destructive" : "outline"}
          size="sm"
          className="gap-2"
        >
          {unmatchedCount > 0 ? (
            <>
              <AlertTriangle className="h-4 w-4" />
              {unmatchedCount} Unmatched
            </>
          ) : (
            <>
              <Link2 className="h-4 w-4" />
              Driver Mappings
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Fuel Driver Mappings
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-6">
              {/* Unmatched Drivers Section */}
              {unmatchedDrivers.length > 0 && (
                <div>
                  <h3 className="font-medium text-sm text-destructive mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Unmatched Drivers ({unmatchedDrivers.length})
                  </h3>
                  <div className="space-y-2">
                    {unmatchedDrivers.map((unmatched) => (
                      <div
                        key={unmatched.fuel_driver_name}
                        className="flex items-center gap-3 p-3 border rounded-lg bg-destructive/5"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-sm">{unmatched.fuel_driver_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {unmatched.transaction_count} transaction{unmatched.transaction_count !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Combobox
                            options={driverOptions}
                            value={selectedMappings[unmatched.fuel_driver_name] || ""}
                            onValueChange={(value) =>
                              setSelectedMappings((prev) => ({
                                ...prev,
                                [unmatched.fuel_driver_name]: value,
                              }))
                            }
                            placeholder="Link to driver..."
                            searchPlaceholder="Search drivers..."
                            className="w-48"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSaveMapping(unmatched.fuel_driver_name)}
                            disabled={!selectedMappings[unmatched.fuel_driver_name] || isSaving}
                          >
                            {isSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Existing Mappings Section */}
              {mappings.length > 0 && (
                <div>
                  <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Saved Mappings ({mappings.length})
                  </h3>
                  <div className="space-y-2">
                    {mappings.map((mapping) => (
                      <div
                        key={mapping.id}
                        className="flex items-center gap-3 p-3 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{mapping.fuel_driver_name}</span>
                            <span className="text-muted-foreground">→</span>
                            <Badge variant="secondary">
                              {getDriverName(mapping.driver_id)}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMapping(mapping.id)}
                          disabled={isDeleting}
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {unmatchedDrivers.length === 0 && mappings.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  <p>All fuel transaction drivers match database records!</p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};
