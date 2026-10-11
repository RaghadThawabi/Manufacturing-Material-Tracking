import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useListJobs, getListJobsQueryKey, type Job } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ErrorPanel, StatusBadge, SampleFlag } from "@/components/mf-ui";
import { analyzeScrap, initialInsightFilters, type InsightFilters } from "@/lib/production-analysis";
import { errMsg, fmt } from "@/lib/mf";
import { cn } from "@/lib/utils";

const ANY = "";
const uniq = (jobs: Job[], k: "unit" | "material" | "machine" | "product") =>
  [...new Set(jobs.map((j) => j[k]).filter((v) => v && v.trim()))].sort((a, b) => a.localeCompare(b));

function loadFilters(companyId: string): InsightFilters | null {
  try {
    const raw = sessionStorage.getItem(`mf.insight.${companyId}`);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return { ...initialInsightFilters, ...p, includeSamples: p.includeSamples === true, status: ["approved", "submitted", "both"].includes(p.status) ? p.status : "approved" };
  } catch { return null; }
}

const sel = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";

export function ScrapInsight({ companyId }: { companyId: string }) {
  const q = useListJobs(companyId, { query: { queryKey: getListJobsQueryKey(companyId), refetchInterval: 15000 } });
  const all = useMemo(() => q.data ?? [], [q.data]);
  const [f, setF] = useState<InsightFilters>(() => loadFilters(companyId) ?? initialInsightFilters);
  const [open, setOpen] = useState<string | null>(null);
  const units = useMemo(() => uniq(all, "unit"), [all]);
  useEffect(() => {
    if (!f.unit && units.length) setF((p) => ({ ...p, unit: units.includes("kg") ? "kg" : units[0] }));
  }, [units, f.unit]);
  useEffect(() => { sessionStorage.setItem(`mf.insight.${companyId}`, JSON.stringify(f)); }, [f, companyId]);
  const set = <K extends keyof InsightFilters>(k: K, v: InsightFilters[K]) => { setF((p) => ({ ...p, [k]: v })); setOpen(null); };
  const r = useMemo(() => analyzeScrap(all, f), [all, f]);
  const unitOptions = f.unit && !units.includes(f.unit) ? [f.unit, ...units] : units;
  const opts = (k: "material" | "machine" | "product") => { const o = uniq(all, k); return f[k] && !o.includes(f[k]) ? [f[k], ...o] : o; };
  const statusLabel = f.status === "approved" ? "Approved only" : f.status === "submitted" ? "Submitted, awaiting review only" : "Approved + submitted awaiting review";
  const opened = r.reasons.find((x) => x.reason === open);

  return (
    <section className="mt-8 rounded-md border-2 border-foreground bg-card" aria-labelledby="insight-title" data-testid="section-scrap-insight">
      <div className="border-b px-5 py-4">
        <p className="num text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Admin / manager insight · filtered separately from the dashboard above</p>
        <h3 id="insight-title" className="mt-1 text-xl font-extrabold">Largest recorded scrap reason</h3>
      </div>
      <fieldset className="grid gap-3 border-b bg-muted/30 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="sr-only">Insight filters</legend>
        <label className="text-xs font-semibold">Job date from (inclusive)<Input type="date" className="mt-1 h-10" value={f.from} onChange={(e) => set("from", e.target.value)} data-testid="input-insight-from" /></label>
        <label className="text-xs font-semibold">Job date to (inclusive)<Input type="date" className="mt-1 h-10" value={f.to} onChange={(e) => set("to", e.target.value)} data-testid="input-insight-to" /></label>
        <label className="text-xs font-semibold">Recording unit (required)
          <select className={cn(sel, "mt-1")} value={f.unit} onChange={(e) => set("unit", e.target.value)} data-testid="select-insight-unit">
            {!unitOptions.length && <option value="">No units recorded</option>}
            {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
          </select></label>
        <label className="text-xs font-semibold">Status
          <select className={cn(sel, "mt-1")} value={f.status} onChange={(e) => set("status", e.target.value as InsightFilters["status"])} data-testid="select-insight-status">
            <option value="approved">Approved</option><option value="submitted">Submitted, awaiting review</option><option value="both">Both</option>
          </select></label>
        {(["material", "machine", "product"] as const).map((k) => (
          <label key={k} className="text-xs font-semibold capitalize">{k} (exact)
            <select className={cn(sel, "mt-1")} value={f[k]} onChange={(e) => set(k, e.target.value)} data-testid={`select-insight-${k}`}>
              <option value={ANY}>All {k}s</option>{opts(k).map((o) => <option key={o} value={o}>{o}</option>)}
            </select></label>
        ))}
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold"><Checkbox checked={f.includeSamples} onCheckedChange={(v) => set("includeSamples", v === true)} data-testid="checkbox-insight-samples" />Include illustrative sample jobs</label>
          <Button variant="outline" size="sm" onClick={() => { setF({ ...initialInsightFilters, unit: units.includes("kg") ? "kg" : units[0] ?? "" }); setOpen(null); }} data-testid="button-insight-reset">Reset filters</Button>
        </div>
      </fieldset>

      <div className="px-5 py-4 text-sm" data-testid="text-insight-scope">
        <p><span className="font-bold">Scope:</span> {f.from || "earliest"} to {f.to || "latest"} · unit <b>{f.unit || "none"}</b> · {statusLabel} · material {f.material || "all"} · machine {f.machine || "all"} · product {f.product || "all"} · samples {f.includeSamples ? "included" : "excluded"}</p>
        <p className="mt-1 text-muted-foreground"><span className="font-semibold text-foreground">Share formula:</span> reason recorded quantity / total recorded scrap for the same selected scope and unit.</p>
      </div>

      <div className="px-5 pb-5">
        {q.isLoading ? <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-40" /></div>
          : q.error ? <ErrorPanel title="Insight unavailable" message={`${errMsg(q.error)} No insight is shown until job records load successfully.`} onRetry={() => q.refetch()} />
          : r.invalidDateRange ? <State title="Invalid date range" body="The 'from' date is after the 'to' date. Adjust the range to see results." />
          : !f.unit ? <State title="No recording unit available" body="No jobs with a recording unit exist yet." />
          : !r.jobs.length ? <State title="No matching jobs" body="No job records match this scope. Try widening the dates, status, or exact filters." />
          : r.totalScrap <= 0 ? <State title="Zero recorded scrap" body={`${r.jobs.length} matching job${r.jobs.length === 1 ? "" : "s"}, but no scrap quantity above zero was recorded in ${f.unit}.`} />
          : (
            <div className="space-y-5">
              {r.sampleCount > 0 && <p role="status" className="rounded-md border border-dashed border-foreground/50 bg-accent/15 px-3 py-2 text-sm font-semibold" data-testid="text-insight-samples">Includes {r.sampleCount} illustrative sample job{r.sampleCount === 1 ? "" : "s"} — not real production records.</p>}
              <div className="rounded-md bg-foreground p-4 text-background" data-testid="text-insight-leader">
                <p className="text-xs font-black uppercase tracking-widest opacity-70">{r.leaders.length > 1 ? `Tie — ${r.leaders.length} reasons share the largest recorded quantity` : "Largest recorded reason"}</p>
                <ul className="mt-2 space-y-1">
                  {r.leaders.map((l) => <li key={l.reason} className="text-lg font-extrabold">{l.reason}: <span className="num">{fmt(l.quantity, 2)} {f.unit}</span> · <span className="num">{l.share.toFixed(1)}%</span></li>)}
                </ul>
                <p className="mt-2 text-xs opacity-80">This is the largest RECORDED reason in this scope; it is not proven to be the root cause.</p>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <Stat k="Matching jobs" v={String(r.jobs.length)} />
                <Stat k="Total recorded scrap" v={`${fmt(r.totalScrap, 2)} ${f.unit}`} />
                {f.status === "both" && <><Stat k="Approved subtotal" v={`${fmt(r.approvedScrap, 2)} ${f.unit}`} /><Stat k="Submitted (awaiting review) subtotal" v={`${fmt(r.submittedScrap, 2)} ${f.unit}`} /></>}
              </dl>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[560px] text-sm" data-testid="table-insight-reasons">
                  <caption className="sr-only">Recorded scrap by reason, ranked</caption>
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide"><tr>
                    <th className="px-3 py-2">Rank</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2 text-right">Quantity ({f.unit})</th><th className="px-3 py-2 text-right">Share</th>
                    {f.status === "both" && <><th className="px-3 py-2 text-right">Approved</th><th className="px-3 py-2 text-right">Submitted</th></>}
                    <th className="px-3 py-2">Jobs</th></tr></thead>
                  <tbody>{r.reasons.map((x, i) => (
                    <tr key={x.reason} className={cn("border-t", open === x.reason && "bg-accent/15")}>
                      <td className="num px-3 py-2">{r.reasons.findIndex((y) => Math.abs(y.quantity - x.quantity) < 1e-8) + 1}</td>
                      <td className="px-3 py-2 font-semibold">{x.reason}</td>
                      <td className="num px-3 py-2 text-right">{fmt(x.quantity, 2)}</td>
                      <td className="num px-3 py-2 text-right">{x.share.toFixed(1)}%</td>
                      {f.status === "both" && <><td className="num px-3 py-2 text-right">{fmt(x.approvedQuantity, 2)}</td><td className="num px-3 py-2 text-right">{fmt(x.submittedQuantity, 2)}</td></>}
                      <td className="px-3 py-2"><Button size="sm" variant="outline" aria-expanded={open === x.reason} onClick={() => setOpen(open === x.reason ? null : x.reason)} data-testid={`button-insight-reason-${i}`}>{open === x.reason ? "Hide" : `Show ${x.contributors.length}`}</Button></td>
                    </tr>))}</tbody>
                </table>
              </div>
              {opened && (
                <div className="rounded-md border" data-testid="panel-insight-contributors">
                  <p className="border-b px-3 py-2 text-sm"><b>{opened.reason}</b> — {fmt(opened.quantity, 2)} of {fmt(r.totalScrap, 2)} {f.unit} ({opened.share.toFixed(1)}%) across {opened.contributors.length} job{opened.contributors.length === 1 ? "" : "s"}</p>
                  <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide"><tr><th className="px-3 py-2">Job</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">This reason ({f.unit})</th></tr></thead>
                    <tbody>{opened.contributors.map(({ job, quantity }) => (
                      <tr key={job.id} className="border-t">
                        <td className="px-3 py-2"><Link href={`/jobs/${job.id}`} className="font-semibold text-primary underline-offset-2 hover:underline" data-testid={`link-insight-job-${job.id}`}>{job.number}</Link> {job.isSample && <SampleFlag />}</td>
                        <td className="num px-3 py-2">{job.date}</td><td className="px-3 py-2"><StatusBadge status={job.status} /></td>
                        <td className="num px-3 py-2 text-right">{fmt(quantity, 2)}</td>
                      </tr>))}</tbody>
                  </table></div>
                </div>
              )}
            </div>
          )}
      </div>
    </section>
  );
}

function State({ title, body }: { title: string; body: string }) {
  return <div role="status" className="rounded-md border border-dashed p-6 text-center" data-testid="text-insight-state"><p className="font-bold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{body}</p></div>;
}
function Stat({ k, v }: { k: string; v: string }) {
  return <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="num mt-1 font-bold">{v}</dd></div>;
}
