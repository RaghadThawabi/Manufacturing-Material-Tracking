# Smart Cutting Advisor: manual test

Open **Cutting advisor** from an authenticated company's sidebar. This is a
temporary planning calculator: it does not save plans or change production jobs.
All roles can calculate a proposal.

## Exact example

- Sheet width: **1000 mm**
- Sheet height: **1000 mm**
- Cutting spacing: **10 mm**
- Allow 90° rotation: **off**
- One piece type: **A**, width **490 mm**, height **490 mm**, quantity **5**
- Generate the layout (or load the built-in example, then generate).

Expected:

- **2 sheets**, **5 pieces**.
- First sheet: four pieces, with top-left coordinates (0,0), (500,0),
  (0,500), (500,500) mm (placement order can differ).
- Second sheet: one piece.
- Each piece is 490 × 490 = **240,100 mm²**.
- Total piece area = 5 × 240,100 = **1,200,500 mm²**, or **1.2005 m²**.
- Total sheet area = **2,000,000 mm²**, or **2 m²**.
- Material utilization = **60.025%** (may display rounded).
- Estimated unused area = **799,500 mm²**, or **0.7995 m²** = **39.975%**.
- There is a 10 mm minimum gap between neighboring pieces. No required border
  margin is added. Unused area includes spacing and potentially reusable offcuts;
  it is not a prediction of measured production scrap or mass.

## Extra checks

1. Change the quantity to **4**, regenerate: **1 sheet**, **96.04%** utilization,
   **39,600 mm²** unused area.
2. Sheet **600 × 400 mm**, piece **400 × 600 mm**, quantity **1**, spacing **0**:
   rotation off should reject it; rotation on should fit one sheet at **100%**.
3. Blank fields, negative spacing, zero/fractional quantities, and oversized pieces
   should be rejected rather than producing a partial plan.
4. Add a second piece type and check that every requested quantity is present in
   the sheet layouts and placement tables.
5. Change an input after calculating: regenerate before treating any proposal as
   current. Refreshing/navigating away clears the temporary plan.

## Scope and safety

The algorithm tries several deterministic rectangular guillotine-style packing
heuristics and chooses the proposal using the fewest sheets among those trials.
It does **not** prove a globally optimal layout or generate machine-ready cut
instructions. Assume a single sheet size and material, rectangular pieces only,
no defects, no edge trim, and no grain constraint beyond the rotation setting.
Confirm actual cutter kerf, grain, clamps, trim and cutting sequence before using
any proposal in production. All arithmetic is area-based, not kg-based.
