# Smart Waste Detective — manual MVP test

## What it does
- Uses approved, non-sample jobs only.
- Matches material, machine, product, unit and both sheet dimensions exactly.
- Requires at least 5 matching jobs with production dates strictly before the candidate, within the preceding 90 days.
- Flags scrap rate at least 5 percentage points above those jobs' median.
- The largest recorded reason is not a proven cause.
- Admins, Managers and Supervisors can use the separate Detective page; Operators cannot.
- An investigation records notes, one corrective action, an applied date and Open / Monitoring / Closed status.
- The original flagged job and baseline are captured when the investigation opens.
- After results include all matching approved non-sample jobs dated strictly after both the action date and the flagged job, through today. Submitted jobs do not count.
- After rates use total outcomes divided by total issued, not an average of individual percentages. Lower scrap after an action does not prove causation.

## Preparation
Use a dedicated test company so other jobs cannot change the baseline. As Admin, configure:
- Material: `Detective test board`
- Machine: `DT-Cutter`
- Product: `DT-Box`
- Unit: `kg`
- Scrap reason: `Setup/layout`

Use the same settings for every job below, dimensions **700 × 1000 mm**, planned yield **80%**, and instructions **Detective MVP manual test**. Assign yourself or a joined Operator. All quantities below are kg. Set pending rework explicitly to **0**.

The dates below are intentionally historical illustrative test dates. Use them exactly; job dates, not the time you enter or approve the record, control comparison eligibility.

## 1. Enter and approve the five baseline jobs
| Job | Date | Issued | Good | Reusable | Setup/layout scrap | Pending |
|---|---|---:|---:|---:|---:|---:|
| DT-B1 | 2026-10-01 | 100 | 85 | 5 | 10 | 0 |
| DT-B2 | 2026-10-02 | 100 | 85 | 5 | 10 | 0 |
| DT-B3 | 2026-10-03 | 100 | 85 | 5 | 10 | 0 |
| DT-B4 | 2026-10-04 | 100 | 85 | 5 | 10 | 0 |
| DT-B5 | 2026-10-05 | 100 | 85 | 5 | 10 | 0 |

Submit each and approve using all three existing review checklist items.

Expected: each balances exactly; yield **85%**, scrap **10%**. No waste signal. The earliest jobs show insufficient history because they do not each have five earlier matching jobs. This is expected, not an error.

## 2. Enter the unusually wasteful job
| Job | Date | Issued | Good | Reusable | Setup/layout scrap | Pending |
|---|---|---:|---:|---:|---:|---:|
| DT-HIGH | 2026-10-06 | 100 | 75 | 5 | 20 | 0 |

Submit and approve. Since yield 75% is below the 80% plan, complete the review checks and enter the approval comment: **“Illustrative test job; below-plan yield reviewed.”**

Open **Smart Waste Detective** from navigation.

Expected:
- Exactly **one signal**: DT-HIGH.
- Job scrap rate **20%**; job yield **75%**.
- **5** baseline jobs, median scrap rate **10%**.
- Difference **+10 percentage points**, exceeding the +5-point threshold.
- Largest recorded reason **Setup/layout**.
- Links to the flagged job and all five baseline jobs.

If DT-HIGH is only submitted, it should not generate this MVP's signal. If a dimension differs, or fewer than five baselines are approved, it should not generate the signal either.

## 3. Open an investigation and record the action
Open the investigation from DT-HIGH's signal. Enter:
- Corrective action: **“Review cutting setup and confirm the layout before the next job.”**
- Notes: **“Manual feature test. Setup/layout was recorded; the cause has not been verified.”**

Save/create the investigation. Record the action applied date **2026-10-07**, change status to **Monitoring**, and save.

Expected:
- The investigation remains after page reload.
- Its before result stays **20% scrap / 75% yield**.
- No later comparison yet if you have not entered the following job.
- Opening another investigation for DT-HIGH is prevented.
- Monitoring without an action and applied date is rejected.

## 4. Enter a later production job
| Job | Date | Issued | Good | Reusable | Setup/layout scrap | Pending |
|---|---|---:|---:|---:|---:|---:|
| DT-AFTER | 2026-10-08 | 100 | 87 | 5 | 8 | 0 |

Submit and approve it. Return to Detective and open the investigation; allow up to 15 seconds for refresh, or reload.

Expected:
- **1** matching follow-up job: DT-AFTER.
- Before scrap **20%** → after **8%**: **12 percentage points lower**.
- Before yield **75%** → after **87%**: **12 percentage points higher**.
- Issued **100 kg** before and **100 kg** after.
- Baseline median stays **10%** in the saved investigation; it is distinct from the before result.
- The page describes a recorded change, not a proven effect of the action.

Change status to Closed and save to confirm the record remains accessible. Status is a workflow label, not a claim that the action caused an improvement; comparison remains based on current eligible approved follow-up records.

## 5. Quick safeguards
- Leave DT-AFTER submitted: it must not enter the after comparison until approved.
- Change a follow-up's machine, product, unit or dimensions: it must not be counted.
- A job dated 2026-10-07 (the action day) must not count: dates cannot establish whether it ran before or after the action that day.
- Open Detective as Operator: access must be denied. Existing job recording should still work.
- Open as Manager or Supervisor: investigation access should work; existing Settings permissions should remain unchanged.
- Reload after saving action/notes: persisted values should remain.

Use only this test company and the matching job values for the exact expected results. Additional matching records may legitimately change live signal baselines or follow-up totals. Avoid adding unnecessary test copies in a real production company.
