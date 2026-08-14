import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PaperworkItem {
  id: string;
  office: string;
  unit_label: string;
  last_day: string | null;
  last_day_text: string | null;
  reason: string | null;
  note: string | null;
  is_ready: boolean;
}

const formatDate = (value: string | null) => {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return `${m}/${d}/${y}`;
};

const daysUntil = (value: string | null) => {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${value}T00:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
};

export const PaperworkTab = () => {
  const { hasRole } = useAuthContext();
  const queryClient = useQueryClient();
  const canEdit =
    hasRole("admin") || hasRole("manager") || hasRole("safety") || hasRole("maintenance");

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaperworkItem | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["paperwork_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paperwork_items")
        .select("*")
        .order("last_day", { ascending: true, nullsFirst: false })
        .order("unit_label", { ascending: true });
      if (error) throw error;
      return (data || []) as PaperworkItem[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<PaperworkItem> & { id?: string }) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase
          .from("paperwork_items")
          .update(rest as never)
          .eq("id", id);
        if (error) throw error;
        return { created: false as const };
      } else {
        const { error } = await supabase.from("paperwork_items").insert(payload as never);
        if (error) throw error;
        return { created: true as const, item: payload };
      }
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ["paperwork_items"] });
      setDialogOpen(false);
      setEditing(null);
      toast.success("Saved");

      if (result?.created) {
        const item = result.item as Partial<PaperworkItem>;
        try {
          const { data, error } = await supabase.functions.invoke("send-paperwork-reminder", {
            body: {
              unitLabel: item.unit_label,
              lastDay: item.last_day ?? null,
              lastDayText: item.last_day_text ?? null,
              reason: item.reason ?? null,
              note: item.note ?? null,
            },
          });
          if (error || (data as any)?.error || (data as any)?.success === false) {
            toast.error("Paperwork saved, but reminder email failed");
          } else {
            toast.success("Reminder email sent");
          }
        } catch {
          toast.error("Paperwork saved, but reminder email failed");
        }
      }
    },
    onError: (e: any) => toast.error(e.message || "Failed to save"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("paperwork_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["paperwork_items"] });
      toast.success("Deleted");
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete"),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((i) => {
      if (!term) return true;
      return (
        i.unit_label.toLowerCase().includes(term) ||
        (i.reason || "").toLowerCase().includes(term) ||
        (i.note || "").toLowerCase().includes(term)
      );
    });
  }, [items, search]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const lastDay = (fd.get("last_day") as string) || null;
    saveMutation.mutate({
      ...(editing ? { id: editing.id } : {}),
      office: (fd.get("office") as string) || "CHICAGO",
      unit_label: (fd.get("unit_label") as string)?.trim(),
      last_day: lastDay,
      last_day_text: (fd.get("last_day_text") as string)?.trim() || null,
      reason: (fd.get("reason") as string)?.trim() || null,
      note: (fd.get("note") as string)?.trim() || null,
      is_ready: editing ? editing.is_ready : false,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search truck/trailer or reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {canEdit && (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Item
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Truck / Trailer</TableHead>
              <TableHead className="w-[170px]">Last Day</TableHead>
              <TableHead className="w-[320px]">Reason / Note</TableHead>
              <TableHead className="w-[240px]">Note</TableHead>
              <TableHead className="w-[110px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No items
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => {
                const d = daysUntil(item.last_day);
                const overdue = d !== null && d < 0;
                const soon = d !== null && d >= 0 && d <= 14;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium truncate">{item.unit_label}</TableCell>
                    <TableCell>
                      {item.last_day ? (
                        <span
                          className={
                            overdue
                              ? "text-destructive font-semibold"
                              : soon
                                ? "text-amber-600 dark:text-amber-400 font-medium"
                                : ""
                          }
                        >
                          {formatDate(item.last_day)}
                        </span>
                      ) : item.last_day_text ? (
                        <span className="text-sm">{item.last_day_text}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="truncate" title={item.reason || ""}>
                      {item.reason || "—"}
                    </TableCell>
                    <TableCell>
                      {canEdit ? (
                        <Input
                          className="h-7 text-sm"
                          defaultValue={item.note || ""}
                          placeholder="Add note..."
                          key={item.note || ""}
                          onBlur={(e) => {
                            const val = e.target.value.trim() || null;
                            if (val !== (item.note || null)) {
                              saveMutation.mutate({ id: item.id, note: val });
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") {
                              e.currentTarget.value = item.note || "";
                              e.currentTarget.blur();
                            }
                          }}
                        />
                      ) : (
                        <span className="truncate" title={item.note || ""}>
                          {item.note || "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canEdit && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditing(item);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => {
                              if (confirm(`Delete ${item.unit_label}?`)) deleteMutation.mutate(item.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Paperwork Item" : "Add Paperwork Item"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="unit_label">Truck / Trailer *</Label>
              <Input
                id="unit_label"
                name="unit_label"
                required
                defaultValue={editing?.unit_label || ""}
                placeholder="e.g. (8495) 096201"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="last_day">Last Day</Label>
                <Input
                  id="last_day"
                  name="last_day"
                  type="date"
                  defaultValue={editing?.last_day || ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_day_text">Last Day (range/text)</Label>
                <Input
                  id="last_day_text"
                  name="last_day_text"
                  defaultValue={editing?.last_day_text || ""}
                  placeholder="08/02/2026-8/29/2026"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason / Note</Label>
              <Input
                id="reason"
                name="reason"
                defaultValue={editing?.reason || ""}
                placeholder="TRUCK PLATE, NTTA, NY"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Textarea id="note" name="note" defaultValue={editing?.note || ""} rows={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="office">Office</Label>
              <Input id="office" name="office" defaultValue={editing?.office || "CHICAGO"} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};