import { useEffect, useState } from "react";

interface Snowflake {
  id: number;
  left: string;
  delay: string;
  duration: string;
  size: string;
  opacity: number;
}

interface ScrollDecoration {
  id: number;
  emoji: string;
  right: string;
  top: number;
  delay: string;
}

export const ChristmasDecorations = () => {
  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);
  const [scrollY, setScrollY] = useState(0);
  const [visibleDecorations, setVisibleDecorations] = useState<Set<number>>(new Set());

  // Scroll-triggered decorations on the right side
  const scrollDecorations: ScrollDecoration[] = [
    { id: 1, emoji: "🎄", right: "2%", top: 150, delay: "0s" },
    { id: 2, emoji: "🎁", right: "8%", top: 300, delay: "0.1s" },
    { id: 3, emoji: "⭐", right: "3%", top: 450, delay: "0.2s" },
    { id: 4, emoji: "🦌", right: "6%", top: 600, delay: "0.3s" },
    { id: 5, emoji: "🎅", right: "4%", top: 750, delay: "0.4s" },
    { id: 6, emoji: "🎄", right: "9%", top: 900, delay: "0.5s" },
    { id: 7, emoji: "🔔", right: "2%", top: 1050, delay: "0.6s" },
    { id: 8, emoji: "🎁", right: "5%", top: 1200, delay: "0.7s" },
    { id: 9, emoji: "☃️", right: "7%", top: 1350, delay: "0.8s" },
    { id: 10, emoji: "🎄", right: "3%", top: 1500, delay: "0.9s" },
  ];

  // Generate snowflakes
  useEffect(() => {
    const flakes: Snowflake[] = [];
    for (let i = 0; i < 50; i++) {
      flakes.push({
        id: i,
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 10}s`,
        duration: `${8 + Math.random() * 12}s`,
        size: `${8 + Math.random() * 12}px`,
        opacity: 0.3 + Math.random() * 0.5,
      });
    }
    setSnowflakes(flakes);
  }, []);

  // Track scroll position for revealing decorations
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      const scroll = target.scrollTop || 0;
      setScrollY(scroll);
      
      // Check which decorations should be visible
      const newVisible = new Set<number>();
      scrollDecorations.forEach((dec) => {
        if (scroll + window.innerHeight > dec.top - 100) {
          newVisible.add(dec.id);
        }
      });
      setVisibleDecorations(newVisible);
    };

    const scrollContainer = document.querySelector('.christmas-scroll-container');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      // Trigger initial check
      handleScroll({ target: scrollContainer } as unknown as Event);
    }

    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  return (
    <>
      {/* CSS for animations */}
      <style>{`
        @keyframes snowfall {
          0% {
            transform: translateY(-20px) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
          }
        }

        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }

        @keyframes sway {
          0%, 100% { transform: rotate(-3deg); }
          50% { transform: rotate(3deg); }
        }

        @keyframes popIn {
          0% { transform: scale(0) rotate(-180deg); opacity: 0; }
          60% { transform: scale(1.2) rotate(10deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }

        @keyframes lightGlow {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.5) drop-shadow(0 0 8px currentColor); }
        }

        @keyframes gentleFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        .snowflake {
          animation: snowfall linear infinite;
        }

        .decoration-pop {
          animation: popIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
        }

        .gentle-float {
          animation: gentleFloat 4s ease-in-out infinite;
        }

        .sway {
          animation: sway 3s ease-in-out infinite;
        }

        .twinkle {
          animation: twinkle 2s ease-in-out infinite;
        }

        .light-glow {
          animation: lightGlow 1.5s ease-in-out infinite;
        }
      `}</style>

      {/* String lights at top */}
      <div className="fixed top-0 left-0 right-0 h-10 pointer-events-none z-10 overflow-hidden">
        <div className="flex justify-between px-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <span
              key={i}
              className="text-lg light-glow"
              style={{
                animationDelay: `${i * 0.15}s`,
                color: ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6b6b'][i % 5],
              }}
            >
              💡
            </span>
          ))}
        </div>
        {/* Wire */}
        <div 
          className="absolute top-3 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-green-800 to-transparent"
          style={{ zIndex: -1 }}
        />
      </div>

      {/* Snowflakes - more on right side */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {snowflakes.map((flake) => (
          <div
            key={flake.id}
            className="snowflake absolute text-blue-200/60"
            style={{
              left: flake.left,
              animationDelay: flake.delay,
              animationDuration: flake.duration,
              fontSize: flake.size,
              opacity: flake.opacity,
            }}
          >
            ❄
          </div>
        ))}
      </div>

      {/* Left side subtle decorations - fixed positions */}
      <div className="fixed left-2 top-20 pointer-events-none z-10 opacity-40">
        <span className="text-2xl twinkle" style={{ animationDelay: "0s" }}>✨</span>
      </div>
      <div className="fixed left-4 top-48 pointer-events-none z-10 opacity-30">
        <span className="text-xl twinkle" style={{ animationDelay: "0.5s" }}>⭐</span>
      </div>
      <div className="fixed left-2 top-80 pointer-events-none z-10 opacity-40">
        <span className="text-lg gentle-float" style={{ animationDelay: "1s" }}>❄️</span>
      </div>
      <div className="fixed left-5 bottom-48 pointer-events-none z-10 opacity-30">
        <span className="text-xl twinkle" style={{ animationDelay: "1.5s" }}>✨</span>
      </div>
      <div className="fixed left-3 bottom-20 pointer-events-none z-10 opacity-40">
        <span className="text-2xl gentle-float" style={{ animationDelay: "2s" }}>🌟</span>
      </div>

      {/* Right side scroll-triggered decorations */}
      {scrollDecorations.map((dec) => (
        <div
          key={dec.id}
          className={`fixed pointer-events-none z-10 ${
            visibleDecorations.has(dec.id) ? 'decoration-pop' : 'opacity-0'
          }`}
          style={{
            right: dec.right,
            top: `${Math.min(dec.top, window.innerHeight - 100)}px`,
            animationDelay: dec.delay,
          }}
        >
          <span className={`text-4xl ${dec.emoji === '🎄' ? 'sway' : 'gentle-float'}`}>
            {dec.emoji}
          </span>
        </div>
      ))}

      {/* Large Christmas tree in bottom right corner */}
      <div className="fixed bottom-4 right-4 pointer-events-none z-10 sway">
        <span className="text-7xl" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))' }}>
          🎄
        </span>
      </div>

      {/* Presents near the tree */}
      <div className="fixed bottom-4 right-24 pointer-events-none z-10 gentle-float" style={{ animationDelay: "0.5s" }}>
        <span className="text-3xl">🎁</span>
      </div>
      <div className="fixed bottom-8 right-20 pointer-events-none z-10 gentle-float" style={{ animationDelay: "1s" }}>
        <span className="text-2xl">🎁</span>
      </div>

      {/* Candy canes on right side */}
      <div className="fixed top-32 right-12 pointer-events-none z-10 opacity-70" style={{ transform: 'rotate(15deg)' }}>
        <span className="text-3xl">🍬</span>
      </div>
      <div className="fixed top-64 right-6 pointer-events-none z-10 opacity-60" style={{ transform: 'rotate(-10deg)' }}>
        <span className="text-2xl">🍭</span>
      </div>

      {/* Holly in corners */}
      <div className="fixed top-14 right-4 pointer-events-none z-10">
        <span className="text-2xl">🎀</span>
      </div>

      {/* Reindeer tracks at bottom right */}
      <div className="fixed bottom-32 right-8 pointer-events-none z-10 opacity-40">
        <span className="text-xl">🦌</span>
      </div>
    </>
  );
};
