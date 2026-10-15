---
description: SDLC Step 7 - generate missing tests, run the unit + integration suite with coverage, and quality-check the generated output document
argument-hint: <JIRA-KEY>
---

Ticket: $ARGUMENTS.

1. Use the **test-suite-generator** subagent. It fills any AC/EH test gaps, runs the full suite with coverage, generates the output
   document, and runs the **doc-quality-check** skill on it.
2. Show the user the summary from `docs/sdlc/$ARGUMENTS/verification-report.md`: the test counts, the coverage, and the document check table.
3. If it reports production bugs, offer to send them to the **feature-implementer** subagent, then re-run `/verify`.
4. If the result is **PASS**, commit the report and any new tests, then suggest `/create-pr $ARGUMENTS`.
