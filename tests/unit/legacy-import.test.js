const LegacyImport = require('../../JS/legacy-import.js');
const TodoModel = require('../../JS/todo-model.js');

const { KEY, LOCK_NAME, run, isEntryRejection, message, progressMessage } = LegacyImport;
const NOW = '2030-01-01T00:00:00.000Z';

function createStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    data,
    log: [],
    getItem: jest.fn((key) => (data.has(key) ? data.get(key) : null)),
    setItem: jest.fn((key, value) => {
      storage.log.push(['set', key, value]);
      data.set(key, String(value));
    }),
    removeItem: jest.fn((key) => {
      storage.log.push(['remove', key]);
      data.delete(key);
    }),
  };
  return storage;
}

const httpError = (status, details) => Object.assign(new Error(`HTTP ${status}`), { status, details });
const networkError = () => new Error('Could not reach the server. Please try again.');

/** Fake TodoApi backed by a shared store; `fail(body, index)` may return an Error to reject with. */
function createApi({ store = new Map(), fail = () => null, log = [] } = {}) {
  let index = 0;
  const api = {
    store,
    bodies: [],
    create: jest.fn(async (body) => {
      api.bodies.push(body);
      log.push(['post', body.id]);
      const failure = fail(body, index++);
      if (failure) throw failure;
      if (store.has(body.id)) throw httpError(409);
      store.set(body.id, body);
      return body;
    }),
  };
  return api;
}

const legacy = (value) => createStorage({ [KEY]: typeof value === 'string' ? value : JSON.stringify(value) });
const stored = (storage) => JSON.parse(storage.data.get(KEY));
const runWith = (overrides) => run({ model: TodoModel, now: NOW, ...overrides });

describe('message and progressMessage (FR-10e)', () => {
  it.each([
    [{ status: 'absent' }, null],
    [{ status: 'complete', imported: 0, skipped: 0 }, null],
    [{ status: 'complete', imported: 2, skipped: 0 }, 'Imported 2 task(s) from the previous version'],
    [{ status: 'complete', imported: 1, skipped: 3 }, 'Imported 1 task(s) from the previous version; skipped 3 invalid entr(ies)'],
    [{ status: 'complete', imported: 0, skipped: 2 }, 'Imported 0 task(s) from the previous version; skipped 2 invalid entr(ies)'],
    [
      { status: 'partial', imported: 1, skipped: 0, remaining: [{}, {}] },
      'Could not import 2 task(s) from the previous version; will retry next time.',
    ],
    [null, null],
    [undefined, null],
    [{}, null],
    ['complete', null],
    [{ status: 'partial', remaining: 'x' }, null],
  ])('%p -> %p', (result, expected) => {
    expect(message(result)).toBe(expected);
  });

  it('builds the progress text', () => {
    expect(progressMessage(3)).toBe('Importing 3 task(s) from the previous version…');
  });
});

describe('isEntryRejection (AD-5)', () => {
  it.each([
    [httpError(400, [{ field: 'title' }]), true],
    [httpError(400, [{ field: 'title' }, { field: 'completed' }]), true],
    [httpError(400), false],
    [httpError(400, []), false],
    [httpError(400, [{ field: 'id' }]), false],
    [httpError(400, [{ field: 'title' }, { field: 'body' }]), false],
    [httpError(400, [null]), false],
    [httpError(422, [{ field: 'title' }]), false],
    [networkError(), false],
    [null, false],
  ])('%p -> %p', (err, expected) => {
    expect(isEntryRejection(err)).toBe(expected);
  });
});

describe('LegacyImport.run', () => {
  it('AC-3: writes ids back before the first POST, imports in order and removes the key', async () => {
    const storage = legacy(['A', 'B']);
    const order = [];
    storage.setItem.mockImplementation((key, value) => {
      order.push('write-back');
      storage.data.set(key, value);
    });
    const api = createApi({ log: order });
    const onStart = jest.fn((n) => order.push(`start ${n}`));

    const result = await runWith({ storage, api, onStart });

    expect(result).toEqual({ status: 'complete', imported: 2, skipped: 0 });
    expect(order.map((entry) => (Array.isArray(entry) ? entry[0] : entry))).toEqual([
      'write-back',
      'start 2',
      'post',
      'post',
    ]);
    const writtenBack = JSON.parse(storage.setItem.mock.calls[0][1]);
    expect(api.bodies).toEqual(writtenBack.map(({ id, title, completed }) => ({ id, title, completed })));
    expect(api.bodies.map((b) => b.title)).toEqual(['A', 'B']);
    api.bodies.forEach((b) => expect(b.id).toMatch(TodoModel.UUID_V4_RE));
    expect(storage.data.has(KEY)).toBe(false);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(message(result)).toBe('Imported 2 task(s) from the previous version');
    expect(progressMessage(2)).toBe('Importing 2 task(s) from the previous version…');
  });

  it('AC-7: stops on a network error, keeps the rest, and a retry completes without duplicates', async () => {
    const storage = legacy(['A', 'B', 'C']);
    const store = new Map();
    // The 2nd POST is committed but its response is lost, so the retry gets a 409 for it.
    let lostOnce = true;
    const flaky = createApi({ store });
    flaky.create.mockImplementation(async (body) => {
      flaky.bodies.push(body);
      if (body.title === 'B' && lostOnce) {
        lostOnce = false;
        store.set(body.id, body);
        throw networkError();
      }
      if (store.has(body.id)) throw httpError(409);
      store.set(body.id, body);
      return body;
    });

    const first = await runWith({ storage, api: flaky });
    expect(first.status).toBe('partial');
    expect(first.imported).toBe(1);
    expect(first.remaining.map((t) => t.title)).toEqual(['B', 'C']);
    expect(stored(storage)).toEqual(first.remaining);
    expect(message(first)).toBe('Could not import 2 task(s) from the previous version; will retry next time.');

    const second = await runWith({ storage, api: flaky });
    expect(second).toEqual({ status: 'complete', imported: 2, skipped: 0 });
    expect(storage.data.has(KEY)).toBe(false);
    expect([...store.values()].map((t) => t.title)).toEqual(['A', 'B', 'C']);
  });

  describe('EH-4: failure classification', () => {
    it('skips a 400 that names only entry fields and continues', async () => {
      const storage = legacy(['A', 'B']);
      const api = createApi({ fail: (body) => (body.title === 'A' ? httpError(400, [{ field: 'title' }]) : null) });
      const result = await runWith({ storage, api });
      expect(result).toEqual({ status: 'complete', imported: 1, skipped: 1 });
      expect(storage.data.has(KEY)).toBe(false);
    });

    it.each([
      ['no details', undefined],
      ['an id detail', [{ field: 'id' }]],
      ['mixed title and body details', [{ field: 'title' }, { field: 'body' }]],
    ])('stops on a 400 with %s and keeps the remaining items', async (_name, details) => {
      const storage = legacy(['A', 'B']);
      const api = createApi({ fail: (_body, i) => (i === 0 ? httpError(400, details) : null) });
      const result = await runWith({ storage, api });
      expect(result.status).toBe('partial');
      expect(result.remaining.map((t) => t.title)).toEqual(['A', 'B']);
      expect(api.create).toHaveBeenCalledTimes(1);
      expect(stored(storage).map((t) => t.title)).toEqual(['A', 'B']);
    });

    it.each([500, 404, 413])('stops on HTTP %p', async (status) => {
      const storage = legacy(['A']);
      const result = await runWith({ storage, api: createApi({ fail: () => httpError(status) }) });
      expect(result.status).toBe('partial');
    });

    it('still reports partial when writing the remaining items back fails', async () => {
      const storage = legacy(['A']);
      storage.setItem.mockImplementationOnce((k, v) => storage.data.set(k, v)).mockImplementation(() => {
        throw new Error('quota');
      });
      const result = await runWith({ storage, api: createApi({ fail: () => networkError() }) });
      expect(result.status).toBe('partial');
    });
  });

  describe('AC-8 / EH-5: corrupt legacy data', () => {
    it.each([['invalid JSON', '{oops'], ['an object', '{}'], ['a string', '"A"'], ['null JSON', 'null']])(
      'leaves %s untouched and imports nothing',
      async (_name, raw) => {
        const storage = legacy(raw);
        const api = createApi();
        const onStart = jest.fn();
        await expect(runWith({ storage, api, onStart })).resolves.toEqual({ status: 'absent' });
        expect(storage.data.get(KEY)).toBe(raw);
        expect(storage.setItem).not.toHaveBeenCalled();
        expect(api.create).not.toHaveBeenCalled();
        expect(onStart).not.toHaveBeenCalled();
      },
    );

    it('imports the valid entries of [1, null, "", "ok"] and counts 3 skipped', async () => {
      const storage = legacy([1, null, '', 'ok']);
      const api = createApi();
      const result = await runWith({ storage, api });
      expect(result).toEqual({ status: 'complete', imported: 1, skipped: 3 });
      expect(api.bodies.map((b) => b.title)).toEqual(['ok']);
      expect(message(result)).toBe('Imported 1 task(s) from the previous version; skipped 3 invalid entr(ies)');
    });

    it('an array with only invalid entries removes the key and reports the skips without onStart', async () => {
      const storage = legacy([1, '']);
      const onStart = jest.fn();
      const result = await runWith({ storage, api: createApi(), onStart });
      expect(result).toEqual({ status: 'complete', imported: 0, skipped: 2 });
      expect(onStart).not.toHaveBeenCalled();
      expect(storage.data.has(KEY)).toBe(false);
    });
  });

  it('returns absent with no key', async () => {
    const api = createApi();
    await expect(runWith({ storage: createStorage(), api })).resolves.toEqual({ status: 'absent' });
    expect(api.create).not.toHaveBeenCalled();
  });

  it('EH-6: returns absent when storage is missing or getItem throws', async () => {
    const storage = createStorage();
    storage.getItem.mockImplementation(() => {
      throw new Error('SecurityError');
    });
    await expect(runWith({ storage, api: createApi() })).resolves.toEqual({ status: 'absent' });
    await expect(runWith({ storage: null, api: createApi() })).resolves.toEqual({ status: 'absent' });
  });

  it('returns absent and posts nothing when the write-back throws', async () => {
    const storage = legacy(['A']);
    storage.setItem.mockImplementation(() => {
      throw new Error('quota');
    });
    const api = createApi();
    await expect(runWith({ storage, api })).resolves.toEqual({ status: 'absent' });
    expect(api.create).not.toHaveBeenCalled();
    expect(storage.data.get(KEY)).toBe('["A"]');
  });

  it('[] completes with no notice and no onStart', async () => {
    const storage = legacy([]);
    const onStart = jest.fn();
    const result = await runWith({ storage, api: createApi(), onStart });
    expect(message(result)).toBeNull();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('ignores a throwing onStart and a throwing removeItem', async () => {
    const storage = legacy(['A']);
    storage.removeItem.mockImplementation(() => {
      throw new Error('nope');
    });
    const onStart = () => {
      throw new Error('ui broke');
    };
    await expect(runWith({ storage, api: createApi(), onStart })).resolves.toEqual({
      status: 'complete',
      imported: 1,
      skipped: 0,
    });
  });

  it('never rejects, even when the model throws', async () => {
    const model = { convertLegacy: () => { throw new Error('bug'); } };
    await expect(run({ storage: legacy(['A']), api: createApi(), model })).resolves.toEqual({ status: 'absent' });
  });

  it('uses the current time and a no-op onStart by default', async () => {
    const storage = legacy(['A']);
    await expect(run({ storage, api: createApi(), model: TodoModel })).resolves.toMatchObject({ status: 'complete' });
  });

  describe('AC-12: Web Locks', () => {
    function createFifoLocks() {
      let tail = Promise.resolve();
      return {
        names: [],
        request: jest.fn(function request(name, callback) {
          this.names.push(name);
          const result = tail.then(() => callback({ name }));
          tail = result.catch(() => {});
          return result;
        }),
      };
    }

    it('two concurrent runs import once; the second finds no key', async () => {
      const storage = legacy(['A', 'B']);
      const store = new Map();
      const locks = createFifoLocks();

      const [first, second] = await Promise.all([
        runWith({ storage, api: createApi({ store }), locks }),
        runWith({ storage, api: createApi({ store }), locks }),
      ]);

      expect(first).toEqual({ status: 'complete', imported: 2, skipped: 0 });
      expect(second).toEqual({ status: 'absent' });
      expect(store.size).toBe(2);
      expect(locks.names).toEqual([LOCK_NAME, LOCK_NAME]);
    });

    it('falls back to an unguarded import when locks.request rejects before the grant', async () => {
      const storage = legacy(['A']);
      const locks = { request: jest.fn(() => Promise.reject(new Error('SecurityError'))) };
      const api = createApi();
      await expect(runWith({ storage, api, locks })).resolves.toMatchObject({ status: 'complete', imported: 1 });
    });

    it('falls back when locks.request throws synchronously', async () => {
      const storage = legacy(['A']);
      const locks = {
        request: () => {
          throw new Error('SecurityError');
        },
      };
      await expect(runWith({ storage, api: createApi(), locks })).resolves.toMatchObject({ status: 'complete' });
    });

    it('does not import twice when the lock rejects after the callback ran', async () => {
      const storage = legacy(['A']);
      const api = createApi();
      const locks = {
        request: async (_name, callback) => {
          await callback();
          throw new Error('lock released abnormally');
        },
      };
      await expect(runWith({ storage, api, locks })).resolves.toEqual({ status: 'absent' });
      expect(api.create).toHaveBeenCalledTimes(1);
    });

    it('runs without locks', async () => {
      const storage = legacy(['A']);
      await expect(runWith({ storage, api: createApi(), locks: undefined })).resolves.toMatchObject({
        status: 'complete',
      });
    });
  });

  it('NFR-6: imports 200 items strictly in order with one onStart(200)', async () => {
    const titles = Array.from({ length: 200 }, (_, i) => `Task ${i + 1}`);
    const storage = legacy(titles);
    const api = createApi();
    let inFlight = 0;
    let maxInFlight = 0;
    const original = api.create.getMockImplementation();
    api.create.mockImplementation(async (body) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return original(body);
    });
    const onStart = jest.fn();

    const result = await runWith({ storage, api, onStart });

    expect(result).toEqual({ status: 'complete', imported: 200, skipped: 0 });
    expect(api.bodies.map((b) => b.title)).toEqual(titles);
    expect(maxInFlight).toBe(1);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith(200);
  });
});
