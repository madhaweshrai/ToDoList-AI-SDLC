const {
  parseId,
  parseCreateBody,
  parseUpdateBody,
  parseListQuery,
} = require('../../backend/src/validation');
const { ValidationError } = require('../../backend/src/errors');

describe('parseId', () => {
  it('accepts positive integers', () => {
    expect(parseId('1')).toBe(1);
    expect(parseId('42')).toBe(42);
  });

  it.each(['0', '-3', '1.5', 'abc', '', '01', '9007199254740993', undefined, 5])(
    'rejects %p',
    (value) => {
      expect(() => parseId(value)).toThrow(ValidationError);
    },
  );
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
