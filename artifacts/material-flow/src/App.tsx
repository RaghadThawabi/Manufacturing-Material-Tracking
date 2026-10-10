import { type ReactNode, type ComponentType } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, useLocation, Redirect, Router as WouterRouter } from 'wouter';
import { LogIn } from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import NotFound from '@/pages/not-found';
import Overview from '@/pages/overview';
import Jobs from '@/pages/jobs';
import JobNew from '@/pages/job-new';
import JobDetail from '@/pages/job-detail';
import Review from '@/pages/review';
import Settings from '@/pages/settings';
import Onboarding from '@/pages/onboarding';
import { AppShell, Logo } from '@/components/shell';
import { ErrorPanel } from '@/components/mf-ui';
import { CompanyProvider, useCompany, errMsg } from '@/lib/mf';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

function Loading() {
  return <div className="mx-auto max-w-5xl space-y-4 p-8"><Skeleton className="h-12 w-64" /><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
}

function LoginWall() {
  const { login } = useAuth();
  return (
    <div className="grid-paper grid min-h-[100dvh] place-items-center p-4">
      <div className="rise w-full max-w-md rounded-md border-2 border-foreground bg-card p-8">
        <Logo /><h1 className="mt-6 text-2xl font-extrabold">Log in to continue</h1>
        <p className="mt-2 text-sm text-muted-foreground">This area holds company job records and is only available to team members.</p>
        <Button onClick={login} size="lg" className="mt-6 h-12 w-full" data-testid="button-login"><LogIn />Log in</Button>
      </div>
    </div>
  );
}

function Protected({ page: Page }: { page: ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const { company, loading, error, refetch } = useCompany();
  if (isLoading || loading) return <Loading />;
  if (!isAuthenticated) return <LoginWall />;
  if (error) return <div className="p-8"><ErrorPanel message={errMsg(error)} onRetry={refetch} /></div>;
  if (!company) return <Redirect to="/onboarding" />;
  return <Page />;
}

function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  const { company, loading } = useCompany();
  if (isLoading || loading) return <Loading />;
  if (isAuthenticated && !company) return <Redirect to="/onboarding" />;
  return <Overview />;
}

function OnboardingRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (!isAuthenticated) return <LoginWall />;
  return <Onboarding />;
}

function Router() {
  return (
    <AppShell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/onboarding" component={OnboardingRoute} />
          <Route path="/jobs">{() => <Protected page={Jobs} />}</Route>
          <Route path="/jobs/new">{() => <Protected page={JobNew} />}</Route>
          <Route path="/jobs/:id">{() => <Protected page={JobDetail} />}</Route>
          <Route path="/review">{() => <Protected page={Review} />}</Route>
          <Route path="/settings">{() => <Protected page={Settings} />}</Route>
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </AppShell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <CompanyProvider>
            <Router />
          </CompanyProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
