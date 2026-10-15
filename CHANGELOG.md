# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres loosely to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **EPMCDMETST-68130:** Todos now have a stable, client-supplied `id` (a lowercase v4 UUID). The browser generates the id with
  `crypto.randomUUID()` (with a fallback for environments without it) and sends it on create; the server accepts an optional
  client-supplied id or generates one itself, validates it strictly, and uses it as the primary key end to end.
- **EPMCDMETST-68130:** One-time import of legacy `localStorage["todos"]` string-array todos into the API on first load after
  upgrade. Each legacy item is POSTed in order with a generated id; the legacy key is removed only after every item is
  imported successfully. On a partial failure, the remaining items stay in `localStorage` and are retried on the next load
  (duplicates are avoided because a re-POST of an already-imported id returns 409, which is treated as already imported).
- **EPMCDMETST-68130:** The one-time import of legacy todos is guarded by the Web Locks API (`navigator.locks`) where
  available, so concurrent tabs cannot double-import the same legacy list. Browsers without Web Locks run the import
  unguarded (accepted residual risk, see Known Limitations in `docs/sdlc/EPMCDMETST-68130/pr-description.md`).

### Changed

- **EPMCDMETST-68130:** Backend todo ids switched from auto-increment integers to client-supplied/server-generated UUID
  strings (`TEXT PRIMARY KEY` with a strict format check). `GET`/`PUT`/`DELETE /api/todos/:id` and todo list rendering use
  the UUID id instead of a numeric index.

### Migration notes

- **EPMCDMETST-68130:** Existing SQLite databases with integer-id todos are migrated to UUID ids automatically and
  idempotently on server startup, inside a single transaction, preserving each todo's `title`, `completed`, `priority` and
  creation order.
  - This migration is **one-way**: there is no automated downgrade path back to integer ids.
  - Before migrating, the server writes a verified backup of the database file to `<database-file>.pre-68130.bak`. To roll
    back, stop the server and restore this backup file in place of the live database file.
  - Once a database has been migrated (or created fresh with the UUID schema), the server detects this on subsequent
    restarts and does not re-run the migration or re-write the backup.
