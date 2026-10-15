---
description: SDLC Step 1 - read a user story (Jira/Confluence/Word/file), clarify with the user, write and commit docs/sdlc/<KEY>/requirements.md
argument-hint: <JIRA-KEY> [path to story file]
---

Arguments: $ARGUMENTS. The first word is the ticket key. An optional second argument is a story file.

1. Use the **requirements-gathering** subagent to read the story and the code, and to return its clarifying questions.
2. 🛑 Ask the user those questions with AskUserQuestion (2–4 options each, recommended option first). Wait for the answers.
3. Re-run the **requirements-gathering** subagent with the answers to write `docs/sdlc/<KEY>/requirements.md`.
4. Show the FR/EH/NFR/AC counts, then commit `docs/sdlc/<KEY>/user-story.md` and `requirements.md` with the message `<KEY>: add requirements for <title>`.
5. Suggest `/design <KEY>` as the next step.
