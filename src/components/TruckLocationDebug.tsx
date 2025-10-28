import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LocationDebugData {
  truckNumber: string;
  samsaraVehicleName: string | null;
  apiSource: string | null;
  latitude: number | null;
  longitude: number | null;
  timestamp: string | null;
  ageMinutes: number | null;
  rawVehicleData: any;
  multipleCallsComparison: Array<{
    callNumber: number;
    timestamp: string;
    latitude: number;
    longitude: number;
    identical: boolean;
  }>;
  issue: string | null;
}

export const TruckLocationDebug = () => {
  const [truckNumber, setTruckNumber] = useState("327");
  const [loading, setLoading] = useState(false);
  const [debugData, setDebugData] = useState<LocationDebugData | null>(null);
  const { toast } = useToast();

  const analyzeLocation = async () => {
    setLoading(true);
    try {
      // Make 3 consecutive calls to check for caching
      const calls = [];
      const { data: { session } } = await supabase.auth.getSession();
      for (let i = 0; i < 3; i++) {
        const response = await fetch(
          'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/samsara-locations',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM'}`,
            },
            body: JSON.stringify({})
          }
        );
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        calls.push({ callNumber: i + 1, data, timestamp });
        // Small delay between calls
        if (i < 2) await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Find truck in the results
      const truckLocations = calls.map(call => 
        call.data.locations?.find((loc: any) => loc.truck_number === truckNumber)
      );

      if (!truckLocations[0]) {
        setDebugData({
          truckNumber,
          samsaraVehicleName: null,
          apiSource: null,
          latitude: null,
          longitude: null,
          timestamp: null,
          ageMinutes: null,
          rawVehicleData: null,
          multipleCallsComparison: [],
          issue: `Truck ${truckNumber} not found in Samsara API response. Check if truck number matches a Samsara vehicle name.`
        });
        return;
      }

      const firstLocation = truckLocations[0];
      const locationTimestamp = new Date(firstLocation.timestamp);
      const now = new Date();
      const ageMinutes = (now.getTime() - locationTimestamp.getTime()) / 1000 / 60;

      // Compare multiple calls
      const comparison = truckLocations.map((loc, idx) => ({
        callNumber: idx + 1,
        timestamp: loc?.timestamp || 'N/A',
        latitude: loc?.latitude || 0,
        longitude: loc?.longitude || 0,
        identical: idx === 0 ? true : (
          loc?.latitude === truckLocations[0]?.latitude &&
          loc?.longitude === truckLocations[0]?.longitude &&
          loc?.timestamp === truckLocations[0]?.timestamp
        )
      }));

      // Determine the issue
      let issue = null;
      if (ageMinutes > 60) {
        issue = `🔴 CRITICAL: Location data is ${Math.round(ageMinutes)} minutes (${Math.round(ageMinutes / 60)} hours) old! This explains why the app shows different data - the API is returning stale cached location.`;
      } else if (ageMinutes > 15) {
        issue = `⚠️ WARNING: Location data is ${Math.round(ageMinutes)} minutes old. This is moderately stale.`;
      } else if (comparison.every(c => c.identical)) {
        issue = `🔄 CACHED: All 3 API calls returned identical data (same timestamp, same coordinates). The API is serving cached data.`;
      }

      setDebugData({
        truckNumber,
        samsaraVehicleName: firstLocation.samsaraVehicleName || 'Unknown',
        apiSource: firstLocation.apiSource || 'Unknown',
        latitude: firstLocation.latitude,
        longitude: firstLocation.longitude,
        timestamp: firstLocation.timestamp,
        ageMinutes: Math.round(ageMinutes),
        rawVehicleData: firstLocation,
        multipleCallsComparison: comparison,
        issue
      });

      console.log('🔍 LOCATION DEBUG COMPLETE:', {
        truck: truckNumber,
        ageMinutes: Math.round(ageMinutes),
        allCallsIdentical: comparison.every(c => c.identical),
        rawData: firstLocation
      });

    } catch (error: any) {
      console.error('Debug error:', error);
      toast({
        title: "Debug Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>🔍 Samsara Location Debugger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter truck number (e.g., 327)"
              value={truckNumber}
              onChange={(e) => setTruckNumber(e.target.value)}
            />
            <Button onClick={analyzeLocation} disabled={loading || !truckNumber}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Debug Location
            </Button>
          </div>

          {debugData && (
            <div className="space-y-4">
              {debugData.issue && (
                <Card className="border-destructive bg-destructive/10">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                      <div>
                        <p className="font-semibold text-destructive mb-2">Issue Identified:</p>
                        <p className="text-sm">{debugData.issue}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Location Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="font-semibold">Truck Number:</div>
                    <div>{debugData.truckNumber}</div>
                    
                    <div className="font-semibold">Samsara Vehicle Name:</div>
                    <div>{debugData.samsaraVehicleName || 'Not found'}</div>
                    
                    <div className="font-semibold">API Source:</div>
                    <div>{debugData.apiSource || 'N/A'}</div>
                    
                    <div className="font-semibold">Coordinates:</div>
                    <div>{debugData.latitude && debugData.longitude 
                      ? `${debugData.latitude.toFixed(6)}, ${debugData.longitude.toFixed(6)}`
                      : 'N/A'}</div>
                    
                    <div className="font-semibold">Timestamp:</div>
                    <div>{debugData.timestamp ? new Date(debugData.timestamp).toLocaleString() : 'N/A'}</div>
                    
                    <div className="font-semibold">Age:</div>
                    <div className={debugData.ageMinutes && debugData.ageMinutes > 60 ? 'text-destructive font-bold' : ''}>
                      {debugData.ageMinutes !== null 
                        ? `${debugData.ageMinutes} minutes (${(debugData.ageMinutes / 60).toFixed(1)} hours)`
                        : 'N/A'}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Cache Test (3 Consecutive Calls)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {debugData.multipleCallsComparison.map((call) => (
                      <div key={call.callNumber} className="flex items-center gap-2 p-2 bg-muted rounded">
                        <span className="font-semibold">Call {call.callNumber}:</span>
                        <span>{call.latitude.toFixed(6)}, {call.longitude.toFixed(6)}</span>
                        <span className="text-muted-foreground text-xs">{new Date(call.timestamp).toLocaleTimeString()}</span>
                        {call.identical && call.callNumber > 1 && (
                          <span className="text-orange-600 text-xs ml-auto">⚠️ Identical (cached)</span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Raw API Data</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-64">
                    {JSON.stringify(debugData.rawVehicleData, null, 2)}
                  </pre>
                </CardContent>
              </Card>

              <Card className="border-blue-500 bg-blue-500/10">
                <CardContent className="pt-6">
                  <div className="text-sm space-y-2">
                    <p className="font-semibold text-blue-700">💡 Recommendations:</p>
                    <ul className="list-disc list-inside space-y-1 text-blue-600">
                      {debugData.ageMinutes && debugData.ageMinutes > 60 && (
                        <li>The location is extremely stale. Samsara may not be receiving GPS updates from this truck's device.</li>
                      )}
                      <li>Check if the truck's ELD device is powered on and has GPS signal</li>
                      <li>Verify the Samsara vehicle name matches the truck number</li>
                      <li>Consider using Samsara webhooks for real-time location updates instead of polling</li>
                      {debugData.multipleCallsComparison.every(c => c.identical) && (
                        <li>API responses are cached - use Samsara's real-time streaming endpoint if available</li>
                      )}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
