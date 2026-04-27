import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface HosRequestDialogProps {
  open: boolean;
  onClose: () => void;
  driverName: string;
  truckNumber: string;
  companyName: string;
  teamDriverName?: string;
  requesterEmail?: string;
}

type RequestType = 'full_shift' | 'full_cycle' | 'custom';

export const HosRequestDialog = ({
  open,
  onClose,
  driverName,
  truckNumber,
  companyName,
  teamDriverName,
  requesterEmail,
}: HosRequestDialogProps) => {
  const [requestType, setRequestType] = useState<RequestType>('full_shift');
  const [violationFix, setViolationFix] = useState(false);
  const [driveHours, setDriveHours] = useState('');
  const [driveMinutes, setDriveMinutes] = useState('');
  const [shiftHours, setShiftHours] = useState('');
  const [shiftMinutes, setShiftMinutes] = useState('');
  const [cycleHours, setCycleHours] = useState('');
  const [cycleMinutes, setCycleMinutes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Get the current user's email directly from Supabase auth
  useEffect(() => {
    const getEmail = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setCurrentUserEmail(user.email);
      }
    };
    getEmail();
  }, []);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const payload: any = {
        driverName,
        truckNumber,
        companyName,
        teamDriverName,
        requestType,
        violationFix,
        requesterEmail: currentUserEmail || requesterEmail,
      };

      if (requestType === 'custom') {
        payload.customHours = {
          driveHours: parseInt(driveHours) || 0,
          driveMinutes: parseInt(driveMinutes) || 0,
          shiftHours: parseInt(shiftHours) || 0,
          shiftMinutes: parseInt(shiftMinutes) || 0,
          cycleHours: parseInt(cycleHours) || 0,
          cycleMinutes: parseInt(cycleMinutes) || 0,
        };
      }

      const { data, error } = await supabase.functions.invoke('send-hos-request', {
        body: payload,
      });

      if (error) {
        throw error;
      }

      toast.success('HOS request sent successfully');
      handleClose();
    } catch (error: any) {
      console.error('Error sending HOS request:', error);
      toast.error('Failed to send HOS request: ' + (error.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setRequestType('full_shift');
    setViolationFix(false);
    setDriveHours('');
    setDriveMinutes('');
    setShiftHours('');
    setShiftMinutes('');
    setCycleHours('');
    setCycleMinutes('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>HOS Request</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Driver</div>
            <div className="font-medium">{driverName}</div>
          </div>

          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Vehicle</div>
            <div className="font-medium">{truckNumber}</div>
          </div>

          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Company</div>
            <div className="font-medium">{companyName}</div>
          </div>

          <div className="space-y-2">
            <Label>Request Type</Label>
            <Select
              value={requestType}
              onValueChange={(value: RequestType) => setRequestType(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select request type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full_shift">Full Shift</SelectItem>
                <SelectItem value="full_cycle">Full Cycle</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {requestType === 'custom' && (
            <div className="space-y-3 p-3 border rounded-md bg-muted/50">
              <div className="space-y-2">
                <Label>Drive</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    placeholder="Hours"
                    value={driveHours}
                    onChange={(e) => setDriveHours(e.target.value)}
                    className="w-20"
                    min="0"
                    max="11"
                  />
                  <span className="text-sm text-muted-foreground">hrs</span>
                  <Input
                    type="number"
                    placeholder="Minutes"
                    value={driveMinutes}
                    onChange={(e) => setDriveMinutes(e.target.value)}
                    className="w-20"
                    min="0"
                    max="59"
                  />
                  <span className="text-sm text-muted-foreground">mins</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Shift</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    placeholder="Hours"
                    value={shiftHours}
                    onChange={(e) => setShiftHours(e.target.value)}
                    className="w-20"
                    min="0"
                    max="14"
                  />
                  <span className="text-sm text-muted-foreground">hrs</span>
                  <Input
                    type="number"
                    placeholder="Minutes"
                    value={shiftMinutes}
                    onChange={(e) => setShiftMinutes(e.target.value)}
                    className="w-20"
                    min="0"
                    max="59"
                  />
                  <span className="text-sm text-muted-foreground">mins</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Cycle</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    placeholder="Hours"
                    value={cycleHours}
                    onChange={(e) => setCycleHours(e.target.value)}
                    className="w-20"
                    min="0"
                    max="70"
                  />
                  <span className="text-sm text-muted-foreground">hrs</span>
                  <Input
                    type="number"
                    placeholder="Minutes"
                    value={cycleMinutes}
                    onChange={(e) => setCycleMinutes(e.target.value)}
                    className="w-20"
                    min="0"
                    max="59"
                  />
                  <span className="text-sm text-muted-foreground">mins</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="violation"
              checked={violationFix}
              onCheckedChange={(checked) => setViolationFix(checked === true)}
            />
            <Label htmlFor="violation" className="cursor-pointer">
              Violation Fix
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Send Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
