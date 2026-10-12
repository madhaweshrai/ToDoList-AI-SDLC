# ToDoList Modernisation — Implementation Plan

## Epic
- **Epic:** EPMCDMETST-67232 — *ToDoList Modernisation - AI-driven SDLC*

> Note: At time of writing, Jira shows **no Stories linked to the Epic** (no issues returned for `"Epic Link" = EPMCDMETST-67232`).  
> The user referenced Story **EPMCDMETST-68567**, but it is **not currently linked** to the Epic per Jira search results. This plan proceeds using the key(s) provided by the user and should be updated once tickets are correctly linked.

---

## Objective
Modernise the ToDoList application by implementing **G01: persist todo completion state across reloads** using a stable data model and persistence mechanism, improving reliability and laying a foundation for future enhancements (IDs, metadata, backend API, testing).

---

## Scope

### In scope (this increment)
- Implement **persistent completion state** for todos (G01).
- Introduce/confirm a **structured Todo model** that includes `completed` (and ideally `id` to support future work safely).
- Refactor UI logic to render completion state correctly on load.
- Add automated tests covering persistence behavior.
- Add minimal build/run documentation and scripts needed to execute and test reliably.

### Out of scope (explicitly not delivered in this increment)
- User accounts, authentication/authorization.
- Cross-device sync or cloud hosting (unless persistence is implemented via a backend as part of the agreed approach).
- Advanced features: due dates, priorities, tagging, recurring tasks, reminders, search/filter UI.
- Full design overhaul or frontend framework migration (React/Vue/etc.).
- Non-functional hardening beyond baseline (e.g., full OWASP review).

---

## Target Architecture (end-state direction)
Two viable implementation approaches exist; the ticket should confirm which is intended.

### Option A (minimal): Enhanced local persistence (LocalStorage)
- **Frontend:** vanilla JS renders Todo list from LocalStorage.
- **Storage:** LocalStorage stores an array of objects (not strings):
  ```json
  [{ "id": "uuid", "title": "Buy milk", "completed": true, "createdAt": "..." }]
  ```
- **Pros:** simplest, no backend required.
- **Cons:** still single-device; harder to evolve to shared state later.

### Option B (recommended for modernisation): Backend API + DB persistence
- **Frontend:** static assets served by Node/Express (or separate static hosting).
- **API:** REST endpoints `/api/todos`.
- **DB:** SQLite (or other) persists `completed` state and future fields.
- **Pros:** scalable to multi-device and future features; testable API.
- **Cons:** more setup.

**Decision checkpoint:** M1 includes a lightweight architecture decision (AD) to select Option A vs B, aligned to the Epic’s "modernisation" intent.

---

## Milestones (M1–M4)

> Estimates are in **story points (SP)** until team converts to hours/days. Owners are placeholders; replace with named individuals.

| Milestone | Goal | Jira Keys | Estimate (SP) | Owner |
|---|---|---:|---:|---|
| **M1** | Confirm scope + architecture decision; agree data model and persistence approach | EPMCDMETST-68567 | 2 | Delivery Lead + Dev |
| **M2** | Implement persistent `completed` state end-to-end (storage + render + toggle) | EPMCDMETST-68567 | 5 | Dev |
| **M3** | Automated tests + regression coverage for persistence and rendering | EPMCDMETST-68567 | 3 | Dev + QA |
| **M4** | Stabilisation: docs, CI-ready scripts, acceptance demo, DoD verification | EPMCDMETST-68567 | 2 | Dev + Delivery Lead |

> If additional Jira keys are created later (e.g., split into separate Stories/Tasks), update the table to list each key under the appropriate milestone.

---

## Implementation Approach (high level)

### Data model
Minimum fields to support G01 safely:
- `id: string` (UUID or incremental) — strongly recommended to avoid duplicate-title issues later
- `title: string`
- `completed: boolean`
- `createdAt: string (ISO)` (optional but helpful)

### Frontend changes (both options)
- Update todo creation to create object instead of string.
- On toggle complete:
  - update object `completed` and persist entire list.
  - update DOM to reflect state.
- On load:
  - render list and apply completed styling based on persisted flag.

### Persistence details
- **Option A:** store JSON array of objects in LocalStorage under a single key, e.g. `todos`.
- **Option B:** store in DB; LocalStorage only for theme preference.

---

## Dependencies
- Access to Jira project EPMCDMETST and ability to update/link issues to Epic **EPMCDMETST-67232**.
- Agreement on persistence approach (LocalStorage vs API/DB).
- Node tooling availability if tests/CI scripts are introduced (recommended even for static apps).

---

## Risks & Mitigations
| Risk | Impact | Likelihood | Mitigation |
|---|---|---:|---|
| Ticket not linked to Epic / unclear scope ownership | Plan tracking and reporting becomes inconsistent | Medium | Ensure **EPMCDMETST-68567** is linked to **EPMCDMETST-67232**; add clear acceptance criteria in Jira |
| Data migration from old LocalStorage format (string array) breaks existing users’ data | Users lose todos or see errors | Medium | Implement **backward-compatible migration**: detect array of strings and convert to objects with `completed:false` |
| Duplicate todo titles cause incorrect updates/deletes | Data corruption | Medium | Introduce and use `id` per todo even if not explicitly required for G01 |
| Inconsistent UI state after refresh | Poor UX | Medium | Single render function from source-of-truth state; avoid DOM-only toggles |
| Lack of tests leads to regressions | Rework | Medium | Add unit tests for storage migration + toggle persistence; add e2e smoke test |

---

## Test Strategy

### Unit tests (recommended)
- Storage read/write:
  - saves todo with `completed=true/false`.
  - loads and renders `completed=true` as checked/line-through.
- Migration:
  - when LocalStorage has `["a","b"]`, converts to `[{id,title,completed:false},...]`.
- Toggle behavior:
  - toggling updates storage value, not only DOM.

### Integration / e2e tests
- Add todo -> refresh -> todo still present.
- Mark complete -> refresh -> still complete.
- Theme preference remains unchanged (regression).

### Manual testing checklist
- Create 3 todos; complete one; refresh; completion persists.
- Existing LocalStorage from previous version migrates cleanly.
- Works on latest Chrome/Edge/Firefox.

---

## Build & Deployment

### Local development
- If kept static: open `index.html` (or serve with a simple static server).
- If Node introduced for tooling:
  - `npm install`
  - `npm test`
  - `npm run start` (if a dev server is added)

### CI readiness (minimal)
- Provide deterministic commands:
  - `npm ci`
  - `npm test`
- Ensure tests do not rely on network.

### Deployment
- Static hosting remains acceptable for Option A.
- If Option B: deploy Node service with environment-based config; DB file persisted via volume.

---

## HITL (Human-in-the-loop) Checkpoints
1. **HITL-1 (M1):** Confirm persistence approach (Option A vs B), acceptance criteria, and migration expectations.
2. **HITL-2 (M2):** Demo persistent completion state after refresh; confirm UI behavior meets expectations.
3. **HITL-3 (M3):** Review automated test coverage and agree on minimum test set.
4. **HITL-4 (M4):** Final acceptance review against DoD; confirm Jira updated/closed and Story linked to Epic.

---

## Definition of Done (DoD)
- `completed` state persists after browser refresh and is correctly rendered.
- Backward compatibility: existing LocalStorage format (if present) is migrated without data loss.
- Code follows agreed conventions (see below).
- Automated tests added and passing locally.
- Documentation updated (how to run, test).
- Jira Story has:
  - clear acceptance criteria,
  - implementation notes,
  - linked to Epic EPMCDMETST-67232,
  - moved to Done/Closed per workflow.

---

## Branching & Commit Conventions
- **Branch naming:** `feature/<JIRA-KEY>-<slug>`
  - Example: `feature/EPMCDMETST-68567-persist-completed-state`
- **Commit message convention:** `<JIRA-KEY>: <message>`
  - Example: `EPMCDMETST-68567: persist completed state in storage model`

---

## Appendix: Acceptance Criteria (proposed for EPMCDMETST-68567)
1. When a user marks a todo as completed and reloads the page, the todo remains completed.
2. Completion state is persisted in storage (not DOM-only).
3. Existing stored todos from prior versions (string array) still load; they are migrated to the new structure.
4. Automated test coverage exists for persistence + migration behavior.
