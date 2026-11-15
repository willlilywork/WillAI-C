const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('Global Search covers conversations, original responses, working nodes, prompts, notes and browser records', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  for (const source of ['snapshot.conversations', 'response.originalContent', 'node.content', 'snapshot.prompts', 'snapshot.notes', 'snapshot.bookmarks', 'snapshot.browserHistory']) {
    assert.ok(app.includes(source), 'Missing search domain: ' + source);
  }
  assert.match(app, /const globalSearchResults = useMemo/);
});

test('Command palette opens from Ctrl+K and has implemented navigation commands', () => {
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
});

test('Search snippets collapse whitespace and conversation notes open in Notes', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.match(app, /replace\(\/\\s\+\/g, ' '\)/);
  const start = app.indexOf('function activateSearchResult');
  const end = app.indexOf('function runPaletteCommand', start);
  const body = app.slice(start, end);
  assert.ok(body.indexOf("result.kind === 'Note'") < body.indexOf('if (result.conversationId)'));
});
