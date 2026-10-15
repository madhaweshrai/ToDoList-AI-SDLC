const { webcrypto } = require('node:crypto');
const TodoModel = require('../../JS/todo-model.js');
const validation = require('../../backend/src/validation');

const { UUID_V4_RE, TITLE_MAX, newId, isValidId, formatV4, fromLegacy, convertLegacy } = TodoModel;

const NOW = '2030-01-01T00:00:00.000Z';
const N = 10000;
const VALID_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function sequentialIds() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

function expectUniqueV4(ids) {
  ids.forEach((id) => expect(id).toMatch(UUID_V4_RE));
  expect(new Set(ids).size).toBe(ids.length);
}

const generate = (env) => Array.from({ length: N }, () => newId(env));

describe('TodoModel global', () => {
  it('FR-1: exposes the model as a global and as a CommonJS export', () => {
    expect(globalThis.TodoModel).toBe(TodoModel);
    expect(Object.keys(TodoModel).sort()).toEqual(
      ['TITLE_MAX', 'UUID_V4_RE', 'convertLegacy', 'formatV4', 'fromLegacy', 'isValidId', 'newId'].sort(),
    );
  });
});

describe('newId (FR-2, NFR-2)', () => {
  it('AC-4: uses crypto.randomUUID when available and lowercases it', () => {
    const randomUUID = jest.fn(() => VALID_ID.toUpperCase());
    expect(newId({ crypto: { randomUUID } })).toBe(VALID_ID);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('AC-4: defaults to the platform crypto', () => {
    expect(newId()).toMatch(UUID_V4_RE);
  });

  it(`AC-4: ${N} ids from crypto.randomUUID are unique v4 UUIDs`, () => {
    expectUniqueV4(generate({ crypto: webcrypto }));
  });

  it(`AC-4 / EH-7: without randomUUID, ${N} getRandomValues ids are unique v4 UUIDs`, () => {
    const getRandomValues = jest.fn((array) => webcrypto.getRandomValues(array));
    expectUniqueV4(generate({ crypto: { getRandomValues } }));
    expect(getRandomValues).toHaveBeenCalledTimes(N);
  });

  it(`AC-4 / EH-7: without crypto, ${N} Math.random ids are unique v4 UUIDs`, () => {
    expectUniqueV4(generate({ crypto: undefined }));
  });

  it(`AC-4 / EH-7: a throwing getRandomValues falls back to Math.random (${N} ids)`, () => {
    const random = jest.fn(Math.random);
    const env = {
      crypto: {
        getRandomValues: () => {
          throw new Error('no entropy');
        },
      },
      random,
    };
    expectUniqueV4(generate(env));
    expect(random).toHaveBeenCalledTimes(N * 16);
  });
});

describe('formatV4', () => {
  it('sets the version nibble to 4 and the variant bits to 10xx', () => {
    expect(formatV4(new Uint8Array(16).fill(0xff))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(formatV4(new Uint8Array(16))).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('does not mutate the input bytes', () => {
    const bytes = new Uint8Array(16).fill(0xff);
    formatV4(bytes);
    expect(Array.from(bytes)).toEqual(new Array(16).fill(0xff));
  });
});

describe('isValidId', () => {
  it.each([
    [VALID_ID, true],
    [VALID_ID.toUpperCase(), false],
    ['3f2504e0-4f89-11d3-9a0c-0305e82c3301', false],
    ['', false],
    [null, false],
    [5, false],
  ])('%p -> %p', (value, expected) => {
    expect(isValidId(value)).toBe(expected);
  });
});

describe('fromLegacy (FR-10a)', () => {
  const ids = () => sequentialIds();

  it('AC-8: converts a string entry to a full Todo with a new id', () => {
    expect(fromLegacy('  Buy milk  ', NOW, () => VALID_ID)).toEqual({
      id: VALID_ID,
      title: 'Buy milk',
      completed: false,
      priority: 'medium',
      dueDate: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('AC-8: converts an object with text, keeping a boolean completed and a string createdAt', () => {
    const todo = fromLegacy({ text: 'Old', completed: true, createdAt: '2020-01-01T00:00:00.000Z' }, NOW, ids());
    expect(todo).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Old',
      completed: true,
      priority: 'medium',
      dueDate: null,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: NOW,
    });
  });

  it('prefers title over text and keeps a valid id', () => {
    expect(fromLegacy({ id: VALID_ID, title: 'T', text: 'X' }, NOW, ids())).toMatchObject({ id: VALID_ID, title: 'T' });
  });

  it('falls back to text when title is blank', () => {
    expect(fromLegacy({ title: '  ', text: 'X' }, NOW, ids()).title).toBe('X');
  });

  it('lowercases an upper-case id instead of replacing it', () => {
    expect(fromLegacy({ id: VALID_ID.toUpperCase(), title: 'T' }, NOW, ids()).id).toBe(VALID_ID);
  });

  it('replaces an invalid id and treats wrong-type fields as missing', () => {
    const todo = fromLegacy({ id: 42, title: 'T', completed: 'yes', createdAt: 7 }, NOW, () => VALID_ID);
    expect(todo).toMatchObject({ id: VALID_ID, completed: false, createdAt: NOW });
  });

  it('copies only whitelisted fields', () => {
    const todo = fromLegacy({ title: 'T', secret: 'x', priority: 'high', dueDate: '2030-01-01' }, NOW, ids());
    expect(Object.keys(todo).sort()).toEqual(
      ['completed', 'createdAt', 'dueDate', 'id', 'priority', 'title', 'updatedAt'],
    );
    expect(todo).toMatchObject({ priority: 'medium', dueDate: null });
  });

  it.each([
    ['a number', 1],
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['a blank string', '   '],
    ['an array', ['A']],
    ['an empty object', {}],
    ['an object with a non-string title', { title: 5 }],
  ])('AC-8: rejects %s', (_name, entry) => {
    expect(fromLegacy(entry, NOW, ids())).toBeNull();
  });

  it('EH-9: accepts 200 code points and rejects 201 (counted in code points, not UTF-16 units)', () => {
    expect(fromLegacy('😀'.repeat(TITLE_MAX), NOW, ids())).not.toBeNull();
    expect(fromLegacy('😀'.repeat(TITLE_MAX + 1), NOW, ids())).toBeNull();
    expect(fromLegacy({ title: 'x'.repeat(TITLE_MAX + 1) }, NOW, ids())).toBeNull();
  });

  it('uses newId by default', () => {
    expect(fromLegacy('A', NOW).id).toMatch(UUID_V4_RE);
  });
});

describe('convertLegacy', () => {
  it('AC-3: keeps order and gives every string an id', () => {
    const { todos, skipped } = convertLegacy(['A', 'B'], NOW, sequentialIds());
    expect(todos.map((t) => [t.id, t.title])).toEqual([
      ['00000000-0000-4000-8000-000000000001', 'A'],
      ['00000000-0000-4000-8000-000000000002', 'B'],
    ]);
    expect(skipped).toBe(0);
  });

  it('AC-8: counts invalid entries as skipped', () => {
    const { todos, skipped } = convertLegacy([1, null, '', 'ok'], NOW, sequentialIds());
    expect(todos.map((t) => t.title)).toEqual(['ok']);
    expect(skipped).toBe(3);
  });

  it('keeps already-converted objects stable across retries', () => {
    const first = convertLegacy(['A', 'B'], NOW).todos;
    const retry = convertLegacy(JSON.parse(JSON.stringify(first)), '2031-01-01T00:00:00.000Z').todos;
    expect(retry.map((t) => t.id)).toEqual(first.map((t) => t.id));
    expect(retry.map((t) => t.createdAt)).toEqual([NOW, NOW]);
  });

  it('D-10b: re-ids a repeated id, including an upper/lower-case pair of the same id', () => {
    const { todos } = convertLegacy(
      [{ id: VALID_ID, title: 'one' }, { id: VALID_ID.toUpperCase(), title: 'two' }, { id: VALID_ID, title: 'three' }],
      NOW,
      sequentialIds(),
    );
    expect(todos.map((t) => t.title)).toEqual(['one', 'two', 'three']);
    expect(todos[0].id).toBe(VALID_ID);
    expect(new Set(todos.map((t) => t.id)).size).toBe(3);
    todos.forEach((t) => expect(t.id).toMatch(UUID_V4_RE));
  });

  it('returns an empty result for a non-array', () => {
    expect(convertLegacy({}, NOW)).toEqual({ todos: [], skipped: 0 });
    expect(convertLegacy(null, NOW)).toEqual({ todos: [], skipped: 0 });
  });
});

describe('parity with backend/src/validation.js (D-10a)', () => {
  it('uses the same id regex (source and flags) and the same title limit', () => {
    expect(UUID_V4_RE.source).toBe(validation.UUID_V4_RE.source);
    expect(UUID_V4_RE.flags).toBe(validation.UUID_V4_RE.flags);
    expect(TITLE_MAX).toBe(validation.TITLE_MAX);
  });
});
