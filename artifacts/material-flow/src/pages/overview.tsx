import { Link } from "wouter";
import { LogIn, Plus, Eye } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetDemoJobs, getGetDemoJobsQueryKey, useGetSummary, getGetSummaryQueryKey, useListJobs, getListJobsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SummaryBoard, summarize, JobRow, ErrorPanel, PageHeader } from "@/components/mf-ui";
import { Logo } from "@/components/shell";
import { errMsg, useCompany } from "@/lib/mf";

function BoardSkeleton() {
  return <div className="space-y-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-64" /></div>;
}

function Demo() {
  const { login } = useAuth();
  const q = useGetDemoJobs({ query: { queryKey: getGetDemoJobsQueryKey() } });
  return (
    <div className="grid-paper min-h-[100dvh]">
      <div className="hazard h-1.5" />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-8">
        <Logo />
        <Button data-testid="button-login" onClick={login} className="h-11"><LogIn />Log in</Button>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 md:px-8">
        <section className="rise grid gap-6 py-8 md:grid-cols-[1.4fr_1fr] md:items-end md:py-14">
          <div>
            <p className="num text-xs uppercase tracking-[0.25em] text-muted-foreground">Material accountability for the shop floor</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-[1.02] tracking-tight md:text-6xl">Every kilo issued.<br />Every kilo <span className="relative inline-block"><span className="relative z-10">explained.</span><span className="absolute inset-x-0 bottom-1 -z-0 h-3 bg-accent md:h-4" /></span></h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">Operators record what went in and what came out. The balance must close before a job is submitted. Supervisors review evidence, not guesses.</p>
          </div>
          <div className="rounded-md border-2 border-foreground bg-card p-5">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest"><Eye className="h-4 w-4" />Read-only demo</p>
            <p className="mt-2 text-sm text-muted-foreground">You are viewing illustrative sample data. Nothing here is a real company record. Log in to record your own jobs.</p>
            <Button data-testid="button-login-cta" onClick={login} size="lg" className="mt-4 h-12 w-full">Log in to start recording</Button>
          </div>
        </section>
        <div className="mb-4 flex items-center gap-3 rounded-md bg-foreground px-4 py-2.5 text-background">
          <span className="rounded-sm bg-accent px-2 py-0.5 text-xs font-black uppercase tracking-widest text-foreground">Demo</span>
          <span className="text-sm">Sample dashboard — challenge dataset IK-202 and IK-203</span>
        </div>
        {q.isLoading ? <BoardSkeleton /> : q.error ? <ErrorPanel message={errMsg(q.error)} onRetry={() => q.refetch()} /> : (
          <div className="space-y-8">
            <SummaryBoard summary={summarize(q.data ?? [])} />
            <section className="rounded-md border bg-card">
              <h3 className="border-b px-5 py-3 font-bold">Sample jobs</h3>
              {(q.data ?? []).map((j) => <JobRow key={j.id} job={j} />)}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function Dashboard() {
  const { company } = useCompany();
  const id = company!.id;
  const s = useGetSummary(id, { query: { queryKey: getGetSummaryQueryKey(id), refetchInterval: 30000 } });
  const jobs = useListJobs(id, { query: { queryKey: getListJobsQueryKey(id) } });
  const recent = [...(jobs.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  return (
    <>
      <PageHeader eyebrow={company!.name} title="Overview">
        <Button asChild size="lg" className="h-12"><Link href="/jobs/new" data-testid="link-record-job"><Plus />Record job</Link></Button>
      </PageHeader>
      {s.isLoading ? <BoardSkeleton /> : s.error ? <ErrorPanel message={errMsg(s.error)} onRetry={() => s.refetch()} /> : s.data && <SummaryBoard summary={s.data} />}
      <section className="mt-8 rounded-md border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-3"><h3 className="font-bold">Recent activity</h3><Link href="/jobs" className="text-sm font-semibold text-primary">All jobs</Link></div>
        {jobs.isLoading ? <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          : jobs.error ? <div className="p-4"><ErrorPanel message={errMsg(jobs.error)} onRetry={() => jobs.refetch()} /></div>
          : recent.length ? recent.map((j) => <JobRow key={j.id} job={j} href={`/jobs/${j.id}`} />)
          : <p className="p-8 text-center text-sm text-muted-foreground">No jobs yet. Record the first one.</p>}
      </section>
    </>
  );
}

export default function Overview() {
  const { isAuthenticated } = useAuth();
  const { company } = useCompany();
  return isAuthenticated && company ? <Dashboard /> : <Demo />;
}
