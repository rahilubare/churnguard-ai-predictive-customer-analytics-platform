import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrainCircuit, Loader2, CheckCircle, Users, TrendingUp, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Toaster, toast } from '@/components/ui/sonner';
export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const from = location.state?.from?.pathname || '/';
  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    try {
      await login(email, password);
      toast.success('Login successful!');
      navigate(from, { replace: true });
    } catch (error) {
      toast.error('Login Failed', { description: error instanceof Error ? error.message : 'Please check your credentials.' });
    } finally {
      setIsLoading(false);
    }
  };
  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const orgName = formData.get('orgName') as string;
    try {
      await register(email, password, orgName);
      toast.success('Registration successful!');
      navigate(from, { replace: true });
    } catch (error) {
      toast.error('Registration Failed', { description: error instanceof Error ? error.message : 'An error occurred.' });
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className="min-h-screen w-full flex bg-background overflow-hidden">
      {/* Left Panel - Desktop Only */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-sidebar text-white flex-col justify-between p-12 overflow-hidden">
        {/* Grid Pattern Background */}
        <div 
          className="absolute inset-0 opacity-[0.03]" 
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        ></div>
        
        {/* Gradient Blur Blobs */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary/30 rounded-full blur-[128px] -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-emerald-500/30 rounded-full blur-[128px] translate-x-1/2 translate-y-1/2"></div>
        
        {/* Content */}
        <div className="relative z-10">
          <Link to="/" className="flex items-center gap-3 mb-8">
            <img src="/favicon.png?v=3" alt="ChurnGuard Logo" className="h-12 w-12 object-contain" />
            <span className="text-3xl font-bold tracking-tight">
              ChurnGuard <span className="text-emerald-400">AI</span>
            </span>
          </Link>
          
          <div className="mt-12 space-y-6">
            <h1 className="text-5xl font-bold leading-tight">
              Stop customer churn
              <br />
              <span className="text-gradient-primary">before it starts.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-md">
              Predict which customers will leave using advanced machine learning.
              Take action before it's too late.
            </p>
          </div>
        </div>
        
        {/* Feature Bullets */}
        <div className="relative z-10 space-y-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/20 border border-primary/30">
              <BrainCircuit className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Predict Churn with AI</h3>
              <p className="text-sm text-muted-foreground">In-browser ML training with real-time performance metrics.</p>
            </div>
          </div>
          
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
              <TrendingUp className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Real-Time Analytics</h3>
              <p className="text-sm text-muted-foreground">Track customer behavior and revenue impact instantly.</p>
            </div>
          </div>
          
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-blue-500/20 border border-blue-500/30">
              <Users className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Customer Insights</h3>
              <p className="text-sm text-muted-foreground">Understand what drives customer loyalty and retention.</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 lg:p-12 relative">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <Link to="/" className="flex items-center gap-3">
              <img src="/favicon.png?v=3" alt="ChurnGuard Logo" className="h-12 w-12 object-contain hover:scale-110 transition-transform duration-300" />
              <span className="text-3xl font-bold tracking-tight text-foreground">
                ChurnGuard <span className="text-emerald-500">AI</span>
              </span>
            </Link>
          </div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold tracking-tight">Get Started</h2>
              <p className="text-muted-foreground">
                Choose an option below to access your dashboard
              </p>
            </div>
            
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <Card>
                  <CardHeader>
                    <CardTitle>Welcome Back</CardTitle>
                    <CardDescription>Enter your credentials to access your dashboard.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="login-email">Email</Label>
                        <Input id="login-email" name="email" type="email" placeholder="m@example.com" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="login-password">Password</Label>
                        <Input id="login-password" name="password" type="password" required />
                      </div>
                      <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Sign In
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="register">
                <Card>
                  <CardHeader>
                    <CardTitle>Create an Account</CardTitle>
                    <CardDescription>Start predicting customer churn in minutes.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="reg-orgName">Organization Name</Label>
                        <Input id="reg-orgName" name="orgName" placeholder="Your Company, Inc." required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-email">Email</Label>
                        <Input id="reg-email" name="email" type="email" placeholder="m@example.com" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-password">Password</Label>
                        <Input id="reg-password" name="password" type="password" required />
                      </div>
                      <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create Account
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </div>
      <Toaster richColors />
    </div>
  );
}