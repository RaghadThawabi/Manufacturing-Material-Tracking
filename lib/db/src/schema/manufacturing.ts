import { pgTable, text, jsonb, integer, uniqueIndex, boolean, timestamp } from "drizzle-orm/pg-core";
export const companiesTable = pgTable("companies", {
 id:text("id").primaryKey(), name:text("name").notNull(),
 tolerance:text("tolerance").notNull().default("0"),
 settings:jsonb("settings").notNull().default([]),
});
export const membersTable = pgTable("members",{
 id:text("id").primaryKey(), companyId:text("company_id").notNull().references(()=>companiesTable.id),
 userId:text("user_id"), name:text("name").notNull(),role:text("role").notNull(),
 inviteCode:text("invite_code"),
 active:boolean("active").notNull().default(true),
 version:integer("version").notNull().default(1),
 inviteExpiresAt:timestamp("invite_expires_at",{withTimezone:true}),
 history:jsonb("history").notNull().default([]),
},t=>[uniqueIndex("member_company_user").on(t.companyId,t.userId),uniqueIndex("invite_unique").on(t.inviteCode)]);
export const jobsTable = pgTable("jobs",{
 id:text("id").primaryKey(),companyId:text("company_id").notNull().references(()=>companiesTable.id),
 number:text("number").notNull(),version:integer("version").notNull().default(1),
 data:jsonb("data").notNull(),
},t=>[uniqueIndex("job_company_number").on(t.companyId,t.number)]);
