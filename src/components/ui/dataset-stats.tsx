import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ColumnStat } from "@shared/types";
import { ScrollArea } from "./scroll-area";
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
interface DatasetStatsProps {
  stats: Record<string, ColumnStat>;
}
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];
export function DatasetStats({ stats }: DatasetStatsProps) {
  const headers = Object.keys(stats);
  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle>2. Dataset Statistics</CardTitle>
        <CardDescription>An overview of each column in your dataset.</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] w-full border rounded-md">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Column</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Missing</TableHead>
                <TableHead className="text-right">Unique</TableHead>
                <TableHead className="hidden md:table-cell">Distribution (Top 5)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TooltipProvider>
                {headers.map((header) => {
                  const stat = stats[header];
                  const missingPercentage = (stat.missing / stat.total) * 100;
                  const top5 = Object.entries(stat.valueCounts)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([name, value]) => ({ name, value }));
                  return (
                    <Tooltip key={header} delayDuration={100}>
                      <TooltipTrigger asChild>
                        <TableRow>
                          <TableCell className="font-medium">{header}</TableCell>
                          <TableCell>
                            <Badge variant={stat.type === 'numerical' ? 'default' : 'secondary'}>
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
                            {stat.type === 'categorical' && top5.length > 0 && (
                              <div className="w-24 h-12">
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie data={top5} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={20}>
                                      {top5.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                    </Pie>
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-semibold">{header}</p>
                        <ul className="text-xs text-muted-foreground mt-1">
                          {Object.entries(stat.valueCounts)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 10)
                            .map(([value, count]) => (
                              <li key={value}>{value}: {count}</li>
                            ))}
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