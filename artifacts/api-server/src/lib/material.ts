import { randomUUID } from "node:crypto";
export function calculated(j:any){
 j={sheetWidthMm:null,sheetLengthMm:null,assignedTo:null,assignedName:"",offcutSizeNote:"",offcutLocation:"",pendingRework:0,recordingVersion:1,reworkResolved:0,...j};
 const scrapTotal=j.scrap.reduce((s:number,x:any)=>s+(x.quantity??0),0);
 const rate=(v:number)=>(j.issued? v/j.issued*100:0);
 return {...j,scrapTotal,difference:Number(((j.issued??0)-(j.good??0)-scrapTotal-(j.offcuts??0)-(j.pendingRework??0)).toFixed(6)),yieldRate:rate(j.good??0),scrapRate:rate(scrapTotal),offcutRate:rate(j.offcuts??0)};
}
export function audit(actor:string,action:string,comment="",changes=""){
 return {id:randomUUID(),actor,action,comment,changes,at:new Date().toISOString()};
}
export function sampleJobs(companyId="demo",createdBy="demo"){
 return [
 {number:"IK-202",issued:1200,good:900,offcuts:60,scrap:[{reason:"Setup/layout",quantity:180},{reason:"Damaged material",quantity:60}]},
 {number:"IK-203",issued:1000,good:820,offcuts:80,scrap:[{reason:"Unspecified",quantity:100}]}
 ].map((s,i)=>calculated({id:companyId==="demo"?`sample-${i+1}`:randomUUID(),companyId,...s,date:"2026-10-10",material:"Carton board",machine:"CT-2",product:"Carton cutting",unit:"kg",instructions:"Single-stage cutting. Illustrative sample; specifications not supplied.",notes:"Challenge sample data. Recorded reasons are not verified root causes.",plannedYield:null,unsupported:false,version:1,status:"submitted",createdBy,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),isSample:true,audit:[audit("Sample dataset","imported","Provided challenge quantities")]}));
}
export function validateSubmission(j:any,tolerance:number){
 if(j.unsupported)return "Multiple materials and multiple production stages are not supported. Same-job rework can be recorded separately.";
 if(j.recordingVersion>=2){
  if(!j.assignedTo)return "Assign an operator before submitting.";
  if(!(j.sheetWidthMm>0)||!(j.sheetLengthMm>0))return "Record positive sheet width and length in millimetres.";
  if(j.plannedYield==null)return "Record the planned yield before submitting.";
  if(!j.instructions?.trim())return "Record cutting instructions before submitting.";
  if(j.pendingRework==null)return "Record material awaiting rework (enter zero if none).";
 }
 const quantities=[j.issued,j.good,j.offcuts,j.pendingRework,...j.scrap.map((s:any)=>s.quantity)];
 if(quantities.some(v=>v!=null&&(!Number.isFinite(v)||v<0)))return "Quantities must be finite, non-negative numbers.";
 if(![j.number,j.date,j.material,j.machine,j.product,j.unit].every(x=>typeof x==="string"&&x.trim()))return "Complete all job details before submitting.";
 if(!/^\d{4}-\d{2}-\d{2}$/.test(j.date)||!Number.isFinite(Date.parse(j.date)))return "Enter a valid job date.";
 if(!j.issued||j.issued<=0)return "Issued material must be greater than zero.";
 if(j.good===null||j.offcuts===null||!j.scrap.length||j.scrap.some((s:any)=>s.quantity===null||!s.reason.trim()))return "Record all outputs and at least one scrap entry (enter zero if there is no scrap).";
 if(Math.abs(calculated(j).difference)>tolerance+1e-8)return "Material does not balance. Resolve the unexplained difference before submitting.";
 return null;
}
export function transferRework(old:any,b:any){
 if(!b.comment?.trim())throw new Error("Explain the rework outcome.");
 if(b.scrap.some((s:any)=>s.quantity==null||!s.reason.trim()))throw new Error("Each rework scrap entry needs a reason and measured quantity.");
 const amounts=[b.good,b.offcuts,...b.scrap.map((s:any)=>s.quantity)];
 if(amounts.some((n:any)=>!Number.isFinite(n)||n<0))throw new Error("Rework outcomes must be finite non-negative quantities.");
 const total=amounts.reduce((sum:number,n:number)=>sum+n,0);
 if(total<=0||total>(old.pendingRework??0))throw new Error("Resolve a positive quantity no greater than the pending rework.");
 if(old.good==null||old.offcuts==null)throw new Error("Measure good output and offcuts before resolving rework.");
 return calculated({...old,good:old.good+b.good,offcuts:old.offcuts+b.offcuts,
  scrap:[...old.scrap,...b.scrap.filter((s:any)=>s.quantity>0)],
  pendingRework:Number((old.pendingRework-total).toFixed(6)),
  reworkResolved:(old.reworkResolved??0)+total});
}
