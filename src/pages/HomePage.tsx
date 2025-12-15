import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppStore } from "@/store/app-store";
import { ArrowRight, BrainCircuit, Database, FlaskConical, Upload, BarChart, PieChart as PieChartIcon, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api-client";
import type { ModelArtifact } from "@shared/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Bar, BarChart as RechartsBar, Pie, PieChart as RechartsPie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { motion } from "framer-motion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
const riskData = [
  { name: 'Low Risk', value: 70, color: '#10B981' },
  { name: 'Medium Risk', value: 20, color: '#F59E0B' },
  { name: 'High Risk', value: 10, color: '#F43F5E' },
];
export function HomePage() {
  const [models, setModels] = useState<ModelArtifact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const dataset = useAppStore(s => s.dataset);
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const result = await api<{ items: ModelArtifact[] }>('/api/models');
        setModels(result.items.sort((a, b) => b.createdAt - a.createdAt));
      } catch (error) {
        console.error("Failed to fetch models:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchModels();
  }, []);
  const recentModels = useMemo(() => models.slice(0, 5), [models]);
  const averageAccuracy = useMemo(() => {
    if (models.length === 0) return 0;
    const total = models.reduce((acc, m) => acc + m.performance.accuracy, 0);
    return (total / models.length) * 100;
  }, [models]);
  return (
    <AppLayout container>
      <div className="py-8 md:py-10 lg:py-12">
        <div className="space-y-12">
          <motion.section 
            className="text-center"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-5xl md:text-6xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-balance">
              ChurnGuard AI Dashboard
            </h1>
            <p className="mt-4 max-w-2xl mx-auto text-xl text-muted-foreground text-balance">
              Your mission control for predictive customer analytics and churn prevention.
            </p>
          </motion.section>
          {isLoading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
            </div>
          ) : models.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Welcome to ChurnGuard AI!</AlertTitle>
                <AlertDescription>
                  You don't have any models yet. Get started by uploading a dataset.
                </AlertDescription>
                <div className="mt-4">
                  <Button asChild>
                    <Link to="/data"><Upload className="mr-2 h-4 w-4" /> Upload Your First Dataset</Link>
                  </Button>
                </div>
              </Alert>
            </motion.div>
          ) : (
            <motion.section 
              className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Deployed Models</CardTitle>
                  <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{models.length}</div>
                  <p className="text-xs text-muted-foreground">Total models trained and deployed</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Average Accuracy</CardTitle>
                  <BarChart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{averageAccuracy.toFixed(2)}%</div>
                  <p className="text-xs text-muted-foreground">Across all deployed models</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Global Churn Risk</CardTitle>
                  <PieChartIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">10% High Risk</div>
                  <p className="text-xs text-muted-foreground">Mock data based on industry average</p>
                </CardContent>
              </Card>
            </motion.section>
          )}
          {models.length > 0 && (
            <motion.section 
              className="grid gap-6 lg:grid-cols-5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <Card className="lg:col-span-3">
                <CardHeader>
                  <CardTitle>Recent Model Performance (Accuracy)</CardTitle>
                  <CardDescription>Comparing the accuracy of your 5 most recent models.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsBar data={recentModels.map(m => ({ name: m.name, accuracy: m.performance.accuracy * 100 }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis unit="%" />
                      <Tooltip />
                      <Bar dataKey="accuracy" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </RechartsBar>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Global Churn Risk Distribution</CardTitle>
                  <CardDescription>A mock overview of your customer base risk.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPie>
                      <Pie data={riskData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                        {riskData.map((entry) => <Cell key={`cell-${entry.name}`} fill={entry.color} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </RechartsPie>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.section>
          )}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Get Started</CardTitle>
                <CardDescription>Follow these steps to build, train, and deploy your churn prediction model.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div className="flex flex-col items-center p-6 bg-secondary rounded-lg text-center">
                  <Database className="h-8 w-8 text-primary mb-4" />
                  <h3 className="font-semibold mb-2">1. Data Studio</h3>
                  <p className="text-sm text-muted-foreground mb-4">Upload and inspect your customer dataset.</p>
                  <Button asChild><Link to="/data">Go to Data Studio <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                </div>
                <div className="flex flex-col items-center p-6 bg-secondary rounded-lg text-center">
                  <FlaskConical className="h-8 w-8 text-primary mb-4" />
                  <h3 className="font-semibold mb-2">2. Model Lab</h3>
                  <p className="text-sm text-muted-foreground mb-4">Train and evaluate your model in-browser.</p>
                  <Button asChild disabled={!dataset}><Link to="/training">Go to Model Lab <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                </div>
                <div className="flex flex-col items-center p-6 bg-secondary rounded-lg text-center">
                  <BrainCircuit className="h-8 w-8 text-primary mb-4" />
                  <h3 className="font-semibold mb-2">3. Prediction Center</h3>
                  <p className="text-sm text-muted-foreground mb-4">Deploy models and make live predictions.</p>
                  <Button asChild disabled={models.length === 0}><Link to="/predict">Go to Predictions <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                </div>
              </CardContent>
            </Card>
          </motion.section>
          <footer className="text-center text-muted-foreground/80">
            <p>Built with ❤️ at Cloudflare</p>
          </footer>
        </div>
      </div>
    </AppLayout>
  );
}