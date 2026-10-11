import type { Job, WasteSignal, DetectiveJob, WasteInvestigation } from "@workspace/api-zod";

export type SavedInvestigation = Omit<WasteInvestigation, "followups" | "afterScrapRate" | "afterYieldRate"> & { source: Job };
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
export const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
export function eligible(j: Job, today: string): boolean {
  return j.status === "approved" && !j.isSample && !j.unsupported &&
    validDate(j.date) && j.date <= today &&
    ["material", "machine", "product", "unit"].every(k => !!j[k as keyof Job]) &&
    finite(j.sheetWidthMm) && j.sheetWidthMm > 0 && finite(j.sheetLengthMm) && j.sheetLengthMm > 0 &&
    finite(j.issued) && j.issued > 0 && finite(j.good) &&
    j.scrap.length > 0 && j.scrap.every(s => finite(s.quantity) && !!s.reason.trim());
}
export function comparable(a: Job, b: Job): boolean {
  return (["material", "machine", "product", "unit", "sheetWidthMm", "sheetLengthMm"] as const).every(k => a[k] === b[k]);
}
export function jobSummary(j: Job): DetectiveJob {
  const scrap = j.scrap.reduce((n, s) => n + s.quantity!, 0);
  return { id: j.id, number: j.number, date: j.date, unit: j.unit, version: j.version, issued: j.issued!, good: j.good!, scrap,
    scrapRate: scrap / j.issued! * 100, yieldRate: j.good! / j.issued! * 100 };
}
export function detectWaste(jobs: Job[], today = new Date().toISOString().slice(0, 10)) {
  const candidates = jobs.filter(j => eligible(j, today));
  const signals: WasteSignal[] = [];
  let insufficientHistory = 0;
  for (const j of candidates) {
    const start = new Date(Date.parse(j.date) - 90 * 86400000).toISOString().slice(0, 10);
    const previous = candidates.filter(b => b.id !== j.id && comparable(j, b) && b.date >= start && b.date < j.date);
    if (previous.length < 5) { insufficientHistory++; continue; }
    const rates = previous.map(b => jobSummary(b).scrapRate).sort((a, b) => a - b);
    const mid = Math.floor(rates.length / 2);
    const medianRate = rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
    const job = jobSummary(j);
    if (job.scrapRate - medianRate < 5 - 1e-8) continue;
    const reasons = new Map<string, number>();
    for (const s of j.scrap) reasons.set(s.reason.trim(), (reasons.get(s.reason.trim()) ?? 0) + s.quantity!);
    const max = Math.max(...reasons.values());
    const largestReason = [...reasons].filter(([, n]) => Math.abs(n - max) < 1e-8).map(([r]) => r).join(" / ");
    signals.push({ job, baseline: previous.sort((a, b) => a.date.localeCompare(b.date)).map(jobSummary), medianRate,
      difference: job.scrapRate - medianRate, largestReason,
      explanation: `Scrap ${job.scrapRate.toFixed(1)}% is ${(job.scrapRate - medianRate).toFixed(1)} percentage points above the ${medianRate.toFixed(1)}% median of ${previous.length} comparable approved jobs in the preceding 90 days (threshold: at least +5 points).` });
  }
  signals.sort((a, b) => b.job.date.localeCompare(a.job.date) || b.difference - a.difference);
  return { signals, eligibleJobs: candidates.length, insufficientHistory };
}
export function investigationView(saved: SavedInvestigation, jobs: Job[], today = new Date().toISOString().slice(0, 10)): WasteInvestigation {
  const { source, ...rest } = saved;
  const followups = !saved.actionDate ? [] : jobs.filter(j => eligible(j, today) && j.id !== source.id &&
    comparable(source, j) && j.date > saved.actionDate && j.date > source.date).sort((a, b) => a.date.localeCompare(b.date)).map(jobSummary);
  const issued = followups.reduce((n, j) => n + j.issued, 0);
  return { ...rest, followups,
    afterScrapRate: issued ? followups.reduce((n, j) => n + j.scrap, 0) / issued * 100 : null,
    afterYieldRate: issued ? followups.reduce((n, j) => n + j.good, 0) / issued * 100 : null };
}
