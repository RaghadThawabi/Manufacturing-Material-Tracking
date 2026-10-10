import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Hammer, Plus, Trash2, ArrowRight } from "lucide-react";
import { useResolveRework, getGetJobQueryKey, getListJobsQueryKey, getGetSummaryQueryKey, type Job, type Company, type Scrap } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QtyField, ChipPicker, ErrorPanel } from "@/components/mf-ui";
import { errMsg, fmt, isConflict, settingNames } from "@/lib/mf";
import { useToast } from "@/hooks/use-toast";

export function ReworkPanel({ job, company }: { job: Job; company: Company }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const resolve = useResolveRework();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [good, setGood] = useState<number | null>(null);
  const [offcuts, setOffcuts] = useState<number | null>(null);
  const [scrap, setScrap] = useState<Scrap[]>([]);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const u = job.unit;
  const pending = job.pendingRework ?? 0;
  const scrapTotal = scrap.reduce((s, x) => s + (x.quantity ?? 0), 0);
  const total = (good ?? 0) + (offcuts ?? 0) + scrapTotal;
  const problems: string[] = [];
  if (total <= 0) problems.push("Move a quantity greater than zero.");
  if (total > pending + 1e-9) problems.push(`Cannot move more than the ${fmt(pending, 3)} ${u} pending.`);
  if (scrap.some((s) => !s.reason.trim() || s.quantity === null)) problems.push("Each scrap line needs a reason and quantity.");
  if (!comment.trim()) problems.push("A comment is required.");

  const reset = () => { setGood(null); setOffcuts(null); setScrap([]); setComment(""); setConfirm(false); setOpen(false); };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetJobQueryKey(company.id, job.id) });
    qc.invalidateQueries({ queryKey: getListJobsQueryKey(company.id) });
    qc.invalidateQueries({ queryKey: getGetSummaryQueryKey(company.id) });
  };
  const submit = () => {
    setErr("");
    resolve.mutate({ companyId: company.id, jobId: job.id, data: { version: job.version, good: good ?? 0, offcuts: offcuts ?? 0, scrap: scrap.filter((s) => (s.quantity ?? 0) > 0), comment: comment.trim() } }, {
      onSuccess: () => { refresh(); reset(); toast({ title: "Rework resolved", description: `${fmt(total, 3)} ${u} moved out of pending.` }); },
      onError: (e) => {
        if (isConflict(e)) { refresh(); setConfirm(false); setErr("This job was changed by someone else. The latest version has been loaded — check the pending quantity and try again."); }
        else setErr(errMsg(e));
      },
    });
  };

  if (!open) return (
    <section className="rounded-md border-2 border-pending bg-card p-5">
      <h3 className="flex items-center gap-2 font-bold"><Hammer className="h-4 w-4 text-pending" />Pending rework</h3>
      <p data-testid="text-pending-rework" className="num mt-2 text-3xl font-semibold text-pending">{fmt(pending, 3)} <span className="text-sm text-muted-foreground">{u}</span></p>
      <p className="mt-1 text-sm text-muted-foreground">Record where reworked pieces ended up. Issued material never changes.</p>
      <Button size="lg" className="mt-3 h-12 w-full" onClick={() => setOpen(true)} data-testid="button-open-resolve"><Hammer />Resolve rework</Button>
      <ErrorPanel message={err} />
    </section>
  );

  return (
    <section className="rise space-y-4 rounded-md border-2 border-pending bg-card p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-bold">Resolve rework</h3>
        <span className="num text-sm text-pending">{fmt(pending, 3)} {u} pending</span>
      </div>
      {!confirm ? (
        <>
          <QtyField testId="rework-good" tone="good" label="To good" value={good} onChange={setGood} unit={u} />
          <QtyField testId="rework-offcuts" tone="reuse" label="To offcuts" value={offcuts} onChange={setOffcuts} unit={u} />
          {scrap.map((s, i) => (
            <div key={i} className="space-y-2 rounded-md border-l-4 border-waste bg-background p-3">
              <div className="flex justify-between"><span className="num text-xs text-muted-foreground">SCRAP {i + 1}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setScrap(scrap.filter((_, k) => k !== i))} data-testid={`button-remove-rework-scrap-${i}`}><Trash2 className="h-4 w-4" /></Button></div>
              <ChipPicker testId={`rework-reason-${i}`} options={settingNames(company, "reason")} value={s.reason} onChange={(v) => setScrap(scrap.map((x, k) => (k === i ? { ...x, reason: v } : x)))} />
              <QtyField testId={`rework-scrap-${i}`} tone="waste" label="Quantity" value={s.quantity} onChange={(v) => setScrap(scrap.map((x, k) => (k === i ? { ...x, quantity: v } : x)))} unit={u} />
            </div>
          ))}
          <Button variant="outline" className="w-full" onClick={() => setScrap([...scrap, { reason: "", quantity: null }])} data-testid="button-add-rework-scrap"><Plus className="h-4 w-4" />Add scrap line</Button>
          <Textarea data-testid="input-rework-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What was reworked and how (required)" />
          <p className="num text-sm">Moving <b>{fmt(total, 3)}</b> of {fmt(pending, 3)} {u} · remaining pending {fmt(Math.max(0, pending - total), 3)}</p>
          {problems.length > 0 && <ul className="list-disc pl-5 text-xs text-destructive">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={reset} data-testid="button-cancel-resolve">Cancel</Button>
            <Button disabled={problems.length > 0} onClick={() => setConfirm(true)} data-testid="button-review-resolve">Review<ArrowRight /></Button>
          </div>
        </>
      ) : (
        <>
          <div data-testid="text-rework-confirm" className="space-y-1.5 rounded-md bg-pending-soft p-4 text-sm">
            <p className="font-semibold">Confirm transfer out of pending rework</p>
            <p className="num">Pending: {fmt(pending, 3)} → {fmt(pending - total, 3)} {u}</p>
            {(good ?? 0) > 0 && <p className="num text-good">+ {fmt(good, 3)} {u} good</p>}
            {(offcuts ?? 0) > 0 && <p className="num text-reuse">+ {fmt(offcuts, 3)} {u} offcuts</p>}
            {scrap.filter((s) => (s.quantity ?? 0) > 0).map((s, i) => <p key={i} className="num text-waste">+ {fmt(s.quantity, 3)} {u} scrap · {s.reason}</p>)}
            <p className="text-muted-foreground">Issued stays {fmt(job.issued, 3)} {u}. After this, direct outcome edits are locked; further moves go through this panel.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setConfirm(false)} data-testid="button-back-resolve">Back</Button>
            <Button disabled={resolve.isPending} onClick={submit} data-testid="button-confirm-resolve">{resolve.isPending ? "Saving…" : "Confirm"}</Button>
          </div>
        </>
      )}
      <ErrorPanel message={err} />
    </section>
  );
}

export function ReworkLifecycle() {
  return (
    <details className="rounded-md border bg-card p-4 text-sm" data-testid="text-rework-lifecycle">
      <summary className="cursor-pointer font-semibold">How pending rework works</summary>
      <dl className="mt-3 space-y-2">
        <div><dt className="font-semibold">Pending rework</dt><dd className="text-muted-foreground">Material measured and set aside for rework. It counts as accounted, never as unexplained, but is not yet a final outcome.</dd></div>
        <div><dt className="font-semibold">Resolution</dt><dd className="text-muted-foreground">Moves some or all pending quantity into good, offcuts or scrap with a mandatory comment. Partial resolutions are allowed. Issued never changes.</dd></div>
        <div><dt className="font-semibold">Audit lock</dt><dd className="text-muted-foreground">After the first resolution, issued and outcome quantities can no longer be edited directly. Job details stay editable.</dd></div>
      </dl>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Record pending rework in draft.</li><li>Resolve while the job is draft or returned (assigned operator or reviewer).</li>
        <li>Submit for review. Approved jobs must be reopened by a reviewer first.</li>
      </ol>
    </details>
  );
}
