const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('Context Panel is optional and has Outline and Model Context views', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.match(app, /contextPanelOpen/);
  assert.match(app, /selectedTab === 'outline'/);
  assert.match(app, /selectedTab === 'context'/);
  assert.match(app, /className="context-panel"/);
});

test('Model Context node selection uses the existing local persistence API', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.match(app, /window\.willai\.setNodeContext\(nodeId, enabled\)/);
  assert.match(app, /includeInModelContext/);
  assert.match(app, /sharedContextPreview/);
});

test('Context insertion requires a supported active provider and returns to Browser for review', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.match(app, /if \(!activeTab\?\.provider\)/);
  assert.match(app, /setWorkspaceView\('browser'\);\s*setBrowserOpen\(true\);/);
});
