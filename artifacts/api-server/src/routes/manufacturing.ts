import { Router, type IRouter } from "express";
import { randomUUID, randomBytes } from "node:crypto";
import { db, companiesTable, membersTable, jobsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import * as V from "@workspace/api-zod";
import { calculated, sampleJobs, validateSubmission, transferRework } from "../lib/material";
import { jobAudit, approvalIssue, memberView, accessAudit, invitationExpiry } from "../lib/governance";
const r:IRouter=Router();
const fail=(status:number,message:string)=>Object.assign(new Error(message),{status});
function parse(schema:any,body:any){const p=schema.safeParse(body);if(!p.success)throw fail(400,"Invalid input: "+p.error.issues.map((x:any)=>`${x.path.join(".")}: ${x.message}`).join("; "));return p.data;}
const out=(schema:any,data:any)=>schema.parse(data);
r.get("/demo/jobs",(_q,s)=>{s.json(out(V.GetDemoJobsResponse,sampleJobs()));});
r.use("/companies",(q,_s,next)=>{
 if(!q.isAuthenticated())throw fail(401,"Please log in.");
 if(!["GET","HEAD"].includes(q.method)){
  const origin=q.get("origin");
  const host=q.get("x-forwarded-host")||q.get("host");
  if(origin&&new URL(origin).host!==host)throw fail(403,"Request origin is not allowed.");
 }
 next();
});
async function member(q:any,roles?:string[]){
 const [m]=await db.select().from(membersTable).where(and(eq(membersTable.companyId,String(q.params.companyId)),eq(membersTable.userId,q.user.id)));
 if(!m)throw fail(404,"Workspace not found.");
 if(!m.active)throw fail(403,"Your access to this company has been suspended. Contact your administrator.");
 if(roles&&!roles.includes(m.role))throw fail(403,"Your role cannot perform this action.");
 return m;
}
async function company(id:string){const [c]=await db.select().from(companiesTable).where(eq(companiesTable.id,id));if(!c)throw fail(404,"Workspace not found.");return c;}
function companyView(c:any,role:string){return {...c,tolerance:Number(c.tolerance),role};}
r.get("/companies",async(q,s)=>{
 const ms=await db.select().from(membersTable).where(and(eq(membersTable.userId,q.user!.id),eq(membersTable.active,true)));
 s.json(out(V.ListCompaniesResponse,await Promise.all(ms.map(async m=>companyView(await company(m.companyId),m.role)))));
});
r.post("/companies",async(q,s)=>{
 const b=parse(V.CreateCompanyBody,q.body);if(!b.name.trim())throw fail(400,"Enter a company name.");
 const id=randomUUID();
 const settings=[{kind:"unit",name:b.unit},...(b.loadSamples?[{kind:"material",name:"Carton board"},{kind:"machine",name:"CT-2"},{kind:"product",name:"Carton cutting"},{kind:"reason",name:"Setup/layout"},{kind:"reason",name:"Damaged material"},{kind:"reason",name:"Unspecified"},...(b.unit!=="kg"?[{kind:"unit",name:"kg"}]:[])]:[])].map(x=>({...x,id:randomUUID(),active:true}));
 const c=await db.transaction(async tx=>{
  const [c]=await tx.insert(companiesTable).values({id,name:b.name.trim(),settings}).returning();
  await tx.insert(membersTable).values({id:randomUUID(),companyId:id,userId:q.user!.id,name:q.user!.firstName||"Administrator",role:"admin"});
  if(b.loadSamples)for(const j of sampleJobs(id,q.user!.id))await tx.insert(jobsTable).values({id:j.id,companyId:id,number:j.number,data:j});
  return c;
 });
 s.json(out(V.CreateCompanyResponse,companyView(c,"admin")));
});
r.post("/companies/join",async(q,s)=>{
 const b=parse(V.JoinCompanyBody,q.body);
 const inv=await db.transaction(async tx=>{
  const [inv]=await tx.select().from(membersTable).where(eq(membersTable.inviteCode,b.code.trim())).for("update");
  if(!inv||!inv.active||inv.userId)throw fail(400,"Invitation is invalid, revoked or already used.");
  if(inv.inviteExpiresAt&&inv.inviteExpiresAt.getTime()<=Date.now())throw fail(400,"Invitation expired. Ask your administrator for a replacement link.");
  const [existing]=await tx.select().from(membersTable).where(and(eq(membersTable.companyId,inv.companyId),eq(membersTable.userId,q.user!.id)));
  if(existing)throw fail(409,existing.active?`You are already a ${existing.role} in this workspace. This invitation is for another person. Sign out and use that person's own account; invitations do not switch your role.`:"Your membership is suspended. Ask your administrator to restore access.");
  await tx.update(membersTable).set({userId:q.user!.id,inviteCode:null,inviteExpiresAt:null,version:inv.version+1,
   history:[...(inv.history as any[]),accessAudit({name:inv.name,userId:q.user!.id,role:inv.role},"joined",inv.version+1,"Invitation accepted.")]}).where(eq(membersTable.id,inv.id));
  return inv;
 });
 s.json(out(V.JoinCompanyResponse,companyView(await company(inv.companyId),inv.role)));
});
r.patch("/companies/:companyId",async(q,s)=>{
 await member(q,["admin"]);const b=parse(V.UpdateCompanyBody,q.body);if(!b.name.trim())throw fail(400,"Name is required.");
 const [c]=await db.update(companiesTable).set({name:b.name.trim(),tolerance:String(b.tolerance)}).where(eq(companiesTable.id,String(q.params.companyId))).returning();
 s.json(out(V.UpdateCompanyResponse,companyView(c,"admin")));
});
async function settingChange(q:any,update:boolean){
 await member(q,["admin"]);const b=parse(update?V.UpdateSettingBody:V.AddSettingBody,q.body);
 if(!b.name.trim())throw fail(400,"Name is required.");
 if(b.kind==="unit"&&!["kg","sheets","m"].includes(b.name))throw fail(400,"Supported units are kg, sheets and m.");
 return db.transaction(async tx=>{
  const [c]=await tx.select().from(companiesTable).where(eq(companiesTable.id,q.params.companyId)).for("update");
  const settings=c.settings as any[];
  const old=update?settings.find(x=>x.id===q.params.settingId):null;
  if(update&&!old)throw fail(404,"Setting not found.");
  if(old&&old.kind!==b.kind)throw fail(400,"Setting type cannot change.");
  if(settings.some(x=>x.id!==old?.id&&x.kind===b.kind&&x.name.toLowerCase()===b.name.trim().toLowerCase()))throw fail(409,"This setting already exists.");
  const value={id:old?.id||randomUUID(),kind:b.kind,name:b.name.trim(),active:b.active??old?.active??true};
  await tx.update(companiesTable).set({settings:update?settings.map(x=>x.id===value.id?value:x):[...settings,value]}).where(eq(companiesTable.id,c.id));
  return value;
 });
}
r.post("/companies/:companyId/settings",async(q,s)=>{s.json(out(V.AddSettingResponse,await settingChange(q,false)));});
r.patch("/companies/:companyId/settings/:settingId",async(q,s)=>{s.json(out(V.UpdateSettingResponse,await settingChange(q,true)));});
r.get("/companies/:companyId/members",async(q,s)=>{
 await member(q,["admin"]);s.json(out(V.ListMembersResponse,(await db.select().from(membersTable).where(eq(membersTable.companyId,String(q.params.companyId)))).map(memberView)));
});
r.get("/companies/:companyId/assignees",async(q,s)=>{
 const m=await member(q);
 const rows=await db.select().from(membersTable).where(eq(membersTable.companyId,m.companyId));
 s.json(out(V.ListAssigneesResponse,rows.filter(x=>x.active&&x.userId&&(x.role==="operator"||x.userId===q.user!.id)).map(x=>({userId:x.userId,name:x.name,role:x.role}))));
});
async function assignment(q:any,m:any,b:any,old?:any){
 const target=b.assignedTo===undefined?(old?.assignedTo??(m.role==="operator"?q.user.id:null)):b.assignedTo;
 if(old&&m.role==="operator"&&target!==(old.assignedTo??null))throw fail(403,"Only a supervisor, manager or admin can reassign a job.");
 if(!old&&m.role==="operator"&&target!==q.user.id)throw fail(403,"Operators must assign new jobs to themselves.");
 if(!target)return {assignedTo:null,assignedName:""};
 const [person]=await db.select().from(membersTable).where(and(eq(membersTable.companyId,m.companyId),eq(membersTable.userId,target)));
 if(!person||!person.active)throw fail(400,"Select an active, joined member of this company.");
 if(target!==old?.assignedTo&&person.role!=="operator"&&target!==q.user.id)throw fail(400,"Select a joined operator or yourself.");
 return {assignedTo:target,assignedName:person.name};
}
const operatorCanEdit=(old:any,userId:string)=>old.assignedTo?old.assignedTo===userId:old.createdBy===userId;
async function lockAdmin(tx:any,self:any){
 // Serialize team administration and re-check identity after acquiring the lock.
 // Concurrent administrators must not be able to demote/suspend one another
 // based on permissions that stopped being true while waiting.
 await tx.select().from(companiesTable).where(eq(companiesTable.id,self.companyId)).for("update");
 const [current]=await tx.select().from(membersTable).where(eq(membersTable.id,self.id));
 if(!current?.active||current.role!=="admin")throw fail(403,"Administrator access changed. Reload before continuing.");
 return current;
}
r.post("/companies/:companyId/members",async(q,s)=>{
 const actor=await member(q,["admin"]);const b=parse(V.InviteMemberBody,q.body);
 if(!b.name.trim())throw fail(400,"Enter the team member's name.");
 const m=await db.transaction(async tx=>{
  const current=await lockAdmin(tx,actor);
  const [created]=await tx.insert(membersTable).values({id:randomUUID(),companyId:String(q.params.companyId),name:b.name.trim(),role:b.role,inviteCode:randomBytes(24).toString("hex"),inviteExpiresAt:invitationExpiry(),history:[accessAudit(current,"invited",1,"",`Role: ${b.role}`)]}).returning();
  return created;
 });
 s.json(out(V.InviteMemberResponse,memberView(m)));
});
r.patch("/companies/:companyId/members/:memberId",async(q,s)=>{
 const self=await member(q,["admin"]);const b=parse(V.UpdateMemberBody,q.body);
 if(self.id===q.params.memberId&&b.role!=="admin")throw fail(400,"You cannot remove your own administrator role.");
 if(!b.name.trim()||!b.comment.trim())throw fail(400,"Name and change reason are required.");
 const m=await db.transaction(async tx=>{
  await lockAdmin(tx,self);
  const [old]=await tx.select().from(membersTable).where(and(eq(membersTable.id,String(q.params.memberId)),eq(membersTable.companyId,self.companyId))).for("update");
  if(!old)throw fail(404,"Member not found.");
  if(b.version!==old.version)throw fail(409,"Team member changed. Reload before saving.");
  const [next]=await tx.update(membersTable).set({name:b.name.trim(),role:b.role,version:old.version+1,
   history:[...(old.history as any[]),accessAudit(self,"membership updated",old.version+1,b.comment.trim(),`Name: ${old.name} → ${b.name.trim()}; role: ${old.role} → ${b.role}`)]}).where(eq(membersTable.id,old.id)).returning();
  return next;
 });
 s.json(out(V.UpdateMemberResponse,memberView(m)));
});
r.post("/companies/:companyId/members/:memberId/actions",async(q,s)=>{
 const self=await member(q,["admin"]);const b=parse(V.ManageMemberBody,q.body);
 if(!b.comment.trim())throw fail(400,"Explain this access change.");
 const m=await db.transaction(async tx=>{
  await lockAdmin(tx,self);
  const [old]=await tx.select().from(membersTable).where(and(eq(membersTable.id,String(q.params.memberId)),eq(membersTable.companyId,self.companyId))).for("update");
  if(!old)throw fail(404,"Member not found.");
  if(b.version!==old.version)throw fail(409,"Team member changed. Reload before saving.");
  if(old.id===self.id&&b.action==="suspend")throw fail(400,"You cannot suspend your own administrator access.");
  const inviteAction=["rotateInvite","revokeInvite"].includes(b.action);
  if(inviteAction&&old.userId)throw fail(400,"This member has already joined. Manage their access instead.");
  if(!inviteAction&&!old.userId)throw fail(400,"This member has not joined. Manage their invitation instead.");
  if(b.action==="suspend"&&!old.active||b.action==="restore"&&old.active)throw fail(409,"Access is already in that state.");
  const values=b.action==="rotateInvite"?{active:true,inviteCode:randomBytes(24).toString("hex"),inviteExpiresAt:invitationExpiry()}
   :b.action==="revokeInvite"?{active:false,inviteCode:null,inviteExpiresAt:null}
   :{active:b.action==="restore"};
  const [next]=await tx.update(membersTable).set({...values,version:old.version+1,
   history:[...(old.history as any[]),accessAudit(self,b.action,old.version+1,b.comment.trim())]}).where(eq(membersTable.id,old.id)).returning();
  return next;
 });
 s.json(out(V.ManageMemberResponse,memberView(m)));
});
async function list(q:any){await member(q);return (await db.select().from(jobsTable).where(eq(jobsTable.companyId,q.params.companyId)).orderBy(desc(jobsTable.number))).map(x=>calculated(x.data));}
r.get("/companies/:companyId/jobs",async(q,s)=>{s.json(out(V.ListJobsResponse,await list(q)));});
function checkSettings(b:any,c:any,old?:any){
 for(const [field,kind] of [["material","material"],["machine","machine"],["product","product"],["unit","unit"]]){
  if(b[field]&&b[field]!==old?.[field]&&!(c.settings as any[]).some(x=>x.kind===kind&&x.name===b[field]&&x.active))throw fail(400,`Select an active ${field} from company settings.`);
 }
 for(const entry of b.scrap)if(entry.reason&&!old?.scrap?.some((x:any)=>x.reason===entry.reason)&&!(c.settings as any[]).some(x=>x.kind==="reason"&&x.name===entry.reason&&x.active))throw fail(400,"Select an active scrap reason.");
}
r.post("/companies/:companyId/jobs",async(q,s)=>{
 const m=await member(q);const b=parse(V.CreateJobBody,q.body);const c=await company(m.companyId);checkSettings(b,c);
 const assigned=await assignment(q,m,b);
 const now=new Date().toISOString();
 const j=calculated({...b,...assigned,pendingRework:b.pendingRework??null,recordingVersion:2,plannedYield:b.plannedYield??null,id:randomUUID(),companyId:m.companyId,number:b.number.trim(),version:1,status:"draft",createdBy:q.user!.id,createdAt:now,updatedAt:now,isSample:false,audit:[]});
 j.audit=[jobAudit(m,"created",null,j)];
 if(!j.number)throw fail(400,"Job number is required.");
 await db.insert(jobsTable).values({id:j.id,companyId:j.companyId,number:j.number,data:j});
 s.json(out(V.CreateJobResponse,j));
});
r.get("/companies/:companyId/jobs/:jobId",async(q,s)=>{
 await member(q);const [row]=await db.select().from(jobsTable).where(and(eq(jobsTable.companyId,String(q.params.companyId)),eq(jobsTable.id,String(q.params.jobId))));
 if(!row)throw fail(404,"Job not found.");s.json(out(V.GetJobResponse,calculated(row.data)));
});
async function changeJob(q:any,action:boolean){
 const m=await member(q);const b=parse(action?V.TransitionJobBody:V.UpdateJobBody,q.body);
 const c=await company(m.companyId);
 return db.transaction(async tx=>{
 const [row]=await tx.select().from(jobsTable).where(and(eq(jobsTable.id,q.params.jobId),eq(jobsTable.companyId,m.companyId))).for("update");
 if(!row)throw fail(404,"Job not found.");
 const old=row.data as any;
 if(b.version!==old.version)throw fail(409,"This job changed. Reload before saving.");
 let next:any;
 if(action){
  const {action:a}=b;const supervisor=["admin","manager","supervisor"].includes(m.role);
  if(["approve","return","reopen"].includes(a)&&!supervisor)throw fail(403,"Supervisor permission is required.");
  if(a==="submit"){
   if(!["draft","returned"].includes(old.status))throw fail(409,"Only draft or returned jobs can be submitted.");
   if(m.role==="operator"&&!operatorCanEdit(old,q.user.id))throw fail(403,"You can submit only jobs assigned to you.");
   if(old.assignedTo)await assignment(q,m,{},old);
   const error=validateSubmission(old,Number(c.tolerance));if(error)throw fail(400,error);
  }else if(a==="reopen"){if(old.status!=="approved")throw fail(409,"Only approved jobs can be reopened.");}
  else if(old.status!=="submitted")throw fail(409,"This job is not awaiting review.");
  if(["return","reopen"].includes(a)&&!b.comment?.trim())throw fail(400,"A reason is required.");
  if(a==="approve"){
   const error=validateSubmission(old,Number(c.tolerance))||approvalIssue(old,b);if(error)throw fail(400,error);
   if(old.assignedTo)await assignment(q,m,{},old);
  }
  next={...old,status:({submit:"submitted",approve:"approved",return:"returned",reopen:"draft"} as any)[a]};
  next.audit=[...old.audit,jobAudit(m,a,old,next,b.comment?.trim()||"",a==="approve"?b.checklist:undefined)];
 }else{
  if(!["draft","returned"].includes(old.status))throw fail(409,"Reopen this job before editing.");
  if(m.role==="operator"&&!operatorCanEdit(old,q.user.id))throw fail(403,"You can edit only jobs assigned to you.");
  if(old.status==="returned"&&!b.changeReason?.trim())throw fail(400,"Explain the correction made after this job was returned.");
  if(old.reworkResolved>0&&["issued","good","offcuts","pendingRework","scrap","unit","material"].some(k=>JSON.stringify(b[k]===undefined?old[k]:b[k])!==JSON.stringify(old[k])))throw fail(400,"Outcomes are locked after rework resolution. Use Resolve rework for further transfers.");
  const assigned=await assignment(q,m,b,old);
  checkSettings(b,c,old);
  const {changeReason,...data}=b;
  next={...old,...data,...assigned,number:b.number.trim()};
  next.audit=[...old.audit,jobAudit(m,"updated",old,next,changeReason?.trim()||"")];
 }
 next=calculated({...next,version:old.version+1,updatedAt:new Date().toISOString()});
 await tx.update(jobsTable).set({number:next.number,data:next,version:next.version}).where(eq(jobsTable.id,row.id));
 return next;
 });
}
r.patch("/companies/:companyId/jobs/:jobId",async(q,s)=>{s.json(out(V.UpdateJobResponse,await changeJob(q,false)));});
r.post("/companies/:companyId/jobs/:jobId/actions",async(q,s)=>{s.json(out(V.TransitionJobResponse,await changeJob(q,true)));});
r.post("/companies/:companyId/jobs/:jobId/rework",async(q,s)=>{
 const m=await member(q);const b=parse(V.ResolveReworkBody,q.body);const c=await company(m.companyId);
 const result=await db.transaction(async tx=>{
  const [row]=await tx.select().from(jobsTable).where(and(eq(jobsTable.id,String(q.params.jobId)),eq(jobsTable.companyId,m.companyId))).for("update");
  if(!row)throw fail(404,"Job not found.");
  const old=calculated(row.data);
  if(m.role==="operator"&&!operatorCanEdit(old,q.user!.id))throw fail(403,"This job is not assigned to you.");
  if(b.version!==old.version)throw fail(409,"This job changed. Reload before resolving rework.");
  if(!["draft","returned"].includes(old.status))throw fail(409,"Return or reopen this job before resolving rework.");
  checkSettings({...old,scrap:b.scrap},c,old);
  let next:any;try{next=transferRework(old,b);}catch(e){throw fail(400,(e as Error).message);}
  next={...next,version:old.version+1,updatedAt:new Date().toISOString(),audit:[...old.audit,jobAudit(m,"rework resolved",old,next,b.comment.trim())]};
  await tx.update(jobsTable).set({data:next,version:next.version}).where(eq(jobsTable.id,row.id));
  return next;
 });
 s.json(out(V.ResolveReworkResponse,result));
});
r.get("/companies/:companyId/summary",async(q,s)=>{
 const jobs=await list(q), units:Record<string,any>={},categories:Record<string,any>={};
 for(const j of jobs.filter(j=>["approved","submitted"].includes(j.status))){
  const u=units[j.unit]??={unit:j.unit,issued:0,good:0,scrap:0,offcuts:0,pendingRework:0,yieldRate:0};
  u.pendingRework+=j.pendingRework??0;
  u.issued+=j.issued||0;u.good+=j.good||0;u.scrap+=j.scrapTotal;u.offcuts+=j.offcuts||0;u.yieldRate=u.issued?u.good/u.issued*100:0;
  for(const x of j.scrap){const key=JSON.stringify([j.unit,x.reason]);const cat=categories[key]??={reason:x.reason,unit:j.unit,quantity:0};cat.quantity+=x.quantity||0;}
 }
 s.json(out(V.GetSummaryResponse,{jobs:jobs.length,pending:jobs.filter(j=>j.status==="submitted").length,approved:jobs.filter(j=>j.status==="approved").length,drafts:jobs.filter(j=>["draft","returned"].includes(j.status)).length,units:Object.values(units),categories:Object.values(categories)}));
});
r.use((err:any,q:any,s:any,_next:any)=>{
 q.log.error({err},"Manufacturing request failed");
 const duplicate=err.code==="23505"||err.cause?.code==="23505";
 s.status(duplicate?409:err.status||500).json({error:duplicate?"This record already exists. Use a unique name or number.":err.status?err.message:"Unable to complete the request. Please try again."});
});
export default r;
