import type { Job } from "@workspace/api-client-react";
import { measuredScrap, recordedReason } from "./production-analysis";

export type ReportFilters = {
  from: string; to: string; material: string; machine: string; product: string;
  unit: string; status: string; includeSamples: boolean;
};
export function filterReportJobs(jobs: Job[], f: ReportFilters): Job[] {
  if (f.from && f.to && f.from > f.to) throw new Error("From date must not be after To date.");
  return jobs.filter(j =>
    (!f.from || j.date >= f.from) && (!f.to || j.date <= f.to) &&
    (!f.material || j.material === f.material) && (!f.machine || j.machine === f.machine) &&
    (!f.product || j.product === f.product) && (!f.unit || j.unit === f.unit) &&
    (!f.status || f.status === "all" || j.status === f.status || (f.status === "both" && ["submitted", "approved"].includes(j.status))) &&
    (f.includeSamples || !j.isSample)
  ).sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
}
// Quote every cell and neutralize spreadsheet formula execution in user-supplied text.
export function csvCell(v: unknown): string {
  let text = v == null ? "" : String(v);
  if (typeof v === "string" && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export function buildProductionCsv(all: Job[], f: ReportFilters, companyName: string): string {
  const jobs = filterReportJobs(all, f);
  const rows: unknown[][] = [
    ["MaterialFlow production report", companyName],
    ["Generated at (UTC)", new Date().toISOString()],
    ["Job date from (inclusive)", f.from || "Earliest", "to (inclusive)", f.to || "Latest"],
    ["Material", f.material || "All", "Machine", f.machine || "All", "Product", f.product || "All"],
    ["Unit", f.unit || "All (separate rows; no combined totals)", "Status", f.status || "All", "Include illustrative samples", f.includeSamples ? "Yes" : "No"],
    ["Definitions", "Rates = outcome / issued x 100. Blank quantities are unmeasured, not zero. Submitted records await review. Recorded reasons are not proven root causes. Reusable offcuts are not scrap."],
    [],
    ["Job ID", "Job", "Date", "Status", "Illustrative sample", "Unit", "Material", "Machine", "Product", "Assigned user ID", "Issued", "Good", "Scrap", "Reusable offcuts", "Pending rework", "Yield %", "Scrap %", "Planned yield %", "Sheet width mm", "Sheet length mm", "Instructions", "Offcut size note", "Offcut location", "Version", "Assigned name"],
  ];
  const rate = (n: number | null | undefined, issued: number | null) => n != null && issued != null && issued > 0 ? n / issued * 100 : null;
  for (const j of jobs) {
    const scrap = measuredScrap(j);
    rows.push([j.id, j.number, j.date, j.status === "submitted" ? "Submitted - awaiting review" : j.status, j.isSample ? "SAMPLE" : "No",
      j.unit, j.material, j.machine, j.product, j.assignedTo, j.issued, j.good, scrap, j.offcuts,
      j.pendingRework ?? ((j.recordingVersion ?? 1) < 2 ? 0 : null), rate(j.good, j.issued), rate(scrap, j.issued),
      j.plannedYield, j.sheetWidthMm, j.sheetLengthMm, j.instructions, j.offcutSizeNote, j.offcutLocation, j.version, j.assignedName]);
  }
  rows.push([], ["Recorded scrap entries (individual entries; not additional job totals)"], ["Job ID", "Job", "Status", "Illustrative sample", "Unit", "Recorded reason", "Quantity"]);
  for (const j of jobs) for (const s of j.scrap) rows.push([j.id, j.number, j.status === "submitted" ? "Submitted - awaiting review" : j.status, j.isSample ? "SAMPLE" : "No", j.unit, recordedReason(s.reason), s.quantity]);
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
