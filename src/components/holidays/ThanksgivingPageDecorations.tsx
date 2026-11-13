import type { CSSProperties } from 'react';

// Fixed positions keep the scene stable while notes and filters update.
const leaves = [
  { left: 2, top: 18, size: 28, opacity: .3 },
  { left: 96, top: 25, size: 30, opacity: .28 },
  { left: 3, top: 44, size: 24, opacity: .26 },
  { left: 97, top: 57, size: 26, opacity: .3 },
  { left: 1, top: 73, size: 30, opacity: .28 },
  { left: 95, top: 86, size: 28, opacity: .26 },
  { left: 16, top: 32, size: 20, opacity: .1 },
  { left: 82, top: 44, size: 22, opacity: .1 },
  { left: 32, top: 68, size: 18, opacity: .08 },
  { left: 68, top: 82, size: 20, opacity: .1 },
  { left: 25, top: 13, size: 18, opacity: .1 },
  { left: 75, top: 20, size: 20, opacity: .1 },
];

function Pumpkin() {
  return <svg className="thanksgiving-pumpkin" viewBox="0 0 80 64" fill="none" focusable="false">
    <path d="M40 17c-2-8 2-12 7-14" stroke="#6f7850" strokeWidth="5" strokeLinecap="round" />
    <ellipse cx="25" cy="38" rx="20" ry="23" fill="#c78342" />
    <ellipse cx="55" cy="38" rx="20" ry="23" fill="#c78342" />
    <ellipse cx="40" cy="38" rx="18" ry="24" fill="#df9d55" />
    <path d="M40 17c-8 12-8 30 0 43m0-43c8 12 8 30 0 43" stroke="#b87839" strokeWidth="1.5" opacity=".65" />
  </svg>;
}

export function ThanksgivingPageDecorations() {
  return <div className="thanksgiving-page-decorations" aria-hidden="true">
    <div className="thanksgiving-ambient-leaves">
      {leaves.map((leaf, index) => <span
        key={index}
        className={`thanksgiving-ambient-leaf${index >= 6 ? ' thanksgiving-ambient-leaf-interior' : ''}`}
        style={{
          left: `${leaf.left}%`, top: `${leaf.top}%`, fontSize: leaf.size,
          opacity: leaf.opacity,
          '--leaf-duration': `${10 + index % 4 * 2}s`,
          '--leaf-delay': `${-index * 1.7}s`,
          '--leaf-turn': `${index % 2 ? 14 : -14}deg`,
        } as CSSProperties}
      >{index % 2 ? '🍂' : '🍁'}</span>)}
    </div>
    <div className="thanksgiving-harvest thanksgiving-harvest-left"><Pumpkin /><span>🌾</span><span>🍂</span></div>
    <div className="thanksgiving-harvest thanksgiving-harvest-right"><span>🍁</span><span>🌾</span><Pumpkin /></div>
    <div className="thanksgiving-arrival-leaves">
      {[8, 22, 38, 62, 78, 92].map((left, index) => <span
        key={left}
        className="thanksgiving-arrival-leaf"
        style={{ left: `${left}%`, animationDelay: `${index * .09}s`, '--leaf-turn': `${index % 2 ? 32 : -32}deg` } as CSSProperties}
      >{index % 2 ? '🍂' : '🍁'}</span>)}
    </div>
  </div>;
}
