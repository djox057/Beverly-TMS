import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const TestHosSync = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const testHosSync = async () => {
    setLoading(true);
    try {
      console.log('Calling HOS sync function...');
      const { data, error } = await supabase.functions.invoke('hos-sync', {
        body: {}
      });

      if (error) {
        console.error('Function error:', error);
        toast({
          title: "Error",
          description: `HOS sync failed: ${error.message}`,
          variant: "destructive"
        });
        setResult({ error: error.message });
      } else {
        console.log('Function success:', data);
        toast({
          title: "Success",
          description: `HOS sync completed. Updated ${data.updated} trucks.`,
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

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Test HOS Sync</h3>
      <Button 
        onClick={testHosSync} 
        disabled={loading}
        className="mb-4"
      >
        {loading ? 'Testing...' : 'Test HOS Sync'}
      </Button>
      
      {result && (
        <div className="mt-4">
          <h4 className="font-medium mb-2">Result:</h4>
          <pre className="bg-muted p-2 rounded text-sm overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};