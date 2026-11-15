const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('background request dispatch waits for the provider adapter before posting the prompt', () => {
  const browser = fs.readFileSync(path.join(root, 'src/main/browser.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/index.cjs'), 'utf8');
  assert.match(browser, /waitForProviderAdapter\\(tab\\)/);
  assert.match(browser, /webContents\\.send\\('willai:send-prompt'/);
  assert.match(main, /ipcMain\\.handle\\('willai:send-prompt'/);
});

test('a hidden provider view keeps a non-zero DOM viewport for background submission', () => {
  const browser = fs.readFileSync(path.join(root, 'src/main/browser.cjs'), 'utf8');
  assert.match(browser, /tab\\.view\\.setBounds\\(this\\.contentBounds\\)/);
  assert.match(browser, /tab\\.view\\.setVisible\\(this\\.browserVisible && tab\\.id === this\\.activeTabId\\)/);
  assert.match(browser, /this\\.browserVisible = false/);
  assert.match(browser, /if \\(next\\.width > 0 && next\\.height > 0\\)/);
});

test('provider page waits for its composer and enabled send control', () => {
  const preload = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  assert.match(preload, /waitForComposerAndSubmit/);
  assert.match(preload, /button\\[data-testid="send-button"\\]/);
  assert.match(preload, /button\\[aria-label\\*="Send" i\\]/);
  assert.match(preload, /button\\.click\\(\\)/);
  assert.match(preload, /willai:prompt-submit-result/);
});

test('response capture waits for generation to finish before finalising a stable answer', () => {
  const preload = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  assert.match(preload, /CAPTURE_STABILITY_DELAY_MS = 2400/);
  assert.match(preload, /function isProviderGenerating/);
  assert.match(preload, /if \\(isProviderGenerating\\(\\)\\)/);
});

test('renderer keeps New Conversation visible while background requests execute', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.match(app, /setWorkspaceView\\('newchat'\\);/);
  assert.match(app, /setBrowserOpen\\(false\\);/);
  assert.match(app, /window\\.willai\\.sendPrompt\\(provider, content\\)/);
});
