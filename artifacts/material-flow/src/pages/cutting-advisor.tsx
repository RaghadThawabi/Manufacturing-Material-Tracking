import { useMemo, useState } from "react";
import { Scissors, Plus, Trash2, RotateCcw, FlaskConical, AlertTriangle, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/mf-ui";
import { useCompany } from "@/lib/mf";
import { cn } from "@/lib/utils";
import { generateCuttingPlan, type CuttingInput, type CuttingPlan } from "@/lib/cutting";

type PieceRow = { id: string; label: string; width: string; height: string; quantity: string };
type Form = { sheetWidth: string; sheetHeight: string; spacing: string; allowRotation: boolean; pieces: PieceRow[] };

const MAX_TYPES = 20;
const MAX_PIECES = 300;
let seq = 0;
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;
const blankPiece = (label = ""): PieceRow => ({ id: newId(), label, width: "", height: "", quantity: "1" });
const blankForm = (): Form => ({ sheetWidth: "", sheetHeight: "", spacing: "0", allowRotation: false, pieces: [blankPiece("A")] });
const exampleForm = (): Form => ({ sheetWidth: "1000", sheetHeight: "1000", spacing: "10", allowRotation: false, pieces: [{ id: newId(), label: "A", width: "490", height: "490", quantity: "5" }] });

const DEC1 = /^\d+(\.\d)?$/;
function dim(raw: string, name: string, min: number, max: number, allowZero = false): { v?: number; err?: string } {
  const s = raw.trim();
  if (!s) return { err: `${name} is required.` };
  if (!DEC1.test(s)) return { err: `${name} must be a number in mm with at most 1 decimal.` };
  const v = Number(s);
  if (!Number.isFinite(v)) return { err: `${name} is not a valid number.` };
  if (allowZero ? v < min : v <= min) return { err: `${name} must be ${allowZero ? "at least" : "greater than"} ${min} mm.` };
  if (v > max) return { err: `${name} must be at most ${max} mm.` };
  return { v };
}

function validate(f: Form): { input?: CuttingInput; errors: Record<string, string>; general: string[] } {
  const errors: Record<string, string> = {};
  const general: string[] = [];
  const sw = dim(f.sheetWidth, "Sheet width", 0, 10000);
  const sh = dim(f.sheetHeight, "Sheet height", 0, 10000);
  const sp = dim(f.spacing, "Spacing", 0, 100, true);
  if (sw.err) errors.sheetWidth = sw.err;
  if (sh.err) errors.sheetHeight = sh.err;
  if (sp.err) errors.spacing = sp.err;
  if (f.pieces.length === 0) general.push("Add at least one piece type.");
  if (f.pieces.length > MAX_TYPES) general.push(`At most ${MAX_TYPES} piece types.`);
  let total = 0;
  const labels = new Set<string>();
  const pieces = f.pieces.map((p, i) => {
    const label = p.label.trim();
    if (!label) errors[`${p.id}.label`] = "Label required.";
    else if (label.length > 24) errors[`${p.id}.label`] = "Max 24 characters.";
    else if (labels.has(label.toLowerCase())) errors[`${p.id}.label`] = "Labels must be unique.";
    labels.add(label.toLowerCase());
    const w = dim(p.width, "Width", 0, 10000);
    const h = dim(p.height, "Height", 0, 10000);
    if (w.err) errors[`${p.id}.width`] = w.err;
    if (h.err) errors[`${p.id}.height`] = h.err;
    const q = p.quantity.trim();
    let qty = 0;
    if (!/^\d+$/.test(q) || Number(q) < 1) errors[`${p.id}.quantity`] = "Whole number of at least 1.";
    else if (Number(q) > MAX_PIECES) errors[`${p.id}.quantity`] = `At most ${MAX_PIECES}.`;
    else qty = Number(q);
    total += qty;
    return { id: p.id, label: label || `Piece ${i + 1}`, width: w.v ?? 0, height: h.v ?? 0, quantity: qty };
  });
  if (total > MAX_PIECES) general.push(`Total quantity is ${total}; the limit is ${MAX_PIECES} pieces.`);
  if (Object.keys(errors).length || general.length) return { errors, general };
  return { errors, general, input: { sheetWidth: sw.v!, sheetHeight: sh.v!, spacing: sp.v!, allowRotation: f.allowRotation, pieces } };
}

const nf = (n: number, d = 0) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const mm = (n: number) => nf(n, Number.isInteger(n) ? 0 : 1);
const PALETTE = ["hsl(var(--good))", "hsl(var(--reuse))", "hsl(var(--primary))", "hsl(var(--waste))"];

function SheetSvg({ plan, input, index }: { plan: CuttingPlan; input: CuttingInput; index: number }) {
  const sheet = plan.sheets[index];
  const { sheetWidth: W, sheetHeight: H } = input;
  const typeIdx = new Map(input.pieces.map((p, i) => [p.id, i]));
  const base = Math.max(W, H);
  const fs = base / 32;
  return (
    <svg viewBox={`${-base * 0.02} ${-base * 0.02} ${W + base * 0.04} ${H + base * 0.04}`} className="h-auto w-full max-h-[70vh]" role="img"
      aria-label={`Sheet ${index + 1} of ${plan.sheets.length}, ${W} by ${H} mm, ${sheet.placements.length} pieces placed. See the placement table for details.`} data-testid="svg-sheet">
      <defs>
        <pattern id="offcut" width={base / 50} height={base / 50} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2={base / 50} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.25" strokeWidth={base / 400} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill="hsl(var(--muted))" />
      <rect x={0} y={0} width={W} height={H} fill="url(#offcut)" stroke="hsl(var(--foreground))" strokeWidth={base / 250} />
      {sheet.placements.map((p, i) => {
        const color = PALETTE[(typeIdx.get(p.pieceId) ?? 0) % PALETTE.length];
        const small = Math.min(p.width, p.height);
        const f = Math.min(fs, small / 4.5, p.width / (Math.max(p.label.length + (p.rotated ? 4 : 0), `${mm(p.width)} x ${mm(p.height)}`.length) * 0.9));
        return (
          <g key={i}>
            <rect x={p.x} y={p.y} width={p.width} height={p.height} fill={`color-mix(in srgb, ${color} 22%, white)`} stroke={color} strokeWidth={base / 350} />
            {f > base / 200 && (
              <>
                <text x={p.x + p.width / 2} y={p.y + p.height / 2 - f * 0.2} textAnchor="middle" fontSize={f * 1.2} fontWeight={800} fill="hsl(var(--foreground))">{p.label}{p.rotated ? " (R)" : ""}</text>
                <text x={p.x + p.width / 2} y={p.y + p.height / 2 + f * 1.1} textAnchor="middle" fontSize={f * 0.85} fill="hsl(var(--muted-foreground))" style={{ fontFamily: "var(--font-mono, monospace)" }}>{mm(p.width)} x {mm(p.height)}</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function FieldErr({ msg, id }: { msg?: string; id: string }) {
  return msg ? <p id={id} className="mt-1 text-xs font-medium text-destructive" role="alert">{msg}</p> : null;
}

function Advisor() {
  const [form, setForm] = useState<Form>(blankForm);
  const [showErrors, setShowErrors] = useState(false);
  const [result, setResult] = useState<{ input: CuttingInput; plan: CuttingPlan; at: Date } | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [unitM2, setUnitM2] = useState(false);

  const v = useMemo(() => validate(form), [form]);
  const errs = showErrors ? v.errors : {};
  const totalQty = form.pieces.reduce((s, p) => s + (/^\d+$/.test(p.quantity.trim()) ? Number(p.quantity) : 0), 0);

  const edit = (fn: (f: Form) => Form) => {
    setForm(fn);
    setCalcError(null);
    if (result) setStale(true);
  };
  const setPiece = (id: string, k: keyof PieceRow, val: string) => edit((f) => ({ ...f, pieces: f.pieces.map((p) => (p.id === id ? { ...p, [k]: val } : p)) }));
  const nextLabel = () => { const used = new Set(form.pieces.map((p) => p.label.trim())); for (let i = 0; i < 26; i++) { const l = String.fromCharCode(65 + i); if (!used.has(l)) return l; } return ""; };

  const generate = () => {
    setShowErrors(true);
    setCalcError(null);
    if (!v.input) return;
    try {
      const plan = generateCuttingPlan(v.input);
      setResult({ input: v.input, plan, at: new Date() });
      setSheetIdx(0);
      setStale(false);
    } catch (e) {
      setResult(null);
      setStale(false);
      setCalcError(e instanceof Error ? e.message : "The plan could not be generated.");
    }
  };
  const resetAll = () => { setForm(blankForm()); setResult(null); setStale(false); setCalcError(null); setShowErrors(false); setSheetIdx(0); };
  const loadExample = () => { setForm(exampleForm()); setResult(null); setStale(false); setCalcError(null); setShowErrors(false); setSheetIdx(0); };

  const area = (n: number) => (unitM2 ? `${nf(n / 1e6, 4)}` : nf(n, Number.isInteger(n) ? 0 : 2));
  const unit = unitM2 ? "m²" : "mm²";
  const plan = result?.plan;
  const sheet = plan?.sheets[sheetIdx];

  const numInput = (key: "sheetWidth" | "sheetHeight" | "spacing", label: string, hint: string) => (
    <div>
      <Label htmlFor={`in-${key}`} className="text-xs font-semibold uppercase tracking-wider">{label} <span className="text-muted-foreground normal-case">(mm)</span></Label>
      <Input id={`in-${key}`} inputMode="decimal" value={form[key]} onChange={(e) => edit((f) => ({ ...f, [key]: e.target.value }))} className="num mt-1 h-11"
        aria-invalid={!!errs[key]} aria-describedby={errs[key] ? `err-${key}` : `hint-${key}`} data-testid={`input-${key}`} />
      {errs[key] ? <FieldErr msg={errs[key]} id={`err-${key}`} /> : <p id={`hint-${key}`} className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div>
      <PageHeader eyebrow="Planning tool / read-only" title="Smart cutting advisor">
        <Button variant="outline" onClick={loadExample} data-testid="button-load-example"><FlaskConical />Load example</Button>
        <Button variant="ghost" onClick={resetAll} data-testid="button-reset"><RotateCcw />Reset</Button>
      </PageHeader>

      <div className="rise mb-6 flex gap-3 rounded-md border-l-4 border-reuse bg-card p-4 text-sm" data-testid="text-temporary-notice">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-reuse" />
        <p><span className="font-semibold">Plans here are temporary.</span> Nothing is saved, and no job, material or production record is created or changed. Leaving the page or switching company clears the plan. All dimensions are in millimetres.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <form className="min-w-0 space-y-6" onSubmit={(e) => { e.preventDefault(); generate(); }} noValidate>
          <section className="rounded-md border bg-card p-5">
            <h2 className="text-lg font-extrabold">Stock sheet</h2>
            <div className="mt-4 grid grid-cols-2 gap-4">
              {numInput("sheetWidth", "Width", "0.1 to 10000")}
              {numInput("sheetHeight", "Height", "0.1 to 10000")}
              {numInput("spacing", "Spacing", "Min gap between pieces, 0 to 100. Not a border margin.")}
              <div className="flex items-start gap-3 pt-6">
                <Checkbox id="in-rotation" checked={form.allowRotation} onCheckedChange={(c) => edit((f) => ({ ...f, allowRotation: c === true }))} data-testid="checkbox-rotation" />
                <Label htmlFor="in-rotation" className="leading-snug">Allow 90 degree rotation<span className="block text-xs font-normal text-muted-foreground">Leave off if grain direction matters.</span></Label>
              </div>
            </div>
          </section>

          <section className="rounded-md border bg-card p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-extrabold">Required pieces</h2>
              <p className={cn("num text-xs", totalQty > MAX_PIECES ? "font-semibold text-destructive" : "text-muted-foreground")} data-testid="text-piece-total">{form.pieces.length}/{MAX_TYPES} types, {totalQty}/{MAX_PIECES} pieces</p>
            </div>
            <div className="mt-4 space-y-3">
              {form.pieces.map((p, i) => (
                <fieldset key={p.id} className="min-w-0 rounded-md border bg-background p-3" data-testid={`row-piece-${i}`}>
                  <legend className="sr-only">Piece type {i + 1}</legend>
                  <div className="grid grid-cols-2 items-start gap-2 sm:grid-cols-[1fr_1fr_1fr_0.8fr_auto]">
                    {([["label", "Label"], ["width", "W mm"], ["height", "H mm"], ["quantity", "Qty"]] as const).map(([k, l]) => (
                      <div key={k}>
                        <Label htmlFor={`in-${p.id}-${k}`} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{l}</Label>
                        <Input id={`in-${p.id}-${k}`} value={p[k]} inputMode={k === "label" ? "text" : k === "quantity" ? "numeric" : "decimal"} maxLength={k === "label" ? 24 : 8}
                          onChange={(e) => setPiece(p.id, k, e.target.value)} className={cn("mt-1 h-10 px-2", k !== "label" && "num")}
                          aria-invalid={!!errs[`${p.id}.${k}`]} aria-describedby={errs[`${p.id}.${k}`] ? `err-${p.id}-${k}` : undefined} data-testid={`input-piece-${k}-${i}`} />
                      </div>
                    ))}
                    <Button type="button" variant="ghost" size="icon" className="mt-5" disabled={form.pieces.length <= 1} aria-label={`Remove piece ${p.label || i + 1}`}
                      onClick={() => edit((f) => ({ ...f, pieces: f.pieces.filter((x) => x.id !== p.id) }))} data-testid={`button-remove-piece-${i}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  {(["label", "width", "height", "quantity"] as const).map((k) => <FieldErr key={k} msg={errs[`${p.id}.${k}`]} id={`err-${p.id}-${k}`} />)}
                </fieldset>
              ))}
            </div>
            <Button type="button" variant="outline" className="mt-3 w-full" disabled={form.pieces.length >= MAX_TYPES}
              onClick={() => edit((f) => ({ ...f, pieces: [...f.pieces, blankPiece(nextLabel())] }))} data-testid="button-add-piece"><Plus />Add piece type</Button>
          </section>

          {showErrors && v.general.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="text-form-errors">{v.general.map((g) => <p key={g}>{g}</p>)}</div>
          )}
          {showErrors && !v.input && v.general.length === 0 && <p className="text-sm text-destructive" role="alert">Fix the highlighted fields to generate a plan.</p>}

          <Button type="submit" size="lg" className="h-12 w-full" data-testid="button-generate"><Scissors />{result ? "Regenerate plan" : "Generate cutting plan"}</Button>
        </form>

        <section aria-live="polite" className="min-w-0">
          {calcError && (
            <div className="rounded-md border-2 border-destructive bg-card p-5" role="alert" data-testid="text-calc-error">
              <div className="flex items-center gap-2 font-extrabold text-destructive"><AlertTriangle className="h-5 w-5" />Plan could not be generated</div>
              <p className="mt-2 text-sm">{calcError}</p>
            </div>
          )}
          {!calcError && !result && (
            <div className="grid-paper grid min-h-[420px] place-items-center rounded-md border-2 border-dashed p-8 text-center" data-testid="empty-results">
              <div className="min-w-0 w-full max-w-sm">
                <Scissors className="mx-auto h-10 w-10 text-muted-foreground" />
                <h2 className="mt-4 text-xl font-extrabold">No plan yet</h2>
                <p className="mt-2 text-sm text-muted-foreground">Enter the stock sheet and the pieces you need, then generate. The layout is drawn to scale with a placement table you can read row by row.</p>
                <Button variant="link" className="h-auto w-full whitespace-normal" onClick={loadExample} data-testid="button-load-example-empty">Try the example: 5 x 490 mm squares on a 1000 mm sheet</Button>
              </div>
            </div>
          )}
          {result && plan && sheet && (
            <div className={cn("space-y-5 transition-opacity", stale && "opacity-60")} data-testid="results">
              {stale && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-pending bg-card p-3 text-sm opacity-100" role="status" data-testid="text-stale">
                  <span className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Inputs changed. This plan reflects the previous inputs. Regenerate before using it.</span>
                  <Button size="sm" onClick={generate} data-testid="button-regenerate"><RefreshCw />Regenerate</Button>
                </div>
              )}
              <div className="rounded-md border bg-card p-3 text-xs text-muted-foreground" data-testid="text-plan-inputs">
                <span className="font-semibold text-foreground">Plan for submitted inputs</span> ({result.at.toLocaleTimeString()}): sheet <span className="num">{mm(result.input.sheetWidth)} x {mm(result.input.sheetHeight)} mm</span>, spacing <span className="num">{mm(result.input.spacing)} mm</span>, rotation {result.input.allowRotation ? "allowed" : "off"}, {result.input.pieces.map((p) => `${p.label} ${mm(p.width)}x${mm(p.height)} x${p.quantity}`).join("; ")}.
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Sheets", value: String(plan.sheets.length), unit: "" },
                  { label: "Pieces", value: String(plan.pieceCount), unit: "" },
                  { label: "Utilization", value: `${nf(plan.utilization, 3)}%`, unit: "" },
                  { label: "Unused area", value: area(plan.unusedArea), unit },
                ].map(metric => <div key={metric.label} className="min-w-0 rounded-md border bg-card p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{metric.label}</p>
                  <p className="num mt-2 break-all text-xl font-bold">{metric.value}</p>
                  {metric.unit && <p className="text-xs text-muted-foreground">{metric.unit}</p>}
                </div>)}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="num" data-testid="text-areas">Used {area(plan.usedArea)} {unit} of {area(plan.totalArea)} {unit}</span>
                <div className="flex rounded-md border p-0.5" role="group" aria-label="Area unit">
                  {[false, true].map((m) => (
                    <button key={String(m)} type="button" aria-pressed={unitM2 === m} onClick={() => setUnitM2(m)} className={cn("rounded px-2 py-1 font-semibold", unitM2 === m ? "bg-foreground text-background" : "hover:bg-muted")} data-testid={`button-unit-${m ? "m2" : "mm2"}`}>{m ? "m²" : "mm²"}</button>
                  ))}
                </div>
              </div>

              <div className="rounded-md border bg-card p-4">
                <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Select sheet">
                  {plan.sheets.map((s, i) => (
                    <button key={i} role="tab" aria-selected={i === sheetIdx} onClick={() => setSheetIdx(i)}
                      className={cn("num rounded-md border px-3 py-1.5 text-sm font-semibold", i === sheetIdx ? "border-foreground bg-foreground text-background" : "hover:bg-muted")} data-testid={`tab-sheet-${i}`}>
                      Sheet {i + 1} <span className="opacity-60">({s.placements.length})</span>
                    </button>
                  ))}
                </div>
                <SheetSvg plan={plan} input={result.input} index={sheetIdx} />
                <p className="mt-2 text-xs text-muted-foreground">Drawn to scale. Origin (0, 0) is the top-left corner. Hatched area is unused. (R) marks a piece rotated 90 degrees.</p>
              </div>

              <div className="overflow-x-auto rounded-md border bg-card">
                <table className="w-full text-sm" data-testid="table-placements">
                  <caption className="p-3 text-left text-sm font-extrabold">Sheet {sheetIdx + 1} placements (mm)</caption>
                  <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>{["#", "Piece", "X", "Y", "Width", "Height", "Rotated"].map((h) => <th key={h} scope="col" className="px-3 py-2 text-left">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {sheet.placements.map((p, i) => (
                      <tr key={i} className="border-t" data-testid={`row-placement-${i}`}>
                        <td className="num px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <th scope="row" className="px-3 py-2 text-left font-semibold">{p.label}</th>
                        <td className="num px-3 py-2">{mm(p.x)}</td><td className="num px-3 py-2">{mm(p.y)}</td>
                        <td className="num px-3 py-2">{mm(p.width)}</td><td className="num px-3 py-2">{mm(p.height)}</td>
                        <td className="px-3 py-2">{p.rotated ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 rounded-md border-l-4 border-pending bg-card p-4 text-xs text-muted-foreground" data-testid="text-disclaimer">
                <p><span className="font-semibold text-foreground">Advisory only.</span> The layout comes from several deterministic guillotine packing heuristics and keeps the best result. It is not guaranteed to be the global optimum and is not a machine-ready toolpath.</p>
                <p>Before production, confirm grain direction, edge trim, clamp zones and saw kerf. Spacing is applied only between pieces, not at sheet edges.</p>
                <p>Unused area includes spacing gaps and potentially reusable offcuts. It is a geometric estimate, not measured scrap.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function CuttingAdvisor() {
  const { company } = useCompany();
  return <Advisor key={company?.id ?? "none"} />;
}
