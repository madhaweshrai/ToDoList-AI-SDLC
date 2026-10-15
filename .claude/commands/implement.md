---
description: SDLC Step 5 - implement human-approved tasks from impl-plan.md with the feature-implementer agent (optionally a task range)
argument-hint: <JIRA-KEY> [task range, e.g. T1-T6]
---

Arguments: $ARGUMENTS. The first word is the ticket key. The optional second word is the approved task range.

1. Make sure you are on a feature branch (`git branch --show-current`). If you are on `master` or `main`, create `feature/<KEY>-<slug>`.
2. Use the **feature-implementer** subagent to implement the approved tasks of `docs/sdlc/<KEY>/impl-plan.md` in dependency order.
   It uses the **dto-generator** skill for data shapes. The PostToolUse hook re-runs the tests after every edit.
3. Report the tasks done and blocked, the files changed, and the test result. If the tests are red, show the failures and stop.
4. Commit with the message `<KEY>: implement <summary>`, then suggest `/review <KEY>`.
