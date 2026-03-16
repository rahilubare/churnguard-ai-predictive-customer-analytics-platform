import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppStore } from "@/store/app-store";
import { ArrowRight, BrainCircuit, Database, FlaskConical, Upload, BarChart as BarChartIcon, AlertCircle, Users, TrendingDown, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api-client";
import type { ModelArtifact } from "@shared/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Bar, BarChart, Pie, PieChart, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid, AreaChart, Area, LineChart, Line } from "recharts";
import { motion } from "framer-motion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useTrainingStore } from "@/store/training-store";
import { ROIDashboard } from "@/components/dashboard/ROIDashboard";
const riskData = [
  { name: 'Low Risk', value: 70, color: '#10B981' },
  { name: 'Medium Risk', value: 20, color: '#F59E0B' },
  { name: 'High Risk', value: 10, color: '#F43F5E' },
];
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};
const mockSparkData = Array.from({ length: 10 }, (_, i) => ({ name: `Day ${i}`, value: 45000 + Math.random() * 1000 - 500 }));
const mockBarData = Array.from({ length: 10 }, (_, i) => ({ name: `Day ${i}`, value: 2300 + Math.random() * 200 - 100 }));
const mockLineData = Array.from({ length: 10 }, (_, i) => ({ name: `Day ${i}`, value: 87 + Math.random() * 2 - 1 }));
export function HomePage() {
  const [models, setModels] = useState<ModelArtifact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const dataset = useAppStore(s => s.dataset);
  const trainingStatus = useTrainingStore(s => s.status);
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
  const dynamicCTA = useMemo(() => {
    if (!dataset) return { text: "Upload a Dataset", to: "/data" };
    if (models.length === 0 && trainingStatus !== 'complete') return { text: "Train Your First Model", to: "/training" };
    if (models.length > 0) return { text: "Score New Customers", to: "/predict" };
    return { text: "View Training Results", to: "/training" };
  }, [dataset, models, trainingStatus]);
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 lg:py-16">
        <div className="space-y-12">
          <motion.section
            className="text-center mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-balance mb-4">
              Executive Overview
            </h1>
            <p className="mt-4 max-w-2xl mx-auto text-lg sm:text-xl text-muted-foreground text-balance leading-relaxed">
              Monitor churn risks and model performance across your customer base with real-time insights.
            </p>
          </motion.section>
          {isLoading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-40 rounded-lg" />
              <Skeleton className="h-40 rounded-lg" />
              <Skeleton className="h-40 rounded-lg" />
              <Skeleton className="h-40 rounded-lg" />
            </div>
          ) : (
            <motion.section
              className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
            >
              <motion.div variants={cardVariants} className="group">
                <Card className="hover:shadow-elevation-lg hover:-translate-y-1 transition-all duration-300 border-t-4 border-t-primary">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Total Customers</CardTitle>
                    <Users className="h-5 w-5 text-primary group-hover:scale-110 transition-transform duration-200" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold mb-1">45,231</div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <span className="text-success font-medium">+20.1%</span> from last month
                    </p>
                    <div className="h-20 mt-3 -ml-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={mockSparkData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                          <defs><linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(221.2 83.2% 53.3%)" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(221.2 83.2% 53.3%)" stopOpacity={0} /></linearGradient></defs>
                          <Area type="monotone" dataKey="value" stroke="hsl(221.2 83.2% 53.3%)" fillOpacity={1} fill="url(#colorUv)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
              <motion.div variants={cardVariants} className="group">
                <Card className="hover:shadow-elevation-lg hover:-translate-y-1 transition-all duration-300 border-t-4 border-t-destructive">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Predicted Churn</CardTitle>
                    <TrendingDown className="h-5 w-5 text-destructive group-hover:scale-110 transition-transform duration-200" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold mb-1">12.3%</div>
                    <p className="text-xs text-muted-foreground">Monthly churn forecast</p>
                    <div className="h-20 mt-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={[{ name: 'Churn', value: 12.3 }, { name: 'Retain', value: 87.7 }]} dataKey="value" startAngle={90} endAngle={-270} innerRadius="60%" outerRadius="80%" paddingAngle={5} cornerRadius={5}>
                            <Cell fill="hsl(0 84.2% 60.2%)" />
                            <Cell fill="hsl(142.1 76.2% 36.3%)" />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
              <motion.div variants={cardVariants} className="group">
                <Card className="hover:shadow-elevation-lg hover:-translate-y-1 transition-all duration-300 border-t-4 border-t-warning">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">High-Risk Segment</CardTitle>
                    <ShieldAlert className="h-5 w-5 text-warning group-hover:scale-110 transition-transform duration-200" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold mb-1">2,350</div>
                    <p className="text-xs text-muted-foreground">Customers with &gt;75% churn prob.</p>
                    <div className="h-20 mt-3 -ml-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={mockBarData}>
                          <Bar dataKey="value" fill="hsl(38 92% 56%)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
              <motion.div variants={cardVariants} className="group">
                <Card className="hover:shadow-elevation-lg hover:-translate-y-1 transition-all duration-300 border-t-4 border-t-success">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Model Accuracy</CardTitle>
                    <BarChartIcon className="h-5 w-5 text-success group-hover:scale-110 transition-transform duration-200" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold mb-1">87.2%</div>
                    <p className="text-xs text-muted-foreground">Average across all models</p>
                    <div className="h-20 mt-3 -ml-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={mockLineData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                          <Line type="monotone" dataKey="value" stroke="hsl(142.1 76.2% 36.3%)" strokeWidth={3} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.section>
          )}
          {models.length > 0 && (
            <motion.section
              className="grid gap-6 lg:grid-cols-5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <Card className="lg:col-span-3 hover:shadow-elevation-lg transition-all duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChartIcon className="h-5 w-5 text-primary" />
                    Recent Model Performance (Accuracy)
                  </CardTitle>
                  <CardDescription>Comparing the accuracy of your 5 most recent models.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={recentModels.map(m => ({ name: m.name, accuracy: m.performance.accuracy * 100 }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis unit="%" fontSize={12} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        }} 
                      />
                      <Bar dataKey="accuracy" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2 hover:shadow-elevation-lg transition-all duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-warning" />
                    Global Churn Risk Distribution
                  </CardTitle>
                  <CardDescription>A mock overview of your customer base risk.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie data={riskData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label paddingAngle={5}>
                        {riskData.map((entry) => <Cell key={`cell-${entry.name}`} fill={entry.color} />)}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }} 
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.section>
          )}

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <ROIDashboard />
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <Card className="hover:shadow-elevation-lg transition-all duration-300">
              <CardHeader>
                <CardTitle className="text-2xl">Get Started</CardTitle>
                <CardDescription className="text-base">Follow these steps to build, train, and deploy your churn prediction model.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-3">
                <div className="flex flex-col items-center p-8 bg-gradient-to-br from-secondary to-accent/50 rounded-xl text-center border border-border hover:border-primary/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-elevation-md group">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                    <Database className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-3">1. Data Studio</h3>
                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed">Upload and inspect your customer dataset with automated quality checks.</p>
                  <Button asChild variant="gradient" className="hover:shadow-glow">
                    <Link to="/data">Go to Data Studio <ArrowRight className="ml-2 h-4 w-4" /></Link>
                  </Button>
                </div>
                <div className="flex flex-col items-center p-8 bg-gradient-to-br from-secondary to-accent/50 rounded-xl text-center border border-border hover:border-primary/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-elevation-md group">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                    <FlaskConical className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-3">2. Model Lab</h3>
                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed">Train and evaluate your model in-browser with advanced ML algorithms.</p>
                  <Button asChild disabled={!dataset} variant="gradient" className="hover:shadow-glow">
                    <Link to="/training">Go to Model Lab <ArrowRight className="ml-2 h-4 w-4" /></Link>
                  </Button>
                </div>
                <div className="flex flex-col items-center p-8 bg-gradient-to-br from-secondary to-accent/50 rounded-xl text-center border border-border hover:border-primary/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-elevation-md group">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                    <BrainCircuit className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-3">3. Prediction Center</h3>
                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed">Deploy models and make live predictions for individual or batch customers.</p>
                  <Button asChild disabled={models.length === 0} variant="gradient" className="hover:shadow-glow">
                    <Link to="/predict">Go to Predictions <ArrowRight className="ml-2 h-4 w-4" /></Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.section>
        </div>
      </div>
      <div className="sticky bottom-4 w-full flex justify-center md:hidden">
        <Button asChild size="lg" className="shadow-lg animate-bounce">
          <Link to={dynamicCTA.to}>{dynamicCTA.text} <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </Button>
      </div>
    </AppLayout>
  );
}