import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { useComplaintsAccess } from "./useComplaintsAccess";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Trash2, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ComplaintComment {
  id: string;
  complaint_id: string;
  content: string;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
}

const MAX_LENGTH = 1000;

const formatChicago = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

interface ComplaintCommentsProps {
  complaintId: string;
  readOnly?: boolean;
  allowComment?: boolean;
  label?: string;
  defaultOpen?: boolean;
}

export function ComplaintComments({
  complaintId,
  readOnly = false,
  allowComment = false,
  label = "Comments",
  defaultOpen = false,
}: ComplaintCommentsProps) {
  const { user, profile, hasRole } = useAuthContext();
  const { viewOnly } = useComplaintsAccess();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = hasRole("admin") && !viewOnly;
  const canComment = !readOnly && !viewOnly && (isAdmin || hasRole("manager") || allowComment);
  const canDeleteOwn = !readOnly && !viewOnly;

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["driver-complaint-comments", complaintId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_complaint_comments")
        .select("*")
        .eq("complaint_id", complaintId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as ComplaintComment[];
    },
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["driver-complaint-comments", complaintId] });

  const handleAdd = async () => {
    const content = text.trim().slice(0, MAX_LENGTH);
    if (!content || !user) return;
    setSubmitting(true);
    const { error } = await supabase.from("driver_complaint_comments").insert({
      complaint_id: complaintId,
      content,
      author_id: user.id,
      author_name: profile?.full_name || user.email || "Unknown",
    });
    setSubmitting(false);
    if (error) {
      console.error(error);
      toast({ title: "Failed to add comment", variant: "destructive" });
      return;
    }
    setText("");
    refresh();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("driver_complaint_comments").delete().eq("id", id);
    if (error) {
      console.error(error);
      toast({ title: "Failed to delete comment", variant: "destructive" });
      return;
    }
    refresh();
  };

  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-1 text-xs text-muted-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
        <MessageSquare className="h-3 w-3 mr-1" />
        {label} ({comments.length})
      </Button>

      {open && (
        <div className="mt-1 space-y-2">
          {isLoading ? (
            <div className="flex items-center text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin mr-1" /> Loading...
            </div>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No comments yet.</p>
          ) : (
            <div className="space-y-1.5">
              {comments.map((c) => (
                <div key={c.id} className="rounded-md border bg-muted/30 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[11px] text-muted-foreground">
                      {c.author_name || "Unknown"} • {formatChicago(c.created_at)}
                    </div>
                    {canDeleteOwn && (isAdmin || c.author_id === user?.id) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-destructive"
                        onClick={() => handleDelete(c.id)}
                        title="Delete comment"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{c.content}</div>
                </div>
              ))}
            </div>
          )}

          {canComment && (
            <div className="space-y-1">
              <Textarea
                placeholder="Add a comment..."
                value={text}
                maxLength={MAX_LENGTH}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleAdd}
                  disabled={submitting || !text.trim()}
                >
                  {submitting ? "Saving..." : "Add comment"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ComplaintComments;
