/**
 * One-time import of the pre-68130 localStorage["todos"] list into the API (FR-10, FR-11, FR-14, EH-4..EH-6).
 * Storage, API, model and Web Locks are injected; this module owns no DOM. Exposes the global `LegacyImport`
 * and, under Node, `module.exports`.
 */
(function (global) {
  const KEY = 'todos';
  const LOCK_NAME = 'todos-legacy-import';
  // A 400 naming only these fields means the server rejected this entry's own data (AD-5).
  const ENTRY_FIELDS = ['title', 'completed'];

  /**
   * @typedef {{ status: 'absent' }
   *   | { status: 'complete', imported: number, skipped: number }
   *   | { status: 'partial', imported: number, skipped: number, remaining: object[] }} LegacyImportResult
   */

  const absent = () => ({ status: 'absent' });

  function isEntryRejection(err) {
    return (
      Boolean(err) &&
      err.status === 400 &&
      Array.isArray(err.details) &&
      err.details.length > 0 &&
      err.details.every((detail) => Boolean(detail) && ENTRY_FIELDS.includes(detail.field))
    );
  }

  /** Result notice text, or null when there is nothing to tell the user. */
  function message(result) {
    if (!result || typeof result !== 'object') return null;
    if (result.status === 'complete') {
      if (result.imported + result.skipped === 0) return null;
      const skippedText = result.skipped > 0 ? `; skipped ${result.skipped} invalid entr(ies)` : '';
      return `Imported ${result.imported} task(s) from the previous version${skippedText}`;
    }
    if (result.status === 'partial' && Array.isArray(result.remaining)) {
      return `Could not import ${result.remaining.length} task(s) from the previous version; will retry next time.`;
    }
    return null;
  }

  function progressMessage(count) {
    return `Importing ${count} task(s) from the previous version…`;
  }

  function quietly(action) {
    try {
      action();
    } catch (error) {
      // Best effort: storage writes and UI callbacks must never break the import or the page load.
    }
  }

  function readLegacyList(storage) {
    if (!storage) return null;
    let raw;
    try {
      raw = storage.getItem(KEY);
    } catch (error) {
      return null; // EH-6
    }
    if (raw === null || raw === undefined) return null;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null; // EH-5: anything else stays untouched
    } catch (error) {
      return null;
    }
  }

  /** @returns {Promise<LegacyImportResult>} */
  async function importSteps({ storage, api, model, now, onStart }) {
    const list = readLegacyList(storage);
    if (list === null) return absent();

    const { todos, skipped: invalidEntries } = model.convertLegacy(list, now);
    try {
      // Persist the generated ids first so a retry re-sends the same ids and gets 409s, not duplicates.
      storage.setItem(KEY, JSON.stringify(todos));
    } catch (error) {
      return absent();
    }

    if (todos.length > 0) quietly(() => onStart(todos.length));

    let imported = 0;
    let skipped = invalidEntries;
    for (let i = 0; i < todos.length; i += 1) {
      const { id, title, completed } = todos[i];
      try {
        await api.create({ id, title, completed });
        imported += 1;
      } catch (err) {
        if (err && err.status === 409) {
          imported += 1; // FR-11: already imported by an earlier attempt
        } else if (isEntryRejection(err)) {
          skipped += 1;
        } else {
          const remaining = todos.slice(i);
          quietly(() => storage.setItem(KEY, JSON.stringify(remaining)));
          return { status: 'partial', imported, skipped, remaining };
        }
      }
    }

    quietly(() => storage.removeItem(KEY));
    return { status: 'complete', imported, skipped };
  }

  /** Never rejects, so a rejection from locks.request always means the lock was not granted. */
  async function importUnlocked(args) {
    try {
      return await importSteps(args);
    } catch (error) {
      return absent();
    }
  }

  /** @returns {Promise<LegacyImportResult>} */
  async function run({ storage, api, model, locks, now = new Date().toISOString(), onStart = () => {} } = {}) {
    const args = { storage, api, model, now, onStart };
    if (!locks || typeof locks.request !== 'function') return importUnlocked(args);

    let granted = false;
    try {
      return await locks.request(LOCK_NAME, () => {
        granted = true;
        return importUnlocked(args);
      });
    } catch (error) {
      // Lock unavailable (e.g. SecurityError in an opaque origin): run unguarded (R7). Never run twice.
      return granted ? absent() : importUnlocked(args);
    }
  }

  const LegacyImport = { KEY, LOCK_NAME, run, isEntryRejection, message, progressMessage };
  global.LegacyImport = LegacyImport;
  if (typeof module !== 'undefined' && module.exports) module.exports = LegacyImport;
})(typeof window !== 'undefined' ? window : globalThis);
