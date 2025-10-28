import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const TestHosSync = () => {
  const [loading, setLoading] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [debugResult, setDebugResult] = useState<any>(null);
  const { toast } = useToast();

  const testHosSync = async () => {
    setLoading(true);
    try {
      console.log('Calling HOS sync function...');
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/hos-sync',
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
        const errorText = await response.text();
        console.error('Function error:', errorText);
        toast({
          title: "Error",
          description: `HOS sync failed: ${errorText}`,
          variant: "destructive"
        });
        setResult({ error: errorText });
      } else {
        const data = await response.json();
        console.log('Function success:', data);
        toast({
          title: "Success",
          description: `HOS sync completed. Updated ${data.updated} drivers.`,
        });
        setResult(data);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast({
        title: "Error",
        description: "Unexpected error occurred",
        variant: "destructive"
      });
      setResult({ error: 'Unexpected error' });
    } finally {
      setLoading(false);
    }
  };

  const testHosDebug = async () => {
    setDebugLoading(true);
    try {
      console.log('Calling HOS debug function...');
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/hos-debug',
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
        const errorText = await response.text();
        console.error('Debug function error:', errorText);
        toast({
          title: "Error",
          description: `HOS debug failed: ${errorText}`,
          variant: "destructive"
        });
        setDebugResult({ error: errorText });
      } else {
        const data = await response.json();
        console.log('Debug function success:', data);
        toast({
          title: "Success",
          description: `HOS debug completed. Found ${data.totalRecords} total records.`,
        });
        setDebugResult(data);
      }
    } catch (err) {
      console.error('Unexpected debug error:', err);
      toast({
        title: "Error",
        description: "Unexpected debug error occurred",
        variant: "destructive"
      });
      setDebugResult({ error: 'Unexpected error' });
    } finally {
      setDebugLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg space-y-4">
      <h3 className="text-lg font-semibold">Test HOS Functions</h3>
      
      <div className="flex gap-2">
        <Button 
          onClick={testHosSync} 
          disabled={loading}
          variant="default"
        >
          {loading ? 'Testing...' : 'Test HOS Sync'}
        </Button>
        
        <Button 
          onClick={testHosDebug} 
          disabled={debugLoading}
          variant="secondary"
        >
          {debugLoading ? 'Debugging...' : 'Debug API Data'}
        </Button>
      </div>
      
      {result && (
        <div>
          <h4 className="font-medium mb-2">Sync Result:</h4>
          <pre className="bg-muted p-2 rounded text-sm overflow-auto max-h-60">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
      
      {debugResult && (
        <div>
          <h4 className="font-medium mb-2">Debug Result:</h4>
          <pre className="bg-muted p-2 rounded text-sm overflow-auto max-h-96">
            {JSON.stringify(debugResult, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};