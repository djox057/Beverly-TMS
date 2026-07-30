import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const COI_COMPANY_OPTIONS = [
  "BF Prime LLC",
  "BG Prime INC",
  "Beverly Freight INC",
  "AP Silver Trans LLC",
  "United Enterprise Solutions INC",
];

interface CoiRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCompanyName?: string | null;
}

export const CoiRequestDialog = ({ open, onOpenChange, defaultCompanyName }: CoiRequestDialogProps) => {
  const { toast } = useToast();
  const [brokerNameInput, setBrokerNameInput] = useState("");
  const [brokerEmailInput, setBrokerEmailInput] = useState("");
  const [brokerAddressInput, setBrokerAddressInput] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBrokerNameInput("");
    setBrokerEmailInput("");
    setBrokerAddressInput("");
    setConfirmation(null);
    setCompanyName(
      COI_COMPANY_OPTIONS.find(
        (c) => c.toUpperCase() === String(defaultCompanyName || "").trim().toUpperCase(),
      ) || "",
    );
  }, [open, defaultCompanyName]);

  const handleSubmit = async () => {
    const brokerName = brokerNameInput.trim();
    const brokerEmail = brokerEmailInput.trim();
    const brokerAddress = brokerAddressInput.trim();

    if (!brokerName || !brokerEmail || !brokerAddress) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }
    if (!companyName) {
      toast({ title: "Error", description: "Please select a booked by company", variant: "destructive" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brokerEmail)) {
      toast({ title: "Error", description: "Please enter a valid broker email", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-coi-request", {
        body: { brokerName, brokerEmail, brokerAddress, bookedByCompanyName: companyName },
      });

      if (error) throw error;

      if (data?.success === false) {
        toast({
          title: "COI request failed",
          description: data.error || "Request failed",
          variant: "destructive",
        });
        return;
      }

      setConfirmation(data.confirmationMessage);
      toast({ title: "Success", description: "COI request sent" });
    } catch (err) {
      console.error("Error sending COI request:", err);
      toast({ title: "Error", description: "Failed to send COI request", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onOpenChange(false); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirmation ? "COI Request Sent" : "COI Request"}</DialogTitle>
          <DialogDescription className="sr-only">Request a certificate of insurance for a broker</DialogDescription>
        </DialogHeader>

        {confirmation ? (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg whitespace-pre-wrap font-mono text-sm">{confirmation}</div>
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="coi-broker-name">Broker Name</Label>
              <Input
                id="coi-broker-name"
                value={brokerNameInput}
                onChange={(e) => setBrokerNameInput(e.target.value)}
                placeholder="Amerigo Logistics LLC"
                maxLength={200}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coi-broker-email">Broker Email</Label>
              <Input
                id="coi-broker-email"
                type="email"
                value={brokerEmailInput}
                onChange={(e) => setBrokerEmailInput(e.target.value)}
                placeholder="certs@brokerdomain.com"
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coi-broker-address">Full Address</Label>
              <Textarea
                id="coi-broker-address"
                value={brokerAddressInput}
                onChange={(e) => setBrokerAddressInput(e.target.value)}
                placeholder="31 Acevedo Ave, San Francisco, CA 94132"
                maxLength={500}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="coi-company">Booked By Company</Label>
              <Select value={companyName} onValueChange={setCompanyName}>
                <SelectTrigger id="coi-company">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {COI_COMPANY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  isSubmitting ||
                  !brokerNameInput.trim() ||
                  !brokerEmailInput.trim() ||
                  !brokerAddressInput.trim() ||
                  !companyName
                }
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Request"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
