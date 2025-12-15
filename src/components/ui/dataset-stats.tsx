import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ColumnStat } from "@shared/types";
import { ScrollArea } from "./scroll-area";
interface DatasetStatsProps {
  stats: Record<string, ColumnStat>;
}
export function DatasetStats({ stats }: DatasetStatsProps) {
  const headers = Object.keys(stats);
  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle>2. Dataset Statistics</CardTitle>
        <CardDescription>An overview of each column in your dataset.</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] w-full border rounded-md">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Column</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Total Rows</TableHead>
                <TableHead className="text-right">Missing</TableHead>
                <TableHead className="text-right">Unique Values</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TooltipProvider>
                {headers.map((header) => {
                  const stat = stats[header];
                  const missingPercentage = ((stat.missing / stat.total) * 100).toFixed(1);
                  return (
                    <Tooltip key={header}>
                      <TooltipTrigger asChild>
                        <TableRow>
                          <TableCell className="font-medium">{header}</TableCell>
                          <TableCell>
                            <Badge variant={stat.type === 'numerical' ? 'default' : 'secondary'}>
                              {stat.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{stat.total}</TableCell>
                          <TableCell className={`text-right ${stat.missing > 0 ? 'text-amber-600' : ''}`}>
                            {stat.missing} ({missingPercentage}%)
                          </TableCell>
                          <TableCell className="text-right">{stat.unique}</TableCell>
                        </TableRow>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Top values:</p>
                        <ul className="text-xs text-muted-foreground">
                          {Object.entries(stat.valueCounts)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 5)
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