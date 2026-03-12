import React from 'react';
interface HosCircularTimerProps {
  minutes: number;
  maxMinutes: number;
  label: string;
  color: string;
  size?: number;
  strokeWidth?: number;
  disabled?: boolean;
}
export const HosCircularTimer: React.FC<HosCircularTimerProps> = ({
  minutes,
  maxMinutes,
  label,
  color,
  size = 60,
  strokeWidth = 6,
  disabled = false,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = Math.min(minutes / maxMinutes, 1);
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - progress * circumference;

  // Convert minutes to hours and minutes for display
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const timeDisplay = `${hours}:${remainingMinutes.toString().padStart(2, '0')}`;
  
  // Turn red if time is 0 or below
  const circleColor = minutes <= 0 ? '#ef4444' : color;
  
  return <div className={`flex flex-col items-center ${disabled ? 'opacity-25' : ''}`}>
      <div className="relative" style={{
      width: size,
      height: size
    }}>
        {/* Background circle */}
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-border" />
          {/* Progress circle */}
          <circle cx={size / 2} cy={size / 2} r={radius} stroke={circleColor} strokeWidth={strokeWidth} fill="transparent" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} strokeLinecap="round" className="transition-all duration-300 ease-in-out" />
        </svg>
        
        {/* Time display in center */}
        <div className="absolute inset-0 flex items-center justify-center">
          {disabled ? (
            <span className={`font-bold text-destructive ${size < 40 ? 'text-[7px]' : 'text-[9px]'}`}>
              ✕
            </span>
          ) : (
            <span className={`font-medium text-muted-foreground ${size < 40 ? 'text-[9px]' : 'text-sm'}`}>
              {timeDisplay}
            </span>
          )}
        </div>
      </div>
      
      {/* Label */}
      
    </div>;
};