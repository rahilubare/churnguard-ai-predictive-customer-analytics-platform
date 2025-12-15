import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ColumnStat } from "@shared/types";
import { ScrollArea } from "./scroll-area";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
interface DatasetStatsProps {
  stats: Record<string, ColumnStat>;
}
const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#F43F5E', '#6366F1'];
export function DatasetStats({ stats }: DatasetStatsProps) {
  const headers = Object.keys(stats);
  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle>2. Dataset Statistics</CardTitle>
        <CardDescription>An overview of each column in your dataset. Hover over rows for more details.</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] w-full border rounded-md">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>Column</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Missing</TableHead>
                <TableHead className="text-right">Unique Values</TableHead>
                <TableHead className="hidden md:table-cell">Distribution (Top 5)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TooltipProvider>
                {headers.map((header) => {
                  const stat = stats[header];
                  const missingPercentage = stat.total > 0 ? (stat.missing / stat.total) * 100 : 0;
                  const top5 = Object.entries(stat.valueCounts)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([name, value]) => ({ name, value }));
                  return (
                    <Tooltip key={header} delayDuration={100}>
                      <TooltipTrigger asChild>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="font-medium">{header}</TableCell>
                          <TableCell>
                            <Badge variant={stat.type === 'numerical' ? 'default' : 'secondary'} className="capitalize">
                              {stat.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={missingPercentage > 10 ? 'destructive' : 'outline'}>
                              {stat.missing} ({missingPercentage.toFixed(1)}%)
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{stat.unique}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            {stat.type === 'categorical' && top5.length > 0 ? (
                              <div className="w-24 h-12">
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie data={top5} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={20} stroke="hsl(var(--background))">
                                      {top5.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                    </Pie>
                                    <RechartsTooltip contentStyle={{
                                        background: "hsl(var(--popover))",
                                        borderColor: "hsl(var(--border))",
                                        color: "hsl(var(--popover-foreground))"
                                    }}/>
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            ) : stat.type === 'numerical' ? <span className="text-xs text-muted-foreground">N/A for numerical</span> : null}
                          </TableCell>
                        </TableRow>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-semibold">{header}</p>
                        <ul className="text-xs text-muted-foreground mt-1 max-h-48 overflow-y-auto">
                          {Object.entries(stat.valueCounts)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 10)
                            .map(([value, count]) => (
                              <li key={value} className="truncate">{value}: {count}</li>
                            ))}
                            {Object.keys(stat.valueCounts).length > 10 && <li>...and more</li>}
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}