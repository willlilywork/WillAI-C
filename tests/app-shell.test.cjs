const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('global navigation exposes implemented primary workspaces', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  for (const destination of ['newchat', 'home', 'work', 'prompts', 'notes', 'browser']) {
    assert.ok(app.includes("navigateTo('" + destination + "')"), 'Missing navigation action: ' + destination);
  }
  assert.match(app, /className="global-rail"/);
  assert.match(app, /aria-label="Primary navigation"/);
});

test('Browser is a full main-canvas workspace, not a permanent third column', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8');
  assert.match(app, /browser-workspace/);
  assert.match(css, /grid-template-columns: 64px minmax\(220px,var\(--sidebar-width,248px\)\) 6px minmax\(0,1fr\)/);
});

test('Opening a saved conversation does not force the provider browser into the workspace', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.match(app, /function openConversation\(conversation: Conversation\) \{\s*setWorkspaceView\('work'\);\s*setActiveConversationId\(conversation.id\);\s*setBrowserOpen\(false\);/);
});

test('Browser navigation pane reflects open tabs and saved browser record counts', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.match(app, /browserState\.tabs\.map/);
  assert.match(app, /snapshot\.bookmarks\.length \+ snapshot\.browserHistory\.length/);
});
