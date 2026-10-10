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
  };
}

export function jobToInput(j: Job): JobInput {
  return {
    number: j.number, date: j.date, material: j.material, machine: j.machine, product: j.product, unit: j.unit,
    instructions: j.instructions, issued: j.issued, good: j.good, offcuts: j.offcuts,
    scrap: j.scrap.map((s) => ({ ...s })), notes: j.notes, plannedYield: j.plannedYield, unsupported: j.unsupported, version: j.version,
  };
}

export function calc(j: JobInput) {
  const scrapTotal = j.scrap.reduce((s, x) => s + (x.quantity ?? 0), 0);
  const issued = j.issued ?? 0;
  const r = (v: number) => (issued ? (v / issued) * 100 : 0);
  const accounted = (j.good ?? 0) + (j.offcuts ?? 0) + scrapTotal;
  return { scrapTotal, accounted, difference: Number((issued - accounted).toFixed(6)), yieldRate: r(j.good ?? 0), scrapRate: r(scrapTotal), offcutRate: r(j.offcuts ?? 0) };
}

export function submissionIssues(j: JobInput, tolerance: number): string[] {
  const out: string[] = [];
  if (j.unsupported) out.push("Rework, multiple materials or multiple stages are not supported in Phase 1.");
  const missing = (["number", "date", "material", "machine", "product", "unit"] as const).filter((k) => !String(j[k] ?? "").trim());
  if (missing.length) out.push(`Missing job details: ${missing.join(", ")}.`);
  if (!j.issued || j.issued <= 0) out.push("Issued material must be greater than zero.");
  if (j.good === null || j.offcuts === null) out.push("Record good output and reusable offcuts (enter 0 if none).");
  if (!j.scrap.length || j.scrap.some((s) => s.quantity === null || !s.reason.trim())) out.push("Every scrap entry needs a reason and quantity. Enter 0 if there was no scrap.");
  if (j.issued && Math.abs(calc(j).difference) > tolerance + 1e-8) out.push("Material does not balance within company tolerance.");
  return out;
}

type Ctx = { companies: Company[]; company: Company | null; setCompanyId: (id: string) => void; loading: boolean; error: unknown; refetch: () => void };
const CompanyCtx = createContext<Ctx>({ companies: [], company: null, setCompanyId: () => {}, loading: false, error: null, refetch: () => {} });

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const q = useListCompanies({ query: { enabled: isAuthenticated, queryKey: getListCompaniesQueryKey() } });
  const [id, setId] = useState<string | null>(() => localStorage.getItem("mf.company"));
  const companies = useMemo(() => q.data ?? [], [q.data]);
  const company = companies.find((c) => c.id === id) ?? companies[0] ?? null;
  useEffect(() => { if (company && company.id !== id) setId(company.id); }, [company, id]);
  const setCompanyId = (v: string) => { localStorage.setItem("mf.company", v); setId(v); };
  return (
    <CompanyCtx.Provider value={{ companies, company, setCompanyId, loading: isAuthenticated && q.isLoading, error: q.error, refetch: () => q.refetch() }}>
      {children}
    </CompanyCtx.Provider>
  );
}
export const useCompany = () => useContext(CompanyCtx);
export const canReview = (role?: string) => role === "admin" || role === "supervisor";
export const settingNames = (c: Company | null, kind: string) => (c?.settings ?? []).filter((s) => s.kind === kind && s.active).map((s) => s.name);
