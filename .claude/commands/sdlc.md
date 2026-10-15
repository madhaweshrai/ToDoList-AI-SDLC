---
description: Run the full 8-step agentic SDLC for a ticket (requirements → architecture → design review → plan → implement → review → verify → PR) with human-in-the-loop gates
argument-hint: <JIRA-KEY> [path to story file]
---

Run the end-to-end agentic SDLC for **$ARGUMENTS**. All artifacts go in `docs/sdlc/<KEY>/`.
Subagents cannot talk to the user, so **you** own every human-in-the-loop gate (🛑): stop at each one and wait for the user's answer.

| Step | Phase | Subagent / skill | Artifact | Gate |
|------|-------|------------------|----------|------|
| 1 | Requirements | requirements-gathering (run twice) | user-story.md, requirements.md, **committed** | 🛑 The user answers the clarifying questions |
| 2 | Architecture | architecture-designer | architecture.md | |
| 3 | Design review | design-reviewer ⇄ architecture-designer (max 2 loops) | design-review.md, architecture.md rev N | 🛑 The user decides any finding that changes requirements, then approves the design |
| 4 | Implementation planning | implementation-planner | impl-plan.md (dependency-ordered, blocked tasks) | 🛑 The user approves the plan or a task range |
| 5 | Implementation | feature-implementer + dto-generator skill · PostToolUse test hook | source + unit tests | Tests stay green |
| 6 | Review | code-reviewer ⇄ feature-implementer (max 2 loops) | code-review.md | Verdict APPROVED |
| 7 | Verify | test-suite-generator + doc-quality-check skill | verification-report.md | Result PASS |
| 8 | Pull request | pr-creator | CHANGELOG.md, pr-description.md, PR | 🛑 The user confirms the push and the PR |

Rules:
- Run the steps strictly in order. Never skip a gate. Commit the artifacts at the end of steps 1, 3, 4, 5 and 7 (`<KEY>: <summary>`).
- If a step fails (missing input, red tests, loop limit hit), stop. Report the step, the cause, and the command to resume:
  `/requirements`, `/design`, `/plan`, `/implement`, `/review`, `/verify`, `/create-pr`.
- After each step, give the user one status line: the step, the artifact path, and the verdict or result.
- At the end, print a table of the 8 steps with their status, plus the PR URL.
