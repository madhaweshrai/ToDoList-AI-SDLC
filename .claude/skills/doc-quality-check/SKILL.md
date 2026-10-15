---
name: doc-quality-check
description: Content-quality verification for the Markdown deliverables of an SDLC ticket (docs/sdlc/<KEY>/*.md, README/API docs, PR description, CHANGELOG) - required sections, requirement-ID traceability into tests, no placeholders, consistent facts (counts, paths, commands), valid relative links, table integrity, no secrets. Use in SDLC Step 7 (Verify) and before opening a PR.
---

# Doc Quality Check

Verifies that the **documents** a ticket produces are complete, accurate and consistent with the code, not just that the code's tests pass.

## Inputs

- The ticket folder `docs/sdlc/<KEY>/` and any user-facing docs the change touched (`README.md`, API docs, `CHANGELOG.md`, `pr-description.md`).
- `requirements.md`, which supplies the requirement IDs (FR-n, EH-n, NFR-n, AC-n).
- The test files, which are where the requirement IDs must appear.

## Checks

| # | Check | How | Pass when |
|---|-------|-----|-----------|
| Q1 | Required artifacts | `requirements.md`, `architecture.md`, `design-review.md`, `impl-plan.md`, `code-review.md` exist (plus `pr-description.md` at Step 8) | All present |
| Q2 | Required sections | Each artifact has the sections its agent template defines. The PR description has Summary, Changes Made, Test Evidence, Known Limitations and Reviewer Checklist. | None missing |
| Q3 | AC traceability | Every `AC-n` in `requirements.md` appears in at least one test name (`grep -rn "AC-n" tests/`) | Every AC is covered |
| Q4 | Requirement coverage | Every FR/EH/NFR appears in the architecture traceability table and the plan coverage matrix | No orphan IDs |
| Q5 | No placeholders | Search for `TODO`, `TBD`, `FIXME`, `lorem`, `<KEY>`, `<summary>`, `XXX` and empty table cells | None (except intentional template text in `.claude/`) |
| Q6 | Facts match reality | Test counts, coverage %, file paths, commands, endpoints and status codes quoted in the docs match the latest run and the code | All consistent |
| Q7 | Links | Every relative link `[x](path)` resolves to an existing file. External links use https. | All resolve |
| Q8 | Table integrity | Each table row has the same number of unescaped `\|` cells as its header | No ragged rows |
| Q9 | Secrets | No `gh[pousr]_…`, `github_pat_…`, `AKIA…`, private-key headers, or real tokens or passwords | None |
| Q10 | Verdict consistency | `design-review.md` ends APPROVED. `code-review.md` is APPROVED. Every Blocker and Major finding is marked Resolved. | Consistent |

## Procedure

1. Run the checks with Grep/Glob or short `node -e` scripts. Do not add dependencies.
2. Record each check as **Pass / Fail / N/A**, with evidence (counts, file:line of each failure).
3. Fix wording or fact mismatches in the docs directly. Report code or test gaps to the caller instead of fixing them.

## Output (append to `verification-report.md`)

```markdown
## B. Document quality — docs/sdlc/<KEY>/
| Check | Result | Notes |
|-------|--------|-------|
| Q1 Required artifacts | Pass | 6/6 present |
| ... | | |
```

The documents **fail** if any of Q1–Q4, Q6, Q9 or Q10 fails.
