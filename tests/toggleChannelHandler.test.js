const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('Main IPC Handler Reference Tests', () => {
  it('should not contain references to undeclared settingsWindow variable in main.js', () => {
    const mainPath = path.join(__dirname, '../src/main/main.js');
    const mainContent = fs.readFileSync(mainPath, 'utf8');
    
    // Check if settingsWindow is referenced directly in main.js without being declared
    // windowManager encapsulates settingsWindow
    const settingsWindowMatches = [...mainContent.matchAll(/settingsWindow/g)];
    assert.equal(
      settingsWindowMatches.length,
      0,
      `Found ${settingsWindowMatches.length} references to undeclared 'settingsWindow' in main.js. Use windowManager instead.`
    );
  });
});
