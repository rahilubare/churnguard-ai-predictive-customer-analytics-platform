import React from "react";
import { LayoutDashboard, Database, FlaskConical, BrainCircuit, Settings, LifeBuoy, LogOut, ExternalLink, ChevronRight } from "lucide-react";
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
import { useAppStore } from "@/store/app-store";
import { Card, CardContent } from "./ui/card";
const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, description: "Overview & ROI" },
  { href: "/data", label: "Data Studio", icon: Database, description: "Import & validate" },
  { href: "/training", label: "Model Lab", icon: FlaskConical, description: "Train & evaluate" },
  { href: "/predict", label: "Prediction Center", icon: BrainCircuit, description: "Score customers" },
];
export function AppSidebar(): JSX.Element {
  const location = useLocation();
  const user = useAuthStore(s => s.user);
  const org = useAuthStore(s => s.org);
  const logout = useAuthStore(s => s.logout);
  const dataset = useAppStore(s => s.dataset);
  const datasetStats = useAppStore(s => s.datasetStats);
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3 px-3 py-4 mb-2">
          <img src="/favicon.png?v=3" alt="ChurnGuard Logo" className="h-9 w-9 object-contain drop-shadow-md" />
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-foreground">
              ChurnGuard <span className="text-gradient-primary">AI</span>
            </span>
            <span className="text-xs text-muted-foreground -mt-1">Predictive Analytics</span>
          </div>
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
      <SidebarContent className="flex-grow px-2">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton 
                asChild 
                isActive={location.pathname === item.href}
                className="transition-all duration-200 hover:shadow-md rounded-lg mb-1 group"
              >
                <a href={item.href} className="flex flex-col gap-0.5 py-2">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      <item.icon className="h-5 w-5" /> 
                      <span className="font-medium">{item.label}</span>
                    </div>
                    {location.pathname === item.href && <ChevronRight className="h-4 w-4 text-primary" />}
                  </div>
                  <span className="text-xs text-muted-foreground ml-8 group-hover:text-foreground/70 transition-colors">{item.description}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      {/* Dataset Status Indicator */}
      {dataset && datasetStats && (
        <div className="px-3 py-2">
          <Card className="bg-emerald-500/5 border-emerald-500/20">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-medium text-emerald-600">Dataset loaded</span>
              </div>
              <div className="text-xs text-muted-foreground pl-4">
                {datasetStats.rowCount.toLocaleString()} rows • {datasetStats.featureCount} features
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      <SidebarFooter className="p-4 space-y-4 border-t bg-muted/30">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="hover:shadow-sm">
              <a href="#"><Settings className="h-5 w-5" /> <span className="font-medium">Settings</span></a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="hover:shadow-sm">
              <a href="#"><LifeBuoy className="h-5 w-5" /> <span className="font-medium">Support</span></a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <SidebarMenuButton className="hover:bg-destructive/10 hover:text-destructive transition-colors">
                <LogOut className="h-5 w-5" /> <span className="font-medium">Logout</span>
              </SidebarMenuButton>
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