# Agentic SDLC kit for Claude Code

This Claude Code configuration drives a user story through the full **8-step agentic SDLC** of the capstone brief,
from requirements to a merged-ready Pull Request:

```
Story ─► 1 Requirements ─► 2 Architecture ⇄ 3 Design review ─► 4 Plan ─► 5 Implement ─► 6 Review ⇄ fix ─► 7 Verify ─► 8 PR
            🛑 clarify               🛑 decide findings           🛑 approve                                      🛑 confirm push
```

The capstone brief names GitHub Copilot primitives. This kit implements each of them with the Claude Code equivalent:

| Brief (Copilot) | This kit (Claude Code) | Where |
|-----------------|------------------------|-------|
| Agents | Subagents, one per SDLC role | `.claude/agents/*.md` |
| Prompts | Slash commands, one per step plus `/sdlc` | `.claude/commands/*.md` |
| Instructions | Project memory | `.claude/CLAUDE.md` |
| Skills | Skills | `.claude/skills/*/SKILL.md` |
| Hooks | `PreToolUse` / `PostToolUse` hooks | `.claude/settings.local.json` + `.claude/hooks/*.mjs` |
| Integrations | MCP servers (Jira, GitHub) | `.mcp.json` (repo root; Claude Code reads it only from there) |

## Contents

```
.claude/
├── agents/
│   ├── requirements-gathering.md   Step 1: story + code → requirements.md, clarifying questions
│   ├── architecture-designer.md    Step 2: architecture.md (components, diagrams, traceability); applies review fixes
│   ├── design-reviewer.md          Step 3: independent review → design-review.md (read-only)
│   ├── implementation-planner.md   Step 4: dependency-ordered impl-plan.md with blocked tasks
│   ├── feature-implementer.md      Step 5: implements approved tasks; fixes review findings
│   ├── code-reviewer.md            Step 6: 7-area checklist → code-review.md (read-only)
│   ├── test-suite-generator.md     Step 7: tests + coverage + output-document quality → verification-report.md
│   └── pr-creator.md               Step 8: CHANGELOG, PR description (5 required sections), push, PR
├── commands/   sdlc · requirements · design · plan · implement · review · verify · create-pr
├── skills/
│   ├── dto-generator/SKILL.md      DTOs / domain models + pure mappers with explicit missing-value defaults (JS or Java)
│   └── doc-quality-check/SKILL.md  10 checks for the ticket's Markdown deliverables (sections, AC traceability, facts, links, secrets)
├── hooks/
│   ├── guard-git.mjs               PreToolUse(Bash): blocks force push, push to master/main, secrets or node_modules in commits
│   └── test-on-edit.mjs            PostToolUse(Edit|Write): runs the related Jest tests and feeds failures back to Claude
├── CLAUDE.md                       Project instructions and SDLC rules
├── README.md                       This file
└── settings.local.json             Permissions (allow / ask / deny), hooks, enabled MCP servers
.mcp.json                           jira (mcp-atlassian via uvx) + github (hosted MCP)
```

## Usage

```text
/sdlc EPMCDMETST-68130                  # everything, stopping at each 🛑 gate
/requirements EPMCDMETST-68130 story.md # or step by step …
/design EPMCDMETST-68130
/plan EPMCDMETST-68130
/implement EPMCDMETST-68130 T1-T6
/review EPMCDMETST-68130
/verify EPMCDMETST-68130
/create-pr EPMCDMETST-68130
```

Each step writes a Markdown artifact under `docs/sdlc/<KEY>/` and reads the previous ones, so any step can be resumed after a failure.

### Human-in-the-loop gates

Subagents cannot ask the user questions, so the commands own every gate:

| Gate | What the human decides |
|------|------------------------|
| Step 1 | Answers to the clarifying questions (2–4 options each, with a recommended default) |
| Step 3 | Any review finding that changes requirements or scope, then approval of the design |
| Step 4 | Approval of the plan, or the task range to implement first |
| Step 8 | Confirmation before pushing and opening the PR |

## Setup

| Need | How |
|------|-----|
| Node.js ≥ 22 + `npm install` | Runs the hooks (`.mjs`) and the app's Jest tests |
| Jira MCP | Install `uv`, then set `JIRA_URL` (default `https://jiraeu.epam.com`) and `JIRA_PERSONAL_TOKEN` |
| GitHub MCP / CLI | Set `GITHUB_PERSONAL_ACCESS_TOKEN` for the MCP server, or install `gh` and run `gh auth login`. Without either, `pr-creator` returns a compare URL. |

Check the setup with `/mcp` (servers) and `/hooks` (hooks) inside Claude Code. Tokens live only in environment variables.

## Permissions (`settings.local.json`)

- **allow:** running Jest (`npm test`, `npx jest`), `npm audit`, read-only and branch/commit git commands, Jira reads.
- **ask:** `git push`, `gh pr create`, the GitHub MCP `create_pull_request`, Jira comments. Anything outward-facing needs confirmation.
- **deny:** force push, `git reset --hard`, reading `.env*` and `secrets/`.

## Worked example

`docs/sdlc/EPMCDMETST-68130/` contains a complete run of this kit for the story *Structured todos with stable IDs*:
requirements → architecture → design review → plan → implementation → code review → verification → PR.
