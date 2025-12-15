import React, { useState, useMemo, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/store/app-store";
import { useTrainingStore } from "@/store/training-store";
import { FlaskConical, Info, Rocket, XCircle, Loader2 } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster, toast } from "@/components/ui/sonner";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trainChurnModel } from "@/lib/ml-engine";
import { motion } from "framer-motion";
export function ModelLabPage() {
  const dataset = useAppStore(s => s.dataset);
  const targetVariable = useTrainingStore(s => s.targetVariable);
  const selectedFeatures = useTrainingStore(s => s.selectedFeatures);
  const status = useTrainingStore(s => s.status);
  const progress = useTrainingStore(s => s.progress);
  const error = useTrainingStore(s => s.error);
  const metrics = useTrainingStore(s => s.metrics);
  const featureImportance = useTrainingStore(s => s.featureImportance);
  const setConfig = useTrainingStore(s => s.setConfig);
  const startTraining = useTrainingStore(s => s.startTraining);
  const setTrainingState = useTrainingStore(s => s.setTrainingState);
  const deployModel = useTrainingStore(s => s.deployModel);
  const [localTarget, setLocalTarget] = useState<string | undefined>(targetVariable || undefined);
  const [localFeatures, setLocalFeatures] = useState<string[]>(selectedFeatures);
  const [modelName, setModelName] = useState("");
  const [isDeployDialogOpen, setDeployDialogOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const navigate = useNavigate();
  const importanceData = useMemo(() => {
    if (!featureImportance) return [];
    return Object.entries(featureImportance)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => a.value - b.value);
  }, [featureImportance]);
  const metricsData = useMemo(() => {
    if (!metrics) return [];
    return [
      { name: 'Accuracy', value: metrics.accuracy },
      { name: 'Precision', value: metrics.precision },
      { name: 'Recall', value: metrics.recall },
      { name: 'F1 Score', value: metrics.f1 },
      { name: 'ROC AUC', value: metrics.rocAuc },
    ];
  }, [metrics]);
  const confusionMatrixData = useMemo(() => {
    if (!metrics) return [];
    const { truePositive, falseNegative, falsePositive, trueNegative } = metrics.confusionMatrix;
    return [
      { name: 'True Positive', value: truePositive },
      { name: 'False Negative', value: falseNegative },
      { name: 'False Positive', value: falsePositive },
      { name: 'True Negative', value: trueNegative },
    ];
  }, [metrics]);
  if (!dataset) {
    return <Navigate to="/data" replace />;
  }
  const handleFeatureToggle = (feature: string, checked: boolean) => {
    setLocalFeatures(prev => {
      if (checked) return [...prev, feature];
      return prev.filter(f => f !== feature);
    });
  };
  const potentialFeatures = dataset.headers.filter(h => h !== localTarget);
  const handleSelectAll = (checked: boolean) => {
    setLocalFeatures(checked ? potentialFeatures : []);
  };
  const handleTrainModel = async () => {
    if (!localTarget || localFeatures.length === 0) {
      toast.error("Configuration incomplete", { description: "Please select a target variable and at least one feature." });
      return;
    }
    setConfig(localTarget, localFeatures);
    startTraining();
    setIsTraining(true);
    try {
      setTrainingState({ status: 'preprocessing', progress: 10 });
      // Yield to the browser to update UI
      await new Promise(resolve => setTimeout(resolve, 50));
      const result = await trainChurnModel(dataset, localTarget, localFeatures);
      setTrainingState({ status: 'complete', progress: 100, ...result });
      toast.success("Training complete!");
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "An unknown error occurred during training.";
      setTrainingState({ status: 'error', error: errorMessage });
      toast.error("Training failed", { description: errorMessage });
    } finally {
      setIsTraining(false);
    }
  };
  const handleDeploy = async () => {
    if (!modelName.trim()) {
      toast.error("Model name is required.");
      return;
    }
    setIsDeploying(true);
    const deployed = await deployModel(modelName.trim());
    setIsDeploying(false);
    if (deployed) {
      toast.success(`Model "${deployed.name}" deployed successfully!`);
      setDeployDialogOpen(false);
      navigate('/predict');
    } else {
      toast.error("Failed to deploy model.");
    }
  };
  const allFeaturesSelected = potentialFeatures.length > 0 && localFeatures.length === potentialFeatures.length;
  const COLORS = ['#10B981', '#F43F5E', '#F59E0B', '#3B82F6'];
  return (
    <AppLayout container>
      <div className="py-8 md:py-10 lg:py-12">
        <div className="space-y-8 animate-fade-in">
          <header className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">Model Lab</h1>
            <p className="text-lg text-muted-foreground">Configure, train, and evaluate your churn prediction model.</p>
          </header>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle>1. Configure Model</CardTitle>
                  <CardDescription>Select the target variable and the features for training.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label htmlFor="target-variable">Target Variable (What to predict)</Label>
                    <Select onValueChange={setLocalTarget} value={localTarget} disabled={isTraining}>
                      <SelectTrigger id="target-variable"><SelectValue placeholder="Select a column..." /></SelectTrigger>
                      <SelectContent>
                        {dataset.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {localTarget && (
                    <div className="space-y-4">
                      <Label>Feature Variables (Inputs for prediction)</Label>
                      <div className="flex items-center space-x-2 border-b pb-2 mb-2">
                        <Checkbox id="select-all-features" checked={allFeaturesSelected} onCheckedChange={(c) => handleSelectAll(!!c)} disabled={isTraining} />
                        <Label htmlFor="select-all-features" className="font-medium">Select All Features</Label>
                      </div>
                      <ScrollArea className="h-64 border rounded-md p-4">
                        <div className="space-y-3">
                          {potentialFeatures.map(h => (
                            <div key={h} className="flex items-center space-x-2">
                              <Checkbox id={`feature-${h}`} checked={localFeatures.includes(h)} onCheckedChange={(c) => handleFeatureToggle(h, !!c)} disabled={isTraining} />
                              <Label htmlFor={`feature-${h}`} className="font-normal">{h}</Label>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="flex justify-end">
                <Button size="lg" onClick={handleTrainModel} disabled={!localTarget || localFeatures.length === 0 || isTraining}>
                  {isTraining ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Training...</> : <><FlaskConical className="mr-2 h-5 w-5" /> Train Model</>}
                </Button>
              </div>
              {isTraining && (
                <Card>
                  <CardHeader><CardTitle>Training Progress</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <Progress value={progress} className="w-full" />
                    <p className="text-center text-muted-foreground capitalize">{status}...</p>
                  </CardContent>
                </Card>
              )}
              {error && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Training Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {status === 'complete' && metrics ? (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>2. Evaluation Results</CardTitle>
                        <CardDescription>Model performance on the test dataset.</CardDescription>
                      </div>
                      <Dialog open={isDeployDialogOpen} onOpenChange={setDeployDialogOpen}>
                        <DialogTrigger asChild>
                          <Button><Rocket className="mr-2 h-4 w-4" /> Deploy Model</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Deploy Model</DialogTitle>
                            <DialogDescription>Give your new model a name for easy identification.</DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <Label htmlFor="model-name">Model Name</Label>
                            <Input id="model-name" value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="e.g., Q2 High-Value Customers Model" />
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setDeployDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleDeploy} disabled={isDeploying}>
                              {isDeploying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deploying...</> : 'Deploy'}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </CardHeader>
                    <CardContent className="grid gap-8 pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <h3 className="font-semibold">Performance Metrics</h3>
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={metricsData} layout="vertical" margin={{ left: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis type="number" domain={[0, 1]} />
                              <YAxis type="category" dataKey="name" width={80} />
                              <Tooltip />
                              <Bar dataKey="value" fill="hsl(var(--primary))" barSize={20} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="space-y-4">
                          <h3 className="font-semibold">Confusion Matrix</h3>
                          <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                              <Pie data={confusionMatrixData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                                {confusionMatrixData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                              </Pie>
                              <Tooltip />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold mb-4">Feature Importance</h3>
                        {importanceData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={400}>
                            <BarChart data={importanceData} layout="vertical" margin={{ left: 30 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis type="number" />
                              <YAxis type="category" dataKey="name" width={120} />
                              <Tooltip />
                              <Bar dataKey="value" fill="hsl(var(--primary))" />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : <Skeleton className="w-full h-[400px]" />}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : isTraining && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Skeleton className="h-[350px]" />
                    <Skeleton className="h-[350px]" />
                    <div className="md:col-span-2"><Skeleton className="h-[400px]" /></div>
                </div>
              )}
            </div>
            <div className="lg:col-span-1">
              <Card className="sticky top-24">
                <CardHeader><CardTitle>Configuration Summary</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Target:</span><span className="font-medium">{localTarget || 'Not set'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Features:</span><span className="font-medium">{localFeatures.length} selected</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Algorithm:</span><span className="font-medium">Random Forest</span></div>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Next Step</AlertTitle>
                    <AlertDescription>Once configured, click "Train Model" to start. Results will appear below.</AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
      <Toaster richColors />
    </AppLayout>
  );
}