import { useDriverData } from "@/hooks/useDriverData";
import { useAuthContext } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, User, Building, Truck, Phone, Mail, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function DriverInfo() {
  const { data, isLoading } = useDriverData();
  const { signOut } = useAuthContext();
  const { toast } = useToast();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

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
              <div className="text-xs text-muted-foreground mb-1">Name</div>
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
            {data?.driver?.home_city && (
              <div>
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Home Location
                </div>
                <div className="text-sm font-medium text-foreground">
                  {data.driver.home_city}, {data.driver.home_state}
                </div>
              </div>
            )}
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
    </div>
  );
}
