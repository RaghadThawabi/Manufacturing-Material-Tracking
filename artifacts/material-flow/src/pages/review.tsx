import { useListJobs, getListJobsQueryKey } from "@workspace/api-client-react";
import { ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, JobRow, ErrorPanel } from "@/components/mf-ui";
import { canReview, errMsg, useCompany } from "@/lib/mf";

export default function Review() {
  const { company } = useCompany();
  const id = company!.id;
  const q = useListJobs(id, { query: { queryKey: getListJobsQueryKey(id), refetchInterval: 15000 } });
  if (!canReview(company!.role)) return <ErrorPanel title="Access restricted" message="Only supervisors and admins can review jobs." />;
  const pending = (q.data ?? []).filter((j) => j.status === "submitted").sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  return (
    <>
      <PageHeader eyebrow="Supervisor" title="Review queue"><span className="num self-center text-sm text-muted-foreground">Auto-refreshes every 15s</span></PageHeader>
      {q.isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        : q.error ? <ErrorPanel message={errMsg(q.error)} onRetry={() => q.refetch()} />
        : pending.length ? <section className="rounded-md border bg-card"><p className="num border-b px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">{pending.length} awaiting review · oldest first</p>{pending.map((j) => <JobRow key={j.id} job={j} href={`/jobs/${j.id}`} />)}</section>
        : <div className="rise grid place-items-center rounded-md border border-dashed bg-card p-14 text-center"><ShieldCheck className="h-10 w-10 text-good" /><p className="mt-3 text-lg font-bold">Queue clear</p><p className="text-sm text-muted-foreground">No submitted jobs are waiting for review.</p></div>}
    </>
  );
}
