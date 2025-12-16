import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wrench } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";

export default function Repairs() {
  const { hasRole } = useAuthContext();

  // Check if user has allowed roles
  if (!hasRole('admin') && !hasRole('manager') && !hasRole('maintenance') && !hasRole('accounting') && !hasRole('chicago_management')) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">This page is only accessible to Admin, Manager, Maintenance, Accounting and Chicago Management roles.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Wrench className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">Repairs</h1>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Repair Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Repair tracking and management coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
