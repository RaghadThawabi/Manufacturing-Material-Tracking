import { useMemo, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { AlertTriangle } from "lucide-react";
import { useListJobs, getListJobsQueryKey, type Job } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, ErrorPanel, StatusBadge, SampleFlag } from "@/components/mf-ui";
import { compareProductionJobs } from "@/lib/production-analysis";
import { canReview, errMsg, fmt, useCompany } from "@/lib/mf";
import { cn } from "@/lib/utils";

const sel = "h-11 w-full rounded-md border border-input bg-background px-2 text-sm";
const MISSING = <span className="italic text-muted-foreground">Missing</span>;
const sign = (n: number, d: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${fmt(Math.abs(n), d)}`;
const provisional = (j: Job) => j.status === "draft" || j.status === "returned";

export default function Compare() {
  const { company } = useCompany();
  const id = company!.id;
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const q = useListJobs(id, { query: { queryKey: getListJobsQueryKey(id), refetchInterval: 15000 } });
  const jobs = useMemo(() => [...(q.data ?? [])].sort((x, y) => y.date.localeCompare(x.date) || x.number.localeCompare(y.number)), [q.data]);
  const a = jobs.find((j) => j.id === params.get("a")) ?? null;
  const b = jobs.find((j) => j.id === params.get("b")) ?? null;
  const setParam = (k: "a" | "b", v: string) => {
    const p = new URLSearchParams(search);
    if (v) p.set(k, v); else p.delete(k);
    navigate(`/compare${p.toString() ? `?${p}` : ""}`, { replace: true });
  };
  if (!canReview(company?.role)) return <><PageHeader eyebrow={company!.name} title="Compare jobs" /><ErrorPanel title="Reviewers only" message="Job comparison is available to admins, managers and supervisors." /></>;
  const label = (j: Job) => `${j.number} · ${j.date} · ${j.status}${provisional(j) ? " (provisional)" : ""}${j.isSample ? " · sample" : ""}`;
  const picker = (k: "a" | "b", cur: Job | null, other: Job | null) => (
    <label className="text-sm font-semibold">Job {k.toUpperCase()}
      <select className={cn(sel, "mt-1")} value={cur?.id ?? ""} onChange={(e) => setParam(k, e.target.value)} data-testid={`select-compare-${k}`}>
        <option value="">Choose a job…</option>
        {jobs.map((j) => <option key={j.id} value={j.id} disabled={j.id === other?.id}>{label(j)}</option>)}
      </select></label>
  );
  const staleParam = (k: "a" | "b", j: Job | null) => !q.isLoading && !q.error && params.get(k) && !j;
  return (
    <>
      <PageHeader eyebrow={company!.name} title="Compare jobs" />
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">Side-by-side recorded measurements for two jobs. Differences describe the records only; they do not prove cause, savings, or that one job is better.</p>
      {q.isLoading ? <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>
        : q.error ? <ErrorPanel message={`${errMsg(q.error)} Comparison is hidden until job records load.`} onRetry={() => q.refetch()} />
        : (
          <>
            <div className="grid gap-3 rounded-md border bg-card p-4 sm:grid-cols-2">{picker("a", a, b)}{picker("b", b, a)}</div>
            {(staleParam("a", a) || staleParam("b", b)) && <p role="status" className="mt-3 text-sm text-waste">A job in the link is not in this company's records and was ignored.</p>}
            {a && b && a.id !== b.id ? <Result a={a} b={b} /> : <div className="mt-6 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground" data-testid="text-compare-empty">Choose two different jobs to compare.</div>}
          </>
        )}
    </>
  );
}

function Result({ a, b }: { a: Job; b: Job }) {
  const c = compareProductionJobs(a, b);
  const unitOf = (j: Job) => j.unit || "unit missing";
  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-3 md:grid-cols-2">
        {([["A", a], ["B", b]] as const).map(([k, j]) => (
          <div key={k} className="rounded-md border-2 border-foreground bg-card p-4" data-testid={`card-compare-${k}`}>
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Job {k}</p>
            <Link href={`/jobs/${j.id}`} className="mt-1 block text-xl font-extrabold text-primary hover:underline" data-testid={`link-compare-job-${k}`}>{j.number}</Link>
            <div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge status={j.status} />{j.isSample && <SampleFlag />}{provisional(j) && <span className="text-xs font-bold uppercase text-waste">Incomplete / provisional</span>}</div>
            <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">
              <dt className="text-muted-foreground">Date</dt><dd className="num">{j.date || MISSING}</dd>
              <dt className="text-muted-foreground">Operator</dt><dd>{j.assignedName || MISSING}</dd>
              <dt className="text-muted-foreground">Version</dt><dd className="num">v{j.version}</dd>
              <dt className="text-muted-foreground">Unit</dt><dd>{j.unit || MISSING}</dd>
            </dl>
            <Link href={`/jobs/${j.id}#audit`} className="mt-2 inline-block text-sm font-semibold text-primary hover:underline" data-testid={`link-compare-audit-${k}`}>View audit trail</Link>
          </div>
        ))}
      </div>

      <section className="space-y-2 rounded-md border bg-card p-4 text-sm" data-testid="text-compare-summary">
        <h3 className="font-bold">Comparability summary</h3>
        {!c.sameUnit && <p role="alert" className="flex gap-2 font-semibold text-waste"><AlertTriangle className="h-4 w-4 shrink-0" />Not comparable across units: A is recorded in {unitOf(a)}, B in {unitOf(b)}. No differences are calculated.</p>}
        <p>{c.bothApproved ? "Both jobs are approved." : `Not both approved — A is ${a.status}, B is ${b.status}. Records awaiting review, draft or returned may still change.`}</p>
        <p><b>Missing specifications:</b> {c.missingSpecs.length ? c.missingSpecs.join(", ") : "none"}.</p>
        <p><b>Different specifications:</b> {c.differentSpecs.length ? c.differentSpecs.join(", ") : "none"}.</p>
        <p className="text-muted-foreground">A shared machine is not evidence of comparability, and matching listed fields does not prove equal conditions. Jobs of different size or specification are not ranked.</p>
      </section>

      <Table caption="Specifications" head={["Field", "Job A", "Job B", "State"]} rows={c.specifications.map((s) => [s.label, show(s.a), show(s.b),
        <span className={cn("text-xs font-bold uppercase", s.state === "match" ? "text-good" : s.state === "different" ? "text-waste" : "text-muted-foreground")}>{s.state === "match" ? "Same" : s.state === "different" ? "Different" : "Missing"}</span>])} />

      <Table caption="Recorded quantities and ratios (B − A)" head={["Measure", `Job A (${unitOf(a)})`, `Job B (${unitOf(b)})`, "Difference B − A"]}
        rows={c.metrics.map((m) => [m.label,
          m.a === null ? MISSING : m.kind === "pp" ? `${fmt(m.a, 1)}%` : fmt(m.a, 2),
          m.b === null ? MISSING : m.kind === "pp" ? `${fmt(m.b, 1)}%` : fmt(m.b, 2),
          m.delta === null ? <span className="text-muted-foreground">{c.sameUnit ? "Not available (missing value)" : "Not comparable"}</span> : m.kind === "pp" ? `${sign(m.delta, 1)} pp` : `${sign(m.delta, 2)} ${a.unit}`])} />
      <p className="-mt-4 text-xs text-muted-foreground">Good yield = good output ÷ issued × 100. Scrap rate = recorded scrap ÷ issued × 100. Reusable and pending shares also use issued as their denominator. Rate differences are in percentage points (pp), not percent change. Missing values are never treated as zero.</p>

      <Table caption="Recorded scrap by reason" head={["Reason", `Job A (${unitOf(a)})`, `Job B (${unitOf(b)})`, "Difference B − A"]}
        rows={c.scrapReasons.length ? c.scrapReasons.map((r) => [r.reason, r.a === null ? MISSING : fmt(r.a, 2), r.b === null ? MISSING : fmt(r.b, 2),
          r.delta === null ? <span className="text-muted-foreground">{c.sameUnit ? "Not available" : "Not comparable"}</span> : `${sign(r.delta, 2)} ${a.unit}`]) : [["No scrap reasons recorded", "", "", ""]]} />
      <p className="-mt-4 text-xs text-muted-foreground">Source records: <Link href={`/jobs/${a.id}`} className="font-semibold text-primary hover:underline">{a.number}</Link> and <Link href={`/jobs/${b.id}`} className="font-semibold text-primary hover:underline">{b.number}</Link>. No causes are inferred.</p>
    </div>
  );
}

const show = (v: unknown) => v === null || v === undefined || (typeof v === "string" && !v.trim()) ? MISSING : <span className="whitespace-pre-wrap">{String(v)}</span>;

function Table({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <section className="rounded-md border bg-card">
      <h3 className="border-b px-4 py-3 font-bold">{caption}</h3>
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide"><tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t">{r.map((cell, j) => j === 0 ? <th key={j} scope="row" className="px-3 py-2 text-left font-semibold">{cell}</th> : <td key={j} className="num px-3 py-2">{cell}</td>)}</tr>)}</tbody>
      </table></div>
    </section>
  );
}
