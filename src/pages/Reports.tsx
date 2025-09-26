import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, AlertCircle, Loader2, Edit3, Check, X } from "lucide-react";
import { useReports } from "@/hooks/useReports";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { DateCalendarCarousel } from "@/components/ui/date-calendar-carousel";

interface EditingState {
  truckId: string;
  field: 'pickup-location' | 'pickup-datetime' | 'delivery-location' | 'delivery-datetime' | 'note';
  value: string;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "In Transit":
      return <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 border border-blue-200">In Transit</span>;
    case "Loading":
      return <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 border border-yellow-200">Loading</span>;
    case "Available":
      return <span className="px-2 py-1 text-xs bg-green-100 text-green-800 border border-green-200">Available</span>;
    case "Maintenance":
      return <span className="px-2 py-1 text-xs bg-red-100 text-red-800 border border-red-200">Maintenance</span>;
    default:
      return <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 border border-gray-200">{status}</span>;
  }
};

const Reports = () => {
  const { data: groupedReports, isLoading, error, updateTruckStatus, updateOrderNote, updatePickupDrop } = useReports();
  const [editing, setEditing] = useState<EditingState | null>(null);
  const { toast } = useToast();

  const handleEdit = (truckId: string, field: 'pickup-location' | 'pickup-datetime' | 'delivery-location' | 'delivery-datetime' | 'note', currentValue: string) => {
    setEditing({ truckId, field, value: currentValue });
  };

  const handleSave = async () => {
    if (!editing) return;

    try {
      // Find the truck to get orderId and pickup/delivery stop IDs
      const allTrucks = Object.values(groupedReports || {}).flatMap(group => group.trucks);
      const truck = allTrucks.find(t => t.id === editing.truckId);
      
      if (editing.field === 'note' && truck?.orderId) {
        await updateOrderNote.mutateAsync({ orderId: truck.orderId, notes: editing.value });
      } else if (editing.field.startsWith('pickup-') && truck?.pickup.id) {
        const updates: any = {};
        
        if (editing.field === 'pickup-location') {
          updates.address = editing.value;
        } else if (editing.field === 'pickup-datetime') {
          updates.datetime = new Date(editing.value).toISOString();
        }
        
        await updatePickupDrop.mutateAsync({
          pickupDropId: truck.pickup.id,
          address: updates.address || truck.pickup.location,
          ...(updates.datetime && { datetime: updates.datetime })
        });
      } else if (editing.field.startsWith('delivery-') && truck?.delivery.id) {
        const updates: any = {};
        
        if (editing.field === 'delivery-location') {
          updates.address = editing.value;
        } else if (editing.field === 'delivery-datetime') {
          updates.datetime = new Date(editing.value).toISOString();
        }
        
        await updatePickupDrop.mutateAsync({
          pickupDropId: truck.delivery.id,
          address: updates.address || truck.delivery.location,
          ...(updates.datetime && { datetime: updates.datetime })
        });
      }
      
      toast({
        title: "Updated successfully",
        description: `${editing.field.replace('-', ' ')} has been updated.`,
      });
      setEditing(null);
    } catch (error) {
      toast({
        title: "Update failed",
        description: "There was an error updating the field.",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    setEditing(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8 text-destructive">
          Error loading reports: {error.message}
        </div>
      </div>
    );
  }

  const renderEditableField = (truckId: string, field: 'note', value: string, displayValue?: React.ReactNode) => {
    const isEditing = editing?.truckId === truckId && editing?.field === field;

    if (isEditing) {
      return (
        <div className="flex items-center gap-2">
          <Textarea
            value={editing.value}
            onChange={(e) => setEditing({...editing, value: e.target.value})}
            className="min-h-[60px] text-xs border-gray-300 rounded-none resize-none"
          />
          <div className="flex gap-1">
            <button onClick={handleSave} className="text-green-600 hover:text-green-800 p-1">
              <Check className="h-3 w-3" />
            </button>
            <button onClick={handleCancel} className="text-red-600 hover:text-red-800 p-1">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        className="flex items-center gap-2 cursor-pointer group hover:bg-blue-50 p-1 rounded-none min-h-[1.5rem] w-full"
        onClick={() => handleEdit(truckId, field, value)}
      >
        <div className="flex-1 text-sm">
          {displayValue || value || "—"}
        </div>
        <Edit3 className="h-3 w-3 opacity-0 group-hover:opacity-50 text-gray-500" />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Google Sheets-style header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
        <h1 className="text-lg font-normal text-gray-900">Dispatcher Fleet Reports</h1>
        <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
          <AlertCircle className="h-3 w-3" />
          Real-time fleet status by dispatcher assignment
        </div>
      </div>

      {groupedReports && Object.keys(groupedReports).length === 0 ? (
        <div className="p-6">
          <div className="text-center py-12 text-gray-500">
            No trucks assigned to dispatchers found
          </div>
        </div>
      ) : (
        <div className="px-6 py-4 space-y-8">
          {Object.entries(groupedReports || {}).map(([dispatcherId, group]) => (
            <div key={dispatcherId} className="bg-white">
              {/* Dispatcher header - Google Sheets style */}
              <div className="mb-4">
                <h2 className="text-sm font-medium text-gray-900 px-1 mb-3">
                  {group.dispatcher} ({group.trucks.length} truck{group.trucks.length !== 1 ? 's' : ''})
                </h2>
                
                {/* Date Calendar Carousel - appears once per dispatcher */}
                <div className="mb-4">
                  <DateCalendarCarousel />
                </div>
              </div>
              
              {/* Google Sheets-style table */}
              <div className="overflow-x-auto border border-gray-300">
                <table className="w-full border-collapse bg-white">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border-r border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 sticky top-0">Truck #</th>
                      <th className="border-r border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 sticky top-0">Driver</th>
                      <th className="border-r border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 sticky top-0">Home</th>
                      <th className="border-r border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 sticky top-0">Away (D)</th>
                      <th className="border-r border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 sticky top-0">Drive</th>
                      <th className="border-r border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 sticky top-0">Shift</th>
                      <th className="border-r border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 sticky top-0">Cycle</th>
                      <th className="border-r border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 sticky top-0">Note</th>
                      <th className="border-r border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 sticky top-0">Last Edit</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 sticky top-0">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.trucks.map((truck, index) => (
                      <tr key={truck.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                        <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900 font-medium">{truck.truckNumber}</td>
                        <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900">{truck.driver}</td>
                        <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-gray-500" />
                            {truck.home}
                          </div>
                        </td>
                        <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900">{truck.awayDays}</td>
                        <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900">{truck.driveHours}h</td>
                        <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900">{truck.shiftHours}h</td>
                        <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900">{truck.cycleHours}h</td>
                        <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900">
                          {renderEditableField(truck.id, 'note', truck.note)}
                        </td>
                        <td className="border-r border-b border-gray-300 px-3 py-2 text-xs text-gray-600">{truck.lastEdit}</td>
                        <td className="border-b border-gray-300 px-3 py-2 text-xs text-gray-600">{truck.editDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Reports;