import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/store/app-store";
import { FlaskConical, Info } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { Toaster, toast } from "@/components/ui/sonner";
export function ModelLabPage() {
  const dataset = useAppStore(s => s.dataset);
  const datasetStats = useAppStore(s => s.datasetStats);
  const [targetVariable, setTargetVariable] = useState<string | undefined>();
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set());
  if (!dataset || !datasetStats) {
    return <Navigate to="/data" replace />;
  }
  const handleFeatureToggle = (feature: string, checked: boolean) => {
    setSelectedFeatures(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(feature);
      } else {
        newSet.delete(feature);
      }
      return newSet;
    });
  };
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allFeatures = dataset.headers.filter(h => h !== targetVariable);
      setSelectedFeatures(new Set(allFeatures));
    } else {
      setSelectedFeatures(new Set());
    }
  };
  const handleTrainModel = () => {
    toast.info("Training in Progress...", {
      description: "Model training functionality will be implemented in Phase 2.",
      duration: 5000,
    });
  };
  const potentialFeatures = dataset.headers.filter(h => h !== targetVariable);
  const allFeaturesSelected = potentialFeatures.length > 0 && selectedFeatures.size === potentialFeatures.length;
  return (
    <AppLayout container>
      <div className="space-y-8 animate-fade-in">
        <header className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Model Lab</h1>
          <p className="text-lg text-muted-foreground">
            Configure, train, and evaluate your churn prediction model.
          </p>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>1. Configure Model</CardTitle>
                <CardDescription>Select the target variable and the features to be used for training.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="target-variable">Target Variable (What to predict)</Label>
                  <Select onValueChange={setTargetVariable} value={targetVariable}>
                    <SelectTrigger id="target-variable">
                      <SelectValue placeholder="Select a column..." />
                    </SelectTrigger>
                    <SelectContent>
                      {dataset.headers.map(header => (
                        <SelectItem key={header} value={header}>{header}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {targetVariable && (
                  <div className="space-y-4">
                    <Label>Feature Variables (Inputs for prediction)</Label>
                    <div className="flex items-center space-x-2 border-b pb-2 mb-2">
                      <Checkbox 
                        id="select-all-features"
                        checked={allFeaturesSelected}
                        onCheckedChange={handleSelectAll}
                      />
                      <Label htmlFor="select-all-features" className="font-medium">Select All Features</Label>
                    </div>
                    <ScrollArea className="h-64 border rounded-md p-4">
                      <div className="space-y-3">
                        {potentialFeatures.map(header => (
                          <div key={header} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`feature-${header}`}
                              checked={selectedFeatures.has(header)}
                              onCheckedChange={(checked) => handleFeatureToggle(header, !!checked)}
                            />
                            <Label htmlFor={`feature-${header}`} className="font-normal">{header}</Label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>
            <div className="flex justify-end">
              <Button size="lg" onClick={handleTrainModel} disabled={!targetVariable || selectedFeatures.size === 0}>
                <FlaskConical className="mr-2 h-5 w-5" />
                Train Model
              </Button>
            </div>
          </div>
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle>Configuration Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target:</span>
                  <span className="font-medium">{targetVariable || 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Features:</span>
                  <span className="font-medium">{selectedFeatures.size} selected</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Algorithm:</span>
                  <span className="font-medium">Random Forest</span>
                </div>
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Next Step</AlertTitle>
                  <AlertDescription>
                    Once configured, click "Train Model" to start the training process. Results will appear below.
                  </AlertDescription>
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