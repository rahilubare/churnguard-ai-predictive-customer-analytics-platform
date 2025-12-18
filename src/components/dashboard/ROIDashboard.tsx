import React, { useState, useMemo } from "react";
import {
    TrendingUp,
    DollarSign,
    Target,
    LineChart,
    ArrowRight,
    HelpCircle,
    Lightbulb
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Slider } from "../ui/slider";
import { Badge } from "../ui/badge";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts";
import { cn } from "@/lib/utils";

export function ROIDashboard() {
    const [customers, setCustomers] = useState(10000);
    const [churnRate, setChurnRate] = useState(5.5);
    const [ltv, setLtv] = useState(1500);
    const [retentionTarget, setRetentionTarget] = useState(30);

    const PLATFORM_COST = 2990; // Pro Annual

    const metrics = useMemo(() => {
        const monthlyChurned = customers * (churnRate / 100);
        const monthlyLoss = monthlyChurned * ltv;
        const annualLoss = monthlyLoss * 12;

        const savedMonthly = monthlyChurned * (retentionTarget / 100);
        const savedAnnual = savedMonthly * 12 * ltv;
        const netSavings = savedAnnual - PLATFORM_COST;
        const roi = (netSavings / PLATFORM_COST) * 100;

        return {
            annualLoss,
            savedAnnual,
            netSavings,
            roi,
            monthlyChurned: Math.round(monthlyChurned),
            savedMonthly: Math.round(savedMonthly)
        };
    }, [customers, churnRate, ltv, retentionTarget]);

    const chartData = [
        { name: "Current Revenue Loss", value: metrics.annualLoss, fill: "hsl(var(--destructive))" },
        { name: "Projected Savings", value: metrics.savedAnnual, fill: "hsl(var(--primary))" }
    ];

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

    return (
        <Card className="border-2 shadow-premium overflow-hidden">
            <CardHeader className="bg-muted/30">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <DollarSign className="h-6 w-6 text-emerald-500" />
                        <CardTitle>Executive ROI Projection</CardTitle>
                    </div>
                    <Badge variant="outline" className="bg-background">Consultant Tool</Badge>
                </div>
                <CardDescription>
                    Quantify the financial impact of AI-powered churn reduction for your business.
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Controls */}
                    <div className="space-y-8">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-semibold flex items-center gap-2">
                                    <Target className="h-4 w-4 text-muted-foreground" /> Total Customers
                                </label>
                                <span className="text-sm font-mono font-bold bg-secondary px-2 py-0.5 rounded text-primary">
                                    {customers.toLocaleString()}
                                </span>
                            </div>
                            <Slider
                                value={[customers]}
                                onValueChange={([v]) => setCustomers(v)}
                                max={100000}
                                step={1000}
                                className="py-2"
                            />
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-semibold flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-muted-foreground" /> Monthly Churn Rate
                                </label>
                                <span className="text-sm font-mono font-bold bg-secondary px-2 py-0.5 rounded text-primary">
                                    {churnRate}%
                                </span>
                            </div>
                            <Slider
                                value={[churnRate]}
                                onValueChange={([v]) => setChurnRate(v)}
                                max={20}
                                step={0.1}
                                className="py-2"
                            />
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-semibold flex items-center gap-2">
                                    <DollarSign className="h-4 w-4 text-muted-foreground" /> Avg Customer LTV
                                </label>
                                <span className="text-sm font-mono font-bold bg-secondary px-2 py-0.5 rounded text-primary">
                                    {formatCurrency(ltv)}
                                </span>
                            </div>
                            <Slider
                                value={[ltv]}
                                onValueChange={([v]) => setLtv(v)}
                                max={10000}
                                step={100}
                                className="py-2"
                            />
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-semibold flex items-center gap-2">
                                    <LineChart className="h-4 w-4 text-muted-foreground" /> Target Retention Improvement
                                </label>
                                <span className="text-sm font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded text-emerald-600">
                                    {retentionTarget}% reduction
                                </span>
                            </div>
                            <Slider
                                value={[retentionTarget]}
                                onValueChange={([v]) => setRetentionTarget(v)}
                                max={50}
                                step={5}
                                className="py-2 cursor-pointer"
                            />
                        </div>
                    </div>

                    {/* Results Display */}
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/10">
                                <span className="text-xs font-semibold text-muted-foreground uppercase">Current Annual Loss</span>
                                <div className="text-xl font-bold text-destructive mt-1">{formatCurrency(metrics.annualLoss)}</div>
                            </div>
                            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                                <span className="text-xs font-semibold text-muted-foreground uppercase">Potential Savings</span>
                                <div className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(metrics.savedAnnual)}</div>
                            </div>
                        </div>

                        <div className="bg-primary/5 border border-primary/10 rounded-xl p-6 relative overflow-hidden">
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-2">
                                    <DollarSign className="h-5 w-5 text-primary" />
                                    <span className="font-bold text-primary">Projected Net ROI</span>
                                </div>
                                <div className="text-4xl font-black tracking-tight text-primary mb-1">
                                    {Math.round(metrics.roi).toLocaleString()}%
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Estimated return on investment based on a {retentionTarget}% reduction in churn.
                                </p>
                            </div>
                            <div className="absolute -right-8 -bottom-8 opacity-10">
                                <DollarSign size={120} />
                            </div>
                        </div>

                        <div className="h-48 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} layout="vertical" margin={{ left: -20 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="name" width={120} fontSize={10} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        formatter={(value: number) => formatCurrency(value)}
                                        cursor={{ fill: 'transparent' }}
                                    />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={32}>
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-dashed">
                    <div className="flex items-start gap-3 bg-muted/50 p-4 rounded-xl">
                        <Lightbulb className="h-6 w-6 text-emerald-500 shrink-0 mt-1" />
                        <div>
                            <h4 className="font-bold text-sm">Consultant Insight</h4>
                            <p className="text-sm text-foreground/80 leading-relaxed">
                                By saving just <span className="font-bold">{metrics.savedMonthly} customers</span> per month,
                                you can recover <span className="font-bold">{formatCurrency(metrics.savedAnnual)}</span> annually.
                                {metrics.roi > 500 ? " This project demonstrates an exceptional ROI, paying for itself in less than a month." : " This represents a solid business case for predictive retention automation."}
                            </p>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
