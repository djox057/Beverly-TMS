import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays } from 'date-fns';

interface SharedCalendarCarouselProps {
  startDate: Date;
  onDateChange: (date: Date) => void;
}

export const SharedCalendarCarousel: React.FC<SharedCalendarCarouselProps> = ({
  startDate,
  onDateChange
}) => {
  // Generate 5 consecutive days starting from startDate
  const days = Array.from({ length: 5 }, (_, i) => addDays(startDate, i));

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newDate = addDays(startDate, direction === 'next' ? 7 : -7);
    onDateChange(newDate);
  };

  return (
    <div className="border border-gray-300 bg-white">
      {/* Calendar Header */}
      <div className="flex items-center justify-between bg-gray-50 border-b border-gray-300 px-4 py-2">
        <button
          onClick={() => navigateWeek('prev')}
          className="p-1 hover:bg-gray-200 rounded"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-medium text-gray-700">
          {format(startDate, 'MMM dd')} - {format(addDays(startDate, 4), 'MMM dd, yyyy')}
        </div>
        <button
          onClick={() => navigateWeek('next')}
          className="p-1 hover:bg-gray-200 rounded"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Calendar Days Header */}
      <div className="flex">
        {days.map((day, index) => (
          <div key={index} className="flex-1 border-r border-gray-300 last:border-r-0 bg-gray-50 border-b border-gray-300 px-3 py-2 text-center">
            <div className="text-xs font-medium text-gray-700">
              {format(day, 'EEE')}
            </div>
            <div className="text-xs text-gray-600">
              {format(day, 'dd')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};