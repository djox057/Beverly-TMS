import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Edit3, Check, X } from 'lucide-react';
import { format, addDays, startOfWeek, isSameDay, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const CHICAGO_TZ = 'America/Chicago';
const getChicagoNow = () => toZonedTime(new Date(), CHICAGO_TZ);

interface EditingState {
  truckId: string;
  field: 'pickup-location' | 'pickup-datetime' | 'delivery-location' | 'delivery-datetime' | 'note';
  value: string;
}

interface CalendarData {
  date: Date;
  pickup?: {
    location: string;
    datetime?: string;
    id?: string;
  };
  delivery?: {
    location: string;
    datetime?: string;
    id?: string;
  };
  status: string;
}

interface CalendarCarouselProps {
  truckId: string;
  truckData: {
    pickup: { location: string; date: string; time: string; id?: string };
    delivery: { location: string; date: string; time: string; id?: string };
    status: string;
  };
  editing: EditingState | null;
  onEdit: (truckId: string, field: 'pickup-location' | 'pickup-datetime' | 'delivery-location' | 'delivery-datetime', value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onEditingChange: (editing: EditingState | null) => void;
}

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

export const CalendarCarousel: React.FC<CalendarCarouselProps> = ({
  truckId,
  truckData,
  editing,
  onEdit,
  onSave,
  onCancel,
  onEditingChange
}) => {
  const [startDate, setStartDate] = useState(() => {
    // Try to start from pickup or delivery date if available, using Chicago timezone
    const pickupDate = truckData.pickup.date !== '—' ? new Date(truckData.pickup.date) : null;
    const deliveryDate = truckData.delivery.date !== '—' ? new Date(truckData.delivery.date) : null;
    const refDate = pickupDate || deliveryDate || getChicagoNow();
    return startOfWeek(refDate, { weekStartsOn: 1 }); // Start week on Monday
  });

  const statusColors = getStatusColors(truckData.status);

  // Generate 6 consecutive days starting from startDate
  const days = Array.from({ length: 6 }, (_, i) => addDays(startDate, i));

  const navigateWeek = (direction: 'prev' | 'next') => {
    setStartDate(prev => addDays(prev, direction === 'next' ? 7 : -7));
  };

  const parseDate = (dateStr: string) => {
    if (dateStr === '—' || !dateStr) return null;
    try {
      return new Date(dateStr);
    } catch {
      return null;
    }
  };

  const pickupDate = parseDate(truckData.pickup.date);
  const deliveryDate = parseDate(truckData.delivery.date);

  const renderEditableCell = (
    type: 'pickup' | 'delivery',
    day: Date,
    data: { location: string; date: string; time: string }
  ) => {
    const isActive = type === 'pickup' ? 
      (pickupDate && isSameDay(day, pickupDate)) : 
      (deliveryDate && isSameDay(day, deliveryDate));

    if (!isActive) {
      return (
        <div className={`h-16 border-b ${type === 'pickup' ? 'border-gray-200' : ''} p-2 bg-gray-50`}>
          <div className="text-xs text-gray-400">—</div>
        </div>
      );
    }

    const locationField = `${type}-location` as const;
    const datetimeField = `${type}-datetime` as const;
    const isEditingLocation = editing?.truckId === truckId && editing?.field === locationField;
    const isEditingDatetime = editing?.truckId === truckId && editing?.field === datetimeField;

    const currentDatetime = data.date !== '—' && data.time !== '—' ? 
      `${data.date}T${data.time}` : '';

    return (
      <div className={`h-16 ${type === 'pickup' ? 'border-b border-gray-200' : ''} p-2 ${statusColors.bg} ${statusColors.border} border`}>
        {/* Location */}
        <div className="mb-1">
          {isEditingLocation ? (
            <div className="flex items-center gap-1">
              <Input
                value={editing.value}
                onChange={(e) => onEditingChange({...editing, value: e.target.value})}
                className="h-5 text-xs border-gray-300 rounded-none"
              />
              <button onClick={onSave} className="text-green-600 hover:text-green-800 p-0.5">
                <Check className="h-2 w-2" />
              </button>
              <button onClick={onCancel} className="text-red-600 hover:text-red-800 p-0.5">
                <X className="h-2 w-2" />
              </button>
            </div>
          ) : (
            <div
              className="flex items-center gap-1 cursor-pointer group hover:bg-white/50 p-0.5 rounded text-xs font-medium"
              onClick={() => onEdit(truckId, locationField, data.location)}
            >
              <span className={`flex-1 ${statusColors.text} truncate`}>
                {data.location || '—'}
              </span>
              <Edit3 className="h-2 w-2 opacity-0 group-hover:opacity-50 text-gray-500" />
            </div>
          )}
        </div>

        {/* Date/Time */}
        <div>
          {isEditingDatetime ? (
            <div className="flex items-center gap-1">
              <Input
                type="datetime-local"
                value={editing.value}
                onChange={(e) => onEditingChange({...editing, value: e.target.value})}
                className="h-4 text-xs border-gray-300 rounded-none"
              />
              <button onClick={onSave} className="text-green-600 hover:text-green-800 p-0.5">
                <Check className="h-2 w-2" />
              </button>
              <button onClick={onCancel} className="text-red-600 hover:text-red-800 p-0.5">
                <X className="h-2 w-2" />
              </button>
            </div>
          ) : (
            <div
              className="cursor-pointer group hover:bg-white/50 p-0.5 rounded text-xs"
              onClick={() => onEdit(truckId, datetimeField, currentDatetime)}
            >
              <div className={`${statusColors.text} opacity-70 flex items-center gap-1`}>
                <span className="truncate">
                  {data.date !== '—' && data.time !== '—' 
                    ? `${data.date} ${data.time}`
                    : '—'
                  }
                </span>
                <Edit3 className="h-2 w-2 opacity-0 group-hover:opacity-50 text-gray-500" />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="border border-gray-300">
      {/* Calendar Header */}
      <div className="flex items-center justify-between bg-gray-50 border-b border-gray-300 px-2 py-1">
        <button
          onClick={() => navigateWeek('prev')}
          className="p-1 hover:bg-gray-200 rounded"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-xs font-medium text-gray-700">
          {format(startDate, 'MMM dd')} - {format(addDays(startDate, 5), 'MMM dd, yyyy')}
        </div>
        <button
          onClick={() => navigateWeek('next')}
          className="p-1 hover:bg-gray-200 rounded"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Calendar Days */}
      <div className="flex">
        {days.map((day, index) => (
          <div key={index} className="flex-1 border-r border-gray-300 last:border-r-0">
            {/* Day header */}
            <div className="bg-gray-50 border-b border-gray-300 px-2 py-1 text-center">
              <div className="text-xs font-medium text-gray-700">
                {format(day, 'EEE')}
              </div>
              <div className="text-xs text-gray-600">
                {format(day, 'dd')}
              </div>
            </div>

            {/* Delivery cell (top) */}
            {renderEditableCell('delivery', day, truckData.delivery)}

            {/* Pickup cell (bottom) */}
            {renderEditableCell('pickup', day, truckData.pickup)}
          </div>
        ))}
      </div>
    </div>
  );
};