import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppStore } from "@/store/app-store";
import { ArrowRight, BrainCircuit, Database, FlaskConical, Upload } from "lucide-react";
import { Link } from "react-router-dom";
export function HomePage() {
  const dataset = useAppStore(s => s.dataset);
  return (
    <AppLayout container>
      <div className="space-y-12">
        <section className="text-center animate-fade-in">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-balance">
            ChurnGuard AI
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-xl text-muted-foreground text-balance">
            A professional-grade, serverless machine learning platform for predicting customer churn with client-side training and edge deployment.
          </p>
        </section>
        <section className="animate-slide-up" style={{ animationDelay: '200ms' }}>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-secondary rounded-lg">
                    <Database className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>1. Data Studio</CardTitle>
                    <CardDescription>Upload & Prepare</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-muted-foreground">
                  Start by uploading your customer dataset in CSV format. Our studio helps you inspect and prepare your data for the next step.
                </p>
              </CardContent>
              <div className="p-6 pt-0">
                <Button asChild className="w-full">
                  <Link to="/data"><Upload className="mr-2 h-4 w-4" /> Upload Data</Link>
                </Button>
              </div>
            </Card>
            <Card className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-secondary rounded-lg">
                    <FlaskConical className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>2. Model Lab</CardTitle>
                    <CardDescription>Train & Evaluate</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-muted-foreground">
                  Configure your machine learning model. Select features, choose a target, and train the model right in your browser.
                </p>
              </CardContent>
              <div className="p-6 pt-0">
                <Button asChild className="w-full" disabled={!dataset}>
                  <Link to="/training">Go to Model Lab <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </div>
            </Card>
            <Card className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-secondary rounded-lg">
                    <BrainCircuit className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>3. Prediction Center</CardTitle>
                    <CardDescription>Deploy & Predict</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-muted-foreground">
                  Deploy your trained model to the edge and start making real-time churn predictions for new customers via API or our interface.
                </p>
              </CardContent>
              <div className="p-6 pt-0">
                <Button asChild className="w-full" disabled>
                  <Link to="/predict">Make Predictions <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </div>
            </Card>
          </div>
        </section>
        <footer className="text-center text-muted-foreground/80">
          <p>Built with ���️ at Cloudflare</p>
        </footer>
      </div>
    </AppLayout>
  );
}