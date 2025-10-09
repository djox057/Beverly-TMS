import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

interface LayoutProps {
  children: ReactNode;
}

const LayoutContent = ({ children }: LayoutProps) => {
  const { state } = useSidebar();
  
  return (
    <div className="flex h-screen bg-background w-full">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
};

export const Layout = ({ children }: LayoutProps) => {
  return (
    <SidebarProvider>
      <LayoutContent>{children}</LayoutContent>
    </SidebarProvider>
  );
};