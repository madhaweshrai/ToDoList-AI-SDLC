---
name: dto-generator
description: Generates domain models / data-transfer objects (DTOs) and the pure mappers that turn raw or legacy data (API JSON, localStorage, files) into normalised, fully-populated shapes with explicit missing-value defaults - JavaScript (JSDoc typedefs + mapper functions) or Java (Lombok models + record DTOs). Use whenever a task introduces or changes a data shape, an id/format rule, a legacy-data conversion, or a missing-field rule.
---

# DTO Generator

Creates consistent DTOs and **mappers** so that every field is always either a real value or an explicit
"missing" marker. Downstream code (renderers, controllers) then never has to handle `undefined` or `null`.

## When to use

- A plan task says `Skill: dto-generator`.
- You are mapping an external API response (e.g. GitHub REST JSON) into an internal shape.
- A requirement says missing data must render as `Not Found` (or a similar marker).

## Inputs to collect first

1. The **source**: a sample of raw JSON (from the API docs or a test fixture). Note which fields can be absent, `null` or empty.
2. The **target fields**: name, type, formatting rule (dates, percentages, sorting) and the missing-value rule.
3. The **stack**: check `CLAUDE.md` and the existing code, and follow the conventions already in use.

## Rules (all stacks)

| Rule | Detail |
|------|--------|
| One missing marker | Export a single constant (`NOT_FOUND = 'Not Found'`). Never repeat the literal in other files. |
| Normalise emptiness | `undefined`, `null`, `''` (after trim), `[]` and `{}` all become `NOT_FOUND`. `0` and `false` are **real values**. |
| Pure mappers | No I/O, no clock, no randomness. The same input always gives the same output (determinism). |
| Stable ordering | Sort collections explicitly (e.g. by value descending, then by name) so that output is reproducible. |
| Format in the mapper | Dates become `YYYY-MM-DD` (UTC) and percentages use a fixed number of decimals. Renderers only lay out the data. |
| Whitelist fields | Copy only the fields that are needed. Never spread raw objects, because that leaks unexpected data such as URLs with tokens. |
| Defensive types | Check `typeof` and `Array.isArray` before use, and treat wrong types as missing. |
| Test each mapper | Cover a full input, an all-missing input (`{}`), a `null` input, and wrong-type fields. |

## JavaScript template (ES modules + JSDoc)

```js
// src/dto.js
export const NOT_FOUND = 'Not Found';

/** Returns the trimmed string, or NOT_FOUND when absent/blank/not a string. */
export function textOrNotFound(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : NOT_FOUND;
}

/** ISO timestamp → YYYY-MM-DD (UTC), or NOT_FOUND. */
export function dateOrNotFound(value) {
  const date = typeof value === 'string' ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : NOT_FOUND;
}

/**
 * @typedef {object} Overview
 * @property {string} fullName
 * @property {string} license   SPDX id or NOT_FOUND
 * @property {string[]|string} topics  sorted list or NOT_FOUND
 */

/** @param {any} repo raw GET /repos/{owner}/{repo} body @returns {Overview} */
export function toOverview(repo) {
  const r = repo && typeof repo === 'object' ? repo : {};
  const topics = Array.isArray(r.topics) ? r.topics.filter((t) => typeof t === 'string' && t) : [];
  return {
    fullName: textOrNotFound(r.full_name),
    license: textOrNotFound(r.license?.spdx_id === 'NOASSERTION' ? '' : r.license?.spdx_id),
    topics: topics.length ? [...topics].sort() : NOT_FOUND,
  };
}
```

Test skeleton (`node:test`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toOverview, NOT_FOUND } from '../src/dto.js';

test('toOverview maps a full repo', () => { /* fixture → expected object */ });
test('toOverview marks every field Not Found for {}', () => {
  assert.deepEqual(toOverview({}), { fullName: NOT_FOUND, license: NOT_FOUND, topics: NOT_FOUND });
});
test('toOverview tolerates null and wrong types', () => {
  assert.equal(toOverview(null).fullName, NOT_FOUND);
  assert.equal(toOverview({ topics: 'x' }).topics, NOT_FOUND);
});
```

## Java template (Spring Boot + Lombok)

- Domain model: `@Data @Builder @NoArgsConstructor @AllArgsConstructor @JsonIgnoreProperties(ignoreUnknown = true)`.
- Request and response DTOs: Java `record`s. Validation annotations go on request DTOs only. Add `@Schema(example=…)` for Swagger.
- Mappers: a static `Response.from(Entity)` and `Request.toEntity()`. Put the missing-value defaults in `from()`.

## Steps

1. Collect the inputs. Write a realistic fixture (`test/fixtures/<source>.json`) that includes missing and `null` fields.
2. Write the typedef or class and the mapper(s), following the rules above.
3. Write the mapper tests: full, empty, `null` and wrong-type inputs.
4. Run the tests. Report the DTOs, mappers and fixtures that were created.
