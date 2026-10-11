import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Search, FolderOpen, Save, AlertTriangle } from "lucide-react";
import {
  useGetDetective, getGetDetectiveQueryKey, useCreateInvestigation, useUpdateInvestigation,
  type WasteSignal, type WasteInvestigation, type DetectiveJob, type InvestigationUpdateStatus, type DetectiveSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PageHeader, ErrorPanel, Metric } from "@/components/mf-ui";
import { useCompany, canReview, errMsg, pct, fmt, isConflict } from "@/lib/mf";
import { cn } from "@/lib/utils";

const today = () => new Date().toISOString().slice(0, 10);
const pp = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)} pp`;
const STATUSES: InvestigationUpdateStatus[] = ["open", "monitoring", "closed"];

function JobLink({ j }: { j: DetectiveJob }) {
  return <Link href={`/jobs/${j.id}`} className="font-semibold underline underline-offset-2 hover:text-primary" data-testid={`link-job-${j.id}`}>{j.number}</Link>;
}

function JobTable({ jobs, label }: { jobs: DetectiveJob[]; label: string }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm" aria-label={label}>
        <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className="p-2">Job</th><th className="p-2">Date</th><th className="p-2 text-right">Issued</th><th className="p-2 text-right">Scrap</th><th className="p-2 text-right">Good</th><th className="p-2 text-right">Scrap %</th><th className="p-2 text-right">Yield %</th></tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-t">
              <td className="p-2"><JobLink j={j} /></td><td className="p-2 font-mono">{j.date}</td>
              <td className="p-2 text-right font-mono">{fmt(j.issued)} {j.unit}</td><td className="p-2 text-right font-mono">{fmt(j.scrap)}</td>
              <td className="p-2 text-right font-mono">{fmt(j.good)}</td><td className="p-2 text-right font-mono">{pct(j.scrapRate)}</td><td className="p-2 text-right font-mono">{pct(j.yieldRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SignalBody({ s }: { s: WasteSignal }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><p className="text-xs text-muted-foreground">Job scrap rate</p><p className="font-mono text-lg font-bold text-[hsl(var(--waste))]">{pct(s.job.scrapRate)}</p></div>
        <div><p className="text-xs text-muted-foreground">Baseline median</p><p className="font-mono text-lg font-bold">{pct(s.medianRate)}</p></div>
        <div><p className="text-xs text-muted-foreground">Above median</p><p className="font-mono text-lg font-bold">{pp(s.difference)}</p></div>
        <div><p className="text-xs text-muted-foreground">Quantity</p><p className="font-mono text-lg font-bold">{fmt(s.job.scrap)} / {fmt(s.job.issued)} {s.job.unit}</p></div>
      </div>
      <p className="text-sm">{s.explanation}</p>
      <p className="text-sm"><span className="font-semibold">Largest recorded reason (not a confirmed cause):</span> {s.largestReason || "None recorded"}</p>
      <details className="text-sm"><summary className="cursor-pointer font-semibold" data-testid={`toggle-baseline-${s.job.id}`}>Baseline: {s.baseline.length} earlier approved jobs</summary><div className="mt-2"><JobTable jobs={s.baseline} label="Baseline jobs" /></div></details>
    </div>
  );
}

function InvestigationCard({ inv, companyId }: { inv: WasteInvestigation; companyId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const update = useUpdateInvestigation();
  const [form, setForm] = useState({ action: inv.action, notes: inv.notes, actionDate: inv.actionDate ?? "", status: inv.status as InvestigationUpdateStatus });
  const base = useRef(inv.version);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    if (!dirty && inv.version !== base.current) {
      base.current = inv.version;
      setForm({ action: inv.action, notes: inv.notes, actionDate: inv.actionDate ?? "", status: inv.status as InvestigationUpdateStatus });
    }
  }, [inv, dirty]);
  const set = (k: keyof typeof form, v: string) => { setDirty(true); setErr(null); setForm((f) => ({ ...f, [k]: v })); };
  const s = inv.signal;
  const validate = () => {
    if (form.status !== "open") {
      if (!form.action.trim()) return "Monitoring or Closed requires a corrective action.";
      if (!form.actionDate) return "Monitoring or Closed requires the date the action was applied.";
    }
    if (form.actionDate && (form.actionDate < s.job.date || form.actionDate > today())) return `Action date must be between ${s.job.date} and today.`;
    return null;
  };
  const save = () => {
    const v = validate(); if (v) { setErr(v); return; }
    update.mutate({ companyId, investigationId: inv.id, data: { version: base.current, ...form } }, {
      onSuccess: (r) => {
        qc.setQueryData<DetectiveSummary>(getGetDetectiveQueryKey(companyId), old => old ? { ...old, investigations: old.investigations.map(i => i.id === r.id ? r : i) } : old);
        base.current = r.version; setForm({action:r.action,notes:r.notes,actionDate:r.actionDate,status:r.status as InvestigationUpdateStatus});
        setDirty(false); setConflict(false); qc.invalidateQueries({ queryKey: getGetDetectiveQueryKey(companyId) }); toast({ title: "Investigation saved" });
      },
      onError: (e) => { if (isConflict(e)) setConflict(true); setErr(errMsg(e)); },
    });
  };
  const reload = async () => {
    try {
      await qc.refetchQueries({ queryKey: getGetDetectiveQueryKey(companyId) }, { throwOnError: true });
      const latest = qc.getQueryData<DetectiveSummary>(getGetDetectiveQueryKey(companyId))?.investigations.find(i => i.id === inv.id);
      if (!latest) throw new Error("Investigation unavailable. Reload the page.");
      base.current = latest.version; setForm({ action: latest.action, notes: latest.notes, actionDate: latest.actionDate, status: latest.status as InvestigationUpdateStatus });
      setDirty(false); setConflict(false); setErr(null);
    } catch (e) { setErr(errMsg(e)); }
  };
  const after = inv.afterScrapRate;
  return (
    <article id={`inv-${inv.id}`} className="rounded-md border-2 border-foreground bg-card p-5" data-testid={`card-investigation-${inv.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-extrabold">Job <JobLink j={s.job} /> <span className="font-mono text-sm font-normal text-muted-foreground">{s.job.date}</span></h3>
        <span className="rounded-sm bg-accent px-2 py-0.5 text-xs font-bold uppercase" data-testid={`status-investigation-${inv.id}`}>{inv.status}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Signal snapshot captured {new Date(inv.createdAt).toLocaleString()} by {inv.createdBy}</p>
      <div className="mt-4"><SignalBody s={s} /></div>

      <fieldset disabled={update.isPending} className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2"><Label htmlFor={`a-${inv.id}`}>Corrective action</Label><Textarea id={`a-${inv.id}`} maxLength={2000} value={form.action} onChange={(e) => set("action", e.target.value)} data-testid={`input-action-${inv.id}`} /></div>
        <div className="md:col-span-2"><Label htmlFor={`n-${inv.id}`}>Notes</Label><Textarea id={`n-${inv.id}`} maxLength={4000} value={form.notes} onChange={(e) => set("notes", e.target.value)} data-testid={`input-notes-${inv.id}`} /></div>
        <div><Label htmlFor={`d-${inv.id}`}>Date action applied (optional)</Label><Input id={`d-${inv.id}`} type="date" min={s.job.date} max={today()} value={form.actionDate} onChange={(e) => set("actionDate", e.target.value)} data-testid={`input-date-${inv.id}`} /></div>
        <div><Label>Status</Label>
          <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Status">
            {STATUSES.map((st) => <button key={st} type="button" role="radio" aria-checked={form.status === st} onClick={() => set("status", st)} data-testid={`button-status-${st}-${inv.id}`}
              className={cn("h-10 flex-1 rounded-md border text-sm font-semibold capitalize", form.status === st ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>{st}</button>)}
          </div>
        </div>
      </fieldset>
      {err && <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-destructive" data-testid={`error-investigation-${inv.id}`}><AlertTriangle className="h-4 w-4" />{err}</p>}
      {conflict && <Button variant="outline" size="sm" className="mt-2" onClick={reload} data-testid={`button-reload-${inv.id}`}>Discard my edits and load latest</Button>}
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={save} disabled={update.isPending || !dirty} data-testid={`button-save-${inv.id}`}><Save />{update.isPending ? "Saving..." : "Save"}</Button>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes (v{base.current})</span>}
      </div>

      <section className="mt-6 border-t pt-4">
        <h4 className="font-bold">Before and after</h4>
        {!inv.actionDate ? <p className="mt-1 text-sm text-muted-foreground">Save an action date to compare later matching jobs.</p>
          : inv.followups.length === 0 || after === null ? <p className="mt-1 text-sm text-muted-foreground" data-testid={`empty-after-${inv.id}`}>No matching approved jobs dated after {inv.actionDate} yet.</p>
          : <>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Before (flagged job)</p><p className="font-mono">Scrap {pct(s.job.scrapRate)} · Yield {pct(s.job.yieldRate)}</p></div>
              <div><p className="text-xs text-muted-foreground">After ({inv.followups.length} jobs, weighted)</p><p className="font-mono">Scrap {pct(after)} · Yield {pct(inv.afterYieldRate)}</p></div>
              <div><p className="text-xs text-muted-foreground">Scrap change</p><p className="font-mono font-bold">{pp(after - s.job.scrapRate)}</p></div>
              <div><p className="text-xs text-muted-foreground">Yield change</p><p className="font-mono font-bold">{pp((inv.afterYieldRate ?? 0) - s.job.yieldRate)}</p></div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Observed difference only; this does not show that the action caused it, nor any savings.</p>
            <div className="mt-2"><JobTable jobs={inv.followups} label="After jobs" /></div>
          </>}
      </section>
    </article>
  );
}

export default function Detective() {
  const { company } = useCompany();
  const allowed = canReview(company?.role);
  const companyId = company?.id ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useGetDetective(companyId, { query: { queryKey: getGetDetectiveQueryKey(companyId), refetchInterval: 15000, enabled: allowed && !!companyId } });
  const create = useCreateInvestigation();
  const [tab, setTab] = useState<"signals" | "investigations">("signals");
  const [filter, setFilter] = useState<string>("all");
  const [target, setTarget] = useState<WasteSignal | null>(null);
  const [draft, setDraft] = useState({ action: "", notes: "" });
  useEffect(() => { setTarget(null); setDraft({ action: "", notes: "" }); setTab("signals"); setFilter("all"); }, [companyId]);
  const byJob = useMemo(() => new Map((q.data?.investigations ?? []).map((i) => [i.signal.job.id, i])), [q.data]);

  if (!allowed) return <ErrorPanel title="No access" message="Waste Detective is available to supervisors, managers and admins." />;
  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (q.error || !q.data) return <ErrorPanel message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  const invs = d.investigations.filter((i) => filter === "all" || i.status === filter);
  const openInv = (id: string) => { setTab("investigations"); setFilter("all"); setTimeout(() => document.getElementById(`inv-${id}`)?.scrollIntoView({ behavior: "smooth" }), 50); };
  const submit = () => {
    if (!target) return;
    create.mutate({ companyId, data: { jobId: target.job.id, ...draft } }, {
      onSuccess: (inv) => { qc.invalidateQueries({ queryKey: getGetDetectiveQueryKey(companyId) }); setTarget(null); setDraft({ action: "", notes: "" }); toast({ title: "Investigation opened" }); openInv(inv.id); },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Waste Detective" title="Unusual scrap signals" />
      <p className="max-w-3xl text-sm text-muted-foreground">Fixed rule, no AI: an approved non-sample job is flagged when its scrap rate is at least 5 pp above the median of at least 5 earlier approved jobs (prior 90 days) with exactly the same material, machine, product, unit and dimensions. Jobs missing specifications or measurements are not eligible.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Eligible jobs" value={String(d.eligibleJobs)} />
        <Metric label="Insufficient history" value={String(d.insufficientHistory)} tone="pending" />
        <Metric label="Signals" value={String(d.signals.length)} tone="waste" />
        <Metric label="Investigations" value={String(d.investigations.length)} tone="good" />
      </div>
      <div role="tablist" className="flex gap-1 border-b">
        {(["signals", "investigations"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`tab-${t}`}
          className={cn("-mb-px border-b-2 px-4 py-2 font-semibold capitalize", tab === t ? "border-foreground" : "border-transparent text-muted-foreground")}>{t}</button>)}
      </div>

      {tab === "signals" && (d.signals.length === 0
        ? <div className="rounded-md border-2 border-dashed p-10 text-center" data-testid="empty-signals"><Search className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-2 font-semibold">No signals right now</p><p className="text-sm text-muted-foreground">No eligible job exceeds its baseline median by 5 pp or more.</p></div>
        : <div className="space-y-4">{d.signals.map((s) => {
          const ex = byJob.get(s.job.id);
          return (
            <article key={s.job.id} className="rounded-md border bg-card p-5" data-testid={`card-signal-${s.job.id}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-extrabold">Job <JobLink j={s.job} /> <span className="font-mono text-sm font-normal text-muted-foreground">{s.job.date}</span></h3>
                {ex ? <Button variant="outline" onClick={() => openInv(ex.id)} data-testid={`button-open-investigation-${s.job.id}`}><FolderOpen />Open investigation ({ex.status})</Button>
                  : <Button onClick={() => { create.reset(); setTarget(s); }} data-testid={`button-investigate-${s.job.id}`}><Search />Investigate</Button>}
              </div>
              <SignalBody s={s} />
            </article>
          );
        })}</div>)}

      {tab === "investigations" && <div className="space-y-4">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
          {["all", ...STATUSES].map((f) => <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize" data-testid={`filter-${f}`}>
            {f} ({f === "all" ? d.investigations.length : d.investigations.filter((i) => i.status === f).length})</Button>)}
        </div>
        {invs.length === 0 ? <div className="rounded-md border-2 border-dashed p-10 text-center text-sm text-muted-foreground" data-testid="empty-investigations">No investigations{filter !== "all" ? ` with status ${filter}` : ""}. Open one from a signal.</div>
          : invs.map((i) => <InvestigationCard key={i.id} inv={i} companyId={companyId} />)}
      </div>}

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Investigate job {target?.job.number}</DialogTitle><DialogDescription>The current signal will be saved as a snapshot.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label htmlFor="new-action">Corrective action</Label><Textarea id="new-action" maxLength={2000} value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} data-testid="input-new-action" /></div>
            <div><Label htmlFor="new-notes">Notes</Label><Textarea id="new-notes" maxLength={4000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} data-testid="input-new-notes" /></div>
            {create.error && <p role="alert" className="text-sm text-destructive">{errMsg(create.error)}</p>}
            <Button className="w-full" onClick={submit} disabled={create.isPending} data-testid="button-create-investigation">{create.isPending ? "Opening..." : "Open investigation"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
