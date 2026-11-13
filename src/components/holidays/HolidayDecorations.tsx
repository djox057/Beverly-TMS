import type { CSSProperties } from 'react';
import { Flag, Gift, Leaf, Settings, Snowflake, Sparkles, Sprout, Star, TreePine, Truck, Wheat, Wrench } from 'lucide-react';
import './holidayDecorations.css';

type Motif = 'star' | 'sparkles' | 'flag' | 'laurel' | 'pennant' | 'gear' | 'wrench' | 'truck' | 'leaf' | 'wheat' | 'pumpkin' | 'bulb' | 'tree' | 'gift' | 'snowflake';
interface HolidayScene {
  style: string;
  garland: Motif[];
  margins: Motif[];
  corner: Motif[];
}

const scenes: Record<string, HolidayScene> = {
  'new-years-day': { style: 'stars', garland: ['star', 'sparkles', 'star'], margins: ['sparkles', 'star'], corner: ['sparkles', 'star', 'sparkles'] },
  'memorial-day': { style: 'remembrance', garland: ['flag', 'laurel', 'star'], margins: ['laurel', 'star'], corner: ['laurel', 'flag', 'laurel'] },
  'independence-day': { style: 'bunting', garland: ['pennant', 'star', 'pennant'], margins: ['star', 'sparkles'], corner: ['flag', 'sparkles', 'star'] },
  'labor-day': { style: 'workshop', garland: ['gear', 'wrench', 'gear'], margins: ['gear', 'wrench'], corner: ['gear', 'truck', 'wrench'] },
  thanksgiving: { style: 'harvest', garland: ['leaf', 'wheat', 'pumpkin'], margins: ['leaf', 'wheat'], corner: ['pumpkin', 'wheat', 'leaf'] },
  christmas: { style: 'lights', garland: ['bulb', 'bulb', 'star', 'bulb'], margins: ['snowflake', 'star'], corner: ['gift', 'tree', 'gift'] },
};

function Ornament({ motif }: { motif: Motif }) {
  switch (motif) {
    case 'star': return <Star className="holiday-ornament-filled" />;
    case 'sparkles': return <Sparkles />;
    case 'flag': return <Flag className="holiday-ornament-filled" />;
    case 'laurel': return <Sprout />;
    case 'pennant': return <svg viewBox="0 0 24 28" fill="none" focusable="false"><path d="M2 2h20L12 26Z" fill="currentColor" /><path d="m8 9 4-3 4 3-1 5h-6Z" fill="white" opacity=".75" /></svg>;
    case 'gear': return <Settings />;
    case 'wrench': return <Wrench />;
    case 'truck': return <Truck />;
    case 'leaf': return <Leaf className="holiday-ornament-filled" />;
    case 'wheat': return <Wheat />;
    case 'pumpkin': return <svg viewBox="0 0 80 64" fill="none" focusable="false">
      <path d="M40 17c-2-8 2-12 7-14" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="25" cy="38" rx="20" ry="23" fill="currentColor" />
      <ellipse cx="55" cy="38" rx="20" ry="23" fill="currentColor" />
      <ellipse cx="40" cy="38" rx="18" ry="24" fill="currentColor" />
      <path d="M40 17c-8 12-8 30 0 43m0-43c8 12 8 30 0 43" stroke="white" strokeWidth="2" opacity=".35" />
    </svg>;
    case 'bulb': return <svg className="holiday-light-bulb" viewBox="0 0 20 28" fill="none" focusable="false"><path d="M6 3h8v6H6Z" fill="currentColor" opacity=".65" /><path d="M6 9h8c0 4 4 6 4 10a8 8 0 0 1-16 0c0-4 4-6 4-10Z" fill="currentColor" /></svg>;
    case 'tree': return <TreePine className="holiday-ornament-filled" />;
    case 'gift': return <Gift />;
    case 'snowflake': return <Snowflake />;
  }
}

export function HolidayDecorations({ slug }: { slug: string }) {
  const scene = scenes[slug];
  if (!scene) return null;
  return <>
    {/* The string has its own layout row; it never sits over the title or data. */}
    <div className={`holiday-garland holiday-garland-${scene.style}`} aria-hidden="true">
      <svg className="holiday-garland-wire" viewBox="0 0 1000 24" preserveAspectRatio="none" fill="none" focusable="false">
        <path d="M0 4Q125 26 250 4Q375 26 500 4Q625 26 750 4Q875 26 1000 4" stroke="currentColor" strokeWidth="1.25" />
      </svg>
      {Array.from({ length: 16 }, (_, index) => <span
        key={index}
        className={`holiday-garland-drop holiday-decor-tone-${index % 3}`}
        style={{ '--decor-delay': `${-index * .65}s` } as CSSProperties}
      ><Ornament motif={scene.garland[index % scene.garland.length]} /></span>)}
    </div>
    <div className="holiday-scene-margins" aria-hidden="true">
      {['left', 'right'].map((side, sideIndex) => <div className={`holiday-scene-gutter holiday-scene-gutter-${side}`} key={side}>
        {[12, 34, 58, 82].map((top, index) => <span
          key={top}
          className={`holiday-margin-ornament holiday-decor-tone-${(index + sideIndex) % 3}`}
          style={{ top: `${top}%`, '--decor-delay': `${-index * 2 - sideIndex}s` } as CSSProperties}
        ><Ornament motif={scene.margins[(index + sideIndex) % scene.margins.length]} /></span>)}
      </div>)}
    </div>
  </>;
}

export function HolidayDecorationsFooter({ slug }: { slug: string }) {
  const scene = scenes[slug];
  if (!scene) return null;
  return <div className="holiday-scene-footer" aria-hidden="true">
    {['left', 'right'].map(side => <div className={`holiday-scene-corner holiday-scene-corner-${side}`} key={side}>
      {scene.corner.map((motif, index) => <span className={`holiday-decor-tone-${index}`} key={`${motif}-${index}`}><Ornament motif={motif} /></span>)}
    </div>)}
    <span className="holiday-scene-footer-stars"><Ornament motif={scene.margins[0]} /></span>
  </div>;
}
