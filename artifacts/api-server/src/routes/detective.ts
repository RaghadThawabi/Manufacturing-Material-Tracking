import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, membersTable, jobsTable, investigationsTable } from "@workspace/db";
import * as V from "@workspace/api-zod";
import type { Job } from "@workspace/api-zod";
import { detectWaste, investigationView, validDate, type SavedInvestigation } from "../lib/detective";

const router: IRouter = Router();
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
// Separate module; does not write to manufacturing tables.
router.use("/companies/:companyId/detective", async (q, _s, next) => {
  try {
    if (!q.isAuthenticated()) throw fail(401, "Please log in.");
    const [m] = await db.select().from(membersTable).where(and(eq(membersTable.companyId, String(q.params.companyId)), eq(membersTable.userId, q.user!.id)));
    if (!m) throw fail(404, "Workspace not found.");
    if (!m.active || !["admin", "manager", "supervisor"].includes(m.role)) throw fail(403, "Manager or supervisor access is required.");
    if (!["GET", "HEAD"].includes(q.method)) {
      const origin = q.get("origin");
      if (origin && new URL(origin).host !== (q.get("x-forwarded-host") || q.get("host"))) throw fail(403, "Request origin is not allowed.");
    }
    next();
  } catch (e) { next(e); }
});
const getJobs = async (companyId: string) => (await db.select().from(jobsTable).where(eq(jobsTable.companyId, companyId))).map(r => r.data as Job);
router.get("/companies/:companyId/detective", async (q, s) => {
  const cid = String(q.params.companyId), jobs = await getJobs(cid);
  const rows = await db.select().from(investigationsTable).where(eq(investigationsTable.companyId, cid));
  s.json(V.GetDetectiveResponse.parse({ ...detectWaste(jobs), investigations: rows.map(r => investigationView(r.data as SavedInvestigation, jobs)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }));
});
router.post("/companies/:companyId/detective/investigations", async (q, s) => {
  const b = V.CreateInvestigationBody.parse(q.body), cid = String(q.params.companyId);
  const jobs = await getJobs(cid);
  const signal = detectWaste(jobs).signals.find(x => x.job.id === b.jobId);
  if (!signal) throw fail(400, "This job no longer has an eligible waste signal. Refresh the page.");
  const now = new Date().toISOString();
  const saved: SavedInvestigation = { id: randomUUID(), version: 1, signal, source: jobs.find(j => j.id === b.jobId)!,
    action: b.action.trim(), notes: b.notes.trim(), actionDate: "", status: "open", createdBy: q.user!.id, createdAt: now, updatedAt: now };
  await db.insert(investigationsTable).values({ id: saved.id, companyId: cid, jobId: b.jobId, data: saved });
  s.json(V.CreateInvestigationResponse.parse(investigationView(saved, jobs)));
});
router.patch("/companies/:companyId/detective/investigations/:investigationId", async (q, s) => {
  const b = V.UpdateInvestigationBody.parse(q.body), cid = String(q.params.companyId);
  const saved = await db.transaction(async tx => {
    const [row] = await tx.select().from(investigationsTable).where(and(eq(investigationsTable.companyId, cid), eq(investigationsTable.id, String(q.params.investigationId)))).for("update");
    if (!row) throw fail(404, "Investigation not found.");
    const old = row.data as SavedInvestigation;
    if (old.version !== b.version) throw fail(409, "Investigation changed. Reload before saving.");
    if (b.actionDate && (!validDate(b.actionDate) || b.actionDate < old.source.date || b.actionDate > new Date().toISOString().slice(0, 10))) throw fail(400, "Action date must be a valid date on or after the flagged job date and not in the future.");
    if ((b.status !== "open" || b.actionDate) && (!b.action.trim() || !b.actionDate)) throw fail(400, "Enter a corrective action and its applied date before monitoring or closing.");
    const next: SavedInvestigation = { ...old, ...b, action: b.action.trim(), notes: b.notes.trim(), version: old.version + 1, updatedAt: new Date().toISOString() };
    await tx.update(investigationsTable).set({ data: next }).where(eq(investigationsTable.id, old.id));
    return next;
  });
  s.json(V.UpdateInvestigationResponse.parse(investigationView(saved, await getJobs(cid))));
});
router.use("/companies/:companyId/detective", (e: any, _q: any, s: any, _next: any) => {
  const duplicate = e.code === "23505" || e.cause?.code === "23505";
  s.status(duplicate ? 409 : e.status || (e.name === "ZodError" ? 400 : 500)).json({ error: duplicate ? "An investigation already exists for this job." : e.status ? e.message : e.name === "ZodError" ? "Invalid investigation input." : "Unable to load or save Waste Detective. Try again." });
});
export default router;
