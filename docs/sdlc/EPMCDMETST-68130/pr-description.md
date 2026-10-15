## Summary

Todos now have a stable identity: the browser generates a client-side v4 UUID (`crypto.randomUUID()`, with a fallback) for
every new todo and sends it to the API, which validates, stores and returns it as the primary key end to end, replacing the
previous auto-increment integer id. Existing SQLite databases are migrated to UUID ids automatically on startup (with a
verified backup), and legacy `localStorage["todos"]` string-array todos from the pre-API version of the app are imported
into the API once, on first load, guarded against concurrent tabs by the Web Locks API where available.

## Changes Made

### Frontend (`JS/`, `CSS/`, `index.html`)
- `JS/todo-model.js`: added — id generation/validation (`newId`, v4 format), legacy-object normalization, shared with the
  backend's validation rules to keep the two in parity.
- `JS/legacy-import.js`: added — reads `localStorage["todos"]`, POSTs each legacy item to the API in order, removes the
  legacy key only once every item is imported, and guards the whole run with `navigator.locks` when available.
- `JS/main.js`: modified — switched todo lookups/rendering from numeric index to string `id`; wires in `todo-model.js` and
  `legacy-import.js` on startup; shows/hides the "Checking for tasks from the previous version…" notice based on a
  read-only peek at the legacy key (code-review finding R-1 fix).
- `JS/api.js`: modified — `encodeURIComponent` on id-bearing paths; classifies HTTP errors with `status`/`details` so the
  caller can tell a 409 (already imported) from other failures.
- `CSS/main.css`: modified — styling for the legacy-import "checking"/"retry" notice.
- `index.html`: modified — loads `JS/todo-model.js` before `JS/main.js`; adds the import-notice container
  (`role="status"`).

### Backend (`backend/`)
- `backend/src/validation.js`: modified — strict anchored v4 UUID regex for `id`; accepts an optional client-supplied `id`
  on create, otherwise generates one server-side.
- `backend/src/repositories/todoRepository.js`: modified — primary key lookups/writes keyed on the UUID string id; maps
  `SQLITE_CONSTRAINT_PRIMARYKEY` to a 409 (duplicate id), leaving other constraint errors as 500.
- `backend/src/services/todoService.js`: modified — passes the client-supplied or generated id through to the repository.
- `backend/src/errors.js`: modified — new error classification used by the 409/400 paths above.
- `backend/src/db.js`: modified — runs the id migration (below) during database open/startup.
- `backend/src/dbMigrations.js`: added — detects a legacy integer-id schema, writes a verified `.pre-68130.bak` backup,
  then migrates all rows to UUID ids inside a single transaction, preserving `title`/`completed`/`priority` and creation
  order. Idempotent: a database already on the UUID schema is a no-op on every subsequent start.
  Removed/replaced by the UUID schema.
- `backend/server.js`: modified — wires the migration into server startup and exits 1 with a clear message on a backup or
  migration failure, instead of starting against an inconsistent database.

### Database (`db/`)
- `db/schema.sql`: modified — `todos.id` is now `TEXT PRIMARY KEY` (UUID) instead of an auto-increment integer, with a
  format `CHECK` constraint.
- `db/init.js`: modified — seeds/creates the database using the new UUID schema.
- `db/seed.sql`: modified — seed data updated to use UUID ids.

### Tests (`tests/`)
- `tests/unit/todo-model.test.js`: added — id generation/format/uniqueness (incl. 10,000-id fallback-path check), legacy
  object normalization.
- `tests/unit/legacy-import.test.js`: added — full import flow: success, partial failure/retry, corrupt/missing storage,
  Web Locks guard (present, absent, rejected), sequential-import performance (NFR-6).
- `tests/unit/db-migration.test.js`: added — backup creation/verification, migration transaction, idempotency on restart,
  backup-failure and concurrent-migration error paths.
- `tests/fixtures/schema-integer-ids.sql`: added — legacy integer-id schema fixture used by the migration tests and the
  manual smoke test.
- `tests/unit/frontend.test.js`, `tests/unit/repository.test.js`, `tests/unit/service.test.js`, `tests/unit/validation.test.js`,
  `tests/api/todos.test.js`: modified — updated for string ids throughout; added cases for the new validation, 409
  duplicate-id handling, and the AC-9 regression suite naming (code-review finding R-2 fix).

### Build/tooling
- `package.json`: modified — Jest `coverageThreshold` gate for the four id/migration/import modules (NFR-5).
- `scripts/build.sh`, `scripts/build.ps1`: modified — run the coverage-gated test command as part of the build.

### Documentation
- `README.md`: modified — documents the UUID id model and the legacy-import behaviour for app users.
- `docs/sdlc/EPMCDMETST-68130/user-story.md`, `requirements.md`, `todo-ids.feature`, `architecture.md`,
  `design-review.md`, `impl-plan.md`, `code-review.md`, `verification-report.md`: added — full SDLC trail for this
  ticket (requirements, design, implementation plan, code review with fixes applied, verification report).
- `CHANGELOG.md`: added — `[Unreleased]` entry for this ticket.
- `docs/sdlc/EPMCDMETST-68130/pr-description.md`: added — this document.

### Agentic SDLC kit (out of scope for this ticket's review, added as tooling)
- `.claude/CLAUDE.md`, `.claude/README.md`, `.claude/agents/*.md`, `.claude/commands/*.md`, `.claude/hooks/*.mjs`,
  `.claude/settings.local.json`, `.claude/skills/*/SKILL.md`: added — the Claude Code agent/command/hook/skill
  definitions used to run this ticket's SDLC steps. Not application code; not covered by the code review or test suite.
- `.mcp.json`: added — MCP server configuration for the kit (Jira integration). Contains no hard-coded secrets (uses
  `${…}` environment variable placeholders); see Known Limitations for O-2.

## Test Evidence

From `docs/sdlc/EPMCDMETST-68130/verification-report.md` (Result: **PASS**):

- `npm test`: **306 passed / 0 failed / 0 skipped**, 8 suites, 5.0 s.
- `npm run test:coverage`: **306 passed / 0 failed**; coverage threshold met on all 4 NFR-5-gated modules (90 % lines
  required): `JS/todo-model.js` 100 %, `JS/legacy-import.js` 100 %, `backend/src/dbMigrations.js` 100 %,
  `backend/src/validation.js` 100 %. Overall: 99.76 % statements / 96.4 % branches / 100 % functions / 100 % lines.
- Live end-to-end smoke test against a real server on a temp SQLite DB: all 7 checks passed (client-UUID create, duplicate
  id → 409, malformed id → 400, list order preserved, delete → 204, legacy integer-id DB migrated with a verified backup
  on first start, and a second start is a confirmed no-op).
- `npm audit`: in-repo run fails with `ENOLOCK` (no `package-lock.json` committed — see Known Limitations, O-1). A
  temp-lockfile audit against the same `package.json` reported **0 critical, 0 high, 19 moderate** (all transitive,
  dev-only, in the Jest chain); `npm audit --omit=dev` reports 0.

Raw tail of `npm test`:
```
Test Suites: 8 passed, 8 total
Tests:       306 passed, 306 total
Snapshots:   0 total
Time:        5.029 s
Ran all test suites.
```

Raw tail of `npm run test:coverage`:
```
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   99.76 |     96.4 |     100 |     100 |
-------------------|---------|----------|---------|---------|-------------------

Test Suites: 8 passed, 8 total
Tests:       306 passed, 306 total
Snapshots:   0 total
Time:        6.222 s
Ran all test suites.
```

## Known Limitations

- **`package-lock.json` is not committed** (pre-existing on `master`, not introduced by this branch). In-repo
  `npm audit` fails with `ENOLOCK`; a temp-lockfile audit shows 0 high/critical and 19 moderate issues, all in the
  transitive, dev-only Jest dependency chain. Tracked as `O-1` in `code-review.md`; a follow-up ticket to commit a
  lockfile is recommended.
- **`.mcp.json`'s `mcp-atlassian` is not version-pinned**, and `READ_ONLY_MODE` defaults to `false` (Jira writes
  allowed by default). Out of scope for this ticket's diff. Tracked as `O-2` in `code-review.md`.
- **Web Locks fallback residual risk**: the legacy-import guard uses `navigator.locks` where available. Browsers
  without Web Locks (very old browsers, or `request()` rejected in opaque origins) run the import unguarded; if two
  such tabs read the original legacy array at the same moment, each could import a duplicate set of items. This is
  an accepted residual risk (`architecture.md` AD-4/R7) given that Web Locks are available in all current evergreen
  browsers and the window requires both an old browser and a simultaneous multi-tab restore.
- **The id-migration is one-way.** Existing integer-id SQLite databases are migrated to UUID ids automatically and
  idempotently on startup. There is no automated downgrade: rollback means stopping the server and restoring the
  verified backup written to `<database-file>.pre-68130.bak` before the migration ran.
- **Story acceptance criteria were adapted to API persistence instead of `localStorage`-first persistence** (requirements
  decision Q1): todos are not stored in `localStorage` going forward; the API/SQLite remains the single source of truth,
  and `localStorage["todos"]` is only read once, to import legacy data.
- **The API field stays `title`, not `text`** (requirements decision Q5): the story's `text` field is intentionally
  mapped to the existing `title` field rather than renaming it, to avoid a breaking API change with no corresponding
  benefit.
- **No CI workflow exists on this branch** (`.github/` contains only `ISSUE_TEMPLATE/`). Tests, coverage and audit were
  run and verified manually/locally as recorded in `verification-report.md`; there is no automated CI gate yet.
- Code-review findings R-1 (import-notice flashing on every load) and R-2 (missing `AC-9`-named test) were both
  resolved before this PR — see `code-review.md` → "Re-review (fixes applied)".

## Reviewer Checklist
- [ ] Requirements (requirements.md) satisfied: FR/EH/AC traceability reviewed
- [ ] Design decisions (design-review.md) respected
- [ ] Tests pass locally / in CI, and coverage meets the threshold
- [ ] No secrets in code, logs or generated output
- [ ] Error paths (API failure, missing files, empty repo) behave as specified
- [ ] CHANGELOG entry is accurate
- [ ] Generated documentation reviewed for content quality

**Jira:** [EPMCDMETST-68130](https://jiraeu.epam.com/browse/EPMCDMETST-68130) · **SDLC artifacts:** `docs/sdlc/EPMCDMETST-68130/`
