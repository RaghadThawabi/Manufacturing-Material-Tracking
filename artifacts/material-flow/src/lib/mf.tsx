import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useListCompanies, getListCompaniesQueryKey, type Company, type Job, type JobInput } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";

export function errMsg(e: unknown): string {
  if (!e) return "";
  const any = e as { data?: { error?: string } | null; message?: string };
  return any?.data?.error || any?.message || "Something went wrong.";
}

export const fmt = (n: number | null | undefined, d = 1) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toFixed(1)}%`);

export function emptyJob(company?: Company | null): JobInput {
  const first = (k: string) => company?.settings.find((s) => s.kind === k && s.active)?.name ?? "";
  return {
    number: "", date: new Date().toISOString().slice(0, 10), material: "", machine: "", product: "",
    unit: first("unit"), instructions: "", issued: null, good: null, offcuts: null,
    scrap: [{ reason: "", quantity: null }], notes: "", plannedYield: null, unsupported: false,
    sheetWidthMm: null, sheetLengthMm: null, assignedTo: null, offcutSizeNote: "", offcutLocation: "", pendingRework: null,
  };
}

export function jobToInput(j: Job): JobInput {
  return {
    number: j.number, date: j.date, material: j.material, machine: j.machine, product: j.product, unit: j.unit,
    instructions: j.instructions, issued: j.issued, good: j.good, offcuts: j.offcuts,
    scrap: j.scrap.map((s) => ({ ...s })), notes: j.notes, plannedYield: j.plannedYield, unsupported: j.unsupported, version: j.version,
    sheetWidthMm: j.sheetWidthMm ?? null, sheetLengthMm: j.sheetLengthMm ?? null, assignedTo: j.assignedTo ?? null,
    offcutSizeNote: j.offcutSizeNote ?? "", offcutLocation: j.offcutLocation ?? "", pendingRework: j.pendingRework ?? null,
  };
}

export function calc(j: JobInput) {
  const scrapTotal = j.scrap.reduce((s, x) => s + (x.quantity ?? 0), 0);
  const issued = j.issued ?? 0;
  const r = (v: number) => (issued ? (v / issued) * 100 : 0);
  const pendingRework = j.pendingRework ?? 0;
  const accounted = (j.good ?? 0) + (j.offcuts ?? 0) + scrapTotal + pendingRework;
  return { scrapTotal, pendingRework, accounted, pendingRate: r(pendingRework), difference: Number((issued - accounted).toFixed(6)), yieldRate: r(j.good ?? 0), scrapRate: r(scrapTotal), offcutRate: r(j.offcuts ?? 0) };
}

/** Measurement completeness: which outcome fields are measured (non-null). */
export function measurement(j: Pick<JobInput, "issued" | "good" | "offcuts" | "scrap" | "pendingRework">, recordingVersion: number) {
  const fields: [string, boolean][] = [
    ["Issued", j.issued !== null], ["Good", j.good !== null], ["Reusable offcuts", j.offcuts !== null],
    ["Scrap", j.scrap.length > 0 && j.scrap.every((s) => s.quantity !== null)],
  ];
  if (recordingVersion >= 2) fields.push(["Pending rework", j.pendingRework !== null && j.pendingRework !== undefined]);
  const missing = fields.filter(([, ok]) => !ok).map(([k]) => k);
  return { total: fields.length, measured: fields.length - missing.length, missing, complete: missing.length === 0 };
}

export const isConflict = (e: unknown) => (e as { status?: number })?.status === 409;

export function submissionIssues(j: JobInput, tolerance: number, recordingVersion = 2): string[] {
  const out: string[] = [];
  if (j.unsupported) out.push("Multiple materials or multiple stages are not supported.");
  if (recordingVersion >= 2) {
    if (!j.assignedTo) out.push("Assign an operator to this job.");
    if (!j.sheetWidthMm || j.sheetWidthMm <= 0 || !j.sheetLengthMm || j.sheetLengthMm <= 0) out.push("Sheet width and length (mm) must both be greater than zero.");
    if (j.plannedYield === null || j.plannedYield === undefined || j.plannedYield < 0 || j.plannedYield > 100) out.push("Planned yield % is required (0 to 100).");
    if (!j.instructions.trim()) out.push("Instructions are required.");
    if (j.pendingRework === null || j.pendingRework === undefined || j.pendingRework < 0) out.push("Measure pending rework (enter 0 if none is waiting).");
  }
  const missing = (["number", "date", "material", "machine", "product", "unit"] as const).filter((k) => !String(j[k] ?? "").trim());
  if (missing.length) out.push(`Missing job details: ${missing.join(", ")}.`);
  if (!j.issued || j.issued <= 0) out.push("Issued material must be greater than zero.");
  if (j.good === null || j.offcuts === null) out.push("Record good output and reusable offcuts (enter 0 if none).");
  if (!j.scrap.length || j.scrap.some((s) => s.quantity === null || !s.reason.trim())) out.push("Every scrap entry needs a reason and quantity. Enter 0 if there was no scrap.");
  if (j.issued && Math.abs(calc(recordingVersion >= 2 ? j : { ...j, pendingRework: j.pendingRework ?? 0 }).difference) > tolerance + 1e-8) out.push("Material does not balance within company tolerance.");
  return out;
}

type Ctx = { companies: Company[]; company: Company | null; setCompanyId: (id: string) => void; loading: boolean; error: unknown; refetch: () => void };
const CompanyCtx = createContext<Ctx>({ companies: [], company: null, setCompanyId: () => {}, loading: false, error: null, refetch: () => {} });

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const q = useListCompanies({ query: { enabled: isAuthenticated, queryKey: getListCompaniesQueryKey(), refetchInterval: 15000, staleTime: 0 } });
  const [id, setId] = useState<string | null>(() => localStorage.getItem("mf.company"));
  const companies = useMemo(() => q.data ?? [], [q.data]);
  const company = companies.find((c) => c.id === id) ?? companies[0] ?? null;
  useEffect(() => { if (company && company.id !== id) setId(company.id); }, [company, id]);
  const setCompanyId = (v: string) => { localStorage.setItem("mf.company", v); setId(v); };
  return (
    <CompanyCtx.Provider value={{ companies, company, setCompanyId, loading: authLoading || (isAuthenticated && q.isLoading), error: q.error, refetch: () => q.refetch() }}>
      {children}
    </CompanyCtx.Provider>
  );
}
export const useCompany = () => useContext(CompanyCtx);
export const canReview = (role?: string) => role === "admin" || role === "manager" || role === "supervisor";
export const settingNames = (c: Company | null, kind: string) => (c?.settings ?? []).filter((s) => s.kind === kind && s.active).map((s) => s.name);

/* ---------- Phase 3: review flags ---------- */
export type ReviewFlag = { key: "rework" | "yield" | "balance" | "resubmitted"; label: string; detail: string; weight: number };

export function reviewFlags(j: Job, tolerance: number): ReviewFlag[] {
  const out: ReviewFlag[] = [];
  const pr = j.pendingRework ?? 0;
  if (pr > 0) out.push({ key: "rework", label: "Pending rework", detail: `${fmt(pr, 3)} ${j.unit} set aside, not yet good, offcut or scrap`, weight: 3 });
  if (j.plannedYield != null && j.yieldRate < j.plannedYield) out.push({ key: "yield", label: "Below planned yield", detail: `${pct(j.yieldRate)} vs plan ${pct(j.plannedYield)} (${(j.yieldRate - j.plannedYield).toFixed(1)} pts)`, weight: 2 });
  if (Math.abs(j.difference) > tolerance + 1e-8) out.push({ key: "balance", label: "Outside tolerance", detail: `Residual ${fmt(j.difference, 3)} ${j.unit} vs tolerance ±${fmt(tolerance, 3)}`, weight: 4 });
  if (j.audit.some((a) => isReturnish(a.action, a.toStatus))) out.push({ key: "resubmitted", label: "Resubmitted", detail: "Previously returned or reopened", weight: 1 });
  return out;
}
/** Approval needs a written comment when rework is pending or yield is below plan. */
export const approvalNeedsComment = (j: Job) => (j.pendingRework ?? 0) > 0 || (j.plannedYield != null && j.yieldRate < j.plannedYield);

export function isReturnish(action: string, toStatus?: string) {
  const a = action.toLowerCase();
  return a.startsWith("return") || a.startsWith("reopen") || (toStatus === "returned" && !a.startsWith("submit"));
}
export function latestReturn(j: Job) {
  return [...j.audit].reverse().find((a) => isReturnish(a.action, a.toStatus)) ?? null;
}
export const ago = (iso: string) => {
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.round(m)}m`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
};
