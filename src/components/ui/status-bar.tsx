import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuthStore } from '@/store/auth-store';
import { api } from '@/lib/api-client';
import type { ModelArtifact } from '@shared/types';
import { Building, GitBranch, TrendingUp, BrainCircuit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Skeleton } from './skeleton';
const mockChurnData = [
  { value: 10 }, { value: 11 }, { value: 9 }, { value: 12 }, { value: 11.5 },
  { value: 13 }, { value: 12.8 }, { value: 12 }, { value: 12.2 }, { value: 12.5 }
];
export function StatusBar({ className }: { className?: string }) {
  const org = useAuthStore(s => s.org);
  const [latestModel, setLatestModel] = useState<ModelArtifact | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    const fetchLatestModel = async () => {
      try {
        const result = await api<{ items: ModelArtifact[] }>('/api/models');
        if (result.items && result.items.length > 0) {
          const sorted = result.items.sort((a, b) => b.createdAt - a.createdAt);
          setLatestModel(sorted[0]);
        }
      } catch (error) {
        console.warn("Could not fetch latest model for status bar:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLatestModel();
  }, []);
  const timeAgo = (timestamp: number) => {
    const seconds = Math.floor((new Date().getTime() - timestamp) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return Math.floor(seconds) + "s ago";
  };
  return (
    <Card className={cn("w-full p-2 shadow-sm backdrop-blur-lg bg-card/80", className)}>
      <div className="flex items-center justify-between gap-4 text-xs sm:text-sm">
        <div className="flex items-center gap-4 flex-shrink-0">
          {org ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              <img src="/favicon.png?v=3" alt="Logo" className="h-6 w-6 object-contain" />
              <span className="font-semibold truncate hidden md:inline">{org.name}</span>
              <Badge variant="secondary" className="capitalize text-[10px] h-4 px-1.5">{org.subTier}</Badge>
            </div>
          ) : <Skeleton className="h-6 w-32" />}
        </div>
        <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
          <div className="flex items-center gap-2 truncate">
            <BrainCircuit className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            {isLoading ? <Skeleton className="h-5 w-36" /> : latestModel ? (
              <div className="truncate">
                <span className="font-medium truncate">{latestModel.name}</span>
                <span className="text-muted-foreground ml-1 hidden sm:inline">({timeAgo(latestModel.createdAt)})</span>
              </div>
            ) : (
              <span className="text-muted-foreground">No Active Model</span>
            )}
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Churn Rate:</span>
            <Badge variant="destructive">12.5%</Badge>
            <div className="w-20 h-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockChurnData}>
                  <defs>
                    <linearGradient id="churnGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--destructive))" fill="url(#churnGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}