---
description: SDLC Step 6 - structured peer code review (correctness, security, error handling, test coverage, clarity, DRY, dependency safety) with a fix loop
argument-hint: <JIRA-KEY>
---

Ticket: $ARGUMENTS.

1. Use the **code-reviewer** subagent to write `docs/sdlc/$ARGUMENTS/code-review.md`, covering all seven checklist areas.
2. If the verdict is **CHANGES REQUESTED**, send the Blocker and Major findings to the **feature-implementer** subagent, then re-review.
   Allow at most **2** loops; if it is still not approved, stop and show the user the open findings.
3. Show the checklist table to the user. Once the verdict is **APPROVED**, commit the fixes and the review, then suggest `/verify $ARGUMENTS`.
