import React from "react";
import { LayoutDashboard, Database, FlaskConical, BrainCircuit, Settings, LifeBuoy, LogOut } from "lucide-react";
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
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
            <BrainCircuit className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight">ChurnGuard AI</span>
        </div>
        {org && (
          <div className="flex flex-col gap-1.5 px-2 pt-2 border-t mt-2">
            <div className="text-sm font-semibold text-foreground truncate">{org.name}</div>
            <Badge variant="secondary" className="w-fit text-xs">{org.subTier.toUpperCase()}</Badge>
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
            <SidebarMenuItem>
              <SidebarMenuButton onClick={logout}>
                <LogOut className="h-5 w-5" /> <span>Logout</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
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