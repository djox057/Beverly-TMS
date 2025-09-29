import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MapPin, AlertCircle, Loader2, Edit3, Check, X, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { HosCircularTimer } from "@/components/HosCircularTimer";
import { useReports } from "@/hooks/useReports";
import { TestHosSync } from "@/components/TestHosSync";
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
  const {
    data: groupedReports,
    isLoading,
    error,
    updateTruckStatus,
    updateTruckNote,
    updatePickupDrop
  } = useReports();
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [calendarDates, setCalendarDates] = useState<DispatcherCalendarState>({});
  const {
    toast
  } = useToast();
  const {
    open: sidebarOpen
  } = useSidebar();
  const handleEdit = (truckId: string, field: 'pickup-location' | 'pickup-datetime' | 'delivery-location' | 'delivery-datetime' | 'note', currentValue: string) => {
    setEditing({
      truckId,
      field,
      value: currentValue
    });
  };
  const handleSave = async () => {
    if (!editing) return;
    try {
      // Find the truck to get orderId and pickup/delivery stop IDs
      const allTrucks = Object.values(groupedReports || {}).flatMap(group => group.trucks);
      const truck = allTrucks.find(t => t.id === editing.truckId);
      if (editing.field === 'note') {
        await updateTruckNote.mutateAsync({
          truckId: truck.id,
          note: editing.value
        });
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
          ...(updates.datetime && {
            datetime: updates.datetime
          })
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
          ...(updates.datetime && {
            datetime: updates.datetime
          })
        });
      }
      toast({
        title: "Updated successfully",
        description: `${editing.field.replace('-', ' ')} has been updated.`
      });
      setEditing(null);
    } catch (error) {
      toast({
        title: "Update failed",
        description: "There was an error updating the field.",
        variant: "destructive"
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
    // Default to 2 days before current day to show 5 days
    return addDays(new Date(), -2);
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
        return {
          bg: 'bg-blue-100',
          text: 'text-blue-800',
          border: 'border-blue-200'
        };
      case "Loading":
        return {
          bg: 'bg-yellow-100',
          text: 'text-yellow-800',
          border: 'border-yellow-200'
        };
      case "Available":
        return {
          bg: 'bg-green-100',
          text: 'text-green-800',
          border: 'border-green-200'
        };
      case "Maintenance":
        return {
          bg: 'bg-red-100',
          text: 'text-red-800',
          border: 'border-red-200'
        };
      default:
        return {
          bg: 'bg-gray-100',
          text: 'text-gray-800',
          border: 'border-gray-200'
        };
    }
  };
  const renderTruckCalendarCells = (truck: any, startDate: Date) => {
    const days = Array.from({
      length: 5
    }, (_, i) => addDays(startDate, i));
    const parseDate = (dateStr: string) => {
      if (dateStr === '—' || !dateStr) return null;
      try {
        return new Date(dateStr);
      } catch {
        return null;
      }
    };

    // Helper function to check if pickup and delivery are on the same date
    const isSameDayPickupDelivery = (order: any) => {
      return order.pickupDate && order.deliveryDate && isSameDay(order.pickupDate, order.deliveryDate);
    };

    // Get all orders with their pickup/delivery dates for multi-load overlay
    const ordersWithDates = truck.allOrders?.map((order: any) => {
      const pickupDate = order.pickupStop && order.pickup_datetime ? new Date(order.pickup_datetime) : null;
      const deliveryDate = order.deliveryStop && order.delivery_datetime ? new Date(order.delivery_datetime) : null;
      const statusColors = order.documentColors;
      return {
        ...order,
        pickupDate,
        deliveryDate,
        statusColors,
        pickupLocation: order.pickupStop ? order.pickupStop.city && order.pickupStop.state ? `${order.pickupStop.city}, ${order.pickupStop.state}` : order.pickupStop.address || '—' : '—',
        deliveryLocation: order.deliveryStop ? order.deliveryStop.city && order.deliveryStop.state ? `${order.deliveryStop.city}, ${order.deliveryStop.state}` : order.deliveryStop.address || '—' : '—'
      };
    }) || [];
    return days.map((day, index) => {
      // Find all orders for this day and categorize them
      const allDayOrders = ordersWithDates.filter(order => order.pickupDate && isSameDay(day, order.pickupDate) || order.deliveryDate && isSameDay(day, order.deliveryDate));

      // Separate same-day orders from different-day orders
      const sameDayOrders = allDayOrders.filter(order => isSameDayPickupDelivery(order));
      const pickupOnlyOrders = allDayOrders.filter(order => order.pickupDate && isSameDay(day, order.pickupDate) && !isSameDayPickupDelivery(order));
      const deliveryOnlyOrders = allDayOrders.filter(order => order.deliveryDate && isSameDay(day, order.deliveryDate) && !isSameDayPickupDelivery(order));
      
      // Check if this day is today
      const isToday = isSameDay(day, new Date());
      
      return <td key={index} className={`border-r border-b border-gray-300 p-0 relative ${isToday ? 'border-l-2 border-r-2 border-red-500' : ''}`} style={{
        width: '166px',
        minWidth: '166px',
        maxWidth: '166px'
      }}>
          <div className="h-32 relative" style={{
          width: '166px'
        }}>
            {/* Delivery cell (top half) - empty for same-day orders */}
            <div className={`border-b border-l border-r border-gray-200 flex flex-col h-16 ${deliveryOnlyOrders.length > 0 ? '' : 'bg-gray-50'}`}>
              {deliveryOnlyOrders.length > 0 ? <div className="space-y-0.5 flex-1 p-1 overflow-hidden">
                  {deliveryOnlyOrders.slice(0, 2).map((order, idx) => <div key={`delivery-${order.id}-${idx}`} className={`${order.documentColors.bg} ${order.documentColors.border} border rounded relative flex flex-col p-1`}>
                      <div className={`text-xs font-medium ${order.documentColors.text} truncate`}>
                        {order.deliveryLocation}
                      </div>
                      <div className={`text-xs ${order.documentColors.text} opacity-70 truncate`}>
                        {order.delivery_datetime && order.delivery_end_datetime && 
                         format(new Date(order.delivery_datetime), 'HH:mm') !== format(new Date(order.delivery_end_datetime), 'HH:mm') 
                         ? `${format(new Date(order.delivery_datetime), 'HH:mm')} - ${format(new Date(order.delivery_end_datetime), 'HH:mm')}` 
                         : order.delivery_datetime ? format(new Date(order.delivery_datetime), 'HH:mm') : '—'}
                      </div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="absolute top-0 right-0 h-4 w-4 p-0 hover:bg-white/20">
                            <Info className="h-3 w-3" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80">
                          <div className="space-y-2 text-sm">
                            <h4 className="font-semibold">Load Information</h4>
                            <div className="space-y-1">
                              <p>• <strong>Load #:</strong> {order.loadDetails.loadNumber}</p>
                              <p>• <strong>Broker Load #:</strong> {order.loadDetails.brokerLoadNumber}</p>
                              {order.loadDetails.pickupInfo && <p>• <strong>Pickup:</strong> {order.loadDetails.pickupInfo.address}, {order.loadDetails.pickupInfo.city}, {order.loadDetails.pickupInfo.state} at {order.loadDetails.pickupInfo.datetime !== '—' && order.loadDetails.pickupInfo.endDatetime !== '—' && format(new Date(order.loadDetails.pickupInfo.datetime), 'HH:mm') !== format(new Date(order.loadDetails.pickupInfo.endDatetime), 'HH:mm') ? `${format(new Date(order.loadDetails.pickupInfo.datetime), 'MMM dd, HH:mm')} - ${format(new Date(order.loadDetails.pickupInfo.endDatetime), 'HH:mm')}` : order.loadDetails.pickupInfo.datetime !== '—' ? format(new Date(order.loadDetails.pickupInfo.datetime), 'MMM dd, HH:mm') : '—'}</p>}
                              {order.loadDetails.deliveryInfo && <p>• <strong>Delivery:</strong> {order.loadDetails.deliveryInfo.address}, {order.loadDetails.deliveryInfo.city}, {order.loadDetails.deliveryInfo.state} at {order.loadDetails.deliveryInfo.datetime !== '—' && order.loadDetails.deliveryInfo.endDatetime !== '—' && format(new Date(order.loadDetails.deliveryInfo.datetime), 'HH:mm') !== format(new Date(order.loadDetails.deliveryInfo.endDatetime), 'HH:mm') ? `${format(new Date(order.loadDetails.deliveryInfo.datetime), 'MMM dd, HH:mm')} - ${format(new Date(order.loadDetails.deliveryInfo.endDatetime), 'HH:mm')}` : order.loadDetails.deliveryInfo.datetime !== '—' ? format(new Date(order.loadDetails.deliveryInfo.datetime), 'MMM dd, HH:mm') : '—'}</p>}
                              <p>• <strong>Documents:</strong> {order.loadDetails.documents.length > 0 ? order.loadDetails.documents.map(doc => doc.category).join(', ') : 'None'}</p>
                              {order.loadDetails.notes !== '—' && <p>• <strong>Notes:</strong> {order.loadDetails.notes}</p>}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>)}
                  {deliveryOnlyOrders.length > 2 && <div className="text-xs text-gray-600 text-center">
                      +{deliveryOnlyOrders.length - 2} more
                    </div>}
                </div> : <div className="text-xs text-gray-400 h-full flex items-center justify-center">—</div>}
            </div>
            
            {/* Pickup cell (bottom half) - includes same-day orders */}
            <div className={`border-l border-r border-gray-200 flex flex-col h-16 ${pickupOnlyOrders.length > 0 || sameDayOrders.length > 0 ? '' : 'bg-gray-50'}`}>
              {pickupOnlyOrders.length > 0 || sameDayOrders.length > 0 ? <div className="space-y-0.5 flex-1 p-1 overflow-hidden">
                  {/* Render pickup-only orders first */}
                  {pickupOnlyOrders.slice(0, 2).map((order, idx) => <div key={`pickup-${order.id}-${idx}`} className={`${order.documentColors.bg} ${order.documentColors.border} border rounded relative flex flex-col p-1`}>
                      <div className={`text-xs font-medium ${order.documentColors.text} truncate`}>
                        {order.pickupLocation}
                      </div>
                      <div className={`text-xs ${order.documentColors.text} opacity-70 truncate`}>
                        {order.pickup_datetime && order.pickup_end_datetime && 
                         format(new Date(order.pickup_datetime), 'HH:mm') !== format(new Date(order.pickup_end_datetime), 'HH:mm') 
                         ? `${format(new Date(order.pickup_datetime), 'HH:mm')} - ${format(new Date(order.pickup_end_datetime), 'HH:mm')}` 
                         : order.pickup_datetime ? format(new Date(order.pickup_datetime), 'HH:mm') : '—'}
                      </div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="absolute top-0 right-0 h-4 w-4 p-0 hover:bg-white/20">
                            <Info className="h-3 w-3" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80">
                          <div className="space-y-2 text-sm">
                            <h4 className="font-semibold">Load Information</h4>
                            <div className="space-y-1">
                              <p>• <strong>Load #:</strong> {order.loadDetails.loadNumber}</p>
                              <p>• <strong>Broker Load #:</strong> {order.loadDetails.brokerLoadNumber}</p>
                              {order.loadDetails.pickupInfo && <p>• <strong>Pickup:</strong> {order.loadDetails.pickupInfo.address}, {order.loadDetails.pickupInfo.city}, {order.loadDetails.pickupInfo.state} at {order.loadDetails.pickupInfo.datetime !== '—' && order.loadDetails.pickupInfo.endDatetime !== '—' && format(new Date(order.loadDetails.pickupInfo.datetime), 'HH:mm') !== format(new Date(order.loadDetails.pickupInfo.endDatetime), 'HH:mm') ? `${format(new Date(order.loadDetails.pickupInfo.datetime), 'MMM dd, HH:mm')} - ${format(new Date(order.loadDetails.pickupInfo.endDatetime), 'HH:mm')}` : order.loadDetails.pickupInfo.datetime !== '—' ? format(new Date(order.loadDetails.pickupInfo.datetime), 'MMM dd, HH:mm') : '—'}</p>}
                              {order.loadDetails.deliveryInfo && <p>• <strong>Delivery:</strong> {order.loadDetails.deliveryInfo.address}, {order.loadDetails.deliveryInfo.city}, {order.loadDetails.deliveryInfo.state} at {order.loadDetails.deliveryInfo.datetime !== '—' && order.loadDetails.deliveryInfo.endDatetime !== '—' && format(new Date(order.loadDetails.deliveryInfo.datetime), 'HH:mm') !== format(new Date(order.loadDetails.deliveryInfo.endDatetime), 'HH:mm') ? `${format(new Date(order.loadDetails.deliveryInfo.datetime), 'MMM dd, HH:mm')} - ${format(new Date(order.loadDetails.deliveryInfo.endDatetime), 'HH:mm')}` : order.loadDetails.deliveryInfo.datetime !== '—' ? format(new Date(order.loadDetails.deliveryInfo.datetime), 'MMM dd, HH:mm') : '—'}</p>}
                              <p>• <strong>Documents:</strong> {order.loadDetails.documents.length > 0 ? order.loadDetails.documents.map(doc => doc.category).join(', ') : 'None'}</p>
                              {order.loadDetails.notes !== '—' && <p>• <strong>Notes:</strong> {order.loadDetails.notes}</p>}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>)}

                  {/* Render same-day orders (combined pickup and delivery) */}
                  {sameDayOrders.slice(0, Math.max(0, 2 - pickupOnlyOrders.length)).map((order, idx) => <div key={`same-day-${order.id}-${idx}`} className={`${order.documentColors.bg} ${order.documentColors.border} border rounded relative flex flex-col p-1`}>
                      <div className={`text-xs font-medium ${order.documentColors.text} truncate`}>
                        P: {order.pickupLocation}
                      </div>
                      <div className={`text-xs ${order.documentColors.text} opacity-70 truncate`}>
                        D: {order.deliveryLocation}
                      </div>
                      <div className={`text-xs ${order.documentColors.text} opacity-70 truncate flex justify-between`}>
                        <span>{order.pickup_datetime && order.pickup_end_datetime && 
                              format(new Date(order.pickup_datetime), 'HH:mm') !== format(new Date(order.pickup_end_datetime), 'HH:mm') 
                              ? `${format(new Date(order.pickup_datetime), 'HH:mm')}-${format(new Date(order.pickup_end_datetime), 'HH:mm')}` 
                              : order.pickup_datetime ? format(new Date(order.pickup_datetime), 'HH:mm') : '—'}</span>
                        <span>{order.delivery_datetime && order.delivery_end_datetime && 
                              format(new Date(order.delivery_datetime), 'HH:mm') !== format(new Date(order.delivery_end_datetime), 'HH:mm') 
                              ? `${format(new Date(order.delivery_datetime), 'HH:mm')}-${format(new Date(order.delivery_end_datetime), 'HH:mm')}` 
                              : order.delivery_datetime ? format(new Date(order.delivery_datetime), 'HH:mm') : '—'}</span>
                      </div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="absolute top-0 right-0 h-4 w-4 p-0 hover:bg-white/20">
                            <Info className="h-3 w-3" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80">
                          <div className="space-y-2 text-sm">
                            <h4 className="font-semibold">Same-Day Load Information</h4>
                            <div className="space-y-1">
                              <p>• <strong>Load #:</strong> {order.loadDetails.loadNumber}</p>
                              <p>• <strong>Broker Load #:</strong> {order.loadDetails.brokerLoadNumber}</p>
                              {order.loadDetails.pickupInfo && <p>• <strong>Pickup:</strong> {order.loadDetails.pickupInfo.address}, {order.loadDetails.pickupInfo.city}, {order.loadDetails.pickupInfo.state} at {order.loadDetails.pickupInfo.datetime !== '—' && order.loadDetails.pickupInfo.endDatetime !== '—' && format(new Date(order.loadDetails.pickupInfo.datetime), 'HH:mm') !== format(new Date(order.loadDetails.pickupInfo.endDatetime), 'HH:mm') ? `${format(new Date(order.loadDetails.pickupInfo.datetime), 'MMM dd, HH:mm')} - ${format(new Date(order.loadDetails.pickupInfo.endDatetime), 'HH:mm')}` : order.loadDetails.pickupInfo.datetime !== '—' ? format(new Date(order.loadDetails.pickupInfo.datetime), 'MMM dd, HH:mm') : '—'}</p>}
                              {order.loadDetails.deliveryInfo && <p>• <strong>Delivery:</strong> {order.loadDetails.deliveryInfo.address}, {order.loadDetails.deliveryInfo.city}, {order.loadDetails.deliveryInfo.state} at {order.loadDetails.deliveryInfo.datetime !== '—' && order.loadDetails.deliveryInfo.endDatetime !== '—' && format(new Date(order.loadDetails.deliveryInfo.datetime), 'HH:mm') !== format(new Date(order.loadDetails.deliveryInfo.endDatetime), 'HH:mm') ? `${format(new Date(order.loadDetails.deliveryInfo.datetime), 'MMM dd, HH:mm')} - ${format(new Date(order.loadDetails.deliveryInfo.endDatetime), 'HH:mm')}` : order.loadDetails.deliveryInfo.datetime !== '—' ? format(new Date(order.loadDetails.deliveryInfo.datetime), 'MMM dd, HH:mm') : '—'}</p>}
                              <p>• <strong>Documents:</strong> {order.loadDetails.documents.length > 0 ? order.loadDetails.documents.map(doc => doc.category).join(', ') : 'None'}</p>
                              {order.loadDetails.notes !== '—' && <p>• <strong>Notes:</strong> {order.loadDetails.notes}</p>}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>)}

                  {/* Show +more only for pickup cell activities (pickup-only + same-day orders) */}
                  {(pickupOnlyOrders.length + sameDayOrders.length) > 2 && <div className="text-xs text-gray-600 text-center">
                      +{(pickupOnlyOrders.length + sameDayOrders.length) - 2} more
                    </div>}
                </div> : <div className="text-xs text-gray-400 h-full flex items-center justify-center">—</div>}
            </div>

          </div>
        </td>;
    });
  };
  if (isLoading) {
    return <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>;
  }
  if (error) {
    return <div className="space-y-6">
        <div className="flex items-center justify-center py-8 text-destructive">
          Error loading reports: {error.message}
        </div>
      </div>;
  }
  const handleNoteChange = async (truckId: string, newValue: string) => {
    try {
      await updateTruckNote.mutateAsync({
        truckId,
        note: newValue
      });
    } catch (error) {
      toast({
        title: "Update failed",
        description: "There was an error updating the note.",
        variant: "destructive"
      });
    }
  };
  const renderEditableField = (truckId: string, field: 'note', value: string, displayValue?: React.ReactNode) => {
    return <Textarea defaultValue={value || ""} onBlur={e => handleNoteChange(truckId, e.target.value)} className="text-xs border-none rounded-none resize-none text-left bg-transparent focus:outline-none focus:ring-0 focus:border-transparent p-2 w-full" style={{
      height: '64px',
      minHeight: '64px',
      maxHeight: '64px',
      boxShadow: 'none'
    }} placeholder="Add note..." spellCheck={false} />;
  };
  return <div className="h-full bg-white overflow-hidden flex flex-col">
      {/* Google Sheets-style header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-4 z-20 relative">
        <TestHosSync />
        <h1 className="text-lg font-normal text-gray-900">Dispatcher Fleet Reports</h1>
        <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
          <AlertCircle className="h-3 w-3" />
          Real-time fleet status with multi-load overlay • Orange badge shows trucks with multiple orders
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {groupedReports && Object.keys(groupedReports).length === 0 ? <div className="p-4">
            <div className="text-center py-12 text-gray-500">
              No trucks assigned to dispatchers found
            </div>
          </div> : <div className="px-4 py-4 space-y-8">
            {Object.entries(groupedReports || {}).map(([dispatcherId, group]) => {
          const startDate = getCalendarStartDate(dispatcherId);
          const days = Array.from({
            length: 5
          }, (_, i) => addDays(startDate, i));
          return <div key={dispatcherId} className="bg-white">
                {/* Dispatcher header - Google Sheets style */}
                <div className="mb-4">
                  <h2 className="text-sm font-medium text-gray-900 px-1">
                    {group.dispatcher} ({group.trucks.length} truck{group.trucks.length !== 1 ? 's' : ''})
                  </h2>
                </div>
                
                {/* Google Sheets-style table */}
                <div className="w-full">
                  <table className="w-full border-collapse bg-white border border-gray-300" style={{
                tableLayout: 'auto'
              }}>
                    <thead>
                      {/* Date Range Selector Row - Above main headers */}
                      <tr className="bg-gray-50">
                        <th colSpan={3} className="border-r border-b border-gray-300 bg-gray-50"></th>
                        <th colSpan={5} className="border-r border-b border-gray-300 px-2 py-2 bg-gray-50">
                          <div className="flex items-center justify-center">
                            <button onClick={() => handleCalendarDateChange(dispatcherId, addDays(startDate, -1))} className="p-1 hover:bg-gray-200 rounded">
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <div className="text-sm font-medium text-gray-700 mx-4">
                              {format(startDate, 'MMM dd')} - {format(addDays(startDate, 4), 'MMM dd, yyyy')}
                            </div>
                            <button onClick={() => handleCalendarDateChange(dispatcherId, addDays(startDate, 1))} className="p-1 hover:bg-gray-200 rounded">
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </th>
                        <th colSpan={4} className="border-r border-b border-gray-300 bg-gray-50" style={{
                      width: '272px',
                      minWidth: '272px',
                      maxWidth: '272px'
                    }}></th>
                        <th colSpan={2} className={`bg-gray-50 border-l border-b border-gray-300 px-3 py-2 text-center text-xs font-medium text-gray-700 ${sidebarOpen ? 'border-r border-gray-300' : ''}`}>
                          Recent Activity
                        </th>
                      </tr>
                      {/* Column Headers Row */}
                      <tr className="bg-gray-50">
                        <th className="border-r border-b border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-20">Truck #</th>
                        <th className="border-r border-b border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-32">Driver</th>
                        <th className="border-r border-b border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-28">Home</th>
                        {days.map((day, index) => {
                          const isToday = isSameDay(day, new Date());
                          return <th key={index} className={`border-r border-b border-gray-300 px-3 py-2 text-center text-xs font-medium text-gray-700 bg-gray-50 relative ${isToday ? 'border-l-2 border-r-2 border-t-2 border-red-500' : ''}`} style={{
                            width: '166px',
                            minWidth: '166px',
                            maxWidth: '166px'
                          }}>
                            <div>{format(day, 'EEE')}</div>
                            <div className="text-xs text-gray-600">{format(day, 'dd')}</div>
                          </th>;
                        })}
                        <th colSpan={4} className="border-t border-r border-b border-gray-300 px-3 py-1 text-center text-xs font-medium text-gray-700 bg-gray-50" style={{
                      width: '340px',
                      minWidth: '340px',
                      maxWidth: '340px'
                    }}>Away (D) | Drive | Shift | Break | Cycle</th>
                         <th className="border-t border-b border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-24">Last Edit</th>
                         <th className={`border-t border-b border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50 w-24 ${sidebarOpen ? 'border-r border-gray-300' : ''}`}>Date</th>
                       </tr>
                    </thead>
                    <tbody>
                      {group.trucks.map((truck, truckIndex) => {
                        const isLastTruck = truckIndex === group.trucks.length - 1;
                        const calendarCells = renderTruckCalendarCells(truck, startDate);
                        
                        // Add bottom border to today's cell if this is the last truck
                        const modifiedCells = isLastTruck ? calendarCells.map((cell, cellIndex) => {
                          const day = addDays(startDate, cellIndex);
                          const isToday = isSameDay(day, new Date());
                          if (isToday) {
                            return <td key={cellIndex} className={`border-r border-b border-gray-300 p-0 relative border-l-2 border-r-2 border-b-2 border-red-500`} style={{
                              width: '166px',
                              minWidth: '166px',
                              maxWidth: '166px'
                            }}>
                              {cell.props.children}
                            </td>;
                          }
                          return cell;
                        }) : calendarCells;
                        
                        return <tr key={truck.id} className={truckIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                          <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900 font-medium" style={{
                      width: '80px',
                      minWidth: '80px',
                      maxWidth: '80px'
                    }}>
                            <div className="flex items-center gap-1">
                              {truck.truckNumber}
                              {truck.hasMultipleOrders && <TooltipProvider>
                                  <Tooltip>
                                    
                                    <TooltipContent>
                                      <p>{truck.totalOrdersCount} total orders ({truck.activeOrdersCount} active)</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>}
                            </div>
                          </td>
                          <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900" style={{
                      width: '128px',
                      minWidth: '128px',
                      maxWidth: '128px'
                    }}>{truck.driver}</td>
                          <td className="border-r border-b border-gray-300 px-3 py-2 text-sm text-gray-900" style={{
                      width: '112px',
                      minWidth: '112px',
                      maxWidth: '112px'
                    }}>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-gray-500" />
                              {truck.home}
                            </div>
                          </td>
                          {modifiedCells}
                          {/* Merged cell for Away, Drive, Shift, Cycle with Notes at bottom */}
                          <td colSpan={4} className="border-r border-b border-gray-300 p-0" style={{
                      height: '128px'
                    }}>
                            <div className="h-16 border-b border-gray-200 flex items-center justify-around px-2">
                              {/* Away Days */}
                              <div className="flex flex-col items-center">
                                <div className="text-xs text-gray-600 mb-1">AWAY (D)</div>
                                <div className="text-sm text-gray-900 font-medium">{truck.awayDays}</div>
                              </div>
                              
                              {/* HOS Circular Timers */}
                              <HosCircularTimer 
                                minutes={truck.driveMinutes} 
                                maxMinutes={11 * 60} // 11 hours max drive time
                                label="DRIVE" 
                                color="#84cc16" // green
                                size={50}
                                strokeWidth={4}
                              />
                               <HosCircularTimer 
                                minutes={truck.shiftMinutes} 
                                maxMinutes={14 * 60} // 14 hours max shift time
                                label="SHIFT" 
                                color="#06b6d4" // cyan
                                size={50}
                                strokeWidth={4}
                              />
                              <HosCircularTimer 
                                minutes={truck.breakMinutes} 
                                maxMinutes={8 * 60} // 8 hours max break time
                                label="BREAK" 
                                color="#8b5cf6" // purple
                                size={50}
                                strokeWidth={4}
                              />
                              <HosCircularTimer 
                                minutes={truck.cycleMinutes} 
                                maxMinutes={70 * 60} // 70 hours max cycle time
                                label="CYCLE" 
                                color="#6b7280" // gray
                                size={50}
                                strokeWidth={4}
                              />
                            </div>
                            <div className="h-16 p-0 w-full">
                              {renderEditableField(truck.id, 'note', truck.note)}
                            </div>
                          </td>
                           <td className="border-b border-gray-300 px-3 py-2 text-xs text-gray-600" style={{
                      width: '96px',
                      minWidth: '96px',
                      maxWidth: '96px'
                    }}>{truck.lastEdit}</td>
                           <td className={`border-b border-gray-300 px-3 py-2 text-xs text-gray-600 ${sidebarOpen ? 'border-r border-gray-300' : ''}`} style={{
                      width: '96px',
                      minWidth: '96px',
                      maxWidth: '96px'
                    }}>{truck.editDate}</td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>;
        })}
          </div>}
      </div>
    </div>;
};
export default Reports;