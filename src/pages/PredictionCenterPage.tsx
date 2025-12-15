import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import type { ModelArtifact, PredictionResult, PredictionBatchResult } from "@shared/types";
import { Loader2, BrainCircuit, BarChartHorizontal } from "lucide-react";
import { Toaster, toast } from "@/components/ui/sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { FileUpload } from "@/components/ui/file-upload";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseCsv } from "@/lib/data-processor";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      const result = await api<PredictionBatchResult>('/api/batch-predict', {
        method: 'POST',
        body: JSON.stringify({ modelId: selectedModel.id, customers: parsed.rows }),
      });
      setBatchResults(result.predictions);
      toast.success(`Successfully processed ${result.total} customers.`);
    } catch (error) {
      toast.error("Batch prediction failed", { description: error instanceof Error ? error.message : "An unknown error occurred." });
    } finally {
      setIsBatchProcessing(false);
    }
  };
  const churnProbabilityPercent = prediction ? (prediction.churnProbability * 100).toFixed(2) : 0;
  const featureContributionData = prediction
    ? Object.entries(prediction.featureContributions)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => Math.abs(a.value) - Math.abs(b.value))
    : [];
  return (
    <AppLayout container>
      <div className="py-8 md:py-10 lg:py-12">
        <div className="space-y-8 animate-fade-in">
          <header className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">Prediction Center</h1>
            <p className="text-lg text-muted-foreground">Use your deployed models to predict customer churn in real-time.</p>
          </header>
          <Card>
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
              <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="single">Single Prediction</TabsTrigger><TabsTrigger value="batch">Batch Prediction</TabsTrigger></TabsList>
              <TabsContent value="single">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
                  <Card>
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
                  <Card>
                    <CardHeader><CardTitle>3. Prediction Result</CardTitle><CardDescription>The model's prediction and feature insights.</CardDescription></CardHeader>
                    <CardContent className="flex flex-col items-center justify-center min-h-[500px] space-y-4">
                      {isPredicting ? <Loader2 className="h-12 w-12 animate-spin text-primary" /> : prediction ? (
                        <motion.div className="w-full space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          <div className="text-center">
                            <p className="text-muted-foreground">Churn Probability</p>
                            <p className={`text-6xl font-bold ${prediction.prediction === 1 ? 'text-destructive' : 'text-emerald-500'}`}>{churnProbabilityPercent}%</p>
                            <Badge variant={prediction.prediction === 1 ? 'destructive' : 'default'} className={prediction.prediction === 0 ? "bg-emerald-500" : ""}>{prediction.prediction === 1 ? 'Likely to Churn' : 'Unlikely to Churn'}</Badge>
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
                <Card className="mt-6">
                  <CardHeader><CardTitle>Batch Prediction</CardTitle><CardDescription>Upload a CSV of customers to predict churn in bulk.</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="mx-auto max-w-md"><FileUpload onFileSelect={setBatchFile} /></div>
                    <Button onClick={handleBatchProcess} disabled={!batchFile || isBatchProcessing}>{isBatchProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : 'Process Batch File'}</Button>
                    {batchResults && (
                      <motion.div className="mt-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <h3 className="font-semibold mb-2">Batch Results</h3>
                        <ScrollArea className="h-[400px] border rounded-md">
                          <Table>
                            <TableHeader><TableRow><TableHead>Customer #</TableHead><TableHead>Churn Probability</TableHead><TableHead>Prediction</TableHead></TableRow></TableHeader>
                            <TableBody>
                              {batchResults.map((res, i) => (
                                <TableRow key={i}>
                                  <TableCell>{i + 1}</TableCell>
                                  <TableCell>{(res.churnProbability * 100).toFixed(2)}%</TableCell>
                                  <TableCell><Badge variant={res.prediction === 1 ? 'destructive' : 'default'} className={res.prediction === 0 ? "bg-emerald-500" : ""}>{res.prediction === 1 ? 'Churn' : 'No Churn'}</Badge></TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </motion.div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
      <Toaster richColors />
    </AppLayout>
  );
}