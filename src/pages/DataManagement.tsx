import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function DataManagement() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Data Management</h1>
        <p className="text-muted-foreground">
          Order data is now fetched directly from the database - no manual import required.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Direct Database Access:</strong> The application now loads all orders (both unlocked and locked) directly from the database via optimized edge functions. This ensures data is always up-to-date without manual synchronization.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
          <CardDescription>
            How order data is loaded
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Unlocked Orders</h3>
            <p className="text-sm text-muted-foreground">
              Fetched via the <code>get-all-unlocked-orders</code> edge function with full relational data.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Locked (Archived) Orders</h3>
            <p className="text-sm text-muted-foreground">
              Fetched via the <code>get-all-locked-orders</code> edge function with full relational data.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Benefits</h3>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Always up-to-date data</li>
              <li>No manual synchronization required</li>
              <li>Simpler architecture with single source of truth</li>
              <li>Full relational data included (pickup/drops, order files, transfers)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
