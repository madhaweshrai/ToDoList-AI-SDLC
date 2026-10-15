---
description: SDLC Step 4 - break the approved architecture into a prioritised, dependency-ordered task list with blocked tasks (docs/sdlc/<KEY>/impl-plan.md)
argument-hint: <JIRA-KEY>
---

Ticket: $ARGUMENTS.

1. Check that `docs/sdlc/$ARGUMENTS/design-review.md` ends with an **APPROVED** verdict. If it does not, stop and suggest `/design $ARGUMENTS`.
2. Use the **implementation-planner** subagent to write `docs/sdlc/$ARGUMENTS/impl-plan.md`.
3. Show the user the critical path, the blocked tasks and the parallel groups.
4. 🛑 Ask the user to approve the plan, either in full or as a task range for the first batch.
5. Commit `impl-plan.md`, then suggest `/implement $ARGUMENTS [range]`.
