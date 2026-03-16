import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuthStore } from "@/store/auth-store";
import { Loader2 } from "lucide-react";
import { StatusBar } from "../ui/status-bar";
import { cn } from "@/lib/utils";
import { SkipLink } from "../ui/SkipLink";
type AppLayoutProps = {
  children: React.ReactNode;
  container?: boolean;
  className?: string;
  contentClassName?: string;
};
function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
export function AppLayout({ children, container = false, className, contentClassName }: AppLayoutProps): JSX.Element {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const isLoading = useAuthStore(s => s.isLoading);
  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <AuthGuard><div /></AuthGuard>;
  }
  return (
    <AuthGuard>
      <SkipLink />
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
        <SidebarInset className={cn("flex flex-col min-h-screen", className)}>
          <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-elevation">
            <SidebarTrigger className="-ml-1 hover:bg-accent transition-colors" />
            <StatusBar className="flex-1 shadow-none border-none bg-transparent" />
          </header>
          <main id="main-content" className="flex-1 py-6 animate-fade-in" role="main" tabIndex="-1">
            {container ? (
              <div className={"max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full" + (contentClassName ? ` ${contentClassName}` : "")}>{children}</div>
            ) : (
              <div className="w-full">{children}</div>
            )}
          </main>
          <footer className="border-t bg-muted/30 mt-auto pt-8 pb-6 text-center text-sm text-muted-foreground/80">
            <p>Built with <span className="text-red-500 animate-pulse">❤️</span> at ToorInfotech</p>
            <p className="text-xs mt-1">© {new Date().getFullYear()} ChurnGuard AI. All rights reserved.</p>
          </footer>
        </SidebarInset>
      </SidebarProvider>
    </AuthGuard>
  );
}