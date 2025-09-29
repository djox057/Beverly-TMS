import React from 'react';

interface HosCircularTimerProps {
  minutes: number;
  maxMinutes: number;
  label: string;
  color: string;
  size?: number;
  strokeWidth?: number;
}

export const HosCircularTimer: React.FC<HosCircularTimerProps> = ({
  minutes,
  maxMinutes,
  label,
  color,
  size = 60,
  strokeWidth = 6
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = Math.min(minutes / maxMinutes, 1);
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (progress * circumference);
  
  // Convert minutes to hours and minutes for display
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const timeDisplay = `${hours}:${remainingMinutes.toString().padStart(2, '0')}`;
  
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Background circle */}
        <svg
          className="transform -rotate-90"
          width={size}
          height={size}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            className="text-gray-200"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-300 ease-in-out"
          />
        </svg>
        
        {/* Time display in center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-medium text-gray-900">
            {timeDisplay}
          </span>
        </div>
      </div>
      
      {/* Label */}
      <span className="text-xs text-gray-600 mt-1 uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
};