---
description: SDLC Step 8 - generate PR description (Summary, Changes Made, Test Evidence, Known Limitations, Reviewer Checklist) and CHANGELOG entry, push and open the PR
argument-hint: <JIRA-KEY>
---

Ticket: $ARGUMENTS.

1. Check the preconditions: `code-review.md` is **APPROVED** and `verification-report.md` is **PASS**.
2. 🛑 Ask the user: "Push branch `<current branch>` and open a PR against `master` for $ARGUMENTS?" Continue only if they confirm.
3. Use the **pr-creator** subagent. It writes the CHANGELOG entry and `pr-description.md` (all five required sections), commits, pushes,
   and opens the PR. If neither `gh` nor the GitHub MCP is available, it returns a compare URL instead.
4. Return the PR URL (or the compare URL plus the description file) to the user.
