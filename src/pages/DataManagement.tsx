import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Database, CheckCircle, XCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  saveLockedOrders, 
  savePickupDrops, 
  saveOrderFiles, 
  getCacheStats 
} from "@/utils/ordersCache";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface ImportStatus {
  orders: boolean | null;
  pickup_drops: boolean | null;
  order_files: boolean | null;
}

export default function DataManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [importStatus, setImportStatus] = useState<ImportStatus>({
    orders: null,
    pickup_drops: null,
    order_files: null
  });
  const [isImporting, setIsImporting] = useState(false);

  const { data: cacheStats } = useQuery({
    queryKey: ['cache-stats'],
    queryFn: getCacheStats,
    refetchInterval: 5000,
  });

  const handleFileImport = async (
    file: File, 
    type: 'orders' | 'pickup_drops' | 'order_files'
  ) => {
    setIsImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!Array.isArray(data)) {
        throw new Error('File must contain an array of records');
      }

      let saveFunction;
      let label;
      
      switch(type) {
        case 'orders':
          saveFunction = saveLockedOrders;
          label = 'orders';
          break;
        case 'pickup_drops':
          saveFunction = savePickupDrops;
          label = 'pickup/drops';
          break;
        case 'order_files':
          saveFunction = saveOrderFiles;
          label = 'order files';
          break;
      }

      await saveFunction(data);
      
      setImportStatus(prev => ({ ...prev, [type]: true }));
      
      toast({
        title: "Import Successful",
        description: `Imported ${data.length} ${label} records`,
      });

      // Invalidate orders query to trigger reload with new cached data
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error) {
      console.error(`Failed to import ${type}:`, error);
      setImportStatus(prev => ({ ...prev, [type]: false }));
      
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: error instanceof Error ? error.message : `Failed to import ${type}`,
      });
    } finally {
      setIsImporting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return 'N/A';
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return `${hours} hours ago`;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Data Management</h1>
        <p className="text-muted-foreground">
          Import archived order data from local JSON files to reduce Supabase egress costs
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Export locked orders from Supabase dashboard, then import the JSON files here. 
          The system will cache archived data locally and only fetch recent/active orders from the database.
        </AlertDescription>
      </Alert>

      {/* Cache Statistics */}
      {cacheStats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Cache Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Orders Cached</p>
                <p className="text-2xl font-bold">{cacheStats.orders.itemCount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Updated</p>
                <p className="text-lg font-semibold">{formatDuration(cacheStats.orders.cacheAge)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pickup/Drops Cached</p>
                <p className="text-2xl font-bold">{cacheStats.pickupDrops.itemCount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Order Files Cached</p>
                <p className="text-2xl font-bold">{cacheStats.orderFiles.itemCount.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Section */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Orders Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Orders
              {importStatus.orders !== null && (
                importStatus.orders ? 
                  <CheckCircle className="h-5 w-5 text-green-500 ml-auto" /> : 
                  <XCircle className="h-5 w-5 text-destructive ml-auto" />
              )}
            </CardTitle>
            <CardDescription>
              Import locked orders from orders.json
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="orders-file">Select JSON file</Label>
              <Input
                id="orders-file"
                type="file"
                accept=".json"
                disabled={isImporting}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileImport(file, 'orders');
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Pickup/Drops Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Pickup/Drops
              {importStatus.pickup_drops !== null && (
                importStatus.pickup_drops ? 
                  <CheckCircle className="h-5 w-5 text-green-500 ml-auto" /> : 
                  <XCircle className="h-5 w-5 text-destructive ml-auto" />
              )}
            </CardTitle>
            <CardDescription>
              Import pickup_drops from pickup_drops.json
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="pickup-drops-file">Select JSON file</Label>
              <Input
                id="pickup-drops-file"
                type="file"
                accept=".json"
                disabled={isImporting}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileImport(file, 'pickup_drops');
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Order Files Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Order Files
              {importStatus.order_files !== null && (
                importStatus.order_files ? 
                  <CheckCircle className="h-5 w-5 text-green-500 ml-auto" /> : 
                  <XCircle className="h-5 w-5 text-destructive ml-auto" />
              )}
            </CardTitle>
            <CardDescription>
              Import order_files from order_files.json
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="order-files-file">Select JSON file</Label>
              <Input
                id="order-files-file"
                type="file"
                accept=".json"
                disabled={isImporting}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileImport(file, 'order_files');
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How to Export Data from Supabase</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <h4 className="font-semibold mb-2">1. Export Orders</h4>
            <code className="block bg-muted p-3 rounded text-sm">
              SELECT * FROM orders WHERE locked = true ORDER BY created_at;
            </code>
          </div>
          <div>
            <h4 className="font-semibold mb-2">2. Export Pickup/Drops</h4>
            <code className="block bg-muted p-3 rounded text-sm">
              SELECT pd.* FROM pickup_drops pd<br/>
              JOIN orders o ON pd.order_id = o.id<br/>
              WHERE o.locked = true ORDER BY pd.created_at;
            </code>
          </div>
          <div>
            <h4 className="font-semibold mb-2">3. Export Order Files</h4>
            <code className="block bg-muted p-3 rounded text-sm">
              SELECT of.* FROM order_files of<br/>
              JOIN orders o ON of.order_id = o.id<br/>
              WHERE o.locked = true ORDER BY of.created_at;
            </code>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Run these queries in the Supabase SQL Editor and export results as JSON files.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
