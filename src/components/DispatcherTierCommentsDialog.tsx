import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Reply, MessageSquare, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Comment = {
  id: string;
  dispatcher_id: string;
  parent_id: string | null;
  author_id: string | null;
  author_name: string | null;
  content: string;
  created_at: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatcherId: string;
  dispatcherName: string;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const DispatcherTierCommentsDialog = ({
  open,
  onOpenChange,
  dispatcherId,
  dispatcherName,
}: Props) => {
  const { user, profile } = useAuthContext();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("dispatcher_tier_comments")
      .select("*")
      .eq("dispatcher_id", dispatcherId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error(error);
      toast({ title: "Failed to load comments", variant: "destructive" });
    } else {
      setComments((data as Comment[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && dispatcherId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dispatcherId]);

  const post = async (content: string, parentId: string | null) => {
    if (!user) {
      toast({ title: "Sign in to comment", variant: "destructive" });
      return;
    }
    const text = content.trim();
    if (!text) return;
    setSubmitting(true);
    const { error } = await supabase.from("dispatcher_tier_comments").insert({
      dispatcher_id: dispatcherId,
      parent_id: parentId,
      author_id: user.id,
      author_name: profile?.full_name || user.email || "Unknown",
      content: text,
    });
    setSubmitting(false);
    if (error) {
      console.error(error);
      toast({ title: "Failed to post comment", variant: "destructive" });
      return;
    }
    if (parentId) {
      setReplyText("");
      setReplyTo(null);
    } else {
      setNewComment("");
    }
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase
      .from("dispatcher_tier_comments")
      .delete()
      .eq("id", id);
    if (error) {
      console.error(error);
      toast({ title: "Failed to delete", variant: "destructive" });
      return;
    }
    load();
  };

  const topLevel = comments.filter((c) => !c.parent_id);
  const repliesOf = (id: string) => comments.filter((c) => c.parent_id === id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Comments · {dispatcherName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            placeholder="Add a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => post(newComment, null)}
              disabled={submitting || !newComment.trim()}
            >
              Post comment
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[400px] pr-3 mt-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...
            </div>
          ) : topLevel.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No comments yet. Be the first to add one.
            </div>
          ) : (
            <div className="space-y-4">
              {topLevel.map((c) => (
                <div key={c.id} className="border rounded-md p-3 bg-muted/30">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">
                        {c.author_name || "Unknown"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {fmtDate(c.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() =>
                          setReplyTo(replyTo === c.id ? null : c.id)
                        }
                      >
                        <Reply className="h-3.5 w-3.5 mr-1" /> Reply
                      </Button>
                      {user?.id === c.author_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive"
                          onClick={() => remove(c.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-sm mt-2 whitespace-pre-wrap">
                    {c.content}
                  </div>

                  {replyTo === c.id && (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        placeholder="Write a reply..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={2}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReplyTo(null);
                            setReplyText("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => post(replyText, c.id)}
                          disabled={submitting || !replyText.trim()}
                        >
                          Reply
                        </Button>
                      </div>
                    </div>
                  )}

                  {repliesOf(c.id).length > 0 && (
                    <div className="mt-3 pl-4 border-l-2 border-muted space-y-2">
                      {repliesOf(c.id).map((r) => (
                        <div key={r.id} className="bg-background rounded-md p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-xs font-medium">
                                {r.author_name || "Unknown"}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {fmtDate(r.created_at)}
                              </div>
                            </div>
                            {user?.id === r.author_id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-destructive"
                                onClick={() => remove(r.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          <div className="text-sm mt-1 whitespace-pre-wrap">
                            {r.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default DispatcherTierCommentsDialog;