import assert from "node:assert/strict";
import type { Job } from "@workspace/api-zod";
import { sampleJobs } from "./material";
import { detectWaste, investigationView, type SavedInvestigation } from "./detective";

const base = sampleJobs()[0] as Job;
const job = (id: string, date: string, scrap: number, issued = 100): Job => ({ ...base, id, number: id, date, status: "approved", isSample: false,
  material: "Board", machine: "Cutter", product: "Box", unit: "kg", sheetWidthMm: 700, sheetLengthMm: 1000, issued,
  good: issued - scrap - 5, offcuts: 5, pendingRework: 0, scrap: [{reason:"Setup",quantity:scrap}], version:1 });
const baselines = [1,2,3,4,5].map(n=>job(`B${n}`, `2026-10-0${n}`,10));
const flagged = job("HIGH", "2026-10-06",20);
const today = "2026-10-11";
const result = detectWaste([...baselines,flagged],today);
assert.equal(result.signals.length,1);
assert.equal(result.signals[0].medianRate,10);
assert.equal(result.signals[0].difference,10);
assert.equal(result.signals[0].baseline.length,5);
assert.equal(detectWaste([...baselines.slice(0,4),flagged],today).signals.length,0);
assert.equal(detectWaste([...baselines,{...flagged,isSample:true}],today).signals.length,0);
assert.equal(detectWaste([...baselines,{...flagged,status:"submitted"}],today).signals.length,0);
assert.equal(detectWaste([...baselines,{...flagged,unit:"sheets"}],today).signals.length,0);
assert.equal(detectWaste([...baselines,{...flagged,sheetWidthMm:null}],today).signals.length,0);
assert.equal(detectWaste([...baselines,job("edge","2026-10-06",15)],today).signals.length,1);
assert.equal(detectWaste([...baselines,job("low","2026-10-06",14.99)],today).signals.length,0);
assert.equal(detectWaste([...baselines.map(j=>({...j,date:"2026-06-01"})),flagged],today).signals.length,0);
assert.equal(detectWaste([...baselines.map(j=>({...j,date:flagged.date})),flagged],today).signals.length,0);
const saved: SavedInvestigation = {id:"i",version:1,signal:result.signals[0],source:flagged,action:"Check setup",notes:"",actionDate:"2026-10-07",status:"monitoring",createdBy:"test",createdAt:"",updatedAt:""};
const after = job("AFTER","2026-10-08",8);
const comparison = investigationView(saved,[...baselines,flagged,after,job("sameDay","2026-10-07",99),{...after,id:"other-unit",unit:"sheets"},{...after,id:"pending",status:"submitted"}],today);
assert.equal(comparison.followups.length,1);
assert.equal(comparison.afterScrapRate,8);
assert.equal(comparison.afterYieldRate,87);
assert.equal(comparison.signal.job.scrapRate,20);
const weighted = investigationView(saved,[after,job("large","2026-10-09",40,200)],today);
assert.equal(weighted.afterScrapRate,48/300*100);
assert.equal(investigationView(saved,[],today).afterScrapRate,null);
assert.equal(investigationView({...saved,actionDate:""},[after],today).followups.length,0);
assert.equal(detectWaste([...baselines,{...flagged,date:"2026-12-01"}],today).signals.length,0);
console.log("Waste Detective: history, isolation of units/specs/status/samples, threshold, dates, weighted comparisons and snapshot checks passed.");
