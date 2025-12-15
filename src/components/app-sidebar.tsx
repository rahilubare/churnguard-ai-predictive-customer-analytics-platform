import React from "react";
import { LayoutDashboard, Database, FlaskConical, BrainCircuit, Settings, LifeBuoy } from "lucide-react";
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
const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/data", label: "Data Studio", icon: Database },
  { href: "/training", label: "Model Lab", icon: FlaskConical },
  { href: "/predict", label: "Prediction Center", icon: BrainCircuit },
];
export function AppSidebar(): JSX.Element {
  const location = useLocation();
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
            <BrainCircuit className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight">ChurnGuard AI</span>
        </div>
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
        </SidebarMenu>
        <div className="flex items-center justify-between px-2">
            <div className="text-xs text-muted-foreground">
                <p>&copy; 2024 ChurnGuard AI</p>
            </div>
            <ThemeToggle className="relative top-0 right-0" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}