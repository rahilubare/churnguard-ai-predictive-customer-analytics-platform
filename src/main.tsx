import '@/lib/errorReporter';
import { enableMapSet } from "immer";
enableMapSet();
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createBrowserRouter,
  RouterProvider,
  useLocation,
  Navigate
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import '@/index.css'
import { HomePage } from '@/pages/HomePage'
import { DataStudioPage } from '@/pages/DataStudioPage';
import { ModelLabPage } from '@/pages/ModelLabPage';
import { PredictionCenterPage } from '@/pages/PredictionCenterPage';
import { AuthPage } from '@/pages/AuthPage';
import { useAuthStore } from './store/auth-store';
import { Loader2 } from 'lucide-react';
const queryClient = new QueryClient();
function AuthWrapper({ children }: { children: JSX.Element }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const isLoading = useAuthStore(s => s.isLoading);
  const location = useLocation();
  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }
  return children;
}
function NonAuthWrapper({ children }: { children: JSX.Element }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const isLoading = useAuthStore(s => s.isLoading);
  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return children;
}
const router = createBrowserRouter([
  {
    path: "/",
    element: <AuthWrapper><HomePage /></AuthWrapper>,
  },
  {
    path: "/data",
    element: <AuthWrapper><DataStudioPage /></AuthWrapper>,
  },
  {
    path: "/training",
    element: <AuthWrapper><ModelLabPage /></AuthWrapper>,
  },
  {
    path: "/predict",
    element: <AuthWrapper><PredictionCenterPage /></AuthWrapper>,
  },
  {
    path: "/auth",
    element: <NonAuthWrapper><AuthPage /></NonAuthWrapper>,
  },
]);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
)