const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('background request dispatch waits for the provider adapter before posting the prompt', () => {
  const browser = fs.readFileSync(path.join(root, 'src/main/browser.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/index.cjs'), 'utf8');
  assert.match(browser, /waitForProviderAdapter\(tab\)/);
  assert.match(browser, /webContents\.send\('willai:send-prompt'/);
  assert.match(main, /ipcMain\.handle\('willai:send-prompt'/);
});

test('provider page submits only through a provider-specific enabled send control', () => {
  const preload = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  assert.match(preload, /button\[data-testid="send-button"\]/);
  assert.match(preload, /button\.click\(\)/);
  assert.match(preload, /The prompt was placed in the composer, but the provider send control was not available/);
  assert.match(preload, /willai:prompt-submit-result/);
});

test('renderer keeps New Conversation visible and hides native provider view during background request execution', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.match(app, /setWorkspaceView\('newchat'\);/);
  assert.match(app, /setBrowserOpen\(false\);/);
  assert.match(app, /window\.willai\.sendPrompt\(provider, content\)/);
});
