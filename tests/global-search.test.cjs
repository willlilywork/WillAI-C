const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('Global Search requests indexed results from the local workspace database', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src/main/preload.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/index.cjs'), 'utf8');
  assert.match(app, /window\.willai\.searchWorkspace\(globalSearchQuery, 80\)/);
  assert.match(preload, /searchWorkspace: \(query, limit\) => ipcRenderer\.invoke\('willai:search-workspace'/);
  assert.match(main, /ipcMain\.handle\('willai:search-workspace'/);
});

test('Command palette opens from Ctrl/Cmd+K and has implemented navigation commands', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.match(app, /event\.key\.toLowerCase\(\) === 'k'/);
  assert.match(app, /role="dialog"/);
  for (const command of ['newchat', 'home', 'work', 'prompts', 'notes', 'browser']) {
    assert.ok(app.includes("id: '" + command + "'"), 'Missing command: ' + command);
  }
});

test('Search results route to their owning workspace and URL results open in Browser', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.match(app, /function activateSearchResult/);
  assert.match(app, /openBrowserUrl\(result\.url\)/);
  const start = app.indexOf('function activateSearchResult');
  const end = app.indexOf('function runPaletteCommand', start);
  const body = app.slice(start, end);
  assert.ok(body.indexOf("result.kind === 'Note'") < body.indexOf('if (result.conversationId)'));
});
