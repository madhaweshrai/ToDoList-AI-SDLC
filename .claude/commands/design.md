---
description: SDLC Steps 2-3 - architecture-designer writes architecture.md, design-reviewer reviews it, the human decides requirement-changing findings, loop until APPROVED
argument-hint: <JIRA-KEY>
---

Ticket: $ARGUMENTS. If `docs/sdlc/$ARGUMENTS/requirements.md` is missing, stop and suggest `/requirements $ARGUMENTS`.

1. **Step 2.** Use the **architecture-designer** subagent to write `docs/sdlc/$ARGUMENTS/architecture.md`.
2. **Step 3.** Use the **design-reviewer** subagent to review it and write `design-review.md`.
3. 🛑 If any finding needs a requirements or scope decision, ask the user (AskUserQuestion). Record the answers under
   *Agreed design decisions* in `design-review.md`, and update `requirements.md` if they change it.
4. If the verdict is **CHANGES REQUESTED**, re-run the **architecture-designer** subagent (it applies the findings and decisions),
   then the **design-reviewer** subagent as a re-review. Allow at most **2** loops; if it is still not approved, stop and show the open findings.
5. Commit `architecture.md`, `design-review.md` and any requirement updates with the message `<KEY>: add architecture and design review`.
6. Suggest `/plan $ARGUMENTS` as the next step.
