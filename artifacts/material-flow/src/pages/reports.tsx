import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Download, RotateCcw, ShieldAlert } from "lucide-react";
import { useListJobs, getListJobsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, ErrorPanel, StatusBadge, SampleFlag } from "@/components/mf-ui";
import { canReview, errMsg, fmt, pct, useCompany } from "@/lib/mf";
import { filterReportJobs, buildProductionCsv, type ReportFilters } from "@/lib/production-report";
import { measuredScrap } from "@/lib/production-analysis";
import type { Job } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const EMPTY: ReportFilters = { from: "", to: "", material: "", machine: "", product: "", unit: "", status: "", includeSamples: false };
type Agg = { jobs: number; issued: number | null; good: number | null; scrap: number | null; offcuts: number | null; pending: number | null };
const pendingOf = (j: Job): number | null => (j.pendingRework ?? null) !== null ? j.pendingRework! : (j.recordingVersion ?? 1) < 2 ? 0 : null;
const addN = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);
const rate = (n: number | null | undefined, d: number | null | undefined) => (n == null || !d ? null : (n / d) * 100);
const key = (id: string) => `mf.report.${id}`;

function load(id: string): ReportFilters {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(key(id)) || "{}") }; } catch { return EMPTY; }
}

function Pick({ label, value, options, onChange, id, labels }: { labels?: Record<string, string>; label: string; value: string; options: string[]; onChange: (v: string) => void; id: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</Label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} data-testid={`select-${id}`} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
      </select>
    </div>
  );
}

function ReportBody({ companyId, companyName }: { companyId: string; companyName: string }) {
  const { toast } = useToast();
  const [f, setF] = useState<ReportFilters>(() => load(companyId));
  useEffect(() => { localStorage.setItem(key(companyId), JSON.stringify(f)); }, [f, companyId]);
  const set = <K extends keyof ReportFilters>(k: K, v: ReportFilters[K]) => setF((p) => ({ ...p, [k]: v }));
  const q = useListJobs(companyId, { query: { queryKey: getListJobsQueryKey(companyId), refetchInterval: 15000 } });
  const jobs = useMemo(() => q.data ?? [], [q.data]);
  const opts = (k: "material" | "machine" | "product" | "unit") => [...new Set(jobs.map((j) => j[k]).filter(Boolean))].sort();

  const result = useMemo(() => {
    try { return { rows: filterReportJobs(jobs, f), error: "" }; } catch (e) { return { rows: [], error: errMsg(e) }; }
  }, [jobs, f]);
  const perUnit = useMemo(() => {
    const m = new Map<string, Agg>();
    for (const j of result.rows) {
      const r = m.get(j.unit) ?? { jobs: 0, issued: 0, good: 0, scrap: 0, offcuts: 0, pending: 0 };
      m.set(j.unit, { jobs: r.jobs + 1, issued: addN(r.issued, j.issued), good: addN(r.good, j.good), scrap: addN(r.scrap, measuredScrap(j)), offcuts: addN(r.offcuts, j.offcuts), pending: addN(r.pending, pendingOf(j)) });
    }
    return [...m.entries()];
  }, [result.rows]);

  const download = () => {
    let url = "";
    try {
      const csv = buildProductionCsv(jobs, f, companyName);
      url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `production-${companyName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {
      toast({ title: "Export failed", description: errMsg(e), variant: "destructive" });
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  };
  const canExport = !q.isLoading && !q.error && !result.error && result.rows.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-4 rounded-md border bg-card p-5 lg:self-start">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="from" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">From</Label><Input id="from" type="date" className="h-11" value={f.from} onChange={(e) => set("from", e.target.value)} data-testid="input-from" /></div>
          <div className="space-y-1"><Label htmlFor="to" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">To</Label><Input id="to" type="date" className="h-11" value={f.to} onChange={(e) => set("to", e.target.value)} data-testid="input-to" /></div>
        </div>
        <p className="text-xs text-muted-foreground">Both dates inclusive.</p>
        <Pick id="material" label="Material" value={f.material} options={opts("material")} onChange={(v) => set("material", v)} />
        <Pick id="machine" label="Machine" value={f.machine} options={opts("machine")} onChange={(v) => set("machine", v)} />
        <Pick id="product" label="Product" value={f.product} options={opts("product")} onChange={(v) => set("product", v)} />
        <Pick id="unit" label="Unit" value={f.unit} options={opts("unit")} onChange={(v) => set("unit", v)} />
        <Pick id="status" label="Status" value={f.status} options={["draft", "submitted", "returned", "approved"]} labels={{ submitted: "Submitted (awaiting review)" }} onChange={(v) => set("status", v)} />
        <label className="flex items-start gap-3 rounded-md border border-dashed p-3">
          <Switch checked={f.includeSamples} onCheckedChange={(v) => set("includeSamples", v)} data-testid="switch-include-samples" />
          <span className="text-sm"><span className="font-semibold">Include sample jobs</span><span className="block text-xs text-muted-foreground">Off by default. Samples are illustrative, not production.</span></span>
        </label>
        <Button variant="outline" className="h-11 w-full" onClick={() => setF(EMPTY)} data-testid="button-reset-filters"><RotateCcw />Reset filters</Button>
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="flex flex-col gap-3 rounded-md border-2 border-foreground bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Production CSV</p>
            <p className="text-sm" data-testid="text-report-count">{q.isLoading ? "Loading jobs" : `${result.rows.length} job${result.rows.length === 1 ? "" : "s"} match · ${perUnit.length} unit${perUnit.length === 1 ? "" : "s"}`}</p>
            <p className="text-xs text-muted-foreground">File is generated in your browser, includes scope and timestamp, and is not stored.</p>
          </div>
          <Button size="lg" className="h-12" disabled={!canExport} onClick={download} data-testid="button-download-csv"><Download />Download CSV</Button>
        </div>

        {q.isLoading ? <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
          : q.error ? <ErrorPanel message={errMsg(q.error)} onRetry={() => q.refetch()} />
          : result.error ? <ErrorPanel title="Check the filters" message={result.error} />
          : !result.rows.length ? (
            <div className="grid-paper rounded-md border border-dashed p-10 text-center" data-testid="empty-report">
              <p className="font-bold">No jobs match this scope.</p>
              <p className="mt-1 text-sm text-muted-foreground">Widen the date range or clear a filter.{!f.includeSamples && jobs.some((j) => j.isSample) ? " Sample jobs are excluded." : ""}</p>
            </div>
          ) : (
            <>
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground" data-testid="text-report-scope">
                Status scope: {f.status ? (f.status === "submitted" ? "submitted (awaiting review)" : f.status) : "all statuses, including drafts and returned"}. Totals are per unit, never combined. A dash means at least one selected job has not measured that field, so no total is shown. Legacy jobs recorded before pending rework existed count as 0 pending.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {perUnit.map(([unit, r]) => (
                  <div key={unit} className="rounded-md border bg-card p-4" data-testid={`card-unit-${unit}`}>
                    <div className="flex items-baseline justify-between"><span className="text-xs font-black uppercase tracking-widest">{unit}</span><span className="num text-sm text-muted-foreground">{r.jobs} jobs</span></div>
                    <dl className="num mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div><dt className="text-xs text-muted-foreground">Issued</dt><dd className="font-bold">{fmt(r.issued, 3)}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Good</dt><dd className="font-bold">{fmt(r.good, 3)}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Scrap</dt><dd className="font-bold">{fmt(r.scrap, 3)}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Offcuts</dt><dd className="font-bold">{fmt(r.offcuts, 3)}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Pending</dt><dd className="font-bold">{fmt(r.pending, 3)}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Yield</dt><dd className="font-bold">{pct(rate(r.good, r.issued))}</dd></div>
                    </dl>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto rounded-md border bg-card">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-widest text-muted-foreground"><tr className="border-b">
                    <th className="px-4 py-2">Job</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Issued</th><th className="px-4 py-2 text-right">Yield</th><th className="px-4 py-2 text-right">Scrap</th>
                  </tr></thead>
                  <tbody>
                    {result.rows.slice(0, 50).map((j) => (
                      <tr key={j.id} className="border-b last:border-0">
                        <td className="px-4 py-2"><Link href={`/jobs/${j.id}`} className="num font-bold text-primary" data-testid={`link-report-job-${j.id}`}>{j.number}</Link> {j.isSample && <SampleFlag />}<span className="block text-xs text-muted-foreground">{j.material} · {j.machine}</span></td>
                        <td className="num px-4 py-2">{j.date}</td>
                        <td className="px-4 py-2"><StatusBadge status={j.status} /></td>
                        <td className="num px-4 py-2 text-right">{fmt(j.issued, 3)} {j.unit}</td>
                        <td className="num px-4 py-2 text-right">{pct(rate(j.good, j.issued))}</td>
                        <td className="num px-4 py-2 text-right">{pct(rate(measuredScrap(j), j.issued))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.rows.length > 50 && <p className="border-t px-4 py-2 text-xs text-muted-foreground">Showing 50 of {result.rows.length}. The CSV contains every row.</p>}
              </div>
            </>
          )}
      </section>
    </div>
  );
}

export default function Reports() {
  const { company } = useCompany();
  if (!canReview(company!.role)) {
    return (
      <div className="mx-auto max-w-md rounded-md border-2 border-foreground bg-card p-8 text-center" data-testid="text-reports-forbidden">
        <ShieldAlert className="mx-auto h-8 w-8" />
        <h1 className="mt-3 text-xl font-extrabold">Reports are for supervisors and above</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ask an admin if you need production exports.</p>
        <Button asChild className="mt-4 h-11"><Link href="/">Back to overview</Link></Button>
      </div>
    );
  }
  return (
    <>
      <PageHeader eyebrow={company!.name} title="Reports" />
      <ReportBody key={company!.id} companyId={company!.id} companyName={company!.name} />
    </>
  );
}
