import { describe, expect, it } from 'vitest';

import { validateRequestedSlug } from '../../src/utils/slug.js';

describe('slug validation', () => {
  it('accepts a valid slug', () => {
    expect(validateRequestedSlug('abc-1')).toBe('abc-1');
  });

  it('rejects nested domains', () => {
    expect(() => validateRequestedSlug('a.b')).toThrowError(/Nested domains/);
  });

  it('rejects uppercase characters', () => {
    expect(() => validateRequestedSlug('Abc')).toThrowError(/Uppercase characters are not allowed/);
  });
});
