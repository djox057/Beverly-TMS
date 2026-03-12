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
  strokeWidth = 6,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = Math.min(minutes / maxMinutes, 1);
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - progress * circumference;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const timeDisplay = `${hours}:${remainingMinutes.toString().padStart(2, '0')}`;
  
  const circleColor = minutes <= 0 ? '#ef4444' : color;
  
  return <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-border" />
          <circle cx={size / 2} cy={size / 2} r={radius} stroke={circleColor} strokeWidth={strokeWidth} fill="transparent" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} strokeLinecap="round" className="transition-all duration-300 ease-in-out" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-medium text-muted-foreground ${size < 40 ? 'text-[9px]' : 'text-sm'}`}>
            {timeDisplay}
          </span>
        </div>
      </div>
    </div>;
};