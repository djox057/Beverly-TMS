import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Home, Package, User } from 'lucide-react';
import { useDragPan } from '@/hooks/useDragPan';

interface DriverLayoutProps {
  children: React.ReactNode;
}

export const DriverLayout: React.FC<DriverLayoutProps> = ({ children }) => {
  const location = useLocation();
  useDragPan();

  const navItems = [
    { path: '/driver', icon: Home, label: 'Home' },
    { path: '/driver/orders', icon: Package, label: 'Loads' },
    { path: '/driver/info', icon: User, label: 'Info' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <main className="pb-16">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors ${
                  isActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className={`h-6 w-6 ${isActive ? 'fill-primary/20' : ''}`} />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
