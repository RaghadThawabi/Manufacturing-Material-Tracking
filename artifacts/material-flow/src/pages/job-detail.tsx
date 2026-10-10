import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Check, RotateCcw, Unlock, AlertTriangle, MessageSquareWarning } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useListAssignees, getListAssigneesQueryKey, useGetJob, getGetJobQueryKey, useUpdateJob, useTransitionJob, getListJobsQueryKey, getGetSummaryQueryKey, type JobInput, type ActionInputAction } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, StatusBadge, SampleFlag, FlowBar, Legend, Metric, AuditTrail, ErrorPanel, BalanceText } from "@/components/mf-ui";
import { ReworkPanel, ReworkLifecycle } from "@/components/rework-panel";
import { JobWizard } from "@/components/job-wizard";
import { canReview, errMsg, fmt, isConflict, jobToInput, measurement, pct, useCompany, reviewFlags, approvalNeedsComment, latestReturn } from "@/lib/mf";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function JobDetail() {
  const { id: jobId } = useParams<{ id: string }>();
  const { company } = useCompany();
  const { user } = useAuth();
  const cid = company!.id;
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useGetJob(cid, jobId, { query: { queryKey: getGetJobQueryKey(cid, jobId), refetchInterval: 20000 } });
  const reviewerRole = canReview(company!.role);
  const as = useListAssignees(cid, { query: { queryKey: getListAssigneesQueryKey(cid), enabled: reviewerRole } });
  const update = useUpdateJob();
  const transition = useTransitionJob();
  const [editing, setEditing] = useState(false);
  const [editVersion, setEditVersion] = useState<number>();
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const [check, setCheck] = useState({ specifications: false, quantities: false, scrapReasons: false });
  useEffect(() => {
    setCheck({ specifications: false, quantities: false, scrapReasons: false });
    setComment("");
  }, [cid, jobId, q.data?.version]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetJobQueryKey(cid, jobId) });
    qc.invalidateQueries({ queryKey: getListJobsQueryKey(cid) });
    qc.invalidateQueries({ queryKey: getGetSummaryQueryKey(cid) });
  };

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  if (q.error || !q.data) return <ErrorPanel message={errMsg(q.error) || "Job not found."} onRetry={() => q.refetch()} />;
  const job = q.data;
  const rv = job.recordingVersion ?? 1;
  const own = job.assignedTo ? job.assignedTo === user?.id : job.createdBy === user?.id;
  const reviewer = reviewerRole;
  const editable = (job.status === "draft" || job.status === "returned") && (own || reviewer);
  const resolved = (job.reworkResolved ?? 0) > 0;
  const pendingQty = job.pendingRework ?? 0;
  const m = measurement(job, rv);
  const conflict = (e: unknown) => { if (isConflict(e)) { refresh(); return "This job was changed by someone else. The latest version has been loaded — review it and try again."; } return errMsg(e); };

  const flags = reviewFlags(job, company!.tolerance);
  const needsComment = approvalNeedsComment(job);
  const allChecked = check.specifications && check.quantities && check.scrapReasons;
  const lastReturn = latestReturn(job);
  const showReturn = lastReturn && (job.status === "returned" || job.status === "draft");
  const act = (action: ActionInputAction) => {
    setErr("");
    if ((action === "return" || action === "reopen") && !comment.trim()) { setErr("A comment is required to return or reopen a job."); return; }
    if (action === "approve" && !allChecked) { setErr("Confirm all three checks before approving."); return; }
    if (action === "approve" && needsComment && !comment.trim()) { setErr("This job has pending rework or is below planned yield. Write a comment explaining why it is acceptable to approve."); return; }
    transition.mutate({ companyId: cid, jobId, data: { action, version: job.version, comment: comment.trim() || undefined, ...(action === "approve" ? { checklist: check } : {}) } }, {
      onSuccess: () => { setComment(""); setCheck({ specifications: false, quantities: false, scrapReasons: false }); refresh(); toast({ title: `Job ${action === "submit" ? "submitted" : action === "approve" ? "approved" : action === "return" ? "returned" : "reopened"}` }); },
      onError: (e) => setErr(conflict(e)),
    });
  };

  const save = async (data: JobInput, submit: boolean) => {
    setErr("");
    try {
      const payload: JobInput = { ...data, version: editVersion };
      if (job.status !== "returned") delete payload.changeReason;
      const saved = await update.mutateAsync({ companyId: cid, jobId, data: payload });
      if (submit) await transition.mutateAsync({ companyId: cid, jobId, data: { action: "submit", version: saved.version } });
      refresh(); setEditing(false);
      toast({ title: submit ? "Submitted for review" : "Changes saved" });
    } catch (e) {
      if (isConflict(e)) {
        refresh(); setEditing(false);
        setErr("The job changed while you were editing. Your edits were not saved. Review the latest record and open Edit again.");
      } else setErr(conflict(e));
    }
  };

  if (editing) return (
    <>
      <PageHeader eyebrow={`Editing · v${job.version}`} title={`Job ${job.number}`} />
      {showReturn && <ReturnBanner a={lastReturn} />}
      <JobWizard requireChangeReason={job.status === "returned"} company={company!} initial={jobToInput(job)} recordingVersion={rv} outcomesLocked={resolved}
        assignees={as.data ?? []} assignMode={reviewer ? "any" : "locked"} assignedName={job.assignedName} pending={update.isPending || transition.isPending} error={err} onSave={save} onCancel={() => setEditing(false)} />
    </>
  );

  const u = job.unit;
  const balanced = Math.abs(job.difference) <= company!.tolerance + 1e-8;
  return (
    <>
      <Link href="/jobs" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Jobs</Link>
      <PageHeader eyebrow={`${job.date} · version ${job.version}`} title={`Job ${job.number}`}>
        <StatusBadge status={job.status} />{job.isSample && <SampleFlag />}
        {editable && <Button size="lg" variant="outline" className="h-11" onClick={() => { setEditVersion(job.version); setEditing(true); }} data-testid="button-edit"><Pencil />Edit</Button>}
        {editable && <Button size="lg" className="h-11" disabled={transition.isPending} onClick={() => act("submit")} data-testid="button-submit-job">Submit</Button>}
      </PageHeader>

      {showReturn && <ReturnBanner a={lastReturn} canFix={editable} />}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="rise rounded-md border bg-card p-5">
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              {[["Material", job.material], ["Machine", job.machine], ["Product", job.product], ["Unit", job.unit],
                ["Assigned to", job.assignedName || (job.assignedTo ? "Assigned" : "Unassigned")],
                ["Sheet (mm)", job.sheetWidthMm && job.sheetLengthMm ? `${fmt(job.sheetWidthMm)} x ${fmt(job.sheetLengthMm)}` : "—"],
                ["Offcut size", job.offcutSizeNote || "—"], ["Offcut storage", job.offcutLocation || "—"]].map(([k, v]) => <div key={k}><p className="text-xs uppercase text-muted-foreground">{k}</p><p className="font-semibold">{v || "—"}</p></div>)}
            </div>
            {job.unsupported && <p className="mt-4 rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">Flagged as multi-stage / multi-material — not supported.</p>}
            {rv < 2 && <p className="mt-4 text-xs text-muted-foreground">Legacy record (recording version 1): assignment, sheet size and pending rework were not required.</p>}
            {job.instructions && <p className="mt-4 border-t pt-4 text-sm"><span className="font-semibold">Instructions: </span>{job.instructions}</p>}
            {job.notes && <p className="mt-2 text-sm"><span className="font-semibold">Notes: </span>{job.notes}</p>}
          </section>
          <section className="rise rounded-md border bg-card p-5" style={{ animationDelay: "60ms" }}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Metric label="Issued" value={fmt(job.issued)} unit={u} />
              <Metric label="Good" value={fmt(job.good)} unit={u} tone="good" sub={`Yield ${pct(job.yieldRate)}${job.plannedYield != null ? ` · plan ${pct(job.plannedYield)}` : ""}`} />
              <Metric label="Reusable" value={fmt(job.offcuts)} unit={u} tone="reuse" sub={pct(job.offcutRate)} />
              <Metric label="Scrap" value={fmt(job.scrapTotal)} unit={u} tone="waste" sub={pct(job.scrapRate)} />
              <Metric label="Pending rework" value={fmt(job.pendingRework)} unit={u} tone="pending" sub={resolved ? `${fmt(job.reworkResolved)} resolved` : job.pendingRework == null ? "Not measured" : undefined} />
            </div>
            <FlowBar className="mt-5 h-5" issued={job.issued ?? 0} good={job.good ?? 0} scrap={job.scrapTotal} offcuts={job.offcuts ?? 0} pending={pendingQty} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><Legend />
              <span className={cn("num rounded-sm px-2 py-1 text-sm font-semibold", balanced ? "bg-good/10 text-good" : "bg-destructive/10 text-destructive")}>Residual {fmt(job.difference, 3)} {u}</span></div>
            <div className="mt-3"><BalanceText issued={job.issued} accounted={(job.issued ?? 0) - job.difference} unit={u} tolerance={company!.tolerance} measured={m.measured} total={m.total} missing={m.missing} /></div>
            <table className="mt-5 w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2">Scrap reason (as recorded)</th><th className="py-2 text-right">Quantity</th></tr></thead>
              <tbody>{job.scrap.map((s, i) => <tr key={i} className="border-b last:border-0"><td className="py-2"><i className="mr-2 inline-block h-2.5 w-2.5 rounded-[2px] bg-waste" />{s.reason || "—"}</td><td className="num py-2 text-right">{s.quantity === null ? "Not measured" : `${fmt(s.quantity)} ${u}`}</td></tr>)}</tbody>
            </table>
          </section>
          <section className="rounded-md border bg-card p-5"><h3 className="mb-4 font-bold">Audit trail</h3><AuditTrail audit={job.audit} /></section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {reviewer && (job.status === "submitted" || job.status === "approved") && (
            <section className="rounded-md border-2 border-foreground bg-card p-5" data-testid="panel-review">
              <h3 className="font-bold">{job.status === "submitted" ? "Supervisor review" : "Reopen approved job"}</h3>
              {job.status === "submitted" ? (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">You are verifying the outcome, not only the balance. A green residual alone is not enough.</p>
                  <div className="mt-3 space-y-2" data-testid="list-flags">
                    {flags.filter((f) => f.key !== "resubmitted").length === 0
                      ? <p className="flex items-center gap-2 rounded-sm bg-good/10 px-3 py-2 text-sm text-good"><Check className="h-4 w-4" />No attention flags raised.</p>
                      : flags.filter((f) => f.key !== "resubmitted").map((f) => (
                        <div key={f.key} className={cn("flex gap-2 rounded-sm border-l-4 px-3 py-2 text-sm", f.key === "rework" ? "border-pending bg-pending-soft" : "border-waste bg-waste/5")} data-testid={`flag-${f.key}`}>
                          <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", f.key === "rework" ? "text-pending" : "text-waste")} />
                          <span><span className="font-semibold">{f.label}</span><span className="block text-xs text-muted-foreground">{f.detail}</span></span>
                        </div>
                      ))}
                    <p className="text-[11px] leading-snug text-muted-foreground">Scrap reasons are as recorded by the operator. They are not verified root causes.</p>
                  </div>
                  <fieldset className="mt-4 space-y-2 border-t pt-4">
                    <legend className="mb-2 text-xs font-bold uppercase tracking-wider">I have checked</legend>
                    {([["specifications", "Specifications match the job card", "Material, machine, product, sheet size and instructions."],
                      ["quantities", "Quantities are plausible", "Issued, good, offcuts, scrap and pending rework."],
                      ["scrapReasons", "Scrap reasons are recorded", "Each scrap entry has a reason. Not a root-cause finding."]] as const).map(([k, l, h]) => (
                      <label key={k} className={cn("flex cursor-pointer items-start gap-3 rounded-md border-2 p-3 transition-colors", check[k] ? "border-good bg-good/5" : "border-border")}>
                        <Checkbox data-testid={`checkbox-${k}`} className="mt-0.5 h-5 w-5" checked={check[k]} onCheckedChange={(v) => setCheck((c) => ({ ...c, [k]: v === true }))} />
                        <span className="text-sm"><span className="block font-semibold">{l}</span><span className="text-xs text-muted-foreground">{h}</span></span>
                      </label>
                    ))}
                  </fieldset>
                </>
              ) : <p className="mt-1 text-sm text-muted-foreground">Reopening requires a comment and is recorded in the audit trail. The operator will see your reason.</p>}
              <label className="mt-4 block text-xs font-bold uppercase tracking-wider" htmlFor="review-comment">
                Comment {job.status === "submitted" ? (needsComment ? <span className="text-destructive">required to approve or return</span> : <span className="font-normal normal-case text-muted-foreground">(required to return)</span>) : <span className="text-destructive">required</span>}
              </label>
              <Textarea id="review-comment" data-testid="input-comment" className="mt-2" value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder={job.status === "submitted" ? (needsComment ? "Why is approving acceptable despite the flags? Or what should the operator correct?" : "What should the operator correct?") : "Why is this being reopened?"} />
              <div className="mt-3 grid gap-2">
                {job.status === "submitted" ? <>
                  <Button size="lg" className="h-12 bg-good text-white hover:bg-good/90" disabled={transition.isPending || !allChecked || (needsComment && !comment.trim())} onClick={() => act("approve")} data-testid="button-approve"><Check />Approve</Button>
                  {(!allChecked || (needsComment && !comment.trim())) && <p className="text-xs text-muted-foreground">{!allChecked ? "Tick all three checks to enable approval." : "Add a comment to approve a flagged job."}</p>}
                  <Button size="lg" variant="outline" className="h-12 border-waste text-waste" disabled={transition.isPending || !comment.trim()} onClick={() => act("return")} data-testid="button-return"><RotateCcw />Return to operator</Button>
                </> : <Button size="lg" variant="outline" className="h-12" disabled={transition.isPending || !comment.trim()} onClick={() => act("reopen")} data-testid="button-reopen"><Unlock />Reopen</Button>}
              </div>
            </section>
          )}
          {editable && pendingQty > 0 && <ReworkPanel job={job} company={company!} />}
          {!editable && pendingQty > 0 && <p className="rounded-md border border-pending bg-pending-soft p-4 text-sm"><span className="num font-semibold text-pending">{fmt(pendingQty, 3)} {u}</span> pending rework. {job.status === "approved" ? "A reviewer must reopen this job before rework can be resolved." : job.status === "submitted" ? "Return the job to resolve rework." : "Only the assigned operator or a reviewer can resolve it."}</p>}
          {resolved && <p data-testid="text-rework-resolved" className="rounded-md border p-3 text-xs text-muted-foreground"><span className="num font-semibold">{fmt(job.reworkResolved, 3)} {u}</span> resolved from rework. Outcome quantities are locked; details remain editable.</p>}
          <ReworkLifecycle />
          {!editable && !reviewer && job.status !== "approved" && <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{job.status === "submitted" ? "Awaiting supervisor review." : (rv >= 2 ? "Only the assigned operator or a reviewer can edit this job." : "Only the operator who recorded this job can edit it.")}</p>}
          <ErrorPanel message={err} />
        </aside>
      </div>
    </>
  );
}

function ReturnBanner({ a, canFix }: { a: NonNullable<ReturnType<typeof latestReturn>>; canFix?: boolean }) {
  const reopened = a.action.toLowerCase().startsWith("reopen");
  return (
    <section data-testid="banner-return-reason" className="rise mb-6 flex gap-4 rounded-md border-2 border-waste bg-waste/5 p-5">
      <MessageSquareWarning className="h-6 w-6 shrink-0 text-waste" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-widest text-waste">{reopened ? "Reopened" : "Returned"} by {a.actor || "reviewer"}{a.actorRole ? ` · ${a.actorRole}` : ""} · {new Date(a.at).toLocaleString()}</p>
        <p className="mt-1.5 text-lg font-semibold leading-snug" data-testid="text-return-reason">{a.comment || "No reason recorded."}</p>
        <p className="mt-2 text-sm text-muted-foreground">{canFix ? "Next: edit the job, correct what is described above, explain your correction, then submit again." : "Waiting for the assigned operator or a reviewer to correct and resubmit."}</p>
      </div>
    </section>
  );
}
