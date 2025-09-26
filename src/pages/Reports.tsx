import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, AlertCircle, Loader2, Edit3, Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useReports } from "@/hooks/useReports";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { CalendarCarousel } from "@/components/ui/calendar-carousel";
import { startOfWeek, addDays, isSameDay, format } from 'date-fns';

interface EditingState {
  truckId: string;
  field: 'pickup-location' | 'pickup-datetime' | 'delivery-location' | 'delivery-datetime' | 'note';
  value: string;
}

interface DispatcherCalendarState {
  [dispatcherId: string]: Date;
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
  const [calendarDates, setCalendarDates] = useState<DispatcherCalendarState>({});
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

  const getCalendarStartDate = (dispatcherId: string) => {
    if (calendarDates[dispatcherId]) {
      return calendarDates[dispatcherId];
    }
    // Default to current week start
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  };

  const handleCalendarDateChange = (dispatcherId: string, newDate: Date) => {
    setCalendarDates(prev => ({
      ...prev,
      [dispatcherId]: newDate
    }));
  };

  const getStatusColors = (status: string) => {
    switch (status) {
      case "In Transit":
        return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' };
      case "Loading":
        return { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200' };
      case "Available":
        return { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' };
      case "Maintenance":
        return { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' };
    }
  };

  const renderTruckCalendarCells = (truck: any, startDate: Date) => {
    const days = Array.from({ length: 5 }, (_, i) => addDays(startDate, i));
    const statusColors = getStatusColors(truck.status);
    
    const parseDate = (dateStr: string) => {
      if (dateStr === '—' || !dateStr) return null;
      try {
        return new Date(dateStr);
      } catch {
        return null;
      }
    };

    const pickupDate = parseDate(truck.pickup.date);
    const deliveryDate = parseDate(truck.delivery.date);

    return days.map((day, index) => {
      const isPickupDay = pickupDate && isSameDay(day, pickupDate);
      const isDeliveryDay = deliveryDate && isSameDay(day, deliveryDate);

      return (
        <td key={index} className="border-r border-b border-gray-300 p-0 w-32">
          <div className="h-32">
            {/* Delivery cell (top half) */}
            <div className={`h-16 border-b border-gray-200 p-2 ${isDeliveryDay ? `${statusColors.bg} ${statusColors.border} border` : 'bg-gray-50'}`}>
              {isDeliveryDay ? (
                <div>
                  <div className={`text-xs font-medium ${statusColors.text} truncate mb-1`}>
                    {truck.delivery.location}
                  </div>
                  <div className={`text-xs ${statusColors.text} opacity-70`}>
                    {truck.delivery.date !== '—' && truck.delivery.time !== '—' 
                      ? `${truck.delivery.time}`
                      : '—'
                    }
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-400">—</div>
              )}
            </div>
            
            {/* Pickup cell (bottom half) */}
            <div className={`h-16 p-2 ${isPickupDay ? `${statusColors.bg} ${statusColors.border} border` : 'bg-gray-50'}`}>
              {isPickupDay ? (
                <div>
                  <div className={`text-xs font-medium ${statusColors.text} truncate mb-1`}>
                    {truck.pickup.location}
                  </div>
                  <div className={`text-xs ${statusColors.text} opacity-70`}>
                    {truck.pickup.date !== '—' && truck.pickup.time !== '—' 
                      ? `${truck.pickup.time}`
                      : '—'
                    }
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-400">—</div>
              )}
            </div>
          </div>
        </td>
      );
    });
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
          {Object.entries(groupedReports || {}).map(([dispatcherId, group]) => {
            const startDate = getCalendarStartDate(dispatcherId);
            const days = Array.from({ length: 5 }, (_, i) => addDays(startDate, i));
            return (
              <div key={dispatcherId} className="bg-white">
                {/* Dispatcher header - Google Sheets style */}
                <div className="mb-4">
                  <h2 className="text-sm font-medium text-gray-900 px-1">
                    {group.dispatcher} ({group.trucks.length} truck{group.trucks.length !== 1 ? 's' : ''})
                  </h2>
                </div>
                
                {/* Google Sheets-style table */}
                <div className="overflow-x-auto border border-gray-300">
                  <table className="w-full border-collapse bg-white">
                    <thead>
                      {/* Date Range Selector Row - Above main headers */}
                      <tr className="bg-gray-50">
                        <th colSpan={3} className="border-r border-b border-gray-300 bg-gray-50"></th>
                        <th colSpan={5} className="border-r border-b border-gray-300 px-2 py-2 bg-gray-50">
                          <div className="flex items-center justify-center">
                            <button
                              onClick={() => handleCalendarDateChange(dispatcherId, addDays(startDate, -7))}
                              className="p-1 hover:bg-gray-200 rounded"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <div className="text-sm font-medium text-gray-700 mx-4">
                              {format(startDate, 'MMM dd')} - {format(addDays(startDate, 4), 'MMM dd, yyyy')}
                            </div>
                            <button
                              onClick={() => handleCalendarDateChange(dispatcherId, addDays(startDate, 7))}
                              className="p-1 hover:bg-gray-200 rounded"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </th>
                        <th colSpan={7} className="border-b border-gray-300 bg-gray-50"></th>
                      </tr>
                      {/* Column Headers Row */}
                      <tr className="bg-gray-50">
                        <th className="border-r border-b border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-20">Truck #</th>
                        <th className="border-r border-b border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-32">Driver</th>
                        <th className="border-r border-b border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-28">Home</th>
                        {days.map((day, index) => (
                          <th key={index} className="border-r border-b border-gray-300 px-3 py-2 text-center text-xs font-medium text-gray-700 bg-gray-50 w-32">
                            <div>{format(day, 'EEE')}</div>
                            <div className="text-xs text-gray-600">{format(day, 'dd')}</div>
                          </th>
                        ))}
                        <th className="border-r border-b border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-20">Away (D)</th>
                        <th className="border-r border-b border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-16">Drive</th>
                        <th className="border-r border-b border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-16">Shift</th>
                        <th className="border-r border-b border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-16">Cycle</th>
                        <th className="border-r border-b border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-48">Note</th>
                        <th className="border-r border-b border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-24">Last Edit</th>
                        <th className="border-b border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-24">Date</th>
                       </tr>
                    </thead>
                    <tbody>
                      {group.trucks.map((truck, index) => (
                        <tr key={truck.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                          <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900 font-medium w-20">{truck.truckNumber}</td>
                          <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900 w-32">{truck.driver}</td>
                          <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900 w-28">
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-gray-500" />
                              {truck.home}
                            </div>
                          </td>
                          {renderTruckCalendarCells(truck, startDate)}
                          <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900 w-20">{truck.awayDays}</td>
                          <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900 w-16">{truck.driveHours}h</td>
                          <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900 w-16">{truck.shiftHours}h</td>
                          <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900 w-16">{truck.cycleHours}h</td>
                          <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900 w-48">
                            {renderEditableField(truck.id, 'note', truck.note)}
                          </td>
                          <td className="border-r border-b border-gray-300 px-3 py-2 text-xs text-gray-600 w-24">{truck.lastEdit}</td>
                          <td className="border-b border-gray-300 px-3 py-2 text-xs text-gray-600 w-24">{truck.editDate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Reports;