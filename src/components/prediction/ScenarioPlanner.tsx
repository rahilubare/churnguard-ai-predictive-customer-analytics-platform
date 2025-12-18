import React, { useState, useMemo, useEffect } from "react";
import {
    Zap,
    BarChart3,
    ArrowRight,
    TrendingDown,
    Info,
    Play,
    Loader2
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Slider } from "../ui/slider";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    Legend
} from "recharts";
import { useAppStore } from "@/store/app-store";
import type { ModelArtifact, PredictionResult } from "@shared/types";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface ScenarioPlannerProps {
    selectedModel: ModelArtifact;
}

export function ScenarioPlanner({ selectedModel }: ScenarioPlannerProps) {
    const dataset = useAppStore(s => s.dataset);
    const [perturbation, setPerturbation] = useState<Record<string, number>>({});
    const [isRunning, setIsRunning] = useState(false);
    const [results, setResults] = useState<{ baseline: number; scenario: number } | null>(null);

    // Initialize perturbations for numerical features
    useEffect(() => {
        const initial: Record<string, number> = {};
        selectedModel.features.forEach(f => {
            initial[f] = 0; // percentage change
        });
        setPerturbation(initial);
        setResults(null);
    }, [selectedModel]);

    const handleRunScenario = async () => {
        if (!dataset) return;
        setIsRunning(true);

        try {
            // For this implementation, we use the API to run the batch prediction
            // because the model might be too large for local deserialization without more setup.
            // We'll run the baseline first, then the perturbed version.

            const BATCH_SIZE = 100;
            const sampleRows = dataset.rows.slice(0, 500); // Sample for speed in scenario planning

            // 1. Get Baseline
            const baselineResponse = await api<{ predictions: PredictionResult[] }>('/api/batch-predict', {
                method: 'POST',
                body: JSON.stringify({ modelId: selectedModel.id, customers: sampleRows }),
            });

            // 2. Apply Perturbations and Run Scenario
            const perturbedRows = sampleRows.map(row => {
                const newRow = { ...row };
                Object.entries(perturbation).forEach(([feature, change]) => {
                    if (change !== 0 && typeof newRow[feature] === 'number') {
                        newRow[feature] = newRow[feature] * (1 + change / 100);
                    }
                });
                return newRow;
            });

            const scenarioResponse = await api<{ predictions: PredictionResult[] }>('/api/batch-predict', {
                method: 'POST',
                body: JSON.stringify({ modelId: selectedModel.id, customers: perturbedRows }),
            });

            const baselineChurn = (baselineResponse.predictions.filter(p => p.prediction === 1).length / sampleRows.length) * 100;
            const scenarioChurn = (scenarioResponse.predictions.filter(p => p.prediction === 1).length / sampleRows.length) * 100;

            setResults({ baseline: baselineChurn, scenario: scenarioChurn });
        } catch (error) {
            console.error("Scenario simulation failed", error);
        } finally {
            setIsRunning(false);
        }
    };

    const chartData = results ? [
        { name: "Current State", churn: results.baseline, fill: "hsl(var(--muted-foreground))" },
        { name: "Simulated Scenario", churn: results.scenario, fill: results.scenario < results.baseline ? "hsl(var(--primary))" : "hsl(var(--destructive))" }
    ] : [];

    const topFeatures = useMemo(() => {
        if (!selectedModel.featureImportance) return [];
        return Object.entries(selectedModel.featureImportance)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([name]) => name);
    }, [selectedModel]);

    return (
        <Card className="border-2 shadow-premium">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Zap className="h-6 w-6 text-emerald-500" />
                        <CardTitle>Scenario Planner & Simulation</CardTitle>
                    </div>
                    <Badge variant="secondary">Consulting Feature</Badge>
                </div>
                <CardDescription>
                    Simulate business changes to predict their impact on churn rate. (Uses {dataset?.rows.slice(0, 500).length || 0} sample customers)
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div className="bg-muted/30 p-4 rounded-xl space-y-4">
                            <h4 className="text-sm font-bold flex items-center gap-2">
                                <BarChart3 className="h-4 w-4" /> Perturb Variables (% Change)
                            </h4>
                            <p className="text-xs text-muted-foreground">Adjust high-impact numerical features to see how it affects overall churn.</p>

                            <div className="space-y-6 pt-2">
                                {topFeatures.map(feature => (
                                    <div key={feature} className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <label className="text-xs font-semibold truncate max-w-[150px]">{feature}</label>
                                            <span className={cn(
                                                "text-xs font-mono font-bold px-2 py-0.5 rounded",
                                                perturbation[feature] > 0 ? "text-emerald-600 bg-emerald-100" :
                                                    perturbation[feature] < 0 ? "text-destructive bg-destructive/10" : "bg-secondary"
                                            )}>
                                                {perturbation[feature]}%
                                            </span>
                                        </div>
                                        <Slider
                                            value={[perturbation[feature]]}
                                            onValueChange={([v]) => setPerturbation(prev => ({ ...prev, [feature]: v }))}
                                            min={-50}
                                            max={50}
                                            step={5}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <Button
                            onClick={handleRunScenario}
                            className="w-full h-12 shadow-glow hover:scale-[1.02] transition-all"
                            disabled={isRunning || !dataset}
                        >
                            {isRunning ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running Simulation...</>
                            ) : (
                                <><Play className="mr-2 h-4 w-4 fill-current" /> Run Simulation Scenario</>
                            )}
                        </Button>
                    </div>

                    <div className="flex flex-col justify-center min-h-[300px]">
                        {results ? (
                            <div className="space-y-6 animate-fade-in">
                                <div className="text-center">
                                    <div className="flex items-center justify-center gap-2 mb-1">
                                        <TrendingDown className={cn("h-5 w-5", results.scenario < results.baseline ? "text-emerald-500" : "text-muted-foreground")} />
                                        <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Impact on Churn Rate</span>
                                    </div>
                                    <div className="flex items-baseline justify-center gap-2">
                                        <span className="text-5xl font-black">{results.scenario.toFixed(1)}%</span>
                                        <span className="text-muted-foreground line-through">from {results.baseline.toFixed(1)}%</span>
                                    </div>
                                    {results.scenario < results.baseline && (
                                        <p className="text-emerald-500 font-bold mt-2 flex items-center justify-center gap-1">
                                            -{Math.abs(((results.baseline - results.scenario) / results.baseline) * 100).toFixed(0)}% Relative Improvement
                                        </p>
                                    )}
                                </div>

                                <div className="h-56 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                                            <YAxis unit="%" fontSize={10} axisLine={false} tickLine={false} />
                                            <Tooltip
                                                formatter={(val: number) => [`${val.toFixed(2)}% Churn Rate`, "Metric"]}
                                            />
                                            <Bar dataKey="churn" barSize={60} radius={[4, 4, 0, 0]}>
                                                {chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-muted-foreground bg-muted/20 border-2 border-dashed rounded-xl h-full p-8 text-center">
                                <Info className="h-10 w-10 mb-4 opacity-50" />
                                <p className="text-sm">Select perturbations on the left and click "Run Simulation" to see the impact on your client's churn rate.</p>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
