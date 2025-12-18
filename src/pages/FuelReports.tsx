import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Fuel } from "lucide-react";

const FuelReports = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Fuel className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">Fuel Reports</h1>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Fuel Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Fuel reports content coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default FuelReports;
