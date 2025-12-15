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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 lg:py-12">
        <div className="space-y-12">
          <motion.section
            className="text-center"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-5xl md:text-6xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-balance">
              Executive Overview
            </h1>
            <p className="mt-4 max-w-2xl mx-auto text-xl text-muted-foreground text-balance">
              Monitor churn risks and model performance across your customer base.
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
              <motion.div variants={cardVariants} className="hover:shadow-lg hover:scale-105 transition-all duration-200">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">45,231</div>
                    <p className="text-xs text-muted-foreground">+20.1% from last month</p>
                    <div className="h-20 mt-2 -ml-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={mockSparkData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                          <defs><linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/><stop offset="95%" stopColor="#8884d8" stopOpacity={0}/></linearGradient></defs>
                          <Area type="monotone" dataKey="value" stroke="#8884d8" fillOpacity={1} fill="url(#colorUv)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
              <motion.div variants={cardVariants} className="hover:shadow-lg hover:scale-105 transition-all duration-200">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Predicted Churn</CardTitle>
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">12.3%</div>
                    <p className="text-xs text-muted-foreground">Monthly churn forecast</p>
                    <div className="h-20 mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={[{name: 'Churn', value: 12.3}, {name: 'Retain', value: 87.7}]} dataKey="value" startAngle={90} endAngle={-270} innerRadius="60%" outerRadius="80%" paddingAngle={5} cornerRadius={5}>
                            <Cell fill="#F43F5E" />
                            <Cell fill="#10B981" />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
              <motion.div variants={cardVariants} className="hover:shadow-lg hover:scale-105 transition-all duration-200">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">High-Risk Segment</CardTitle>
                    <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">2,350</div>
                    <p className="text-xs text-muted-foreground">Customers with &gt;75% churn prob.</p>
                    <div className="h-20 mt-2 -ml-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={mockBarData}>
                          <Bar dataKey="value" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
              <motion.div variants={cardVariants} className="hover:shadow-lg hover:scale-105 transition-all duration-200">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Model Accuracy</CardTitle>
                    <BarChartIcon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">87.2%</div>
                    <p className="text-xs text-muted-foreground">Average across all models</p>
                    <div className="h-20 mt-2 -ml-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={mockLineData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                          <Line type="monotone" dataKey="value" stroke="#10B981" strokeWidth={2} dot={false} />
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
              <Card className="lg:col-span-3 hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle>Recent Model Performance (Accuracy)</CardTitle>
                  <CardDescription>Comparing the accuracy of your 5 most recent models.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={recentModels.map(m => ({ name: m.name, accuracy: m.performance.accuracy * 100 }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis unit="%" />
                      <Tooltip />
                      <Bar dataKey="accuracy" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2 hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle>Global Churn Risk Distribution</CardTitle>
                  <CardDescription>A mock overview of your customer base risk.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={riskData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                        {riskData.map((entry) => <Cell key={`cell-${entry.name}`} fill={entry.color} />)}
                      </Pie>
                      <Tooltip />
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
                  <Button asChild className="hover:shadow-glow hover:scale-105 transition-all"><Link to="/data">Go to Data Studio <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                </div>
                <div className="flex flex-col items-center p-6 bg-secondary rounded-lg text-center">
                  <FlaskConical className="h-8 w-8 text-primary mb-4" />
                  <h3 className="font-semibold mb-2">2. Model Lab</h3>
                  <p className="text-sm text-muted-foreground mb-4">Train and evaluate your model in-browser.</p>
                  <Button asChild disabled={!dataset} className="hover:shadow-glow hover:scale-105 transition-all"><Link to="/training">Go to Model Lab <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                </div>
                <div className="flex flex-col items-center p-6 bg-secondary rounded-lg text-center">
                  <BrainCircuit className="h-8 w-8 text-primary mb-4" />
                  <h3 className="font-semibold mb-2">3. Prediction Center</h3>
                  <p className="text-sm text-muted-foreground mb-4">Deploy models and make live predictions.</p>
                  <Button asChild disabled={models.length === 0} className="hover:shadow-glow hover:scale-105 transition-all"><Link to="/predict">Go to Predictions <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
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