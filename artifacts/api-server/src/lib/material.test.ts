import { strict as assert } from "node:assert";
import { calculated, sampleJobs, transferRework, validateSubmission } from "./material";

const samples=sampleJobs();
assert.equal(samples[0].yieldRate,75);
assert.equal(samples[0].scrapRate,20);
assert.equal(samples[0].difference,0);
assert.equal(samples[1].scrapRate,10);
assert.equal(validateSubmission(samples[0],0),null);
const job=calculated({...samples[0],recordingVersion:2,assignedTo:"operator",
 sheetWidthMm:700,sheetLengthMm:1000,plannedYield:80,
 issued:1200,good:850,offcuts:60,pendingRework:50});
assert.equal(job.difference,0);
assert.equal(validateSubmission(job,0),null);
assert.match(validateSubmission({...job,pendingRework:null},0)!,/awaiting rework/);
assert.match(validateSubmission({...job,sheetWidthMm:0},0)!,/width/);
assert.match(validateSubmission({...job,assignedTo:null},0)!,/Assign/);
assert.match(validateSubmission({...job,good:840},0)!,/balance/);
assert.match(validateSubmission({...job,good:-1},0)!,/non-negative/);
const resolved=transferRework(job,{good:25,offcuts:5,scrap:[{reason:"Damaged material",quantity:10}],comment:"Measured after second pass"});
assert.equal(resolved.issued,1200);
assert.equal(resolved.pendingRework,10);
assert.equal(resolved.good,875);
assert.equal(resolved.offcuts,65);
assert.equal(resolved.scrapTotal,250);
assert.equal(resolved.difference,0);
assert.equal(resolved.reworkResolved,40);
const final=transferRework(resolved,{good:10,offcuts:0,scrap:[],comment:"Remaining material recovered"});
assert.equal(final.pendingRework,0);
assert.equal(final.reworkResolved,50);
assert.equal(final.difference,0);
assert.throws(()=>transferRework(resolved,{good:11,offcuts:0,scrap:[],comment:"Too much"}));
assert.throws(()=>transferRework(resolved,{good:0,offcuts:0,scrap:[],comment:"Zero"}));
assert.throws(()=>transferRework(resolved,{good:-1,offcuts:0,scrap:[],comment:"Negative"}));
assert.throws(()=>transferRework(resolved,{good:1,offcuts:0,scrap:[],comment:" "}));
console.log("Material accounting regression checks passed.");
