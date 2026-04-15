import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

interface LayoutProps {
  children: ReactNode;
}

const LayoutContent = ({ children }: LayoutProps) => {
  const { state } = useSidebar();

  return (
    <div className="flex h-screen bg-background w-full relative z-0">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex items-center gap-2 border-b bg-background px-4 flex-shrink-0">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold text-foreground">Dispatch Manager</h1>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
};

export const Layout = ({ children }: LayoutProps) => {
  return (
    <SidebarProvider defaultOpen={true}>
      <LayoutContent>{children}</LayoutContent>
    </SidebarProvider>
  );
};
