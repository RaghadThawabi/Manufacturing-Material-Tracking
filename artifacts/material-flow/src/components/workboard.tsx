import { useState } from "react";
import { Link } from "wouter";
import { Check, Circle, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useListMembers, getListMembersQueryKey, type Job } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorPanel, StatusBadge, SampleFlag } from "@/components/mf-ui";
import { canReview, errMsg, fmt, useCompany, ago } from "@/lib/mf";
import { cn } from "@/lib/utils";

const SETTING_STEPS = [
  { kind: "material", label: "Active material" },
  { kind: "unit", label: "Active unit" },
  { kind: "machine", label: "Active machine" },
  { kind: "product", label: "Active product" },
  { kind: "reason", label: "Active scrap reason" },
] as const;

export function SetupChecklist() {
  const { company } = useCompany();
  const { user } = useAuth();
  const admin = company?.role === "admin";
  const id = company?.id ?? "";
  const members = useListMembers(id, { query: { enabled: !!id && admin, queryKey: getListMembersQueryKey(id), refetchInterval: 15000 } });
  const [open, setOpen] = useState(true);
  if (!company || !admin) return null;

  const steps = SETTING_STEPS.map((s) => {
    const n = company.settings.filter((x) => x.kind === s.kind && x.active).length;
    return { key: s.kind, label: s.label, done: n > 0, detail: n ? `${n} active` : "None active", href: `/settings?tab=config&kind=${s.kind}` };
  });
  const list = members.data ?? [];
  const joined = list.filter((m) => !!m.userId && m.active !== false && m.userId !== user?.id).length;
  const invited = list.filter((m) => !m.userId && !!m.inviteCode && m.active !== false && (!m.inviteExpiresAt || new Date(m.inviteExpiresAt).getTime() > Date.now())).length;
  const teamDone = joined > 0;
  const all = [...steps, { key: "team", label: "Teammate joined (optional)", optional: true, done: teamDone, detail: members.isLoading ? "Checking" : members.error ? "Could not load team" : teamDone ? `${joined} active joined` : invited ? `${invited} invitation${invited > 1 ? "s" : ""} not yet accepted` : "No one else has joined", href: "/settings?tab=team" }];
  const doneCount = all.filter((s) => s.done).length;
  const required = all.filter((s) => !("optional" in s));
  const requiredDone = required.filter((s) => s.done).length;
  if (doneCount === all.length && !members.isLoading && !members.error) return null;

  return (
    <section className="mb-6 rounded-md border-2 border-foreground bg-card" data-testid="section-setup-checklist">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-5 py-3 text-left" data-testid="button-toggle-setup">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Company setup</p>
          <h3 className="font-bold"><span className="num" data-testid="text-setup-progress">{requiredDone}/{required.length}</span> required options configured{requiredDone === required.length ? " · ready to record jobs" : ""}</h3>
        </div>
        {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
      </button>
      <div className="h-1.5 bg-muted"><div className="h-full bg-primary transition-transform origin-left" style={{ transform: `scaleX(${doneCount / all.length})` }} /></div>
      {open && (
        <ul className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          {all.map((s) => (
            <li key={s.key} className="bg-card">
              <Link href={s.href} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/60" data-testid={`link-setup-${s.key}`}>
                {s.done ? <Check className="h-5 w-5 shrink-0 text-primary" /> : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm font-semibold", s.done && "text-muted-foreground line-through")}>{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.detail}</span>
                </span>
                {!s.done && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {members.error ? <div className="border-t px-5 py-3"><ErrorPanel title="Could not load team" message={errMsg(members.error)} onRetry={() => members.refetch()} /></div> : null}
      <p className="border-t px-5 py-2 text-xs text-muted-foreground">Setup checks active configuration and joined team, not job counts. A sole admin can record and review jobs without a teammate.</p>
    </section>
  );
}

function WorkItem({ job }: { job: Job }) {
  const pr = job.pendingRework ?? 0;
  return (
    <Link href={`/jobs/${job.id}`} className="flex items-center gap-3 border-t px-4 py-2.5 hover:bg-muted/60" data-testid={`link-work-${job.id}`}>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-bold"><span className="num">{job.number}</span>{job.isSample && <SampleFlag />}</span>
        <span className="block truncate text-xs text-muted-foreground">{job.material} · {job.machine} · {job.assignedName || "Unassigned"}{pr > 0 ? ` · ${fmt(pr, 3)} ${job.unit} rework` : ""}</span>
      </span>
      <StatusBadge status={job.status} />
      <span className="num w-8 text-right text-xs text-muted-foreground">{ago(job.updatedAt)}</span>
    </Link>
  );
}

function Lane({ title, hint, jobs, id }: { title: string; hint: string; jobs: Job[]; id: string }) {
  const shown = jobs.slice(0, 5);
  return (
    <div className="rounded-md border bg-card" data-testid={`lane-${id}`}>
      <div className="flex items-baseline justify-between px-4 py-3">
        <div><h4 className="font-bold">{title}</h4><p className="text-xs text-muted-foreground">{hint}</p></div>
        <span className="num text-2xl font-extrabold" data-testid={`count-${id}`}>{jobs.length}</span>
      </div>
      {shown.length ? shown.map((j) => <WorkItem key={j.id} job={j} />) : <p className="border-t px-4 py-4 text-sm text-muted-foreground">Nothing waiting.</p>}
      {jobs.length > shown.length && <p className="border-t px-4 py-2 text-xs text-muted-foreground">+{jobs.length - shown.length} more in Jobs</p>}
    </div>
  );
}

export function WorkLists({ jobs, loading, error, onRetry }: { jobs?: Job[]; loading: boolean; error: unknown; onRetry: () => void }) {
  const { company } = useCompany();
  const { user } = useAuth();
  if (!company) return null;
  const reviewer = canReview(company.role);
  const all = [...(jobs ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const rework = (j: Job) => (j.pendingRework ?? 0) > 0;
  const mine = (j: Job) => (j.assignedTo ? j.assignedTo === user?.id : j.createdBy === user?.id);
  const lanes = reviewer
    ? [
        { id: "review", title: "Review queue", hint: "Submitted, waiting for decision", jobs: all.filter((j) => j.status === "submitted") },
        { id: "returned", title: "Returned", hint: "Sent back to operators", jobs: all.filter((j) => j.status === "returned") },
        { id: "unassigned", title: "Unassigned", hint: "Open jobs with no operator", jobs: all.filter((j) => !j.assignedTo && (j.status === "draft" || j.status === "returned")) },
        { id: "rework", title: "Pending rework", hint: "Material set aside, unresolved", jobs: all.filter(rework) },
      ]
    : [
        { id: "mine", title: "My open jobs", hint: "Drafts and returned jobs assigned to you or created by you", jobs: all.filter((j) => mine(j) && (j.status === "draft" || j.status === "returned")) },
        { id: "rework", title: "My pending rework", hint: "Set aside on your jobs", jobs: all.filter((j) => mine(j) && rework(j)) },
      ];
  return (
    <section className="mb-8" data-testid="section-work-lists">
      <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Your work · counts are jobs, not quantities</h3>
      {loading ? <div className="grid gap-3 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-40" />)}</div>
        : error ? <ErrorPanel message={errMsg(error)} onRetry={onRetry} />
        : <div className={cn("grid gap-3", reviewer ? "md:grid-cols-2" : "md:grid-cols-2")}>{lanes.map((l) => <Lane key={l.id} {...l} />)}</div>}
    </section>
  );
}
