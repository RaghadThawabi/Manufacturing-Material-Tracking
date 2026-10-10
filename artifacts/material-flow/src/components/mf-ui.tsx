import { type ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, RotateCcw, FileClock, PencilLine, Minus, Plus } from "lucide-react";
import type { Job, Summary, Audit } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { fmt, pct } from "@/lib/mf";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground border-border", Icon: PencilLine },
  submitted: { label: "Pending review", cls: "bg-accent/20 text-foreground border-accent", Icon: FileClock },
  approved: { label: "Approved", cls: "bg-good/10 text-good border-good", Icon: CheckCircle2 },
  returned: { label: "Returned", cls: "bg-waste/10 text-waste border-waste", Icon: RotateCcw },
};
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.draft;
  return (
    <span data-testid={`status-${status}`} className={cn("inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide", s.cls)}>
      <s.Icon className="h-3.5 w-3.5" />{s.label}
    </span>
  );
}

export function SampleFlag() {
  return <span className="inline-flex items-center rounded-sm border border-dashed border-foreground/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sample data</span>;
}

export function FlowBar({ issued, good, scrap, offcuts, pending = 0, className }: { issued: number; good: number; scrap: number; offcuts: number; pending?: number; className?: string }) {
  const base = Math.max(issued, good + scrap + offcuts + pending, 1);
  const w = (v: number) => `${Math.max(0, (v / base) * 100)}%`;
  const gap = issued - good - scrap - offcuts - pending;
  return (
    <div className={cn("flex h-3 w-full overflow-hidden rounded-sm bg-muted", className)}>
      <div className="bar-in bg-good transition-all duration-500" style={{ width: w(good) }} title={`Good ${fmt(good)}`} />
      <div className="bar-in bg-reuse transition-all duration-500" style={{ width: w(offcuts) }} title={`Reusable ${fmt(offcuts)}`} />
      <div className="bar-in bg-waste transition-all duration-500" style={{ width: w(scrap) }} title={`Scrap ${fmt(scrap)}`} />
      {pending > 0 && <div className="bar-in pending-fill transition-all duration-500" style={{ width: w(pending) }} title={`Pending rework ${fmt(pending)}`} />}
      {gap > 0 && <div className="hazard opacity-60" style={{ width: w(gap) }} title={`Unexplained ${fmt(gap)}`} />}
    </div>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[2px] bg-good" />Good</span>
      <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[2px] bg-reuse" />Reusable offcuts</span>
      <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[2px] bg-waste" />Scrap / waste</span>
      <span className="flex items-center gap-1.5"><i className="pending-fill h-2.5 w-2.5 rounded-[2px]" />Pending rework</span>
      <span className="flex items-center gap-1.5"><i className="hazard h-2.5 w-2.5 rounded-[2px]" />Unexplained</span>
    </div>
  );
}

/** Plain-language balance: accounted vs unexplained, plus measurement completeness. */
export function BalanceText({ issued, accounted, unit, tolerance, measured, total, missing, testId = "text-balance" }: {
  issued: number | null; accounted: number; unit: string; tolerance: number; measured?: number; total?: number; missing?: string[]; testId?: string;
}) {
  const gap = (issued ?? 0) - accounted;
  const ok = issued !== null && issued > 0 && Math.abs(gap) <= tolerance + 1e-8;
  return (
    <div data-testid={testId} className="space-y-1 text-sm">
      <p>
        <span className="font-semibold">Accounted</span> <span className="num">{fmt(accounted, 3)}</span> of <span className="num">{fmt(issued, 3)}</span> {unit}
        {" · "}
        <span className={cn("font-semibold", ok ? "text-good" : issued ? "text-destructive" : "text-muted-foreground")}>
          {gap > 0 ? `Unexplained ${fmt(gap, 3)}` : gap < 0 ? `Over-recorded ${fmt(-gap, 3)}` : "Nothing unexplained"}
        </span>{gap !== 0 && ` ${unit}`}
      </p>
      {total !== undefined && (
        <p className="text-xs text-muted-foreground">
          Measurement <span className="num">{measured}/{total}</span>{missing && missing.length > 0 ? ` · not measured: ${missing.join(", ")}` : " · complete"}
        </p>
      )}
    </div>
  );
}

type UnitRow = Summary["units"][number] & { pendingRework?: number };
const pendOf = (u: UnitRow) => u.pendingRework ?? 0;

export function ErrorPanel({ message, onRetry, title = "Could not complete" }: { message: string; onRetry?: () => void; title?: string }) {
  if (!message) return null;
  return (
    <div role="alert" data-testid="text-error" className="rise flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      <div className="flex-1"><p className="font-semibold text-destructive">{title}</p><p className="mt-0.5 text-foreground/80">{message}</p></div>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry} data-testid="button-retry">Retry</Button>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="rise mb-6 flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <p className="num text-xs uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>}
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Metric({ label, value, unit, tone, sub }: { label: string; value: string; unit?: string; tone?: "good" | "waste" | "reuse" | "pending"; sub?: string }) {
  return (
    <div className="relative overflow-hidden rounded-md border bg-card p-4">
      {tone && <span className={cn("absolute inset-y-0 left-0 w-1", tone === "good" ? "bg-good" : tone === "waste" ? "bg-waste" : tone === "pending" ? "pending-fill" : "bg-reuse")} />}
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="num mt-2 text-2xl font-semibold">{value}{unit && <span className="ml-1 text-sm text-muted-foreground">{unit}</span>}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function QtyField({ label, value, onChange, tone, unit, hint, testId, disabled }: { label: string; value: number | null; onChange: (v: number | null) => void; tone?: "good" | "waste" | "reuse" | "pending"; unit?: string; hint?: string; testId: string; disabled?: boolean }) {
  const step = (d: number) => onChange(Math.max(0, (value ?? 0) + d));
  return (
    <fieldset disabled={disabled} className={cn("rounded-md border-2 bg-card p-4 transition-colors disabled:opacity-60", value === null ? "border-dashed border-input" : tone === "good" ? "border-good" : tone === "waste" ? "border-waste" : tone === "reuse" ? "border-reuse" : tone === "pending" ? "border-pending" : "border-primary")}>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
          {tone && <i className={cn("h-3 w-3 rounded-[2px]", tone === "good" ? "bg-good" : tone === "waste" ? "bg-waste" : tone === "pending" ? "pending-fill" : "bg-reuse")} />}{label}
        </label>
        <span className="text-xs text-muted-foreground">{value === null ? "Not measured" : unit}</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="button" variant="outline" className="h-14 w-14 shrink-0" onClick={() => step(-1)} aria-label="decrease" data-testid={`button-dec-${testId}`}><Minus /></Button>
        <input
          data-testid={`input-${testId}`} inputMode="decimal" placeholder="—"
          className="num h-14 w-full min-w-0 rounded-md border bg-background px-3 text-center text-3xl font-semibold outline-none focus:ring-2 focus:ring-ring"
          value={value ?? ""}
          onChange={(e) => { const t = e.target.value.replace(",", "."); if (t === "") return onChange(null); const n = Number(t); if (!Number.isNaN(n) && n >= 0) onChange(n); }}
        />
        <Button type="button" variant="outline" className="h-14 w-14 shrink-0" onClick={() => step(1)} aria-label="increase" data-testid={`button-inc-${testId}`}><Plus /></Button>
      </div>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </fieldset>
  );
}

export function ChipPicker({ options, value, onChange, testId, empty }: { options: string[]; value: string; onChange: (v: string) => void; testId: string; empty?: string }) {
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  if (!opts.length) return <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{empty ?? "No options configured. An admin can add them in Settings."}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <button type="button" key={o} data-testid={`chip-${testId}-${o}`} onClick={() => onChange(o)}
          className={cn("min-h-12 rounded-md border-2 px-4 text-sm font-semibold transition-all active:scale-[.97]", value === o ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50")}>
          {o}{!options.includes(o) && <span className="ml-1 text-[10px] opacity-70">(archived)</span>}
        </button>
      ))}
    </div>
  );
}

export function summarize(jobs: Job[]): Summary {
  const units: Record<string, UnitRow> = {};
  const cats: Record<string, Summary["categories"][number]> = {};
  for (const j of jobs) {
    const u: UnitRow = (units[j.unit] ??= { unit: j.unit, issued: 0, good: 0, scrap: 0, offcuts: 0, yieldRate: 0, pendingRework: 0 } as UnitRow);
    u.pendingRework = pendOf(u) + (j.pendingRework ?? 0);
    u.issued += j.issued ?? 0; u.good += j.good ?? 0; u.scrap += j.scrapTotal; u.offcuts += j.offcuts ?? 0;
    for (const s of j.scrap) { const k = `${s.reason}|${j.unit}`; (cats[k] ??= { reason: s.reason || "Unspecified", unit: j.unit, quantity: 0 }).quantity += s.quantity ?? 0; }
  }
  Object.values(units).forEach((u) => (u.yieldRate = u.issued ? (u.good / u.issued) * 100 : 0));
  return {
    jobs: jobs.length, pending: jobs.filter((j) => j.status === "submitted").length, approved: jobs.filter((j) => j.status === "approved").length,
    drafts: jobs.filter((j) => j.status === "draft").length, units: Object.values(units), categories: Object.values(cats),
  };
}

export function SummaryBoard({ summary }: { summary: Summary }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Jobs recorded" value={String(summary.jobs)} />
        <Metric label="Pending review" value={String(summary.pending)} tone="reuse" />
        <Metric label="Approved" value={String(summary.approved)} tone="good" />
        <Metric label="Drafts" value={String(summary.drafts)} />
      </div>
      {summary.units.length === 0 && <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No quantities recorded yet.</p>}
      {(summary.units as UnitRow[]).map((u, i) => {
        const cats = summary.categories.filter((c) => c.unit === u.unit).sort((a, b) => b.quantity - a.quantity);
        const max = Math.max(...cats.map((c) => c.quantity), 1);
        return (
          <section key={u.unit} className="rise rounded-md border bg-card" style={{ animationDelay: `${i * 80}ms` }}>
            <header className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="font-bold">Material balance <span className="num ml-2 rounded-sm bg-foreground px-1.5 py-0.5 text-xs text-background">{u.unit}</span></h3>
              <span className="text-xs text-muted-foreground">Totals in {u.unit} only — units never mixed</span>
            </header>
            <div className="grid gap-6 p-5 lg:grid-cols-[1.3fr_1fr]">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Metric label="Issued" value={fmt(u.issued)} unit={u.unit} />
                  <Metric label="Good" value={fmt(u.good)} unit={u.unit} tone="good" sub={`Yield ${pct(u.yieldRate)}`} />
                  <Metric label="Reusable" value={fmt(u.offcuts)} unit={u.unit} tone="reuse" sub={u.issued ? pct((u.offcuts / u.issued) * 100) : undefined} />
                  <Metric label="Scrap" value={fmt(u.scrap)} unit={u.unit} tone="waste" sub={u.issued ? pct((u.scrap / u.issued) * 100) : undefined} />
                  <Metric label="Pending rework" value={fmt(pendOf(u))} unit={u.unit} tone="pending" sub={u.issued ? pct((pendOf(u) / u.issued) * 100) : undefined} />
                </div>
                <FlowBar issued={u.issued} good={u.good} scrap={u.scrap} offcuts={u.offcuts} pending={pendOf(u)} className="h-5" />
                <Legend />
                <BalanceText issued={u.issued} accounted={u.good + u.offcuts + u.scrap + pendOf(u)} unit={u.unit} tolerance={0} testId={`text-balance-${u.unit}`} />
              </div>
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scrap by recorded reason</p>
                <div className="space-y-2.5">
                  {cats.map((c) => (
                    <div key={c.reason}>
                      <div className="flex justify-between text-sm"><span>{c.reason}</span><span className="num">{fmt(c.quantity)} {u.unit}</span></div>
                      <div className="mt-1 h-2 rounded-sm bg-muted"><div className="bar-in h-2 rounded-sm bg-waste" style={{ width: `${(c.quantity / max) * 100}%` }} /></div>
                    </div>
                  ))}
                  {!cats.length && <p className="text-sm text-muted-foreground">No scrap recorded.</p>}
                </div>
                <p className="mt-4 text-[11px] leading-snug text-muted-foreground">Reasons are as recorded by operators. They are not verified root causes.</p>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function JobRow({ job, href }: { job: Job; href?: string }) {
  const inner = (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="num text-base font-semibold">{job.number || "Untitled"}</span>
          <StatusBadge status={job.status} />{job.isSample && <SampleFlag />}
          {job.assignedName && <span className="text-xs text-muted-foreground">· {job.assignedName}</span>}
        </div>
        <p className="truncate text-sm text-muted-foreground">{job.date} · {job.material || "—"} · {job.machine || "—"} · {job.product || "—"}</p>
      </div>
      <div className="w-full md:w-64">
        <FlowBar issued={job.issued ?? 0} good={job.good ?? 0} scrap={job.scrapTotal} offcuts={job.offcuts ?? 0} pending={job.pendingRework ?? 0} />
        <div className="num mt-1.5 flex justify-between text-xs">
          <span>{fmt(job.issued)} {job.unit}</span>
          <span className="text-good">Y {pct(job.yieldRate)}</span>
          <span className="text-waste">S {pct(job.scrapRate)}</span>
          {(job.pendingRework ?? 0) > 0 && <span className="text-pending">R {fmt(job.pendingRework)}</span>}
          <span className={job.difference === 0 ? "text-muted-foreground" : "font-semibold text-destructive"}>Δ {fmt(job.difference)}</span>
        </div>
      </div>
    </>
  );
  const cls = "flex flex-col gap-3 border-b px-4 py-4 last:border-0 md:flex-row md:items-center md:gap-6";
  return href ? <Link href={href} data-testid={`row-job-${job.id}`} className={cn(cls, "transition-colors hover:bg-muted/50")}>{inner}</Link> : <div data-testid={`row-job-${job.id}`} className={cls}>{inner}</div>;
}

export function AuditTrail({ audit }: { audit: Audit[] }) {
  if (!audit.length) return <p className="text-sm text-muted-foreground">No audit entries.</p>;
  return (
    <ol className="relative space-y-5 border-l-2 border-border pl-5">
      {[...audit].reverse().map((a) => (
        <li key={a.id} className="relative" data-testid={`audit-${a.id}`}>
          <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold capitalize">{a.action}</span>
            <span className="text-sm">by {a.actor}</span>
            <span className="num text-xs text-muted-foreground">{new Date(a.at).toLocaleString()}</span>
          </div>
          {a.comment && <p className="mt-1 rounded-sm bg-muted px-3 py-2 text-sm">“{a.comment}”</p>}
          {a.changes && <p className="num mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{a.changes}</p>}
        </li>
      ))}
    </ol>
  );
}
