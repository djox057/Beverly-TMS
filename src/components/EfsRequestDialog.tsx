import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useDriverCashAdvance } from "@/hooks/useDriverCashAdvance";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface EfsRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
  truckNumber: string;
  companyName: string;
  requesterEmail?: string;
  requesterName?: string;
}

const EFS_PURPOSE_OPTIONS = [
  { value: "scale_ticket", label: "Scale ticket" },
  { value: "fuel", label: "Fuel" },
  
  { value: "escort", label: "Escort" },
  { value: "truck_wash", label: "Truck wash" },
  { value: "straps", label: "Straps" },
  { value: "repairs", label: "Repairs" },
  { value: "custom", label: "Custom" },
];

export function EfsRequestDialog({
  open,
  onOpenChange,
  driverId,
  driverName,
  truckNumber,
  companyName,
  requesterEmail,
  requesterName,
}: EfsRequestDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("cash-advance");
  
  // Cash Advance tab state
  const [cashAdvanceAmount, setCashAdvanceAmount] = useState(50);
  const [isRequestingCashAdvance, setIsRequestingCashAdvance] = useState(false);
  const { data: cashAdvanceData, refetch: refetchCashAdvance, isLoading: isCashAdvanceLoading } = useDriverCashAdvance(driverId);
  
  // Other tab state
  const [otherPurpose, setOtherPurpose] = useState<string>("");
  const [customPurpose, setCustomPurpose] = useState<string>("");
  const [otherAmount, setOtherAmount] = useState<string>("");
  const [isRequestingOther, setIsRequestingOther] = useState(false);
  
  // Fuel-specific fields
  const [fuelCity, setFuelCity] = useState<string>("");
  const [fuelState, setFuelState] = useState<string>("");
  
  const queryClient = useQueryClient();

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setCashAdvanceAmount(50);
      setOtherPurpose("");
      setCustomPurpose("");
      setOtherAmount("");
      setFuelCity("");
      setFuelState("");
      setActiveTab("cash-advance");
    }
  }, [open]);

  const handleCashAdvanceRequest = async () => {
    setIsRequestingCashAdvance(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-cash-advance-request", {
        body: {
          driverId,
          driverName,
          truckNumber,
          companyName,
          amount: cashAdvanceAmount,
          requesterEmail,
          requesterName,
        },
      });

      if (error) throw error;
      
      if (data?.success === false) {
        toast({
          title: "Cannot request cash advance",
          description: data.error || "Request failed",
          variant: "destructive",
        });
        refetchCashAdvance();
        return;
      }
      
      toast({
        title: "Cash advance requested",
        description: `$${cashAdvanceAmount} cash advance sent for ${driverName}`,
      });
      
      refetchCashAdvance();
      onOpenChange(false);
    } catch (error) {
      console.error("Cash advance error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to request cash advance",
        variant: "destructive",
      });
    } finally {
      setIsRequestingCashAdvance(false);
    }
  };

  const handleOtherRequest = async () => {
    if (!otherPurpose || !otherAmount) return;
    if (otherPurpose === "custom" && !customPurpose.trim()) return;
    // Fuel requires city, state only
    if (otherPurpose === "fuel" && (!fuelCity.trim() || !fuelState.trim())) return;
    
    setIsRequestingOther(true);
    try {
      const purposeLabel = otherPurpose === "custom" 
        ? customPurpose.trim() 
        : (EFS_PURPOSE_OPTIONS.find(p => p.value === otherPurpose)?.label || otherPurpose);
      
      const { data, error } = await supabase.functions.invoke("send-efs-other-request", {
        body: {
          driverId,
          driverName,
          truckNumber,
          companyName,
          amount: parseFloat(otherAmount),
          purpose: purposeLabel,
          requesterEmail,
          requesterName,
          // Fuel-specific fields (city and state only)
          ...(otherPurpose === "fuel" && {
            city: fuelCity.trim(),
            state: fuelState.trim().toUpperCase(),
          }),
        },
      });

      if (error) throw error;
      
      if (data?.success === false) {
        toast({
          title: "Request failed",
          description: data.error || "Failed to send request",
          variant: "destructive",
        });
        return;
      }
      
      // Invalidate fuel transactions query if it was a fuel request
      if (otherPurpose === "fuel") {
        queryClient.invalidateQueries({ queryKey: ["fuel-transactions"] });
      }
      
      toast({
        title: "EFS request sent",
        description: `$${parseFloat(otherAmount).toFixed(2)} ${purposeLabel} request sent for ${driverName}`,
      });
      
      onOpenChange(false);
    } catch (error) {
      console.error("EFS other request error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send EFS request",
        variant: "destructive",
      });
    } finally {
      setIsRequestingOther(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>EFS Request</DialogTitle>
        </DialogHeader>
        
        <div className="text-sm text-muted-foreground mb-4">
          <p><strong>Driver:</strong> {driverName}</p>
          <p><strong>Truck:</strong> #{truckNumber}</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="cash-advance">Cash Advance</TabsTrigger>
            <TabsTrigger value="other">Other</TabsTrigger>
          </TabsList>
          
          {/* Cash Advance Tab */}
          <TabsContent value="cash-advance" className="space-y-4 mt-4">
            {isCashAdvanceLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Weekly Usage Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Weekly Usage</span>
                    <span className="text-sm font-semibold">
                      ${cashAdvanceData?.weeklyAmount || 0} / $150
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2.5">
                    <div 
                      className="bg-primary h-2.5 rounded-full transition-all"
                      style={{ width: `${Math.min(((cashAdvanceData?.weeklyAmount || 0) / 150) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ${cashAdvanceData?.remainingAmount ?? 150} remaining this week
                  </p>
                </div>

                {/* Amount Input */}
                {cashAdvanceData?.canRequest && (
                  <div className="space-y-2">
                    <Label htmlFor="cash-advance-amount" className="text-sm font-medium">Amount ($)</Label>
                    <Input
                      id="cash-advance-amount"
                      type="number"
                      min={0}
                      max={Math.min(150, cashAdvanceData?.remainingAmount ?? 150)}
                      value={cashAdvanceAmount}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setCashAdvanceAmount(Math.min(Math.max(0, val), Math.min(150, cashAdvanceData?.remainingAmount ?? 150)));
                      }}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter amount between $0 and ${Math.min(150, cashAdvanceData?.remainingAmount ?? 150)}
                    </p>
                  </div>
                )}

                {/* Status Message */}
                {cashAdvanceData && !cashAdvanceData.canRequest && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-sm text-destructive font-medium">
                      Weekly amount limit ($150) reached. Resets Monday at midnight (Chicago time).
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 justify-end pt-2">
                  <Button 
                    variant="outline" 
                    onClick={() => onOpenChange(false)}
                    disabled={isRequestingCashAdvance}
                  >
                    Close
                  </Button>
                  {!isCashAdvanceLoading && cashAdvanceData?.canRequest && (
                    <Button 
                      onClick={handleCashAdvanceRequest}
                      disabled={isRequestingCashAdvance || cashAdvanceAmount <= 0}
                    >
                      {isRequestingCashAdvance ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        `Request $${cashAdvanceAmount}`
                      )}
                    </Button>
                  )}
                </div>
              </>
            )}
          </TabsContent>
          
          {/* Other Tab */}
          <TabsContent value="other" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="efs-purpose" className="text-sm font-medium">Purpose</Label>
              <Select value={otherPurpose} onValueChange={(val) => {
                setOtherPurpose(val);
                if (val !== "custom") setCustomPurpose("");
              }}>
                <SelectTrigger id="efs-purpose" className="w-full">
                  <SelectValue placeholder="Select purpose" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {EFS_PURPOSE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {otherPurpose === "custom" && (
              <div className="space-y-2">
                <Label htmlFor="custom-purpose" className="text-sm font-medium">Custom Purpose</Label>
                <Input
                  id="custom-purpose"
                  type="text"
                  value={customPurpose}
                  onChange={(e) => setCustomPurpose(e.target.value)}
                  placeholder="Enter custom purpose"
                  maxLength={100}
                />
              </div>
            )}
            
            {/* Fuel-specific fields */}
            {otherPurpose === "fuel" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="fuel-city" className="text-sm font-medium">City</Label>
                  <Input
                    id="fuel-city"
                    type="text"
                    value={fuelCity}
                    onChange={(e) => setFuelCity(e.target.value)}
                    placeholder="e.g., Chicago"
                    maxLength={50}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fuel-state" className="text-sm font-medium">State</Label>
                  <Input
                    id="fuel-state"
                    type="text"
                    value={fuelState}
                    onChange={(e) => setFuelState(e.target.value)}
                    placeholder="e.g., IL"
                    maxLength={2}
                    className="uppercase"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="efs-amount" className="text-sm font-medium">Amount ($)</Label>
              <Input
                id="efs-amount"
                type="number"
                step="0.01"
                min={0}
                value={otherAmount}
                onChange={(e) => setOtherAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              This request has no usage limits and will not count toward the cash advance limits.
            </p>

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-2">
              <Button 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={isRequestingOther}
              >
                Close
              </Button>
              <Button 
                onClick={handleOtherRequest}
                disabled={
                  isRequestingOther || 
                  !otherPurpose || 
                  !otherAmount || 
                  parseFloat(otherAmount) <= 0 || 
                  (otherPurpose === "custom" && !customPurpose.trim()) ||
                  (otherPurpose === "fuel" && (!fuelCity.trim() || !fuelState.trim()))
                }
              >
                {isRequestingOther ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Request"
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
