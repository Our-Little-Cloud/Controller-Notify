const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Theme System Unit Tests', () => {
  const VALID_THEMES = ['pink', 'dark', 'turquoise', 'gameboy', 'atomic-purple'];

  function sanitizeTheme(inputTheme) {
    if (typeof inputTheme === 'string' && VALID_THEMES.includes(inputTheme.toLowerCase())) {
      return inputTheme.toLowerCase();
    }
    return 'pink';
  }

  it('should validate and accept allowed themes', () => {
    assert.equal(sanitizeTheme('pink'), 'pink');
    assert.equal(sanitizeTheme('dark'), 'dark');
    assert.equal(sanitizeTheme('turquoise'), 'turquoise');
    assert.equal(sanitizeTheme('gameboy'), 'gameboy');
    assert.equal(sanitizeTheme('atomic-purple'), 'atomic-purple');
  });

  it('should fallback to pink when theme is invalid or empty', () => {
    assert.equal(sanitizeTheme('invalid-theme'), 'pink');
    assert.equal(sanitizeTheme(''), 'pink');
    assert.equal(sanitizeTheme(null), 'pink');
    assert.equal(sanitizeTheme(undefined), 'pink');
  });
});
