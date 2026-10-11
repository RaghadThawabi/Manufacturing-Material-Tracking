import { strict as assert } from "node:assert";
import type { Job } from "@workspace/api-client-react";
import { sampleJobs } from "../../../api-server/src/lib/material";
import { analyzeScrap, compareProductionJobs, initialInsightFilters } from "./production-analysis";

const [ik202, ik203] = sampleJobs() as Job[];
const make = (id:string, changes:Partial<Job> = {}):Job => ({
  ...ik202,id,number:id,isSample:false,status:"approved",date:"2026-10-11",
  material:"Board",machine:"Cutter 1",product:"Box",issued:100,good:60,offcuts:0,pendingRework:0,
  scrap:[{reason:"Damage",quantity:10},{reason:"Damage",quantity:20},{reason:"Setup",quantity:10}],
  ...changes,
});
const a=make("A");
const b=make("B",{status:"submitted",issued:200,good:100,scrap:[{reason:"Damage",quantity:60},{reason:"Setup",quantity:40}]});
const mixed=make("Other unit",{unit:"sheets",scrap:[{reason:"Damage",quantity:1000}]});
const old=make("Earlier",{date:"2026-10-10"});
const base={...initialInsightFilters,unit:"kg",from:"2026-10-11",to:"2026-10-11"};
const all=[a,b,mixed,old,make("Draft",{status:"draft"}),make("Returned",{status:"returned"})];
const approved=analyzeScrap(all,base);
assert.deepEqual(approved.jobs.map(j=>j.id),["A"]);
assert.equal(approved.totalScrap,40);
assert.equal(approved.approvedScrap,40);
assert.equal(approved.submittedScrap,0);
assert.equal(approved.leaders[0].reason,"Damage");
assert.equal(approved.leaders[0].share,75);
assert.equal(approved.leaders[0].contributors.length,1);
assert.equal(approved.leaders[0].contributors[0].quantity,30);
const combined=analyzeScrap(all,{...base,status:"both"});
assert.equal(combined.totalScrap,140);
assert.equal(combined.approvedScrap,40);
assert.equal(combined.submittedScrap,100);
assert.equal(combined.leaders[0].quantity,90);
assert.ok(Math.abs(combined.leaders[0].share-90/140*100)<1e-10);
assert.equal(combined.leaders[0].contributors[0].job.id,"B");
assert.equal(analyzeScrap(all,{...base,status:"submitted"}).totalScrap,100);
assert.equal(analyzeScrap(all,{...base,unit:"sheets"}).totalScrap,1000);
for (const key of ["material","machine","product"] as const) {
  assert.equal(analyzeScrap(all,{...base,[key]:"No such selection"}).jobs.length,0);
}
assert.equal(analyzeScrap(all,{...base,to:"2026-10-10"}).invalidDateRange,true);
assert.equal(analyzeScrap(all,{...base,unit:""}).jobs.length,0);
assert.equal(analyzeScrap([ik202,ik203],{...initialInsightFilters,unit:"kg",status:"both"}).totalScrap,0);
const illustrative=analyzeScrap([ik202,ik203],{...initialInsightFilters,unit:"kg",status:"both",includeSamples:true});
assert.equal(illustrative.sampleCount,2);
assert.equal(illustrative.totalScrap,340);
const zero=analyzeScrap([make("Zero",{scrap:[{reason:"Damage",quantity:0}]})],base);
assert.equal(zero.jobs.length,1);
assert.equal(zero.leaders.length,0);
const tied=analyzeScrap([make("Tie",{scrap:[{reason:"One",quantity:10},{reason:"Two",quantity:10}]})],base);
assert.equal(tied.leaders.length,2);
assert.ok(tied.leaders.every(r=>r.share===50));
const comparison=compareProductionJobs(ik202,ik203);
assert.equal(comparison.sameUnit,true);
assert.equal(comparison.metrics.find(m=>m.key==="yieldRate")!.delta,7);
assert.equal(comparison.metrics.find(m=>m.key==="scrapRate")!.delta,-10);
assert.equal(comparison.metrics.find(m=>m.key==="issued")!.delta,-200);
assert.ok(comparison.missingSpecs.includes("Sheet width (mm)"));
assert.ok(comparison.missingSpecs.includes("Planned yield (%)"));
assert.equal(comparison.bothApproved,false);
assert.ok(compareProductionJobs(a,mixed).metrics.every(m=>m.delta===null));
const missing=compareProductionJobs(make("Unknown",{issued:null,good:null,scrap:[{reason:"Damage",quantity:null}]}),a);
assert.equal(missing.metrics.find(m=>m.key==="yieldRate")!.a,null);
assert.equal(missing.metrics.find(m=>m.key==="scrap")!.a,null);
assert.equal(missing.scrapReasons[0].a,null);
assert.equal(compareProductionJobs(a,make("Different",{machine:"Cutter 2"})).differentSpecs.includes("Machine"),true);
assert.equal(a.scrap.length,3);
console.log("Phase 4 analysis checks passed: filters, units, status splits, ties, samples, source totals, unknowns and comparison deltas.");
