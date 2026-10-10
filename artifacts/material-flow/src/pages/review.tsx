import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListJobs, getListJobsQueryKey, type Job } from "@workspace/api-client-react";
import { ShieldCheck, Search, AlertTriangle, ArrowUpRight, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, ErrorPanel, FlowBar, StatusBadge, SampleFlag } from "@/components/mf-ui";
import { canReview, errMsg, useCompany, reviewFlags, latestReturn, ago, fmt, pct, type ReviewFlag } from "@/lib/mf";
import { cn } from "@/lib/utils";

type FlagKey = ReviewFlag["key"] | "all" | "clean";
type Sort = "priority" | "oldest" | "newest";
const FLAG_FILTERS: { k: FlagKey; label: string }[] = [
  { k: "all", label: "All" }, { k: "balance", label: "Outside tolerance" }, { k: "rework", label: "Pending rework" },
  { k: "yield", label: "Below plan" }, { k: "resubmitted", label: "Resubmitted" }, { k: "clean", label: "No flags" },
];
const flagCls: Record<ReviewFlag["key"], string> = {
  balance: "border-destructive text-destructive bg-destructive/5", rework: "border-pending text-pending bg-pending-soft",
  yield: "border-waste text-waste bg-waste/5", resubmitted: "border-border text-muted-foreground bg-muted",
};

function Row({ job, flags, score, rank }: { job: Job; flags: ReviewFlag[]; score: number; rank: number }) {
  const ret = latestReturn(job);
  const tier = score >= 5 ? "High" : score >= 2 ? "Medium" : "Routine";
  return (
    <Link href={`/jobs/${job.id}`} data-testid={`row-review-${job.id}`} className="rise group grid gap-3 border-b px-4 py-4 transition-colors last:border-0 hover:bg-muted/40 md:grid-cols-[56px_1fr_240px] md:items-center" style={{ animationDelay: `${Math.min(rank, 10) * 40}ms` }}>
      <div className={cn("flex items-center gap-2 md:flex-col md:items-start md:gap-0.5")}>
        <span className="num text-2xl font-semibold leading-none text-muted-foreground">{String(rank + 1).padStart(2, "0")}</span>
        <span className={cn("text-[10px] font-bold uppercase tracking-widest", tier === "High" ? "text-destructive" : tier === "Medium" ? "text-waste" : "text-muted-foreground")} data-testid={`text-priority-${job.id}`}>{tier}</span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="num text-base font-semibold">{job.number || "Untitled"}</span>
          <StatusBadge status={job.status} />{job.isSample && <SampleFlag />}
          <span className="num text-xs text-muted-foreground">waiting {ago(job.updatedAt)}</span>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{job.assignedName || "Unassigned"} · {job.material || "—"} · {job.machine || "—"} · {job.product || "—"}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {flags.length ? flags.map((f) => <span key={f.key} title={f.detail} className={cn("rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold", flagCls[f.key])}>{f.label}</span>)
            : <span className="rounded-sm border border-good px-1.5 py-0.5 text-[11px] font-semibold text-good">No flags</span>}
        </div>
        {ret?.comment && flags.some((f) => f.key === "resubmitted") && <p className="mt-1.5 truncate text-xs text-muted-foreground">Last returned: “{ret.comment}”</p>}
      </div>
      <div>
        <FlowBar issued={job.issued ?? 0} good={job.good ?? 0} scrap={job.scrapTotal} offcuts={job.offcuts ?? 0} pending={job.pendingRework ?? 0} />
        <div className="num mt-1.5 flex justify-between text-xs">
          <span>{fmt(job.issued)} {job.unit}</span>
          <span className="text-good">Y {pct(job.yieldRate)}{job.plannedYield != null && <span className="text-muted-foreground">/{pct(job.plannedYield)}</span>}</span>
          <span className={job.difference === 0 ? "text-muted-foreground" : "font-semibold text-destructive"}>Δ {fmt(job.difference, 3)}</span>
          <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
    </Link>
  );
}

export default function Review() {
  const { company } = useCompany();
  const id = company!.id;
  const q = useListJobs(id, { query: { queryKey: getListJobsQueryKey(id), refetchInterval: 15000 } });
  const [search, setSearch] = useState("");
  const [flag, setFlag] = useState<FlagKey>("all");
  const [sort, setSort] = useState<Sort>("priority");
  const tol = company!.tolerance;
  const items = useMemo(() => (q.data ?? []).filter((j) => j.status === "submitted").map((job) => {
    const flags = reviewFlags(job, tol);
    const ageDays = (Date.now() - new Date(job.updatedAt).getTime()) / 86400000;
    return { job, flags, score: flags.reduce((s, f) => s + f.weight, 0) + Math.min(ageDays, 3) * 0.5 };
  }), [q.data, tol]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, clean: items.filter((i) => !i.flags.length).length };
    for (const i of items) for (const f of i.flags) c[f.key] = (c[f.key] ?? 0) + 1;
    return c;
  }, [items]);
  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter(({ job, flags }) =>
      (!s || `${job.number} ${job.assignedName ?? ""} ${job.material} ${job.machine} ${job.product}`.toLowerCase().includes(s)) &&
      (flag === "all" || (flag === "clean" ? !flags.length : flags.some((f) => f.key === flag))),
    ).sort((a, b) => sort === "priority" ? b.score - a.score || a.job.updatedAt.localeCompare(b.job.updatedAt)
      : sort === "oldest" ? a.job.updatedAt.localeCompare(b.job.updatedAt) : b.job.updatedAt.localeCompare(a.job.updatedAt));
  }, [items, search, flag, sort]);

  if (!canReview(company!.role)) return <ErrorPanel title="Access restricted" message="Only supervisors, managers and admins can review jobs." />;
  const urgent = (counts.balance ?? 0) + (counts.rework ?? 0) + (counts.yield ?? 0);
  return (
    <>
      <PageHeader eyebrow="Supervisor · verify outcomes" title="Review queue"><span className="num self-center text-sm text-muted-foreground">{q.isFetching ? "Refreshing…" : "Auto-refreshes every 15s"}</span></PageHeader>
      {q.isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        : q.error ? <ErrorPanel message={errMsg(q.error)} onRetry={() => q.refetch()} />
        : !items.length ? <div className="rise grid place-items-center rounded-md border border-dashed bg-card p-14 text-center"><ShieldCheck className="h-10 w-10 text-good" /><p className="mt-3 text-lg font-bold">Queue clear</p><p className="text-sm text-muted-foreground">No submitted jobs are waiting for review.</p></div>
        : (
          <>
            <div className="rise mb-4 grid gap-3 md:grid-cols-[auto_1fr]">
              <div className="flex items-center gap-4 rounded-md border-2 border-foreground bg-card px-5 py-3">
                <div><p className="num text-3xl font-semibold leading-none" data-testid="text-queue-count">{items.length}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Awaiting</p></div>
                <div className="h-10 w-px bg-border" />
                <div><p className={cn("num text-3xl font-semibold leading-none", urgent ? "text-destructive" : "text-good")}>{items.filter((i) => i.flags.some((f) => f.key !== "resubmitted")).length}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Need attention</p></div>
              </div>
              <div className="space-y-3 rounded-md border bg-card p-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1"><Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input data-testid="input-queue-search" className="h-11 pl-10" placeholder="Job, operator, material, machine" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                  <div className="flex rounded-md border p-1">
                    {(["priority", "oldest", "newest"] as Sort[]).map((s) => <button key={s} onClick={() => setSort(s)} data-testid={`button-sort-${s}`} className={cn("h-9 rounded-sm px-3 text-sm font-semibold capitalize", sort === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{s}</button>)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {FLAG_FILTERS.map(({ k, label }) => (
                    <button key={k} onClick={() => setFlag(k)} data-testid={`filter-${k}`} className={cn("h-8 rounded-sm border px-2.5 text-xs font-semibold", flag === k ? "border-foreground bg-foreground text-background" : "bg-background hover:border-foreground/40")}>
                      {label}<span className="num ml-1.5 opacity-70">{counts[k] ?? 0}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <section className="rounded-md border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <p className="num text-xs uppercase tracking-wider text-muted-foreground">{shown.length} shown · {sort === "priority" ? "flags weighted, then oldest" : `${sort} first`}</p>
                {(search || flag !== "all") && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFlag("all"); }} data-testid="button-clear-queue"><X className="h-4 w-4" />Clear</Button>}
              </div>
              {shown.length ? shown.map((i, n) => <Row key={i.job.id} {...i} rank={n} />)
                : <div className="p-10 text-center"><AlertTriangle className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 font-semibold">Nothing matches this filter.</p></div>}
            </section>
            <p className="mt-3 text-xs text-muted-foreground">Flags point to what to verify. Scrap reasons are as recorded by operators, not verified root causes.</p>
          </>
        )}
    </>
  );
}
