import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { useComplaintsAccess } from "./useComplaintsAccess";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, CheckCircle2, RotateCcw, Tags } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AddComplaintDialog } from "./AddComplaintDialog";
import { ComplaintComments } from "./ComplaintComments";
import { AssignComplaintTypeDialog } from "./AssignComplaintTypeDialog";
import { TranslatableComplaintText } from "./TranslatableComplaintText";
import {
  COMPLAINT_TYPE_LABELS,
  DISPATCHER_REPORTING,
  type ComplaintTypeKey,
  type DriverComplaint,
} from "./complaintTypes";

const chicagoDayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

const chicagoDayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

const chicagoTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

interface ComplaintCardProps {
  type: ComplaintTypeKey;
  complaints: DriverComplaint[];
  assignedSourceIds?: Set<string>;
}

export function ComplaintCard({ type, complaints, assignedSourceIds }: ComplaintCardProps) {
  const { user } = useAuthContext();
  const { canManage, isDispatchOnly, viewOnly } = useComplaintsAccess();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<DriverComplaint | null>(null);
  const [assigning, setAssigning] = useState<DriverComplaint | null>(null);

  const isReportingCard = type === DISPATCHER_REPORTING;
  const canAdd = canManage || (isDispatchOnly && isReportingCard);
  const canEditRow = (c: DriverComplaint) =>
    canManage || (isDispatchOnly && c.created_by === user?.id);

  const grouped = useMemo(() => {
    const map = new Map<string, DriverComplaint[]>();
    for (const c of complaints) {
      const key = chicagoDayKey(c.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [complaints]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["driver-complaints"] });

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("driver_complaints").delete().eq("id", id);
    if (error) {
      console.error(error);
      toast({ title: "Failed to delete complaint", variant: "destructive" });
      return;
    }
    refresh();
  };

  const handleToggleResolved = async (c: DriverComplaint) => {
    const { error } = await supabase
      .from("driver_complaints")
      .update({
        is_resolved: !c.is_resolved,
        resolved_at: c.is_resolved ? null : new Date().toISOString(),
      } as never)
      .eq("id", c.id);
    if (error) {
      console.error(error);
      toast({ title: "Failed to update complaint", variant: "destructive" });
      return;
    }
    if (c.source_complaint_id) {
      await supabase
        .from("driver_complaints")
        .update({
          is_resolved: !c.is_resolved,
          resolved_at: c.is_resolved ? null : new Date().toISOString(),
        } as never)
        .eq("id", c.source_complaint_id);
    }
    refresh();
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span>
            {COMPLAINT_TYPE_LABELS[type]} ({complaints.length})
          </span>
          {canAdd && (
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                setEditing(null);
                setAddOpen(true);
              }}
              title={`Add ${COMPLAINT_TYPE_LABELS[type]} complaint`}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {complaints.length === 0 ? (
          <p className="text-sm text-muted-foreground">No complaints</p>
        ) : (
          <div className="space-y-5">
            {grouped.map(([dayKey, items]) => (
              <div key={dayKey} className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground border-b pb-1">
                  {chicagoDayLabel(items[0].created_at)}
                </h3>
                <div className="space-y-3">
                  {items.map((c) => (
                    <div
                      key={c.id}
                      className={`border rounded-lg p-3 space-y-1 ${
                        c.is_resolved
                          ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="font-semibold text-sm break-words">{c.subject_text}</p>
                        {canEditRow(c) && (
                          <div className="flex gap-0.5 shrink-0">
                            {canManage && isReportingCard && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => setAssigning(c)}
                                title="Assign category"
                              >
                                <Tags className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleToggleResolved(c)}
                              title={c.is_resolved ? "Mark unresolved" : "Mark resolved"}
                            >
                              {c.is_resolved ? (
                                <RotateCcw className="h-3 w-3" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                setEditing(c);
                                setAddOpen(true);
                              }}
                              title="Edit complaint"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={() => handleDelete(c.id)}
                              title="Delete complaint"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <TranslatableComplaintText text={c.content} />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-muted-foreground">
                          {c.created_by_name || "Unknown"} • {chicagoTime(c.created_at)}
                        </span>
                        {c.source_complaint_id && (
                          <Badge variant="secondary" className="text-[10px] py-0">
                            From dispatcher reporting
                          </Badge>
                        )}
                        {isReportingCard && canManage && assignedSourceIds?.has(c.id) && (
                          <Badge variant="secondary" className="text-[10px] py-0">
                            Assigned
                          </Badge>
                        )}
                        {c.is_resolved && (
                          <Badge variant="outline" className="text-[10px] py-0">
                            Resolved
                          </Badge>
                        )}
                      </div>
                      <ComplaintComments
                        complaintId={c.id}
                        readOnly={viewOnly}
                        allowComment={!viewOnly && isDispatchOnly && c.created_by === user?.id}
                      />
                      {c.source_complaint_id && (
                        <ComplaintComments
                          complaintId={c.source_complaint_id}
                          readOnly
                          label="Dispatcher comments"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AddComplaintDialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) setEditing(null);
        }}
        type={type}
        complaint={editing}
      />

      <AssignComplaintTypeDialog
        open={!!assigning}
        onOpenChange={(o) => {
          if (!o) setAssigning(null);
        }}
        reporting={assigning}
      />
    </Card>
  );
}

export default ComplaintCard;
