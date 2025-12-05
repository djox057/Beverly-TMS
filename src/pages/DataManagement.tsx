import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Database, CheckCircle, XCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Papa from "papaparse";
import { 
  saveLockedOrders, 
  savePickupDrops, 
  saveOrderFiles, 
  getCacheStats,
  clearCache
} from "@/utils/ordersCache";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
      // Parse CSV file
      Papa.parse(file, {
        header: true,
        // IMPORTANT: Keep dynamicTyping false to preserve leading zeros in string fields like broker_load_number
        // The useOrders transformation handles type conversions for numeric/boolean fields
        dynamicTyping: false,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            const data = results.data;

            if (!Array.isArray(data) || data.length === 0) {
              throw new Error('CSV file is empty or invalid');
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
            
            // Clear local IndexedDB cache to force fresh fetch from storage
            await clearCache();
            
            // Update metadata to notify all users - use upsert with id
            const metadataId = 'singleton';
            await supabase
              .from('archived_orders_metadata')
              .upsert({
                id: metadataId,
                last_updated_at: new Date().toISOString(),
                updated_by: (await supabase.auth.getUser()).data.user?.id,
              }, { onConflict: 'id' });
            
            setImportStatus(prev => ({ ...prev, [type]: true }));
            
            toast({
              title: "Import Successful",
              description: `Imported ${data.length} ${label} records from CSV. All users will see the updated data automatically.`,
            });

            // Invalidate both orders AND reports queries to trigger reload with new cached data
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['reports'] });
            queryClient.invalidateQueries({ queryKey: ['cache-stats'] });
          } catch (error) {
            console.error(`Failed to save ${type}:`, error);
            setImportStatus(prev => ({ ...prev, [type]: false }));
            
            toast({
              variant: "destructive",
              title: "Import Failed",
              description: error instanceof Error ? error.message : `Failed to import ${type}`,
            });
          } finally {
            setIsImporting(false);
          }
        },
        error: (error) => {
          console.error(`Failed to parse CSV for ${type}:`, error);
          setImportStatus(prev => ({ ...prev, [type]: false }));
          
          toast({
            variant: "destructive",
            title: "CSV Parse Error",
            description: error.message || `Failed to parse ${type} CSV file`,
          });
          setIsImporting(false);
        }
      });
    } catch (error) {
      console.error(`Failed to import ${type}:`, error);
      setImportStatus(prev => ({ ...prev, [type]: false }));
      
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: error instanceof Error ? error.message : `Failed to import ${type}`,
      });
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
          <strong>Company-Wide Cache:</strong> When you import CSV files here, they are uploaded to company storage and become available to all users automatically.
          Export locked orders from Supabase using: <code className="bg-muted px-1 rounded">SELECT * FROM orders WHERE locked = true ORDER BY created_at;</code>
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
              Import locked orders from orders.csv
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="orders-file">Select CSV file</Label>
              <Input
                id="orders-file"
                type="file"
                accept=".csv"
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
              Import pickup_drops from pickup_drops.csv
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="pickup-drops-file">Select CSV file</Label>
              <Input
                id="pickup-drops-file"
                type="file"
                accept=".csv"
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
              Import order_files from order_files.csv
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="order-files-file">Select CSV file</Label>
              <Input
                id="order-files-file"
                type="file"
                accept=".csv"
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
        <CardContent className="space-y-4">
          <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-blue-900 dark:text-blue-100">
              <strong>Important:</strong> Export as CSV format. In Supabase SQL Editor, after running each query, 
              click the download button and select "CSV" as the export format.
            </AlertDescription>
          </Alert>

          <div>
            <h4 className="font-semibold mb-2">1. Export Orders (orders.csv)</h4>
            <code className="block bg-muted p-3 rounded text-sm overflow-x-auto">
              SELECT * FROM orders WHERE locked = true ORDER BY created_at;
            </code>
            <p className="text-sm text-muted-foreground mt-2">
              Export as <strong>orders.csv</strong>
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">2. Export Pickup/Drops (pickup_drops.csv)</h4>
            <code className="block bg-muted p-3 rounded text-sm overflow-x-auto">
              SELECT pd.* FROM pickup_drops pd<br/>
              JOIN orders o ON pd.order_id = o.id<br/>
              WHERE o.locked = true ORDER BY pd.created_at;
            </code>
            <p className="text-sm text-muted-foreground mt-2">
              Export as <strong>pickup_drops.csv</strong>
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">3. Export Order Files (order_files.csv)</h4>
            <code className="block bg-muted p-3 rounded text-sm overflow-x-auto">
              SELECT of.* FROM order_files of<br/>
              JOIN orders o ON of.order_id = o.id<br/>
              WHERE o.locked = true ORDER BY of.created_at;
            </code>
            <p className="text-sm text-muted-foreground mt-2">
              Export as <strong>order_files.csv</strong>
            </p>
          </div>

          <div className="border-t pt-4 mt-4">
            <h4 className="font-semibold mb-2">Steps:</h4>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Go to Supabase SQL Editor</li>
              <li>Run each query above one at a time</li>
              <li>Click the download/export button in the results</li>
              <li>Select "CSV" as the format</li>
              <li>Save the files with the exact names shown above</li>
              <li>Upload all three CSV files using the import cards above</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
