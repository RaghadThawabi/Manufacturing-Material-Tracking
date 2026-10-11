import type { Job } from "@workspace/api-client-react";

export type InsightFilters = {
  from: string; to: string; material: string; machine: string; product: string;
  unit: string; status: "approved" | "submitted" | "both"; includeSamples: boolean;
};
export const initialInsightFilters: InsightFilters = {
  from: "", to: "", material: "", machine: "", product: "", unit: "",
  status: "approved", includeSamples: false,
};
export const recordedReason = (reason: string) => reason.trim() || "Unspecified (no reason recorded)";
const measured = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
export function measuredScrap(job: Job): number | null {
  return job.scrap.length && job.scrap.every(s => measured(s.quantity))
    ? job.scrap.reduce((sum, s) => sum + s.quantity!, 0) : null;
}
export function analyzeScrap(allJobs: Job[], filters: InsightFilters) {
  const invalidDateRange = !!(filters.from && filters.to && filters.from > filters.to);
  const jobs = invalidDateRange || !filters.unit ? [] : allJobs.filter(j =>
    (j.status === "approved" || j.status === "submitted") &&
    (filters.status === "both" || j.status === filters.status) &&
    (filters.includeSamples || !j.isSample) && j.unit === filters.unit &&
    (!filters.from || j.date >= filters.from) && (!filters.to || j.date <= filters.to) &&
    (!filters.material || j.material === filters.material) &&
    (!filters.machine || j.machine === filters.machine) &&
    (!filters.product || j.product === filters.product)
  );
  type Reason = { reason: string; quantity: number; approvedQuantity: number; submittedQuantity: number; share: number; contributors: { job: Job; quantity: number }[] };
  const groups = new Map<string, Reason>();
  for (const job of jobs) {
    const perJob = new Map<string, number>();
    for (const entry of job.scrap) {
      if (!measured(entry.quantity) || entry.quantity === 0) continue;
      const reason = recordedReason(entry.reason);
      perJob.set(reason, (perJob.get(reason) ?? 0) + entry.quantity);
    }
    for (const [reason, quantity] of perJob) {
      const row = groups.get(reason) ?? { reason, quantity: 0, approvedQuantity: 0, submittedQuantity: 0, share: 0, contributors: [] };
      row.quantity += quantity;
      if (job.status === "approved") row.approvedQuantity += quantity;
      else row.submittedQuantity += quantity;
      row.contributors.push({ job, quantity });
      groups.set(reason, row);
    }
  }
  const reasons = [...groups.values()].sort((a, b) => b.quantity - a.quantity || a.reason.localeCompare(b.reason));
  const totalScrap = reasons.reduce((sum, row) => sum + row.quantity, 0);
  for (const row of reasons) {
    row.share = totalScrap > 0 ? row.quantity / totalScrap * 100 : 0;
    row.contributors.sort((a, b) => b.quantity - a.quantity || a.job.number.localeCompare(b.job.number));
  }
  return {
    jobs, reasons, totalScrap, invalidDateRange,
    approvedScrap: reasons.reduce((sum, r) => sum + r.approvedQuantity, 0),
    submittedScrap: reasons.reduce((sum, r) => sum + r.submittedQuantity, 0),
    leaders: reasons.filter(r => reasons.length > 0 && Math.abs(r.quantity - reasons[0].quantity) < 1e-8),
    sampleCount: jobs.filter(j => j.isSample).length,
  };
}

export function compareProductionJobs(a: Job, b: Job) {
  const sameUnit = !!a.unit && a.unit === b.unit;
  const specFields = [
    ["unit", "Recording unit"], ["material", "Material"], ["machine", "Machine"],
    ["product", "Product"], ["sheetWidthMm", "Sheet width (mm)"],
    ["sheetLengthMm", "Sheet length (mm)"], ["instructions", "Cutting instructions"],
    ["plannedYield", "Planned yield (%)"],
  ] as const;
  const missing = (v: unknown) => v == null || (typeof v === "string" && !v.trim());
  const specifications = specFields.map(([key, label]) => {
    const av = a[key] ?? null, bv = b[key] ?? null;
    return { key, label, a: av, b: bv, state: missing(av) || missing(bv) ? "missing" as const
      : String(av).trim() === String(bv).trim() ? "match" as const : "different" as const };
  });
  const value = (v: unknown) => measured(v) ? v : null;
  const pending = (j: Job) => value(j.pendingRework === undefined && (j.recordingVersion ?? 1) < 2 ? 0 : j.pendingRework);
  const rate = (n: number | null, j: Job) => n !== null && measured(j.issued) && j.issued > 0 ? n / j.issued * 100 : null;
  const qa = measuredScrap(a), qb = measuredScrap(b);
  const quantities: [string, string, number | null, number | null][] = [
    ["issued", "Issued", value(a.issued), value(b.issued)],
    ["good", "Good output", value(a.good), value(b.good)],
    ["scrap", "Recorded scrap", qa, qb],
    ["offcuts", "Reusable offcuts", value(a.offcuts), value(b.offcuts)],
    ["pendingRework", "Pending rework", pending(a), pending(b)],
  ];
  const ratios: [string, string, number | null, number | null][] = [
    ["yieldRate", "Good yield", rate(value(a.good), a), rate(value(b.good), b)],
    ["scrapRate", "Scrap rate", rate(qa, a), rate(qb, b)],
    ["offcutRate", "Reusable share", rate(value(a.offcuts), a), rate(value(b.offcuts), b)],
    ["pendingRate", "Pending rework share", rate(pending(a), a), rate(pending(b), b)],
  ];
  const metrics = [...quantities.map(([key, label, av, bv]) => ({ key, label, a: av, b: bv, kind: "quantity" as const, delta: sameUnit && av !== null && bv !== null ? bv - av : null })),
    ...ratios.map(([key, label, av, bv]) => ({ key, label, a: av, b: bv, kind: "pp" as const, delta: sameUnit && av !== null && bv !== null ? bv - av : null }))];
  const names = [...new Set([...a.scrap, ...b.scrap].map(s => recordedReason(s.reason)))].sort();
  const reasonQuantity = (j: Job, name: string) => measuredScrap(j) === null ? null : j.scrap.filter(s => recordedReason(s.reason) === name).reduce((sum, s) => sum + s.quantity!, 0);
  const scrapReasons = names.map(reason => {
    const av = reasonQuantity(a, reason), bv = reasonQuantity(b, reason);
    return { reason, a: av, b: bv, delta: sameUnit && av !== null && bv !== null ? bv - av : null };
  });
  return { sameUnit, specifications, metrics, scrapReasons,
    bothApproved: a.status === "approved" && b.status === "approved",
    missingSpecs: specifications.filter(s => s.state === "missing").map(s => s.label),
    differentSpecs: specifications.filter(s => s.state === "different").map(s => s.label),
  };
}
