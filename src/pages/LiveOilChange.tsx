import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Droplet } from "lucide-react";

const LiveOilChange = () => {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Droplet className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold text-foreground">Live Oil Change</h1>
          <p className="text-muted-foreground mt-1">Track live oil change status across the fleet</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            This page will show live oil change tracking for the fleet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default LiveOilChange;