import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Save, Send, Scale, Lock } from "lucide-react";
import type { JobInput, Company, Assignee } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ChipPicker, QtyField, FlowBar, Legend, ErrorPanel, BalanceText } from "@/components/mf-ui";
import { calc, fmt, pct, settingNames, submissionIssues, measurement } from "@/lib/mf";
import { cn } from "@/lib/utils";

const STEPS = ["Job details", "Material issued", "Outcomes", "Check & submit"];

function Field({ label, children, req }: { label: string; children: ReactNode; req?: boolean }) {
  return <div><p className="mb-2 text-sm font-bold uppercase tracking-wide">{label}{req && <span className="ml-1 text-destructive">*</span>}</p>{children}</div>;
}

function mmVal(t: string): number | null | undefined {
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return !Number.isNaN(n) && n >= 0 ? n : undefined;
}

export function JobWizard({ company, initial, pending, error, onSave, onCancel, recordingVersion = 2, outcomesLocked = false, assignees = [], assignMode = "any", assignedName, requireChangeReason = false }: {
  company: Company; initial: JobInput; pending: boolean; error: string; onSave: (j: JobInput, submit: boolean) => void; onCancel?: () => void;
  recordingVersion?: number; outcomesLocked?: boolean; assignees?: Assignee[]; assignMode?: "any" | "self" | "locked"; assignedName?: string; requireChangeReason?: boolean;
}) {
  const [j, setJ] = useState<JobInput>(initial);
  const [step, setStep] = useState(0);
  const set = <K extends keyof JobInput>(k: K, v: JobInput[K]) => setJ((p) => ({ ...p, [k]: v }));
  const c = calc(j);
  const v2 = recordingVersion >= 2;
  const issues = submissionIssues(j, company.tolerance, recordingVersion);
  const m = measurement(j, recordingVersion);
  const assigneeOpts = assignees.filter((a) => assignMode === "any" || a.userId === j.assignedTo || assignMode === "self");
  const lockNote = outcomesLocked && (
    <div data-testid="text-outcomes-locked" className="flex items-start gap-3 rounded-md border-2 border-pending bg-pending-soft p-4 text-sm">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-pending" />
      <span>Rework has already been resolved on this job, so issued and outcome quantities are locked to preserve the audit trail. Use <span className="font-semibold">Resolve rework</span> on the job page to move remaining pending quantity. Job details can still be edited.</span>
    </div>
  );
  const balanced = !!j.issued && Math.abs(c.difference) <= company.tolerance + 1e-8;
  const u = j.unit || "units";
  const reasons = settingNames(company, "reason");
  const reasonMissing = requireChangeReason && !(j.changeReason ?? "").trim();
  const out = (): JobInput => (requireChangeReason ? { ...j, changeReason: (j.changeReason ?? "").trim() } : { ...j, changeReason: undefined });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <ol className="mb-6 grid grid-cols-4 gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" onClick={() => setStep(i)} data-testid={`button-step-${i}`} className="w-full text-left">
                <div className={cn("h-1.5 rounded-sm transition-colors", i <= step ? "bg-primary" : "bg-muted")} />
                <p className={cn("mt-2 hidden text-xs font-semibold uppercase tracking-wide sm:block", i === step ? "text-foreground" : "text-muted-foreground")}><span className="num mr-1">{i + 1}</span>{s}</p>
              </button>
            </li>
          ))}
        </ol>

        <div key={step} className="rise space-y-6 rounded-md border bg-card p-5 md:p-7">
          <h2 className="text-2xl font-extrabold"><span className="num mr-2 text-muted-foreground">0{step + 1}</span>{STEPS[step]}</h2>

          {step === 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Job number" req><Input data-testid="input-number" className="num h-12 text-lg" value={j.number} onChange={(e) => set("number", e.target.value)} placeholder="IK-204" /></Field>
                <Field label="Date" req><Input data-testid="input-date" type="date" className="h-12 text-lg" value={j.date} onChange={(e) => set("date", e.target.value)} /></Field>
              </div>
              <fieldset disabled={outcomesLocked}><Field label="Material" req><ChipPicker testId="material" options={settingNames(company, "material")} value={j.material} onChange={(v) => set("material", v)} /></Field></fieldset>
              <Field label="Machine" req><ChipPicker testId="machine" options={settingNames(company, "machine")} value={j.machine} onChange={(v) => set("machine", v)} /></Field>
              <Field label="Product" req><ChipPicker testId="product" options={settingNames(company, "product")} value={j.product} onChange={(v) => set("product", v)} /></Field>
              <fieldset disabled={outcomesLocked}><Field label="Unit" req><ChipPicker testId="unit" options={settingNames(company, "unit")} value={j.unit} onChange={(v) => set("unit", v)} /></Field></fieldset>
              <Field label="Assigned operator" req={v2}>
                {assignMode === "locked" ? (
                  <p data-testid="text-assigned" className="rounded-md border bg-muted/50 p-3 text-sm"><Lock className="mr-2 inline h-3.5 w-3.5" />{assignedName || "Unassigned"}<span className="ml-2 text-xs text-muted-foreground">Assignment can only be changed by a supervisor, manager or admin.</span></p>
                ) : assigneeOpts.length ? (
                  <div className="flex flex-wrap gap-2">
                    {assigneeOpts.map((a) => (
                      <button type="button" key={a.userId} data-testid={`chip-assignee-${a.userId}`} onClick={() => set("assignedTo", a.userId)}
                        className={cn("min-h-12 rounded-md border-2 px-4 text-left text-sm font-semibold transition-all active:scale-[.97]", j.assignedTo === a.userId ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50")}>
                        {a.name}<span className="ml-2 text-[10px] uppercase opacity-70">{a.role}</span>
                      </button>
                    ))}
                  </div>
                ) : <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No operators available to assign.</p>}
              </Field>
              <Field label="Sheet size (mm)" req={v2}>
                <div className="flex items-center gap-2">
                  <Input data-testid="input-sheet-width" inputMode="decimal" placeholder="Width" className="num h-12 max-w-36 text-lg" value={j.sheetWidthMm ?? ""} onChange={(e) => { const n = mmVal(e.target.value); if (n !== undefined) set("sheetWidthMm", n); }} />
                  <span className="text-muted-foreground">x</span>
                  <Input data-testid="input-sheet-length" inputMode="decimal" placeholder="Length" className="num h-12 max-w-36 text-lg" value={j.sheetLengthMm ?? ""} onChange={(e) => { const n = mmVal(e.target.value); if (n !== undefined) set("sheetLengthMm", n); }} />
                </div>
              </Field>
              <Field label={v2 ? "Instructions" : "Instructions (optional)"} req={v2}><Textarea data-testid="input-instructions" value={j.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="As written on the job card" /></Field>
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-md border-2 p-4", j.unsupported ? "border-destructive bg-destructive/5" : "border-dashed")}>
                <Checkbox data-testid="checkbox-unsupported" className="mt-0.5 h-5 w-5" checked={j.unsupported} onCheckedChange={(v) => set("unsupported", v === true)} />
                <span><span className="block font-semibold">This job involves multiple stages or multiple materials</span>
                  <span className="text-sm text-muted-foreground">Only single-material, single-stage, single-unit jobs can be recorded. Rework is supported: record it as pending rework in Outcomes. Ticking this blocks submission; you can still save a draft.</span></span>
              </label>
            </>
          )}

          {step === 1 && (
            <>
              {lockNote}
              <QtyField disabled={outcomesLocked} testId="issued" label="Material issued" value={j.issued} onChange={(v) => set("issued", v)} unit={u} hint="Total quantity issued to this job. Must be greater than zero." />
              <Field label={v2 ? "Planned yield %" : "Planned yield % (optional)"} req={v2}>
                <Input data-testid="input-planned-yield" inputMode="decimal" className="num h-12 max-w-40 text-lg" value={j.plannedYield ?? ""} placeholder="—"
                  onChange={(e) => { const t = e.target.value; if (t === "") return set("plannedYield", null); const n = Number(t); if (!Number.isNaN(n) && n >= 0 && n <= 100) set("plannedYield", n); }} />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              {lockNote}
              <p className="text-sm text-muted-foreground">Leave a field blank if it has not been measured yet. Blank is not zero — enter 0 when there truly was none.</p>
              <fieldset disabled={outcomesLocked} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <QtyField testId="good" tone="good" label="Good output" value={j.good} onChange={(v) => set("good", v)} unit={u} />
                <QtyField testId="offcuts" tone="reuse" label="Reusable offcuts" value={j.offcuts} onChange={(v) => set("offcuts", v)} unit={u} />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide"><i className="h-3 w-3 rounded-[2px] bg-waste" />Scrap entries</p>
                  <Button type="button" variant="outline" data-testid="button-add-scrap" onClick={() => set("scrap", [...j.scrap, { reason: "", quantity: null }])}><Plus className="h-4 w-4" />Add entry</Button>
                </div>
                {j.scrap.map((s, i) => (
                  <div key={i} className="rise space-y-3 rounded-md border-l-4 border-waste bg-background p-4">
                    <div className="flex items-center justify-between"><span className="num text-xs text-muted-foreground">ENTRY {i + 1}</span>
                      {j.scrap.length > 1 && <Button type="button" variant="ghost" size="sm" data-testid={`button-remove-scrap-${i}`} onClick={() => set("scrap", j.scrap.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" />Remove</Button>}
                    </div>
                    <ChipPicker testId={`reason-${i}`} options={reasons} value={s.reason} onChange={(v) => set("scrap", j.scrap.map((x, k) => (k === i ? { ...x, reason: v } : x)))} />
                    <QtyField testId={`scrap-${i}`} tone="waste" label="Quantity" value={s.quantity} onChange={(v) => set("scrap", j.scrap.map((x, k) => (k === i ? { ...x, quantity: v } : x)))} unit={u} />
                  </div>
                ))}
              </div>
              <QtyField testId="pending-rework" tone="pending" label="Pending rework" value={j.pendingRework ?? null} onChange={(v) => set("pendingRework", v)} unit={u}
                hint={v2 ? "Pieces set aside to be reworked, not yet good, offcut or scrap. Required: enter 0 if nothing is waiting." : "Optional on legacy records. Pieces set aside for rework."} />
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Offcut size (optional)"><Input data-testid="input-offcut-size" className="h-12" value={j.offcutSizeNote ?? ""} onChange={(e) => set("offcutSizeNote", e.target.value)} placeholder="e.g. 2 pcs 600 x 400" /></Field>
                <Field label="Offcut storage (optional)"><Input data-testid="input-offcut-location" className="h-12" value={j.offcutLocation ?? ""} onChange={(e) => set("offcutLocation", e.target.value)} placeholder="e.g. Rack B3" /></Field>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                {[["Job", j.number], ["Date", j.date], ["Material", j.material], ["Machine", j.machine], ["Product", j.product], ["Unit", j.unit],
                  ["Assigned", assignees.find((a) => a.userId === j.assignedTo)?.name ?? (j.assignedTo ? assignedName ?? "" : "")],
                  ["Sheet mm", j.sheetWidthMm && j.sheetLengthMm ? `${fmt(j.sheetWidthMm)} x ${fmt(j.sheetLengthMm)}` : ""]].map(([k, v]) => (
                  <div key={k} className="rounded-md bg-muted/60 p-3"><p className="text-xs uppercase text-muted-foreground">{k}</p><p className="font-semibold">{v || <span className="text-destructive">Missing</span>}</p></div>
                ))}
              </div>
              <Field label="Notes (optional)"><Textarea data-testid="input-notes" value={j.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Observations only. Do not record speculative causes." /></Field>
              {issues.length > 0 ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
                  <p className="font-semibold text-destructive">Not ready to submit</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{issues.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-md border border-good/50 bg-good/5 p-4 text-good"><Check className="h-5 w-5" /><span className="font-semibold">All checks pass. Ready to submit for review.</span></div>
              )}
            </>
          )}

          {requireChangeReason && (
            <div className="rounded-md border-2 border-waste/60 bg-waste/5 p-4">
              <label htmlFor="change-reason" className="text-sm font-bold uppercase tracking-wide">What did you correct?<span className="ml-1 text-destructive">*</span></label>
              <p className="mb-2 text-xs text-muted-foreground">This job was returned. Explain the correction you made so the reviewer can check it. Required to save. Not for general notes.</p>
              <Textarea id="change-reason" data-testid="input-change-reason" value={j.changeReason ?? ""} onChange={(e) => set("changeReason", e.target.value)} placeholder="e.g. Re-weighed scrap bin 2, corrected from 4.2 to 3.6 kg" />
            </div>
          )}
          <ErrorPanel message={error} />
          <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-between">
            <div className="flex gap-2">
              {step > 0 ? <Button variant="outline" size="lg" className="h-12" onClick={() => setStep(step - 1)} data-testid="button-back"><ArrowLeft />Back</Button>
                : onCancel && <Button variant="ghost" size="lg" className="h-12" onClick={onCancel} data-testid="button-cancel">Cancel</Button>}
              <Button variant="outline" size="lg" className="h-12" disabled={pending || !j.number.trim() || reasonMissing} onClick={() => onSave(out(), false)} data-testid="button-save-draft"><Save />Save draft</Button>
            </div>
            {step < 3 ? <Button size="lg" className="h-12 px-8" onClick={() => setStep(step + 1)} data-testid="button-next">Next<ArrowRight /></Button>
              : <Button size="lg" className="h-12 bg-good px-8 text-white hover:bg-good/90" disabled={pending || issues.length > 0 || reasonMissing} onClick={() => onSave(out(), true)} data-testid="button-submit">{pending ? "Saving…" : <><Send />Submit for review</>}</Button>}
          </div>
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-md border bg-card p-5">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground"><Scale className="h-4 w-4" />Live balance</p>
          <div className={cn("mt-4 rounded-md p-4 text-center transition-colors", !j.issued ? "bg-muted" : balanced ? "bg-good/10" : "bg-destructive/10")}>
            <p className="text-xs uppercase text-muted-foreground">Residual</p>
            <p data-testid="text-residual" className={cn("num text-4xl font-semibold", !j.issued ? "" : balanced ? "text-good" : "text-destructive")}>{j.issued ? fmt(c.difference, 3) : "—"}</p>
            <p className="text-xs">{u}{company.tolerance > 0 && ` · tolerance ±${company.tolerance}`}</p>
          </div>
          <FlowBar className="mt-4 h-4" issued={j.issued ?? 0} good={j.good ?? 0} scrap={c.scrapTotal} offcuts={j.offcuts ?? 0} pending={c.pendingRework} />
          <div className="mt-3"><Legend /></div>
          <div className="mt-3 border-t pt-3"><BalanceText issued={j.issued} accounted={c.accounted} unit={u} tolerance={company.tolerance} measured={m.measured} total={m.total} missing={m.missing} /></div>
          <dl className="num mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt>Issued</dt><dd>{fmt(j.issued)}</dd></div>
            <div className="flex justify-between text-good"><dt>Good</dt><dd>{fmt(j.good)} · {pct(c.yieldRate)}</dd></div>
            <div className="flex justify-between text-reuse"><dt>Reusable</dt><dd>{fmt(j.offcuts)} · {pct(c.offcutRate)}</dd></div>
            <div className="flex justify-between text-waste"><dt>Scrap</dt><dd>{fmt(c.scrapTotal)} · {pct(c.scrapRate)}</dd></div>
            <div className="flex justify-between text-pending"><dt>Pending rework</dt><dd>{fmt(j.pendingRework)} · {pct(c.pendingRate)}</dd></div>
            {j.plannedYield != null && <div className="flex justify-between border-t pt-2"><dt>Planned yield</dt><dd>{pct(j.plannedYield)} ({c.yieldRate - j.plannedYield >= 0 ? "+" : ""}{(c.yieldRate - j.plannedYield).toFixed(1)})</dd></div>}
          </dl>
        </div>
      </aside>
    </div>
  );
}
