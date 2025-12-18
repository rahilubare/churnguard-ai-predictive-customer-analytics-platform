import React from "react";
import { LayoutDashboard, Database, FlaskConical, BrainCircuit, Settings, LifeBuoy, LogOut, ExternalLink } from "lucide-react";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { useAuthStore } from "@/store/auth-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "./ui/button";
const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/data", label: "Data Studio", icon: Database },
  { href: "/training", label: "Model Lab", icon: FlaskConical },
  { href: "/predict", label: "Prediction Center", icon: BrainCircuit },
];
export function AppSidebar(): JSX.Element {
  const location = useLocation();
  const user = useAuthStore(s => s.user);
  const org = useAuthStore(s => s.org);
  const logout = useAuthStore(s => s.logout);
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3 px-3 py-4">
          <img src="/favicon.png?v=2" alt="ChurnGuard Logo" className="h-8 w-8 object-contain" />
          <span className="text-lg font-bold tracking-tight text-foreground">
            ChurnGuard <span className="text-emerald-500">AI</span>
          </span>
        </div>
        {org && (
          <div className="flex flex-col gap-1.5 px-2 pt-2 border-t mt-2">
            <div className="text-sm font-semibold text-foreground truncate">{org.name}</div>
            <Badge variant="secondary" className={`w-fit text-xs ${org.subTier === 'free' ? 'animate-pulse' : ''}`}>{org.subTier.toUpperCase()}</Badge>
            {org.subTier === 'free' && (
              <Button variant="link" size="sm" className="h-auto p-0 justify-start text-xs text-primary">
                Upgrade Plan <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </SidebarHeader>
      <SidebarContent className="flex-grow">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={location.pathname === item.href}>
                <a href={item.href}>
                  <item.icon className="h-5 w-5" /> <span>{item.label}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href="#"><Settings className="h-5 w-5" /> <span>Settings</span></a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href="#"><LifeBuoy className="h-5 w-5" /> <span>Support</span></a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <SidebarMenuButton><LogOut className="h-5 w-5" /> <span>Logout</span></SidebarMenuButton>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will be returned to the login page and your current session will be terminated.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={logout}>Log Out</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SidebarMenu>
        <div className="flex items-center justify-between px-2">
          {user && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground overflow-hidden">
              <Avatar className="h-7 w-7">
                <AvatarFallback>{user.email[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="truncate">{user.email}</span>
            </div>
          )}
          <ThemeToggle className="relative top-0 right-0" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}