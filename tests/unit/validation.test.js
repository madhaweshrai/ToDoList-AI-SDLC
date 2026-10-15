const {
  UUID_V4_RE,
  isUuidV4,
  parseId,
  parseCreateBody,
  parseUpdateBody,
  parseListQuery,
} = require('../../backend/src/validation');
const { ValidationError } = require('../../backend/src/errors');

const VALID_V4 = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('isUuidV4', () => {
  it('NFR-1: accepts a lowercase v4 UUID', () => {
    expect(isUuidV4(VALID_V4)).toBe(true);
    expect(isUuidV4('00000000-0000-4000-8000-000000000001')).toBe(true);
  });

  it.each([
    ['upper case', VALID_V4.toUpperCase()],
    ['version 1', '3f2504e0-4f89-11d3-9a0c-0305e82c3301'],
    ['variant c', '3f2504e0-4f89-41d3-ca0c-0305e82c3301'],
    ['missing hyphens', '3f2504e04f8941d39a0c0305e82c3301'],
    ['braces', `{${VALID_V4}}`],
    ['trailing newline', `${VALID_V4}\n`],
    ['empty string', ''],
    ['undefined', undefined],
    ['a number', 5],
  ])('NFR-1: rejects %s', (_name, value) => {
    expect(isUuidV4(value)).toBe(false);
  });

  it('keeps UUID_V4_RE source and flags stable (mirrored by the browser model)', () => {
    expect(UUID_V4_RE.source).toBe('^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
    expect(UUID_V4_RE.flags).toBe('');
  });
});

describe('parseId', () => {
  it('AC-5: accepts a lowercase v4 UUID and returns it unchanged (no coercion)', () => {
    expect(parseId(VALID_V4)).toBe(VALID_V4);
  });

  it.each([
    VALID_V4.toUpperCase(),
    '3f2504e0-4f89-11d3-9a0c-0305e82c3301', // v1
    '3f2504e0-4f89-41d3-ca0c-0305e82c3301', // variant c
    '3f2504e04f8941d39a0c0305e82c3301',
    `{${VALID_V4}}`,
    `${VALID_V4}\n`,
    '0', '-3', '1.5', 'abc', '', '01', '1', undefined, 5,
  ])('EH-3: rejects %p with a field "id" error', (value) => {
    try {
      parseId(value);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.details).toEqual([{ field: 'id', message: 'must be a lowercase v4 UUID' }]);
    }
  });
});

describe('parseCreateBody id (FR-3)', () => {
  it('AC-5: keeps a valid client id', () => {
    expect(parseCreateBody({ id: VALID_V4, title: 'a' })).toEqual({ id: VALID_V4, title: 'a' });
  });

  it('AC-5: leaves id absent when the client sends none', () => {
    expect(parseCreateBody({ title: 'a' })).not.toHaveProperty('id');
  });

  it.each([
    ['malformed', 'abc'],
    ['upper case', VALID_V4.toUpperCase()],
    ['null', null],
    ['a number', 5],
  ])('EH-1: rejects a %s id with a field "id" error', (_name, id) => {
    try {
      parseCreateBody({ id, title: 'a' });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.details).toEqual([{ field: 'id', message: 'must be a lowercase v4 UUID' }]);
    }
  });

  it('EH-1: reports an id error alongside other field errors', () => {
    try {
      parseCreateBody({ id: 'x', title: '' });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error.details.map((d) => d.field).sort()).toEqual(['id', 'title']);
    }
  });
});

describe('parseCreateBody', () => {
  it('trims the title', () => {
    expect(parseCreateBody({ title: '  hi  ' })).toEqual({ title: 'hi' });
  });

  it('requires a title', () => {
    expect(() => parseCreateBody({ priority: 'low' })).toThrow(ValidationError);
  });

  it('rejects blank and over-long titles', () => {
    expect(() => parseCreateBody({ title: '\t \n' })).toThrow(ValidationError);
    expect(() => parseCreateBody({ title: 'a'.repeat(201) })).toThrow(ValidationError);
    expect(parseCreateBody({ title: 'a'.repeat(200) }).title).toHaveLength(200);
  });

  it('counts characters, not UTF-16 units, for the length limit', () => {
    expect(parseCreateBody({ title: '😀'.repeat(200) }).title).toBeTruthy();
    expect(() => parseCreateBody({ title: '😀'.repeat(201) })).toThrow(ValidationError);
  });

  it('collects every field error', () => {
    try {
      parseCreateBody({ title: '', priority: 'x', dueDate: 'y', completed: 'z' });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.details.map((d) => d.field).sort()).toEqual(['completed', 'dueDate', 'priority', 'title']);
    }
  });

  it('rejects non-object bodies', () => {
    [null, undefined, 'x', 5, []].forEach((body) => {
      expect(() => parseCreateBody(body)).toThrow(ValidationError);
    });
  });

  it('validates calendar dates', () => {
    expect(parseCreateBody({ title: 'a', dueDate: '2028-02-29' }).dueDate).toBe('2028-02-29');
    expect(() => parseCreateBody({ title: 'a', dueDate: '2029-02-29' })).toThrow(ValidationError);
    expect(() => parseCreateBody({ title: 'a', dueDate: '2029-13-01' })).toThrow(ValidationError);
    expect(() => parseCreateBody({ title: 'a', dueDate: '2029-1-1' })).toThrow(ValidationError);
  });
});

describe('parseUpdateBody', () => {
  it('allows any subset of fields', () => {
    expect(parseUpdateBody({ completed: true })).toEqual({ completed: true });
    expect(parseUpdateBody({ dueDate: null })).toEqual({ dueDate: null });
  });

  it('requires at least one recognised field', () => {
    expect(() => parseUpdateBody({})).toThrow(ValidationError);
    expect(() => parseUpdateBody({ unknown: 1 })).toThrow(ValidationError);
  });

  it('ignores unknown fields alongside valid ones', () => {
    expect(parseUpdateBody({ id: 99, completed: false })).toEqual({ completed: false });
  });

  it('ignores a body id on update, even a valid one', () => {
    expect(parseUpdateBody({ id: VALID_V4, completed: true })).toEqual({ completed: true });
  });
});

describe('parseListQuery', () => {
  it('defaults to status=all', () => {
    expect(parseListQuery({})).toEqual({ status: 'all' });
    expect(parseListQuery()).toEqual({ status: 'all' });
  });

  it('parses and trims filters', () => {
    expect(parseListQuery({ status: 'active', priority: 'high', q: '  milk ' })).toEqual({
      status: 'active',
      priority: 'high',
      q: 'milk',
    });
  });

  it('drops a blank q', () => {
    expect(parseListQuery({ q: '   ' })).toEqual({ status: 'all' });
  });

  it('rejects invalid values', () => {
    expect(() => parseListQuery({ status: 'done' })).toThrow(ValidationError);
    expect(() => parseListQuery({ priority: 'urgent' })).toThrow(ValidationError);
    expect(() => parseListQuery({ q: ['a', 'b'] })).toThrow(ValidationError);
  });
});
