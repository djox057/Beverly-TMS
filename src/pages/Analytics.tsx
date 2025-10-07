import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

const Analytics = () => {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="h-8 w-8" />
          Analytics
        </h1>
        <p className="text-muted-foreground mt-2">
          Advanced analytics and insights for managers and administrators
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Analytics</CardTitle>
            <CardDescription>Track revenue and profitability</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Coming soon</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
            <CardDescription>Driver and fleet performance</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Coming soon</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operational Insights</CardTitle>
            <CardDescription>Efficiency and utilization</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Coming soon</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Analytics;
