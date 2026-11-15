const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('background request dispatch waits for the provider adapter before posting the prompt', () => {
  const browser = fs.readFileSync(path.join(root, 'src/main/browser.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/index.cjs'), 'utf8');
  assert.ok(browser.includes('waitForProviderAdapter(tab)'));
  assert.ok(browser.includes("webContents.send('willai:send-prompt'"));
  assert.ok(main.includes("ipcMain.handle('willai:send-prompt'"));
});

test('a hidden provider view keeps a non-zero DOM viewport for background submission', () => {
  const browser = fs.readFileSync(path.join(root, 'src/main/browser.cjs'), 'utf8');
  assert.ok(browser.includes('tab.view.setBounds(this.contentBounds)'));
  assert.ok(browser.includes('tab.view.setVisible(this.browserVisible && tab.id === this.activeTabId)'));
  assert.ok(browser.includes('this.browserVisible = false'));
  assert.ok(browser.includes('if (next.width > 0 && next.height > 0)'));
});

test('provider page waits for its composer and enabled send control', () => {
  const preload = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  assert.ok(preload.includes('waitForComposerAndSubmit'));
  assert.ok(preload.includes('button[data-testid="send-button"]'));
  assert.ok(preload.includes('button[aria-label*="Send" i]'));
  assert.ok(preload.includes('button.click()'));
  assert.ok(preload.includes('willai:prompt-submit-result'));
});

test('response capture waits for generation to finish before finalising a stable answer', () => {
  const preload = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  assert.ok(preload.includes('CAPTURE_STABILITY_DELAY_MS = 2400'));
  assert.ok(preload.includes('function isProviderGenerating()'));
  assert.ok(preload.includes('if (isProviderGenerating())'));
});

test('renderer keeps New Conversation visible while background requests execute', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.ok(app.includes("setWorkspaceView('newchat')"));
  assert.ok(app.includes('setBrowserOpen(false)'));
  assert.ok(app.includes('window.willai.sendPrompt(provider, content)'));
});
