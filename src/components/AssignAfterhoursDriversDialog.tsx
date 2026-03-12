import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Truck, Users, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Driver {
  id: string;
  name: string;
  truck: { truck_number: string } | null;
  dispatcher_id: string | null;
  dispatcher_name: string | null;
  dispatcher_office: string | null;
}

interface AssignAfterhoursDriversDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allDrivers: Driver[];
  alreadyAssignedIds: Set<string>;
  onAssign: (driverIds: string[]) => Promise<void>;
}

interface OfficeGroup {
  office: string;
  dispatchers: {
    id: string;
    name: string;
    drivers: Driver[];
  }[];
}

const AssignAfterhoursDriversDialog: React.FC<AssignAfterhoursDriversDialogProps> = ({
  open,
  onOpenChange,
  allDrivers,
  alreadyAssignedIds,
  onAssign,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [collapsedDispatchers, setCollapsedDispatchers] = useState<Set<string>>(new Set());

  // Available = not already assigned
  const availableDrivers = useMemo(
    () => allDrivers.filter((d) => !alreadyAssignedIds.has(d.id)),
    [allDrivers, alreadyAssignedIds]
  );

  // Group by office > dispatcher
  const officeGroups = useMemo(() => {
    const filtered = search
      ? availableDrivers.filter((d) => {
          const s = search.toLowerCase();
          return (
            d.name?.toLowerCase().includes(s) ||
            d.truck?.truck_number?.toString().toLowerCase().includes(s) ||
            d.dispatcher_name?.toLowerCase().includes(s)
          );
        })
      : availableDrivers;

    // Build dispatcher map
    const dispMap = new Map<string, { id: string; name: string; office: string; drivers: Driver[] }>();

    filtered.forEach((d) => {
      const dispKey = d.dispatcher_id || "unassigned";
      if (!dispMap.has(dispKey)) {
        dispMap.set(dispKey, {
          id: dispKey,
          name: d.dispatcher_name || "Unassigned",
          office: d.dispatcher_office || "Other",
          drivers: [],
        });
      }
      dispMap.get(dispKey)!.drivers.push(d);
    });

    // Group by office
    const groups = new Map<string, OfficeGroup>();

    dispMap.forEach((disp) => {
      const office = disp.office;
      if (!groups.has(office)) {
        groups.set(office, { office, dispatchers: [] });
      }
      groups.get(office)!.dispatchers.push(disp);
    });

    groups.forEach((g) => {
      g.dispatchers.sort((a, b) => a.name.localeCompare(b.name));
    });

    return Array.from(groups.values()).sort((a, b) => a.office.localeCompare(b.office));
  }, [availableDrivers, search]);

  const toggleDriver = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDispatcher = (drivers: Driver[]) => {
    const driverIds = drivers.map((d) => d.id);
    const allSelected = driverIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        driverIds.forEach((id) => next.delete(id));
      } else {
        driverIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleCollapse = (dispId: string) => {
    setCollapsedDispatchers((prev) => {
      const next = new Set(prev);
      if (next.has(dispId)) next.delete(dispId);
      else next.add(dispId);
      return next;
    });
  };

  const handleAssign = async () => {
    if (selectedIds.size === 0) return;
    setSubmitting(true);
    try {
      await onAssign(Array.from(selectedIds));
      setSelectedIds(new Set());
      setSearch("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) {
      setSelectedIds(new Set());
      setSearch("");
    }
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add Drivers</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search drivers, trucks, dispatchers..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ScrollArea className="flex-1 min-h-0 border rounded-md">
          <div className="p-2 space-y-1">
            {officeGroups.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No available drivers found.
              </p>
            )}
            {officeGroups.map((group) => (
              <div key={group.office} className="space-y-1">
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.office}
                </div>
                {group.dispatchers.map((disp) => {
                const dispDriverIds = disp.drivers.map((d) => d.id);
                const allSelected = dispDriverIds.length > 0 && dispDriverIds.every((id) => selectedIds.has(id));
                const someSelected = dispDriverIds.some((id) => selectedIds.has(id));
                const isCollapsed = collapsedDispatchers.has(disp.id);

                return (
                  <div key={disp.id} className="border rounded-md overflow-hidden">
                    {/* Dispatcher header */}
                    <div
                      className="flex items-center gap-2 px-3 py-2 bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => toggleCollapse(disp.id)}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <Checkbox
                        checked={allSelected}
                        className={someSelected && !allSelected ? "opacity-60" : ""}
                        onCheckedChange={() => toggleDispatcher(disp.drivers)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">{disp.name}</span>
                      <Badge variant="secondary" className="text-[10px] ml-auto shrink-0">
                        {disp.drivers.length}
                      </Badge>
                    </div>

                    {/* Driver list */}
                    {!isCollapsed && (
                      <div className="divide-y">
                        {disp.drivers.map((driver) => (
                          <label
                            key={driver.id}
                            className="flex items-center gap-3 px-3 py-2 pl-12 hover:bg-accent/50 cursor-pointer transition-colors"
                          >
                            <Checkbox
                              checked={selectedIds.has(driver.id)}
                              onCheckedChange={() => toggleDriver(driver.id)}
                            />
                            <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm truncate">{driver.name}</div>
                              {driver.truck && (
                                <div className="text-xs text-muted-foreground">
                                  Truck {driver.truck.truck_number}
                                </div>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} driver{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <Button onClick={handleAssign} disabled={selectedIds.size === 0 || submitting}>
            {submitting ? "Assigning..." : `Assign ${selectedIds.size > 0 ? selectedIds.size : ""} Driver${selectedIds.size !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AssignAfterhoursDriversDialog;
