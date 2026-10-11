/** Standalone planning only: no production records, API calls or persisted state. */
export interface PieceInput { id: string; label: string; width: number; height: number; quantity: number }
export interface CuttingInput { sheetWidth: number; sheetHeight: number; spacing: number; allowRotation: boolean; pieces: PieceInput[] }
export interface Placement { pieceId: string; label: string; x: number; y: number; width: number; height: number; rotated: boolean }
export interface CuttingPlan { sheets: { placements: Placement[] }[]; pieceCount: number; usedArea: number; totalArea: number; unusedArea: number; utilization: number }
type Rect = { x: number; y: number; w: number; h: number };
type Item = { id: string; label: string; w: number; h: number };
const units = (n: number) => Math.round(n * 10);
function dimension(n: number, label: string, min: number, max: number) {
  if (!Number.isFinite(n) || n < min || n > max || Math.abs(n * 10 - Math.round(n * 10)) > 1e-6)
    throw new Error(`${label} must be ${min}–${max} mm, with at most one decimal place.`);
}

export function generateCuttingPlan(input: CuttingInput): CuttingPlan {
  dimension(input.sheetWidth, "Sheet width", 0.1, 10000);
  dimension(input.sheetHeight, "Sheet height", 0.1, 10000);
  dimension(input.spacing, "Cutting spacing", 0, 100);
  if (typeof input.allowRotation !== "boolean") throw new Error("Choose whether rotation is allowed.");
  if (!Array.isArray(input.pieces) || !input.pieces.length || input.pieces.length > 20)
    throw new Error("Enter between 1 and 20 piece types.");
  const W = units(input.sheetWidth), H = units(input.sheetHeight), gap = units(input.spacing);
  const ids = new Set<string>();
  const items: Item[] = [];
  for (const p of input.pieces) {
    if (!p.id || ids.has(p.id)) throw new Error("Each piece type needs a unique ID.");
    ids.add(p.id);
    if (!p.label.trim() || p.label.length > 80) throw new Error("Piece labels must contain 1–80 characters.");
    dimension(p.width, `${p.label} width`, 0.1, 10000);
    dimension(p.height, `${p.label} height`, 0.1, 10000);
    if (!Number.isSafeInteger(p.quantity) || p.quantity < 1 || p.quantity > 300)
      throw new Error("Each quantity must be a whole number from 1 to 300.");
    if (items.length + p.quantity > 300) throw new Error("This MVP supports up to 300 pieces per plan.");
    const w = units(p.width), h = units(p.height);
    if (!(w <= W && h <= H) && !(input.allowRotation && h <= W && w <= H))
      throw new Error(`${p.label} cannot fit on this sheet${input.allowRotation ? ", even rotated" : "; check dimensions or allow rotation"}.`);
    for (let i = 0; i < p.quantity; i++) items.push({ id: p.id, label: p.label, w, h });
  }

  // Reserve gap on right/bottom of each piece. Extend the virtual sheet by the
  // same gap so spacing is required between pieces, never beyond a sheet edge.
  // Integer tenths of mm avoid decimal rounding allowing overlaps/out-of-bounds.
  const orders = [
    (a: Item, b: Item) => b.w * b.h - a.w * a.h,
    (a: Item, b: Item) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
    (a: Item, b: Item) => b.w - a.w,
    (a: Item, b: Item) => b.h - a.h,
  ];
  let best: { placements: Placement[] }[] | undefined;
  for (const order of orders) for (const horizontal of [false, true]) {
    const sheets: { placements: Placement[]; free: Rect[] }[] = [];
    for (const item of [...items].sort(order)) {
      let choice: { sheet: number; rect: number; w: number; h: number; rotated: boolean; score: number } | undefined;
      function consider(sheet: number) {
        sheets[sheet].free.forEach((r, rect) => {
          for (const rotated of input.allowRotation && item.w !== item.h ? [false, true] : [false]) {
            const w = (rotated ? item.h : item.w) + gap, h = (rotated ? item.w : item.h) + gap;
            if (w > r.w || h > r.h) continue;
            const score = r.w * r.h - w * h;
            if (!choice || score < choice.score) choice = { sheet, rect, w, h, rotated, score };
          }
        });
      }
      for (let s = 0; s < sheets.length; s++) consider(s);
      if (!choice) {
        sheets.push({ placements: [], free: [{ x: 0, y: 0, w: W + gap, h: H + gap }] });
        consider(sheets.length - 1);
      }
      if (!choice) throw new Error("No feasible placement found.");
      const { sheet, rect, w, h, rotated } = choice;
      const target = sheets[sheet], r = target.free.splice(rect, 1)[0];
      target.placements.push({ pieceId: item.id, label: item.label, x: r.x / 10, y: r.y / 10, width: (w - gap) / 10, height: (h - gap) / 10, rotated });
      const remainder = horizontal
        ? [{ x: r.x + w, y: r.y, w: r.w - w, h }, { x: r.x, y: r.y + h, w: r.w, h: r.h - h }]
        : [{ x: r.x + w, y: r.y, w: r.w - w, h: r.h }, { x: r.x, y: r.y + h, w, h: r.h - h }];
      target.free.push(...remainder.filter(v => v.w > 0 && v.h > 0));
    }
    if (!best || sheets.length < best.length) best = sheets.map(({ placements }) => ({ placements }));
  }
  const sheets = best!;
  const usedArea = items.reduce((sum, i) => sum + i.w * i.h, 0) / 100;
  const totalArea = sheets.length * W * H / 100;
  return { sheets, pieceCount: items.length, usedArea, totalArea, unusedArea: totalArea - usedArea, utilization: usedArea / totalArea * 100 };
}
