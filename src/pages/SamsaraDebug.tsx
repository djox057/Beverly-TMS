import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SamsaraDebug = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const { toast } = useToast();

  const fetchDebugData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/samsara-debug',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM'}`,
          },
          body: JSON.stringify({})
        }
      );
      
      if (!response.ok) {
        const error = await response.text();
        console.error('Error fetching debug data:', error);
        toast({
          title: "Error",
          description: "Failed to fetch Samsara data",
          variant: "destructive"
        });
        return;
      }
      
      const result = await response.json();
      setData(result);
      console.log('Samsara Debug Data:', result);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to fetch Samsara data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Samsara API Debug</h1>
      
      <Button onClick={fetchDebugData} disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Fetch Samsara Data
      </Button>

      {data && (
        <div className="mt-6 space-y-6">
          <div className="bg-white p-4 rounded-lg border">
            <h2 className="text-lg font-semibold mb-2">Summary</h2>
            <p>Total Vehicles: {data.totalVehicles}</p>
          </div>

          <div className="bg-white p-4 rounded-lg border">
            <h2 className="text-lg font-semibold mb-2">Name Patterns</h2>
            <div className="space-y-2">
              <p>With "TRUCK" prefix: {data.namePatterns?.withTRUCKPrefix?.length || 0}</p>
              <p>With 4-digit numbers: {data.namePatterns?.withNumbers?.length || 0}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border">
            <h2 className="text-lg font-semibold mb-2">All Vehicle Names</h2>
            <div className="max-h-96 overflow-y-auto">
              <ul className="space-y-1 font-mono text-sm">
                {data.namePatterns?.all?.map((name: string, index: number) => (
                  <li key={index}>{name}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border">
            <h2 className="text-lg font-semibold mb-2">Sample Vehicles (First 10)</h2>
            <pre className="overflow-auto text-xs bg-gray-50 p-3 rounded">
              {JSON.stringify(data.sampleVehicles, null, 2)}
            </pre>
          </div>

          <div className="bg-white p-4 rounded-lg border">
            <h2 className="text-lg font-semibold mb-2">Full Raw Data</h2>
            <pre className="overflow-auto text-xs bg-gray-50 p-3 rounded max-h-96">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default SamsaraDebug;
