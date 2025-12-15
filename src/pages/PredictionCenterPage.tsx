import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import type { ModelArtifact, PredictionResult } from "@shared/types";
import { Loader2, BrainCircuit, BarChartHorizontal } from "lucide-react";
import { Toaster, toast } from "@/components/ui/sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
export function PredictionCenterPage() {
  const [models, setModels] = useState<ModelArtifact[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelArtifact | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isPredicting, setIsPredicting] = useState(false);
  const [formData, setFormData] = useState<Record<string, string | number>>({});
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const result = await api<{ items: ModelArtifact[] }>('/api/models');
        setModels(result.items);
        if (result.items.length > 0) {
          handleModelChange(result.items[0].id, result.items);
        }
      } catch (error) {
        toast.error("Failed to fetch models.");
        console.error(error);
      } finally {
        setIsLoadingModels(false);
      }
    };
    fetchModels();
  }, []);
  const handleModelChange = (modelId: string, modelList = models) => {
    const model = modelList.find(m => m.id === modelId);
    if (model) {
      setSelectedModel(model);
      const initialForm: Record<string, string | number> = {};
      model.features.forEach(feature => {
        initialForm[feature] = '';
      });
      setFormData(initialForm);
      setPrediction(null);
    }
  };
  const handleInputChange = (feature: string, value: string) => {
    setFormData(prev => ({ ...prev, [feature]: value }));
  };
  const handlePredict = async () => {
    if (!selectedModel) return;
    setIsPredicting(true);
    setPrediction(null);
    try {
      // Convert form string values to numbers where appropriate
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
  const churnProbabilityPercent = prediction ? (prediction.churnProbability * 100).toFixed(2) : 0;
  const featureContributionData = prediction
    ? Object.entries(prediction.featureContributions)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => Math.abs(a.value) - Math.abs(b.value))
    : [];
  return (
    <AppLayout container>
      <div className="space-y-8 animate-fade-in">
        <header className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Prediction Center</h1>
          <p className="text-lg text-muted-foreground">
            Use your deployed models to predict customer churn in real-time.
          </p>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>1. Select a Deployed Model</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingModels ? (
              <Skeleton className="h-10 w-full" />
            ) : models.length > 0 ? (
              <Select onValueChange={handleModelChange} defaultValue={selectedModel?.id}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a model..." />
                </SelectTrigger>
                <SelectContent>
                  {models.map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name} (Trained: {new Date(model.createdAt).toLocaleDateString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Alert>
                <BrainCircuit className="h-4 w-4" />
                <AlertTitle>No Models Found</AlertTitle>
                <AlertDescription>
                  You haven't deployed any models yet. Go to the Model Lab to train and deploy your first model.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
        {selectedModel && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle>2. Enter Customer Data</CardTitle>
                <CardDescription>Fill in the features for the customer you want to score.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-4">
                    {selectedModel.features.map(feature => (
                      <div key={feature}>
                        <Label htmlFor={feature}>{feature}</Label>
                        <Input
                          id={feature}
                          value={formData[feature]}
                          onChange={(e) => handleInputChange(feature, e.target.value)}
                          placeholder={`Enter value for ${feature}`}
                        />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <Button onClick={handlePredict} disabled={isPredicting} className="w-full">
                  {isPredicting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Predicting...</> : 'Predict Churn'}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>3. Prediction Result</CardTitle>
                <CardDescription>The model's prediction and feature insights.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center h-full space-y-4">
                {isPredicting ? (
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                ) : prediction ? (
                  <div className="w-full space-y-6">
                    <div className="text-center">
                      <p className="text-muted-foreground">Churn Probability</p>
                      <p className={`text-6xl font-bold ${prediction.prediction === 1 ? 'text-destructive' : 'text-emerald-500'}`}>
                        {churnProbabilityPercent}%
                      </p>
                      <p className={`font-semibold ${prediction.prediction === 1 ? 'text-destructive' : 'text-emerald-500'}`}>
                        {prediction.prediction === 1 ? 'Likely to Churn' : 'Unlikely to Churn'}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2 text-center">Feature Contributions</h4>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={featureContributionData} layout="vertical" margin={{ left: 30 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis type="category" dataKey="name" width={100} />
                          <Tooltip />
                          <Bar dataKey="value" fill="hsl(var(--primary))" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">
                    <BarChartHorizontal className="h-12 w-12 mx-auto mb-4" />
                    <p>Prediction results will appear here.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      <Toaster richColors />
    </AppLayout>
  );
}