import { useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Check, RotateCcw, Unlock } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetJob, getGetJobQueryKey, useUpdateJob, useTransitionJob, getListJobsQueryKey, getGetSummaryQueryKey, type JobInput, type ActionInputAction } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, StatusBadge, SampleFlag, FlowBar, Legend, Metric, AuditTrail, ErrorPanel } from "@/components/mf-ui";
import { JobWizard } from "@/components/job-wizard";
import { canReview, errMsg, fmt, jobToInput, pct, useCompany } from "@/lib/mf";
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
  const update = useUpdateJob();
  const transition = useTransitionJob();
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetJobQueryKey(cid, jobId) });
    qc.invalidateQueries({ queryKey: getListJobsQueryKey(cid) });
    qc.invalidateQueries({ queryKey: getGetSummaryQueryKey(cid) });
  };

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  if (q.error || !q.data) return <ErrorPanel message={errMsg(q.error) || "Job not found."} onRetry={() => q.refetch()} />;
  const job = q.data;
  const own = job.createdBy === user?.id;
  const reviewer = canReview(company!.role);
  const editable = (job.status === "draft" || job.status === "returned") && (own || reviewer);

  const act = (action: ActionInputAction) => {
    setErr("");
    if ((action === "return" || action === "reopen") && !comment.trim()) { setErr("A comment is required to return or reopen a job."); return; }
    transition.mutate({ companyId: cid, jobId, data: { action, version: job.version, comment: comment.trim() || undefined } }, {
      onSuccess: () => { setComment(""); refresh(); toast({ title: `Job ${action === "submit" ? "submitted" : action === "approve" ? "approved" : action === "return" ? "returned" : "reopened"}` }); },
      onError: (e) => setErr(errMsg(e)),
    });
  };

  const save = async (data: JobInput, submit: boolean) => {
    setErr("");
    try {
      const saved = await update.mutateAsync({ companyId: cid, jobId, data: { ...data, version: job.version } });
      if (submit) await transition.mutateAsync({ companyId: cid, jobId, data: { action: "submit", version: saved.version } });
      refresh(); setEditing(false);
      toast({ title: submit ? "Submitted for review" : "Changes saved" });
    } catch (e) { setErr(errMsg(e)); }
  };

  if (editing) return (
    <>
      <PageHeader eyebrow={`Editing · v${job.version}`} title={`Job ${job.number}`} />
      <JobWizard company={company!} initial={jobToInput(job)} pending={update.isPending || transition.isPending} error={err} onSave={save} onCancel={() => setEditing(false)} />
    </>
  );

  const u = job.unit;
  const balanced = Math.abs(job.difference) <= company!.tolerance + 1e-8;
  return (
    <>
      <Link href="/jobs" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Jobs</Link>
      <PageHeader eyebrow={`${job.date} · version ${job.version}`} title={`Job ${job.number}`}>
        <StatusBadge status={job.status} />{job.isSample && <SampleFlag />}
        {editable && <Button size="lg" variant="outline" className="h-11" onClick={() => setEditing(true)} data-testid="button-edit"><Pencil />Edit</Button>}
        {editable && <Button size="lg" className="h-11" disabled={transition.isPending} onClick={() => act("submit")} data-testid="button-submit-job">Submit</Button>}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="rise rounded-md border bg-card p-5">
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              {[["Material", job.material], ["Machine", job.machine], ["Product", job.product], ["Unit", job.unit]].map(([k, v]) => <div key={k}><p className="text-xs uppercase text-muted-foreground">{k}</p><p className="font-semibold">{v || "—"}</p></div>)}
            </div>
            {job.unsupported && <p className="mt-4 rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">Flagged as rework / multi-stage / multi-material — not supported in Phase 1.</p>}
            {job.instructions && <p className="mt-4 border-t pt-4 text-sm"><span className="font-semibold">Instructions: </span>{job.instructions}</p>}
            {job.notes && <p className="mt-2 text-sm"><span className="font-semibold">Notes: </span>{job.notes}</p>}
          </section>
          <section className="rise rounded-md border bg-card p-5" style={{ animationDelay: "60ms" }}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric label="Issued" value={fmt(job.issued)} unit={u} />
              <Metric label="Good" value={fmt(job.good)} unit={u} tone="good" sub={`Yield ${pct(job.yieldRate)}${job.plannedYield != null ? ` · plan ${pct(job.plannedYield)}` : ""}`} />
              <Metric label="Reusable" value={fmt(job.offcuts)} unit={u} tone="reuse" sub={pct(job.offcutRate)} />
              <Metric label="Scrap" value={fmt(job.scrapTotal)} unit={u} tone="waste" sub={pct(job.scrapRate)} />
            </div>
            <FlowBar className="mt-5 h-5" issued={job.issued ?? 0} good={job.good ?? 0} scrap={job.scrapTotal} offcuts={job.offcuts ?? 0} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><Legend />
              <span className={cn("num rounded-sm px-2 py-1 text-sm font-semibold", balanced ? "bg-good/10 text-good" : "bg-destructive/10 text-destructive")}>Residual {fmt(job.difference, 3)} {u}</span></div>
            <table className="mt-5 w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2">Scrap reason (as recorded)</th><th className="py-2 text-right">Quantity</th></tr></thead>
              <tbody>{job.scrap.map((s, i) => <tr key={i} className="border-b last:border-0"><td className="py-2"><i className="mr-2 inline-block h-2.5 w-2.5 rounded-[2px] bg-waste" />{s.reason || "—"}</td><td className="num py-2 text-right">{s.quantity === null ? "Not measured" : `${fmt(s.quantity)} ${u}`}</td></tr>)}</tbody>
            </table>
          </section>
          <section className="rounded-md border bg-card p-5"><h3 className="mb-4 font-bold">Audit trail</h3><AuditTrail audit={job.audit} /></section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {reviewer && (job.status === "submitted" || job.status === "approved") && (
            <section className="rounded-md border-2 border-foreground bg-card p-5">
              <h3 className="font-bold">{job.status === "submitted" ? "Supervisor review" : "Reopen approved job"}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{job.status === "submitted" ? "Approve when the evidence holds. Returning requires a comment." : "Reopening requires a comment and is recorded in the audit trail."}</p>
              <Textarea data-testid="input-comment" className="mt-3" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment" />
              <div className="mt-3 grid gap-2">
                {job.status === "submitted" ? <>
                  <Button size="lg" className="h-12 bg-good text-white hover:bg-good/90" disabled={transition.isPending} onClick={() => act("approve")} data-testid="button-approve"><Check />Approve</Button>
                  <Button size="lg" variant="outline" className="h-12 border-waste text-waste" disabled={transition.isPending} onClick={() => act("return")} data-testid="button-return"><RotateCcw />Return to operator</Button>
                </> : <Button size="lg" variant="outline" className="h-12" disabled={transition.isPending} onClick={() => act("reopen")} data-testid="button-reopen"><Unlock />Reopen</Button>}
              </div>
            </section>
          )}
          {!editable && !reviewer && job.status !== "approved" && <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{job.status === "submitted" ? "Awaiting supervisor review." : "Only the operator who recorded this job can edit it."}</p>}
          <ErrorPanel message={err} />
        </aside>
      </div>
    </>
  );
}
