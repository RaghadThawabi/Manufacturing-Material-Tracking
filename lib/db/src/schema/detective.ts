import { pgTable, text, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { companiesTable } from "./manufacturing";

// Independent records: this module never modifies production jobs.
export const investigationsTable = pgTable("waste_investigations", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull().references(() => companiesTable.id),
  jobId: text("job_id").notNull(),
  data: jsonb("data").notNull(),
}, t => [uniqueIndex("waste_investigation_company_job").on(t.companyId, t.jobId)]);
