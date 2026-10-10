import { audit, calculated } from "./material";

const trackedFields=["number","date","material","machine","product","unit","instructions","issued","good","offcuts","scrap","notes","plannedYield","unsupported","sheetWidthMm","sheetLengthMm","assignedTo","assignedName","offcutSizeNote","offcutLocation","pendingRework"];
export function jobAudit(actor:any, action:string, before:any, after:any, comment="", checklist?:any){
 const fieldChanges=trackedFields.filter(field=>JSON.stringify(before?.[field]??null)!==JSON.stringify(after[field]??null)).map(field=>({
  field,before:JSON.stringify(before?.[field]??null),after:JSON.stringify(after[field]??null)
 }));
 return {...audit(actor.name,action,comment),actorId:actor.userId,actorRole:actor.role,
  version:(before?.version??0)+1,fromStatus:before?.status??"",toStatus:after.status,
  fieldChanges,...(checklist?{checklist}:{})};
}
export function approvalIssue(job:any,body:any){
 if(!["specifications","quantities","scrapReasons"].every(key=>body.checklist?.[key]===true))return "Confirm specifications, quantities and scrap reasons before approving.";
 const j=calculated(job);
 if(((j.pendingRework??0)>0||(j.plannedYield!=null&&j.yieldRate<j.plannedYield))&&!body.comment?.trim())return "Explain approval with pending rework or yield below plan.";
 return null;
}
export function memberView(m:any){
 return {...m,inviteExpiresAt:m.inviteExpiresAt?.toISOString()??null};
}
export function accessAudit(actor:any,action:string,version:number,comment:string,changes=""){
 return {...audit(actor.name,action,comment,changes),actorId:actor.userId,actorRole:actor.role,version};
}
export function invitationExpiry(){return new Date(Date.now()+7*24*60*60*1000);}
