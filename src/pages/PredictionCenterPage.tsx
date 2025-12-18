import { useState, useEffect, useCallback, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import type { ModelArtifact, PredictionResult, PredictionBatchResult } from "@shared/types";
import { Loader2, BrainCircuit, BarChartHorizontal, AlertCircle, ArrowRight } from "lucide-react";
import { Toaster, toast } from "@/components/ui/sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { FileUpload } from "@/components/ui/file-upload";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseCsv } from "@/lib/data-processor";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ScenarioPlanner } from "@/components/prediction/ScenarioPlanner";
export function PredictionCenterPage() {
  const [models, setModels] = useState<ModelArtifact[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelArtifact | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isPredicting, setIsPredicting] = useState(false);
  const [formData, setFormData] = useState<Record<string, string | number>>({});
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [batchResults, setBatchResults] = useState<PredictionResult[] | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const handleModelChange = useCallback((modelId: string, modelList: ModelArtifact[]) => {
    const model = modelList.find(m => m.id === modelId);
    if (model) {
      setSelectedModel(model);
      const initialForm: Record<string, string | number> = {};
      model.features.forEach(feature => { initialForm[feature] = ''; });
      setFormData(initialForm);
      setPrediction(null);
      setBatchFile(null);
      setBatchResults(null);
    }
  }, []);
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const result = await api<{ items: ModelArtifact[] }>('/api/models');
        const sortedModels = result.items.sort((a, b) => b.createdAt - a.createdAt);
        setModels(sortedModels);
        if (sortedModels.length > 0) {
          handleModelChange(sortedModels[0].id, sortedModels);
        }
      } catch (error) {
        toast.error("Failed to fetch models.");
        console.error(error);
      } finally {
        setIsLoadingModels(false);
      }
    };
    fetchModels();
  }, [handleModelChange]);
  const handleInputChange = (feature: string, value: string) => {
    setFormData(prev => ({ ...prev, [feature]: value }));
  };
  const handlePredict = async () => {
    if (!selectedModel) return;
    setIsPredicting(true);
    setPrediction(null);
    try {
      const customerData: Record<string, string | number> = {};
      for (const key in formData) {
        const value = formData[key];
        const numValue = Number(value);
        customerData[key] = isNaN(numValue) || value === '' ? value : numValue;
      }
      const result = await api<PredictionResult>('/api/predict', {
        method: 'POST',
        body: JSON.stringify({ modelId: selectedModel.id, customer: customerData }),
      });
      setPrediction(result);
    } catch (error) {
      toast.error("Prediction failed", { description: error instanceof Error ? error.message : "An unknown error occurred." });
    } finally {
      setIsPredicting(false);
    }
  };
  const handleBatchProcess = async () => {
    if (!batchFile || !selectedModel) return;
    setIsBatchProcessing(true);
    setBatchResults(null);
    try {
      const parsed = await parseCsv(batchFile);
      const BATCH_SIZE = 100;
      const totalRows = parsed.rows.length;
      let allPredictions: PredictionResult[] = [];

      // Process in chunks
      for (let i = 0; i < totalRows; i += BATCH_SIZE) {
        const chunk = parsed.rows.slice(i, i + BATCH_SIZE);
        const result = await api<PredictionBatchResult>('/api/batch-predict', {
          method: 'POST',
          body: JSON.stringify({ modelId: selectedModel.id, customers: chunk }),
        });
        if (result && result.predictions) {
          allPredictions = [...allPredictions, ...result.predictions];
        }
      }

      setBatchResults(allPredictions);
      toast.success(`Successfully processed ${allPredictions.length} customers.`);
    } catch (error) {
      toast.error("Batch prediction failed", { description: error instanceof Error ? error.message : "An unknown error occurred." });
    } finally {
      setIsBatchProcessing(false);
    }
  };
  const churnProbabilityPercent = prediction ? (prediction.churnProbability * 100) : 0;
  const featureContributionData = prediction
    ? Object.entries(prediction.featureContributions)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => Math.abs(a.value) - Math.abs(b.value))
    : [];
  const batchSummary = useMemo(() => {
    if (!batchResults) return null;
    const churnCount = batchResults.filter(r => r.prediction === 1).length;
    const total = batchResults.length;
    return {
      churnCount,
      noChurnCount: total - churnCount,
      churnRate: total > 0 ? (churnCount / total) * 100 : 0,
      total,
    };
  }, [batchResults]);
  const getRiskBadge = (prob: number) => {
    if (prob > 0.75) return <Badge variant="destructive">High Risk</Badge>;
    if (prob > 0.5) return <Badge variant="secondary" className="bg-orange-500 text-white">Medium Risk</Badge>;
    return <Badge className="bg-emerald-500 text-white">Low Risk</Badge>;
  };
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 lg:py-12">
        <div className="space-y-8 animate-fade-in">
          <header className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">Score Customers</h1>
            <p className="text-lg text-muted-foreground">Run single or batch predictions and perform risk analysis.</p>
          </header>

          {/* Privacy & Model Drift Alerts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Alert className="bg-primary/5 border-primary/20">
              <AlertCircle className="h-4 w-4 text-primary" />
              <AlertTitle>Privacy Note</AlertTitle>
              <AlertDescription>
                Predictions are processed securely. Ensure your input data is **anonymized** (no names/emails).
              </AlertDescription>
            </Alert>
            {selectedModel && (Date.now() - selectedModel.createdAt > 30 * 24 * 60 * 60 * 1000) && (
              <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Model Drift Warning</AlertTitle>
                <AlertDescription>
                  This model is over 30 days old. Accuracy may have decreased. Consider **retraining** for best results.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <Card className="hover:shadow-lg transition-shadow duration-200">
            <CardHeader><CardTitle>1. Select a Deployed Model</CardTitle></CardHeader>
            <CardContent>
              {isLoadingModels ? <Skeleton className="h-10 w-full" /> : models.length > 0 ? (
                <Select onValueChange={(val) => handleModelChange(val, models)} value={selectedModel?.id}>
                  <SelectTrigger><SelectValue placeholder="Select a model..." /></SelectTrigger>
                  <SelectContent>
                    {models.map(model => (
                      <SelectItem key={model.id} value={model.id}>{model.name} (Trained: {new Date(model.createdAt).toLocaleDateString()})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Alert>
                  <BrainCircuit className="h-4 w-4" />
                  <AlertTitle>No Models Found</AlertTitle>
                  <AlertDescription>You haven't deployed any models yet. Go to the Model Lab to train and deploy your first model.</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
          {selectedModel && (
            <Tabs defaultValue="single">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="single">Single Prediction</TabsTrigger>
                <TabsTrigger value="batch">Batch Prediction</TabsTrigger>
                <TabsTrigger value="scenario">Scenario Planner</TabsTrigger>
              </TabsList>
              <TabsContent value="single">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
                  <Card className="hover:shadow-lg transition-shadow duration-200">
                    <CardHeader><CardTitle>2. Enter Customer Data</CardTitle><CardDescription>Fill in the features for the customer you want to score.</CardDescription></CardHeader>
                    <CardContent className="space-y-4">
                      <ScrollArea className="h-[400px] pr-4">
                        <div className="space-y-4">
                          {selectedModel.features.map(feature => (
                            <div key={feature}><Label htmlFor={feature}>{feature}</Label><Input id={feature} value={formData[feature]} onChange={(e) => handleInputChange(feature, e.target.value)} placeholder={`Enter value for ${feature}`} /></div>
                          ))}
                        </div>
                      </ScrollArea>
                      <Button onClick={handlePredict} disabled={isPredicting} className="w-full">{isPredicting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Predicting...</> : 'Predict Churn'}</Button>
                    </CardContent>
                  </Card>
                  <Card className="hover:shadow-lg transition-shadow duration-200">
                    <CardHeader><CardTitle>3. Prediction Result</CardTitle><CardDescription>The model's prediction and feature insights.</CardDescription></CardHeader>
                    <CardContent className="flex flex-col items-center justify-center min-h-[500px] space-y-4">
                      {isPredicting ? <Loader2 className="h-12 w-12 animate-spin text-primary" /> : prediction ? (
                        <motion.div className="w-full space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          <div className="text-center">
                            <p className="text-muted-foreground">Churn Probability</p>
                            <p className={cn("text-6xl font-bold", churnProbabilityPercent > 75 ? 'text-destructive' : churnProbabilityPercent > 50 ? 'text-orange-500' : 'text-emerald-500')}>{churnProbabilityPercent.toFixed(1)}%</p>
                            {getRiskBadge(prediction.churnProbability)}
                          </div>
                          <div>
                            <h4 className="font-semibold mb-2 text-center">Feature Contributions</h4>
                            <ResponsiveContainer width="100%" height={250}>
                              <BarChart data={featureContributionData} layout="vertical" margin={{ left: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" />
                                <YAxis type="category" dataKey="name" width={100} />
                                <Tooltip />
                                <Bar dataKey="value">{featureContributionData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.value > 0 ? 'hsl(var(--destructive))' : '#10B981'} />))}</Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </motion.div>
                      ) : (
                        <div className="text-center text-muted-foreground"><BarChartHorizontal className="h-12 w-12 mx-auto mb-4" /><p>Prediction results will appear here.</p></div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
              <TabsContent value="batch">
                <Card className="mt-6 hover:shadow-lg transition-shadow duration-200">
                  <CardHeader><CardTitle>Batch Prediction</CardTitle><CardDescription>Upload a CSV of customers to predict churn in bulk.</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="mx-auto max-w-md"><FileUpload onFileSelect={setBatchFile} /></div>
                    <Button onClick={handleBatchProcess} disabled={!batchFile || isBatchProcessing}>{isBatchProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : 'Process Batch File'}</Button>
                    {isBatchProcessing && (
                      <div className="space-y-2 mt-4">
                        <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" />
                      </div>
                    )}
                    {batchResults && batchSummary && (
                      <motion.div className="mt-6 grid gap-6 lg:grid-cols-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <Card>
                          <CardHeader><CardTitle>Batch Summary</CardTitle></CardHeader>
                          <CardContent>
                            <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie data={[{ name: 'Churn', value: batchSummary.churnCount }, { name: 'No Churn', value: batchSummary.noChurnCount }]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                                    <Cell fill="#F43F5E" /><Cell fill="#10B981" />
                                  </Pie>
                                  <Tooltip />
                                  <Legend />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <Alert variant="destructive" className="mt-4">
                              <AlertCircle className="h-4 w-4" />
                              <AlertTitle>High-Risk Customers Identified</AlertTitle>
                              <AlertDescription>{batchSummary.churnCount} out of {batchSummary.total} customers are predicted to churn ({batchSummary.churnRate.toFixed(1)}%).</AlertDescription>
                            </Alert>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader><CardTitle>Detailed Results</CardTitle></CardHeader>
                          <CardContent>
                            <ScrollArea className="h-[400px] border rounded-md">
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader><TableRow><TableHead>Customer #</TableHead><TableHead>Churn Probability</TableHead><TableHead>Risk Level</TableHead></TableRow></TableHeader>
                                  <TableBody>
                                    {batchResults.map((res, i) => (
                                      <TableRow key={i} className="hover:bg-accent">
                                        <TableCell>{i + 1}</TableCell>
                                        <TableCell>{(res.churnProbability * 100).toFixed(1)}%</TableCell>
                                        <TableCell>{getRiskBadge(res.churnProbability)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </ScrollArea>
                          </CardContent>
                        </Card>
                        <div className="lg:col-span-2 flex justify-end">
                          <Button className="hover:shadow-glow hover:scale-105 transition-all">View Insights <ArrowRight className="ml-2 h-4 w-4" /></Button>
                        </div>
                      </motion.div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="scenario">
                <div className="mt-6">
                  <ScenarioPlanner selectedModel={selectedModel} />
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
      <Toaster richColors />
    </AppLayout>
  );
}