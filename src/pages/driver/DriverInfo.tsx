import { useDriverData } from "@/hooks/useDriverData";
import { useAuthContext } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, User, Building, Truck, Phone, Mail, MapPin, Warehouse, CalendarIcon, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/ui/date-picker";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useDriverCashAdvance } from "@/hooks/useDriverCashAdvance";
import { Progress } from "@/components/ui/progress";

export default function DriverInfo() {
  const { data, isLoading } = useDriverData();
  const { signOut } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showYardActionDialog, setShowYardActionDialog] = useState(false);
  const [showTwoWeekNoticeDialog, setShowTwoWeekNoticeDialog] = useState(false);
  const [twoWeekNoticeDate, setTwoWeekNoticeDate] = useState<Date | undefined>(new Date());
  const [showCashAdvanceDialog, setShowCashAdvanceDialog] = useState(false);
  const [isRequestingCashAdvance, setIsRequestingCashAdvance] = useState(false);

  const { data: cashAdvanceData, refetch: refetchCashAdvance } = useDriverCashAdvance(data?.driver?.id || null);

  const handleCashAdvanceRequest = async () => {
    if (!data?.driver?.id || !data?.driver?.name) return;
    
    setIsRequestingCashAdvance(true);
    try {
      const { data: response, error } = await supabase.functions.invoke("send-cash-advance-request", {
        body: {
          driverId: data.driver.id,
          driverName: data.driver.name,
          truckNumber: data.truck?.truck_number || "N/A",
          companyName: data.truck?.company?.name || "",
        },
      });

      if (error) throw error;

      if (!response?.success) {
        throw new Error(response?.error || "Failed to request cash advance");
      }

      toast({
        title: "Success",
        description: "Cash advance request sent successfully",
      });
      refetchCashAdvance();
      setShowCashAdvanceDialog(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to request cash advance",
        variant: "destructive",
      });
    } finally {
      setIsRequestingCashAdvance(false);
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Password changed successfully",
      });
      setShowPasswordDialog(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to change password",
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">My Information</h1>
      </header>

      <div className="space-y-4">
        {/* Driver Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-5 w-5" />
              Driver Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center justify-between">
                <span>Name</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setShowYardActionDialog(true)}
                  >
                    <Warehouse className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setShowTwoWeekNoticeDialog(true)}
                  >
                    <CalendarIcon className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setShowCashAdvanceDialog(true)}
                  >
                    <DollarSign className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="text-sm font-medium text-foreground">{data?.driver?.name}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Mail className="h-3 w-3" />
                Email
              </div>
              <div className="text-sm font-medium text-foreground">{data?.driver?.email}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Phone className="h-3 w-3" />
                Phone
              </div>
              <div className="text-sm font-medium text-foreground">{data?.driver?.phone || 'N/A'}</div>
            </div>
          </CardContent>
        </Card>

        {/* Truck Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-5 w-5" />
              Truck & Trailer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.truck ? (
              <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Truck Number</div>
                  <div className="text-sm font-medium text-foreground">{data.truck.truck_number}</div>
                </div>
                {data.truck.trailer && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Trailer</div>
                    <div className="text-sm font-medium text-foreground">
                      {data.truck.trailer.trailer_number} ({data.truck.trailer.trailer_type})
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No truck assigned</div>
            )}
          </CardContent>
        </Card>

        {/* Company Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building className="h-5 w-5" />
              Company Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.truck?.company ? (
              <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Company</div>
                  <div className="text-sm font-medium text-foreground">{data.truck.company.name}</div>
                </div>
                {data.truck.dispatcher && (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Dispatcher</div>
                      <div className="text-sm font-medium text-foreground">{data.truck.dispatcher.full_name}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        Dispatcher Email
                      </div>
                      <div className="text-sm font-medium text-foreground">{data.truck.dispatcher.email}</div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No company information available</div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="space-y-2">
          <Button 
            onClick={() => setShowPasswordDialog(true)} 
            variant="outline" 
            className="w-full"
          >
            Change Password
          </Button>
          <Button 
            onClick={() => signOut()} 
            variant="destructive" 
            className="w-full"
          >
            Sign Out
          </Button>
        </div>
      </div>

      {/* Change Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
            <Button 
              onClick={handlePasswordChange} 
              className="w-full"
              disabled={isChangingPassword}
            >
              {isChangingPassword ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Changing...
                </>
              ) : (
                'Change Password'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Yard Action Dialog */}
      <Dialog open={showYardActionDialog} onOpenChange={setShowYardActionDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Request Yard Arrival</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            This feature allows you to notify dispatch that you will be arriving at the yard. Contact your dispatcher for more details.
          </div>
          <Button onClick={() => setShowYardActionDialog(false)}>Close</Button>
        </DialogContent>
      </Dialog>

      {/* Two Week Notice Dialog */}
      <Dialog open={showTwoWeekNoticeDialog} onOpenChange={setShowTwoWeekNoticeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set 2 Week Notice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Last Date of 2 Week Notice</Label>
              <DatePicker
                date={twoWeekNoticeDate}
                onDateChange={setTwoWeekNoticeDate}
                placeholder="Select last date"
              />
              {twoWeekNoticeDate && (
                <p className="text-xs text-muted-foreground">
                  Start date was: {format(new Date(twoWeekNoticeDate.getTime() - 14 * 24 * 60 * 60 * 1000), "MMMM d, yyyy")}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowTwoWeekNoticeDialog(false);
                  setTwoWeekNoticeDate(new Date());
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={!twoWeekNoticeDate}
                onClick={async () => {
                  if (!twoWeekNoticeDate || !data?.driver?.id) return;
                  
                  const { error } = await supabase
                    .from("drivers")
                    .update({ two_week_block_date: format(twoWeekNoticeDate, "yyyy-MM-dd") })
                    .eq("id", data.driver.id);

                  if (error) {
                    toast({
                      title: "Error",
                      description: "Failed to set 2 week notice",
                      variant: "destructive",
                    });
                    return;
                  }

                  toast({
                    title: "Success",
                    description: "2 week notice has been set",
                  });
                  queryClient.invalidateQueries({ queryKey: ["driver-data"] });
                  queryClient.invalidateQueries({ queryKey: ["two-week-notice-drivers"] });

                  setShowTwoWeekNoticeDialog(false);
                  setTwoWeekNoticeDate(new Date());
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cash Advance Dialog */}
      <Dialog open={showCashAdvanceDialog} onOpenChange={setShowCashAdvanceDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Request Cash Advance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Weekly Usage</span>
                <span className="text-sm font-medium">
                  ${cashAdvanceData?.weeklyAmount || 0} / $150
                </span>
              </div>
              <Progress value={((cashAdvanceData?.weekCount || 0) / 3) * 100} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">
                {cashAdvanceData?.weekCount || 0} of 3 requests this week
              </p>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Today</span>
              <span className="text-sm font-medium">
                {cashAdvanceData?.todayCount || 0} / 1 request
              </span>
            </div>

            {!cashAdvanceData?.canRequest ? (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
                <p className="text-sm text-destructive">
                  {(cashAdvanceData?.weekCount || 0) >= 3
                    ? "Weekly limit reached. Resets Monday at midnight."
                    : "Daily limit reached. Resets at midnight."}
                </p>
              </div>
            ) : (
              <Button
                onClick={handleCashAdvanceRequest}
                className="w-full"
                disabled={isRequestingCashAdvance}
              >
                {isRequestingCashAdvance ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Requesting...
                  </>
                ) : (
                  "Request $50 Cash Advance"
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
