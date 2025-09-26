import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MapPin, AlertCircle, Loader2, Edit3, Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useReports } from "@/hooks/useReports";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSidebar } from "@/components/ui/sidebar";
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
  const { data: groupedReports, isLoading, error, updateTruckStatus, updateTruckNote, updatePickupDrop } = useReports();
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [calendarDates, setCalendarDates] = useState<DispatcherCalendarState>({});
  const { toast } = useToast();
  const { open: sidebarOpen } = useSidebar();

  const handleEdit = (truckId: string, field: 'pickup-location' | 'pickup-datetime' | 'delivery-location' | 'delivery-datetime' | 'note', currentValue: string) => {
    setEditing({ truckId, field, value: currentValue });
  };

  const handleSave = async () => {
    if (!editing) return;

    try {
      // Find the truck to get orderId and pickup/delivery stop IDs
      const allTrucks = Object.values(groupedReports || {}).flatMap(group => group.trucks);
      const truck = allTrucks.find(t => t.id === editing.truckId);
      
      if (editing.field === 'note') {
        await updateTruckNote.mutateAsync({ truckId: truck.id, note: editing.value });
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
        <td key={index} className="border-r border-b border-gray-300 p-0" style={{ width: '128px', minWidth: '128px', maxWidth: '128px' }}>
          <div className="h-32" style={{ width: '128px' }}>
            {/* Delivery cell (top half) */}
            <div className={`border-b border-gray-200 p-2 ${isDeliveryDay ? `${statusColors.bg} ${statusColors.border} border` : 'bg-gray-50'}`} style={{ height: '64px', width: '128px' }}>
              {isDeliveryDay ? (
                <div style={{ width: '112px' }}>
                  <div className={`text-xs font-medium ${statusColors.text} truncate mb-1`} style={{ width: '112px' }}>
                    {truck.delivery.location}
                  </div>
                  <div className={`text-xs ${statusColors.text} opacity-70`} style={{ width: '112px' }}>
                    {truck.delivery.date !== '—' && truck.delivery.time !== '—' 
                      ? `${truck.delivery.time}`
                      : '—'
                    }
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-400" style={{ width: '112px' }}>—</div>
              )}
            </div>
            
            {/* Pickup cell (bottom half) */}
            <div className={`p-2 ${isPickupDay ? `${statusColors.bg} ${statusColors.border} border` : 'bg-gray-50'}`} style={{ height: '64px', width: '128px' }}>
              {isPickupDay ? (
                <div style={{ width: '112px' }}>
                  <div className={`text-xs font-medium ${statusColors.text} truncate mb-1`} style={{ width: '112px' }}>
                    {truck.pickup.location}
                  </div>
                  <div className={`text-xs ${statusColors.text} opacity-70`} style={{ width: '112px' }}>
                    {truck.pickup.date !== '—' && truck.pickup.time !== '—' 
                      ? `${truck.pickup.time}`
                      : '—'
                    }
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-400" style={{ width: '112px' }}>—</div>
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

  const handleNoteChange = async (truckId: string, newValue: string) => {
    try {
      await updateTruckNote.mutateAsync({ truckId, note: newValue });
    } catch (error) {
      toast({
        title: "Update failed",
        description: "There was an error updating the note.",
        variant: "destructive",
      });
    }
  };

  const renderEditableField = (truckId: string, field: 'note', value: string, displayValue?: React.ReactNode) => {
    return (
      <Textarea
        defaultValue={value || ""}
        onBlur={(e) => handleNoteChange(truckId, e.target.value)}
        className="text-xs border-none rounded-none resize-none text-left bg-transparent focus:outline-none focus:ring-0 focus:border-transparent p-2 w-full"
        style={{ height: '64px', minHeight: '64px', maxHeight: '64px', boxShadow: 'none' }}
        placeholder="Add note..."
        spellCheck={false}
      />
    );
  };

  return (
    <div className="h-full bg-white overflow-hidden flex flex-col">
      {/* Google Sheets-style header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-4 z-20 relative">
        <h1 className="text-lg font-normal text-gray-900">Dispatcher Fleet Reports</h1>
        <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
          <AlertCircle className="h-3 w-3" />
          Real-time fleet status by dispatcher assignment
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {groupedReports && Object.keys(groupedReports).length === 0 ? (
          <div className="p-4">
            <div className="text-center py-12 text-gray-500">
              No trucks assigned to dispatchers found
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-8">
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
                <div className="w-full border border-gray-300">
                  <table className="w-full border-collapse bg-white" style={{ tableLayout: 'auto' }}>
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
                          <th key={index} className="border-r border-b border-gray-300 px-3 py-2 text-center text-xs font-medium text-gray-700 bg-gray-50" style={{ width: '128px', minWidth: '128px', maxWidth: '128px' }}>
                            <div>{format(day, 'EEE')}</div>
                            <div className="text-xs text-gray-600">{format(day, 'dd')}</div>
                          </th>
                        ))}
                        <th colSpan={4} className="border-r border-b border-gray-300 px-3 py-1 text-center text-xs font-medium text-gray-700 bg-gray-50" style={{ width: '272px', minWidth: '272px', maxWidth: '272px' }}>Away (D) | Drive | Shift | Cycle</th>
                         <th className="border-b border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-24">Last Edit</th>
                         <th className={`px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-24 ${sidebarOpen ? 'border-r border-gray-300' : ''}`}>Date</th>
                       </tr>
                    </thead>
                    <tbody>
                      {group.trucks.map((truck, index) => (
                        <tr key={truck.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                          <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900 font-medium" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>{truck.truckNumber}</td>
                          <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900" style={{ width: '128px', minWidth: '128px', maxWidth: '128px' }}>{truck.driver}</td>
                          <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900" style={{ width: '112px', minWidth: '112px', maxWidth: '112px' }}>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-gray-500" />
                              {truck.home}
                            </div>
                          </td>
                          {renderTruckCalendarCells(truck, startDate)}
                          {/* Merged cell for Away, Drive, Shift, Cycle with Notes at bottom */}
                          <td colSpan={4} className="border-r border-b border-gray-300 p-0" style={{ height: '128px' }}>
                            <div className="h-16 border-b border-gray-200">
                              {/* Labels row */}
                              <div className="h-8 flex">
                                <div className="flex-1 border-r border-gray-300 px-2 py-1 text-center text-xs text-gray-600">Away (D)</div>
                                <div className="flex-1 border-r border-gray-300 px-2 py-1 text-center text-xs text-gray-600">Drive</div>
                                <div className="flex-1 border-r border-gray-300 px-2 py-1 text-center text-xs text-gray-600">Shift</div>
                                <div className="flex-1 px-2 py-1 text-center text-xs text-gray-600">Cycle</div>
                              </div>
                              {/* Values row */}
                              <div className="h-8 flex">
                                <div className="flex-1 border-r border-gray-300 px-2 py-1 text-center text-sm text-gray-900">{truck.awayDays}</div>
                                <div className="flex-1 border-r border-gray-300 px-2 py-1 text-center text-sm text-gray-900">{truck.driveHours}h</div>
                                <div className="flex-1 border-r border-gray-300 px-2 py-1 text-center text-sm text-gray-900">{truck.shiftHours}h</div>
                                <div className="flex-1 px-2 py-1 text-center text-sm text-gray-900">{truck.cycleHours}h</div>
                              </div>
                            </div>
                            <div className="h-16 p-0 w-full">
                              {renderEditableField(truck.id, 'note', truck.note)}
                            </div>
                          </td>
                           <td className="border-b border-gray-300 px-3 py-2 text-xs text-gray-600" style={{ width: '96px', minWidth: '96px', maxWidth: '96px' }}>{truck.lastEdit}</td>
                           <td className={`border-b border-gray-300 px-3 py-2 text-xs text-gray-600 ${sidebarOpen ? 'border-r border-gray-300' : ''}`} style={{ width: '96px', minWidth: '96px', maxWidth: '96px' }}>{truck.editDate}</td>
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
    </div>
  );
};

export default Reports;