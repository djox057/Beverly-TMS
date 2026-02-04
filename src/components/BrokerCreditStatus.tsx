import { useState } from "react";
import { DollarSign, Ban, CreditCard, Pencil, Loader2, Check, X } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Broker {
  id: string;
  credit_status: string;
  credit_limit_amount: number | null;
  credit_used_amount?: number | null;
}

interface BrokerCreditStatusProps {
  broker: Broker;
  canEdit?: boolean;
  onUpdate?: () => void;
}

export const BrokerCreditStatus = ({ broker, canEdit = false, onUpdate }: BrokerCreditStatusProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const status = broker.credit_status || "buy";

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(String(broker.credit_used_amount || 0));
    setIsEditing(true);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
    setEditValue("");
  };

  const handleSaveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const numValue = parseFloat(editValue) || 0;
    if (numValue < 0) {
      toast({
        title: "Error",
        description: "Used amount cannot be negative",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('brokers')
        .update({ credit_used_amount: numValue })
        .eq('id', broker.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Credit used amount updated"
      });
      setIsEditing(false);
      onUpdate?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (status === "buy") {
    return (
      <span className="inline-flex items-center gap-1 text-green-600">
        <DollarSign className="h-3 w-3" />
        Buy
      </span>
    );
  }

  if (status === "no_buy") {
    return (
      <span className="inline-flex items-center gap-1 text-red-600">
        <Ban className="h-3 w-3" />
        No Buy
      </span>
    );
  }

  if (status === "credit_limit") {
    const limit = broker.credit_limit_amount || 0;
    const used = broker.credit_used_amount || 0;
    const remaining = limit - used;
    const isOverLimit = remaining < 0;

    if (isEditing) {
      return (
        <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <CreditCard className="h-3 w-3 text-amber-600" />
          <span className="text-muted-foreground">$</span>
          <Input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-24 h-6 text-xs px-1"
            min="0"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit(e as any);
              if (e.key === 'Escape') handleCancelEdit(e as any);
            }}
          />
          <span className="text-muted-foreground">/${limit.toLocaleString()}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-green-600"
            onClick={handleSaveEdit}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-red-600"
            onClick={handleCancelEdit}
            disabled={isSaving}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <span className={`inline-flex items-center gap-1 cursor-pointer ${isOverLimit ? 'text-red-600' : 'text-amber-600'}`}>
            <CreditCard className="h-3 w-3" />
            ${used.toLocaleString()}/${limit.toLocaleString()}
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 ml-1"
                onClick={handleStartEdit}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </span>
        </HoverCardTrigger>
        <HoverCardContent className="w-56">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Credit Limit:</span>
              <span className="font-medium">${limit.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Used:</span>
              <span className="font-medium">${used.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground">Remaining:</span>
              <span className={`font-semibold ${isOverLimit ? 'text-red-600' : 'text-green-600'}`}>
                ${remaining.toLocaleString()}
              </span>
            </div>
            {isOverLimit && (
              <p className="text-xs text-red-600 mt-1">⚠️ Over credit limit!</p>
            )}
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }

  return <span>{status}</span>;
};
