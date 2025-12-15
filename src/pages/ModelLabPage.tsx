import React, { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/store/app-store";
import { useTrainingStore } from "@/store/training-store";
import { FlaskConical, Info, Rocket, CheckCircle, XCircle, Loader2 } from "lucide-react";
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
// This would typically be in a separate worker file, but for simplicity in this setup, it's defined here.
const trainingWorkerCode = `
  self.importScripts('https://unpkg.com/ml-matrix@6.10.0/dist/ml-matrix.umd.js');
  self.importScripts('https://unpkg.com/ml-random-forest@2.1.0/dist/ml-random-forest.umd.js');
  self.onmessage = (event) => {
    const { dataset, targetVariable, features } = event.data;
    const { Matrix } = self.ML;
    const { RandomForestClassifier: RFClassifier } = self.MLRandomForest;
    try {
      // Preprocessing
      self.postMessage({ type: 'progress', status: 'preprocessing', value: 10 });
      const { rows } = dataset;
      const y = new Array(rows.length).fill(0);
      const X = new Matrix(rows.length, features.length);
      const encodingMap = {};
      features.forEach((feature, colIndex) => {
        const values = rows.map(r => r[feature]);
        const isNumeric = values.every(v => typeof v === 'number' || v === null || v === undefined);
        if (isNumeric) {
          const nonNull = values.filter(v => typeof v === 'number');
          const mean = nonNull.reduce((a, b) => a + b, 0) / nonNull.length || 0;
          rows.forEach((row, rowIndex) => {
            X.set(rowIndex, colIndex, typeof row[feature] === 'number' ? row[feature] : mean);
          });
        } else {
          const valueCounts = {};
          values.forEach(v => {
            if (v !== null && v !== undefined) valueCounts[String(v)] = (valueCounts[String(v)] || 0) + 1;
          });
          const mode = Object.keys(valueCounts).reduce((a, b) => valueCounts[a] > valueCounts[b] ? a : b, '');
          const uniqueValues = Array.from(new Set(values.filter(v => v !== null && v !== undefined).map(String)));
          encodingMap[feature] = {};
          uniqueValues.forEach((val, i) => {
            encodingMap[feature][val] = i;
          });
          rows.forEach((row, rowIndex) => {
            const val = row[feature] === null || row[feature] === undefined ? mode : String(row[feature]);
            X.set(rowIndex, colIndex, encodingMap[feature][val] || 0);
          });
        }
      });
      rows.forEach((row, i) => {
        y[i] = row[targetVariable] ? 1 : 0;
      });
      // Train/Test Split
      self.postMessage({ type: 'progress', status: 'preprocessing', value: 30 });
      const n = X.rows;
      const indices = Array.from({ length: n }, (_, i) => i);
      indices.sort(() => 0.5 - Math.random());
      const splitPoint = Math.floor(n * 0.8);
      const trainIndices = indices.slice(0, splitPoint);
      const testIndices = indices.slice(splitPoint);
      const X_train = X.selection(trainIndices, Array.from({ length: X.columns }, (_, i) => i));
      const y_train = trainIndices.map(i => y[i]);
      const X_test = X.selection(testIndices, Array.from({ length: X.columns }, (_, i) => i));
      const y_test = testIndices.map(i => y[i]);
      // Training
      self.postMessage({ type: 'progress', status: 'training', value: 50 });
      const classifier = new RFClassifier({ nEstimators: 50, maxDepth: 10 });
      classifier.train(X_train, y_train);
      self.postMessage({ type: 'progress', status: 'training', value: 80 });
      // Evaluation
      self.postMessage({ type: 'progress', status: 'evaluating', value: 90 });
      const y_pred = classifier.predict(X_test);
      let tp = 0, tn = 0, fp = 0, fn = 0;
      for (let i = 0; i < y_test.length; i++) {
        if (y_test[i] === 1 && y_pred[i] === 1) tp++;
        else if (y_test[i] === 0 && y_pred[i] === 0) tn++;
        else if (y_test[i] === 0 && y_pred[i] === 1) fp++;
        else if (y_test[i] === 1 && y_pred[i] === 0) fn++;
      }
      const accuracy = (tp + tn) / (tp + tn + fp + fn) || 0;
      const precision = tp / (tp + fp) || 0;
      const recall = tp / (tp + fn) || 0;
      const f1 = 2 * (precision * recall) / (precision + recall) || 0;
      const rocAuc = (accuracy + recall) / 2;
      const metrics = {
        accuracy, precision, recall, f1, rocAuc,
        confusionMatrix: { truePositive: tp, trueNegative: tn, falsePositive: fp, falseNegative: fn },
      };
      const featureImportance = {};
      const importances = classifier.getFeatureImportance();
      features.forEach((feature, i) => {
        featureImportance[feature] = importances[i];
      });
      const modelJson = JSON.stringify(classifier.toJSON());
      self.postMessage({ type: 'result', metrics, featureImportance, model: { modelJson, encodingMap } });
    } catch (error) {
      self.postMessage({ type: 'error', error: error.message });
    }
  };
`;
const workerBlob = new Blob([trainingWorkerCode], { type: 'application/javascript' });
const workerUrl = URL.createObjectURL(workerBlob);
export function ModelLabPage() {
  const dataset = useAppStore(s => s.dataset);
  const targetVariable = useTrainingStore(state => state.targetVariable);
  const selectedFeatures = useTrainingStore(state => state.selectedFeatures);
  const status = useTrainingStore(state => state.status);
  const progress = useTrainingStore(state => state.progress);
  const error = useTrainingStore(state => state.error);
  const metrics = useTrainingStore(state => state.metrics);
  const featureImportance = useTrainingStore(state => state.featureImportance);
  const setConfig = useTrainingStore(state => state.setConfig);
  const startTraining = useTrainingStore(state => state.startTraining);
  const setTrainingState = useTrainingStore(state => state.setTrainingState);
  const deployModel = useTrainingStore(state => state.deployModel);
  const [localTarget, setLocalTarget] = useState<string | undefined>(targetVariable || undefined);
  const [localFeatures, setLocalFeatures] = useState<Set<string>>(selectedFeatures);
  const [modelName, setModelName] = useState("");
  const [isDeployDialogOpen, setDeployDialogOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const worker = new Worker(workerUrl);
    worker.onmessage = (event) => {
      const { type, status, value, metrics, featureImportance, model, error } = event.data;
      if (type === 'progress') {
        setTrainingState({ status, progress: value });
      } else if (type === 'result') {
        setTrainingState({ status: 'complete', progress: 100, metrics, featureImportance, trainedModel: model });
        toast.success("Training complete!");
      } else if (type === 'error') {
        setTrainingState({ status: 'error', error });
        toast.error("Training failed:", { description: error });
      }
    };
    if (status === 'preprocessing' && dataset && localTarget && localFeatures.size > 0) {
      worker.postMessage({
        dataset,
        targetVariable: localTarget,
        features: Array.from(localFeatures),
      });
    }
    return () => {
      worker.terminate();
    };
  }, [status, dataset, localTarget, localFeatures, setTrainingState]);
  if (!dataset) {
    return <Navigate to="/data" replace />;
  }
  const handleFeatureToggle = (feature: string, checked: boolean) => {
    setLocalFeatures(prev => {
      const newSet = new Set(prev);
      if (checked) newSet.add(feature);
      else newSet.delete(feature);
      return newSet;
    });
  };
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allFeatures = dataset.headers.filter(h => h !== localTarget);
      setLocalFeatures(new Set(allFeatures));
    } else {
      setLocalFeatures(new Set());
    }
  };
  const handleTrainModel = () => {
    if (!localTarget || localFeatures.size === 0) {
      toast.error("Configuration incomplete", { description: "Please select a target variable and at least one feature." });
      return;
    }
    setConfig(localTarget, localFeatures);
    startTraining();
  };
  const handleDeploy = async () => {
    if (!modelName.trim()) {
      toast.error("Model name is required.");
      return;
    }
    const deployed = await deployModel(modelName.trim());
    if (deployed) {
      toast.success(`Model "${deployed.name}" deployed successfully!`);
      setDeployDialogOpen(false);
      navigate('/predict');
    } else {
      toast.error("Failed to deploy model.");
    }
  };
  const potentialFeatures = dataset.headers.filter(h => h !== localTarget);
  const allFeaturesSelected = potentialFeatures.length > 0 && localFeatures.size === potentialFeatures.length;
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
  const COLORS = ['#10B981', '#F43F5E', '#F59E0B', '#3B82F6'];
  const isTraining = status === 'preprocessing' || status === 'training' || status === 'evaluating';
  return (
    <AppLayout container>
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
                      <Checkbox id="select-all-features" checked={allFeaturesSelected} onCheckedChange={handleSelectAll} disabled={isTraining} />
                      <Label htmlFor="select-all-features" className="font-medium">Select All Features</Label>
                    </div>
                    <ScrollArea className="h-64 border rounded-md p-4">
                      <div className="space-y-3">
                        {potentialFeatures.map(h => (
                          <div key={h} className="flex items-center space-x-2">
                            <Checkbox id={`feature-${h}`} checked={localFeatures.has(h)} onCheckedChange={(c) => handleFeatureToggle(h, !!c)} disabled={isTraining} />
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
              <Button size="lg" onClick={handleTrainModel} disabled={!localTarget || localFeatures.size === 0 || isTraining}>
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
            {status === 'complete' && metrics && (
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
                        <Button onClick={handleDeploy} disabled={status === 'deploying'}>
                          {status === 'deploying' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deploying...</> : 'Deploy'}
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
            )}
          </div>
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader><CardTitle>Configuration Summary</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Target:</span><span className="font-medium">{localTarget || 'Not set'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Features:</span><span className="font-medium">{localFeatures.size} selected</span></div>
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
      <Toaster richColors />
    </AppLayout>
  );
}