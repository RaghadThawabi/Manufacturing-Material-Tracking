import assert from "node:assert/strict";
import { generateCuttingPlan, type CuttingInput } from "./cutting";
const example: CuttingInput = { sheetWidth: 1000, sheetHeight: 1000, spacing: 10, allowRotation: false, pieces: [{ id: "a", label: "A", width: 490, height: 490, quantity: 5 }] };
function verify(input: CuttingInput) {
  const plan = generateCuttingPlan(input);
  const counts = new Map<string, number>();
  let area = 0;
  for (const sheet of plan.sheets) {
    for (const [i, p] of sheet.placements.entries()) {
      const original = input.pieces.find(v => v.id === p.pieceId)!;
      assert.ok(original);
      assert.equal(p.width, p.rotated ? original.height : original.width);
      assert.equal(p.height, p.rotated ? original.width : original.height);
      assert.ok(!p.rotated || input.allowRotation);
      assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.width <= input.sheetWidth + 1e-7 && p.y + p.height <= input.sheetHeight + 1e-7);
      counts.set(p.pieceId, (counts.get(p.pieceId) ?? 0) + 1);
      area += p.width * p.height;
      for (const q of sheet.placements.slice(i + 1)) {
        const eps = 1e-7, g = input.spacing;
        assert.ok(p.x + p.width + g <= q.x + eps || q.x + q.width + g <= p.x + eps || p.y + p.height + g <= q.y + eps || q.y + q.height + g <= p.y + eps, "Pieces overlap or spacing violated");
      }
    }
  }
  input.pieces.forEach(p => assert.equal(counts.get(p.id), p.quantity));
  assert.ok(Math.abs(area - plan.usedArea) < 1e-5);
  assert.ok(Math.abs(plan.totalArea - plan.usedArea - plan.unusedArea) < 1e-5);
  assert.deepEqual(plan, generateCuttingPlan(input), "Deterministic output");
  return plan;
}
const plan = verify(example);
assert.equal(plan.sheets.length, 2);
assert.equal(plan.sheets[0].placements.length, 4);
assert.ok(Math.abs(plan.utilization - 60.025) < 1e-9);
assert.equal(plan.unusedArea, 799500);
assert.equal(verify({ ...example, spacing: 0, pieces: [{ id: "a", label: "A", width: 1000, height: 1000, quantity: 1 }] }).utilization, 100);
assert.equal(verify({ ...example, spacing: 10, pieces: [{ id: "a", label: "A", width: 1000, height: 1000, quantity: 1 }] }).utilization, 100);
const rotate = { ...example, sheetWidth: 600, sheetHeight: 400, pieces: [{ id: "a", label: "A", width: 400, height: 600, quantity: 1 }] };
assert.throws(() => generateCuttingPlan(rotate), /cannot fit/);
assert.equal(verify({ ...rotate, allowRotation: true }).sheets[0].placements[0].rotated, true);
for (const bad of [NaN, Infinity, 0, -1, 10001, 1.234]) assert.throws(() => generateCuttingPlan({ ...example, sheetWidth: bad }));
for (const bad of [0, -1, 0.5, 301, NaN]) assert.throws(() => generateCuttingPlan({ ...example, pieces: [{ ...example.pieces[0], quantity: bad }] }));
assert.throws(() => generateCuttingPlan({ ...example, pieces: [] }));
assert.throws(() => generateCuttingPlan({ ...example, spacing: -1 }));
assert.throws(() => generateCuttingPlan({ ...example, pieces: [example.pieces[0], example.pieces[0]] }));
// Deterministic generated mixed-size cases verify counts, bounds and spacing.
let seed = 19;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }
for (let k = 0; k < 100; k++) {
  verify({ ...example, spacing: Math.round(random() * 200) / 10, allowRotation: k % 2 === 0,
    pieces: Array.from({ length: 5 }, (_, i) => ({ id: String(i), label: `Type ${i}`, width: Math.round((20 + random() * 900) * 10) / 10, height: Math.round((20 + random() * 900) * 10) / 10, quantity: 1 + Math.floor(random() * 5) })) });
}
verify({ ...example, pieces: [{ ...example.pieces[0], quantity: 300 }] });
console.log("Cutting advisor: exact example, rotation, edge fit, validation, 100 mixed cases, spacing, bounds, quantities and determinism passed.");
