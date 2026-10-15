# Requirements — EPMCDMETST-68130: Structured todos with stable IDs

**Story:** As a user, I want todos stored as structured objects with stable IDs so that duplicate tasks and future metadata are handled reliably.
**Type:** Story · **Priority:** Average · **Labels:** ai-sdlc, frontend · **Scope ref:** G01
**Source:** [Jira EPMCDMETST-68130](https://jiraeu.epam.com/browse/EPMCDMETST-68130) · verbatim copy: [`user-story.md`](user-story.md)
**Repository:** `madhaweshrai/ToDoList-AI-SDLC` · **Branch:** `feature/EPMCDMETST-68130-structured-todos` (from `origin/master` @ 3a07a9d)

## 1. Problem

The story describes the original app, which kept todos in `localStorage` as plain strings. A todo had no identity, metadata
could not be added, and duplicate texts were deleted by text lookup.

## 2. Current state (from code, `origin/master`)

Since the story was written, EPMCDMETST-68567 (PR #2) moved todo persistence to an Express + SQLite REST API:

| Story expectation | Current code | Gap |
|-------------------|--------------|-----|
| Todo is an object | `{id, title, completed, priority, dueDate, createdAt, updatedAt}` from `/api/todos` | — |
| Stable unique **string** id, **client-generated** | `id INTEGER PRIMARY KEY AUTOINCREMENT`, assigned by the server (`db/schema.sql`) | **Yes** |
| `crypto.randomUUID()` with a fallback | Not used | **Yes** |
| Rendering uses the id | `li.dataset.id = String(todo.id)`. `findTodo` uses `Number(li.dataset.id)` (`JS/main.js`) | Must accept string ids |
| Delete/update by id, even when texts are duplicated | Yes (`tests/unit/frontend.test.js` "deletes by id, not by text") | — |
| One-time migration of legacy `localStorage` `["A","B"]` | **Missing.** Old todos are silently lost on upgrade. | **Yes** |
| API id validation | `parseId` accepts positive integers only (`backend/src/validation.js`) | Must validate UUIDs |
| List order | `ORDER BY id ASC` (insertion order through autoincrement) | Must not depend on a random id |

## 3. Clarifications agreed with the user (2026-10-14)

| # | Question | Decision |
|---|----------|----------|
| Q1 | Delivery direction, given that master already uses API + SQLite | **Client UUID end to end.** The browser generates `crypto.randomUUID()` (with a fallback) and sends it on create. The backend stores it as the stable string id. `data-id` and the API routes use it. Todos are **not** stored in `localStorage` (the API remains the source of truth). |
| Q2 | Legacy `localStorage` migration | **Import to the API, then clear.** Each legacy item is POSTed in order. The legacy key is removed only after every item succeeds. On a partial failure, the remaining items are kept for the next load. Blank or invalid entries are skipped and reported. |
| Q3 | Verifying the Gherkin ACs | **Jest + a `.feature` file.** The `.feature` file is living documentation, and Jest tests (jsdom frontend, supertest API, unit) are named after each scenario. No new dependencies. |
| Q4 | Branch/PR scope | **68130 only**, plus the SDLC kit adapted for it. The doc-sync work (EPMCDMETST-67795) stays on its own local branch and is excluded. |
| Q5 | Story field `text` vs the API field `title` *(derived; confirm at the design gate)* | Keep the existing API field **`title`**. The story's `text` maps to `title`. Renaming it would break the API and every client, and is not needed for the story's goal. |

## 4. Functional requirements

| ID | Requirement |
|----|-------------|
| FR-1 | **Todo domain model (frontend).** A browser module `JS/todo-model.js` (global `TodoModel`, loaded before `main.js`) defines the Todo shape `{ id: string, title: string, completed: boolean, priority, dueDate, createdAt: string, updatedAt }`. It owns id generation, id validation and the conversion of legacy entries. |
| FR-2 | **Client-generated stable id.** `TodoModel.newId()` returns a lowercase RFC 4122 **version 4 UUID**. It uses `crypto.randomUUID()` when available, otherwise a fallback built on `crypto.getRandomValues()`, and as a last resort a `Math.random()`-based generator. The fallback output must match the same v4 format. |
| FR-3 | **Create with a client id.** The frontend sends `id` in `POST /api/todos`. The API accepts an optional `id` (v4 UUID) and stores it unchanged. If `id` is omitted (non-browser clients), the server generates a v4 UUID itself. Responses always contain `id` as a string. |
| FR-4 | **Persistence.** In SQLite, `todos.id` is a `TEXT` primary key holding the UUID. A todo's id never changes after creation. |
| FR-5 | **Existing-database migration.** On startup, a database whose `todos.id` is still `INTEGER` is converted in a single transaction: each row gets a new v4 UUID, and every other column, including `created_at`, is preserved. The conversion runs once; later starts are no-ops. |
| FR-6 | **Stable ordering.** Lists are ordered by creation (`created_at`, then insertion order), so they keep the same order they had with integer ids. |
| FR-7 | **API by id.** `GET/PUT/DELETE /api/todos/:id` take the UUID string. Other routes and behaviours are unchanged. |
| FR-8 | **Rendering by id.** Each rendered todo `<li>` carries `data-id` equal to the stored id. Toggle, edit, save and delete resolve the todo by that **string** id, with no numeric coercion. |
| FR-9 | **Duplicate texts.** Two todos with the same title are independent. Deleting or updating one affects only the todo with the matching id. |
| FR-10 | **Legacy migration (frontend, once per load before the first list).** If `localStorage["todos"]` exists: <br>(a) Parse it. If it is an array, convert each entry to a Todo object: a **string** becomes `{ id: newId(), title: trimmed text, completed: false, createdAt: now }`. An **object** with `text` or `title` keeps a valid `id` if present (otherwise it gets a new one) and keeps a boolean `completed`. <br>(b) **Write the converted object array back** to `localStorage["todos"]` before importing, so the generated ids are stable across retries. <br>(c) POST each item in the original order, with its `id`, `title` and `completed`. <br>(d) After all items succeed, remove `localStorage["todos"]`. <br>(e) Show a dismissible notice: "Imported N task(s) from the previous version" (plus "; skipped M invalid entr(ies)" when M > 0). |
| FR-11 | **Migration retry is idempotent.** A `409 Conflict` for an id that already exists counts as "already imported". A retry after a partial failure therefore never creates duplicates. |
| FR-12 | **Existing behaviour is preserved:** add, empty-input message, edit, toggle, delete animation, filters, search, clear completed, themes, the clock, and HTML-safe rendering. The theme key `savedTheme` is untouched by the migration. |

## 5. Error handling requirements

| ID | Scenario | Expected behaviour |
|----|----------|--------------------|
| EH-1 | `POST` with an `id` that is not a v4 UUID (wrong format, upper case, non-string) | `400` `{ error: { message: 'Validation failed', details: [{ field: 'id', … }] } }`. Nothing is stored. |
| EH-2 | `POST` with an `id` that already exists | `409` `{ error: { message: 'Todo <id> already exists' } }`. The existing todo is unchanged. |
| EH-3 | `GET/PUT/DELETE /api/todos/:id` with a malformed id | `400` with field `id`. An unknown valid UUID returns `404`. |
| EH-4 | A legacy import POST fails (network, 5xx, or 400 other than an invalid entry) | Stop importing. Keep the not-yet-imported items in `localStorage["todos"]`. Show "Could not import N task(s) from the previous version; will retry next time." Then load the list normally. |
| EH-5 | The legacy key is corrupt (invalid JSON, not an array, or the array contains numbers, `null` or blank strings) | Invalid JSON or a non-array value leaves the key **untouched** and the app loads normally. Invalid array entries are skipped and counted (FR-10e). Nothing throws. |
| EH-6 | `localStorage` is unavailable (access throws) | Migration is skipped silently and the app works. |
| EH-7 | `crypto.randomUUID` is unavailable (non-secure context, older browser) | The fallback generator is used (FR-2). |
| EH-8 | The startup DB conversion fails | The transaction is rolled back, the server exits with a clear error, and the database is unchanged. |
| EH-9 | The legacy entry's title is longer than 200 characters after trimming | Skipped and counted as invalid (the API would reject it). |

## 6. Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | **Security.** Ids are validated with a strict anchored regex on the server (`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`). They are bound as SQL parameters and URL-encoded in client requests. Legacy titles are rendered with `textContent` only. No secrets are introduced or logged. |
| NFR-2 | **Uniqueness.** The ids generated in tests (including 10 000 fallback ids) contain no duplicates, and all match the v4 regex. |
| NFR-3 | **Compatibility.** Works without `crypto.randomUUID` and without `localStorage`. There is no change to the public API apart from the id type and the optional `id` on create. |
| NFR-4 | **Dependencies.** No new runtime or dev dependencies. `npm audit` must report no high or critical vulnerabilities in the existing dependencies, or any that it reports are listed under Known Limitations. |
| NFR-5 | **Testability.** All existing tests pass (updated only where they asserted integer ids). The new and changed code (`JS/todo-model.js`, the migration in `JS/main.js`, the id validation, the schema migration) has ≥ 90 % line coverage in `jest --coverage`. |
| NFR-6 | **Performance.** A migration of 200 legacy items completes without blocking the UI. Requests are sequential, because order must be preserved. |

## 7. Acceptance criteria

The Gherkin scenarios from the story are adapted to the agreed architecture (Q1). The adaptation is marked in *italics*.

| ID | Given / When / Then | Covers |
|----|---------------------|--------|
| AC-1 | **Happy path.** Given the user opens the app, when they add "Buy milk", then *the POST body and the persisted todo* contain a non-empty v4 UUID `id` and `title` = "Buy milk", and the rendered `<li>` has the **same** `data-id`. | FR-1–4, FR-8 |
| AC-2 | **Duplicates.** Given two saved todos titled "Call mom", when the user deletes the second one, then only the todo with the matching id is removed *from the store (API)*, and the other "Call mom" remains visible. | FR-8, FR-9 |
| AC-3 | **Legacy migration.** Given `localStorage["todos"] = ["A","B"]`, when the user opens the app, then the items are converted to objects with ids, *imported via the API with those ids*, the legacy key is removed, and both "A" and "B" are rendered with `data-id`s equal to their ids. | FR-10 |
| AC-4 | Given `crypto.randomUUID` is undefined, when ids are generated, then they match the v4 regex and are unique. | FR-2, EH-7, NFR-2 |
| AC-5 | The API returns `400` for a malformed id on create, get, update and delete, `409` for a duplicate id on create, and `201` with the client's id for a valid new id. | FR-3, FR-7, EH-1–3 |
| AC-6 | Given a database with integer ids, when the server starts, then every row has a UUID id, all other fields are unchanged, the order is preserved, and a second start changes nothing. | FR-5, FR-6, EH-8 |
| AC-7 | Given the 2nd of 3 legacy imports fails, then items 2–3 remain in `localStorage` and a retry notice is shown. On the next load the import completes with no duplicates (the 409 is treated as already imported). | FR-11, EH-4 |
| AC-8 | Given corrupt legacy data (`"{oops"`, `{}`, `[1, null, "", "ok"]`), the app loads without throwing. Valid entries are imported, invalid ones are counted, and corrupt non-arrays are left untouched. | EH-5, EH-9 |
| AC-9 | All pre-existing behaviours (FR-12) still pass in the regression suite. | FR-12 |

## 8. Out of scope

- Offline or `localStorage`-first persistence of todos (Q1). The API remains the source of truth.
- Renaming the `title` field to `text` (Q5).
- Server-side acceptance of a client-supplied `createdAt` (the server stays authoritative for timestamps).
- User accounts or multi-device sync.
- The doc-sync tool and workflow from EPMCDMETST-67795 (Q4).
