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
  assert.ok(preload.includes('requestNativePromptInsert'));
  assert.ok(preload.includes('button[data-testid="send-button"]'));
  assert.ok(preload.includes('button[aria-label="Send message"]'));
  assert.ok(preload.includes('#composer-submit-button'));
  assert.ok(preload.includes('button[type="submit"]'));
  assert.ok(preload.includes('button.click()'));
  assert.ok(preload.includes('findSendButton(composer)'));
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


test('the Browser workspace can explicitly rescan loaded provider messages through the trusted IPC bridge', () => {
  const browser = fs.readFileSync(path.join(root, 'src/main/browser.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/index.cjs'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src/main/preload.cjs'), 'utf8');
  const provider = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.ok(browser.includes('requestProviderRescan()'));
  assert.ok(browser.includes("webContents.send('willai:rescan-provider-conversation')"));
  assert.ok(main.includes("ipcMain.handle('willai:rescan-provider-conversation'"));
  assert.ok(preload.includes("ipcRenderer.invoke('willai:rescan-provider-conversation')"));
  assert.ok(provider.includes("ipcRenderer.on('willai:rescan-provider-conversation'"));
  assert.ok(provider.includes("reportStatus("));
  assert.ok(app.includes('Extract loaded responses'));
  assert.ok(app.includes('scroll up to load them'));
});

test('capture event TypeScript contract includes response revisions and rescan API', () => {
  const types = fs.readFileSync(path.join(root, 'src/renderer/types.d.ts'), 'utf8');
  assert.ok(types.includes('updated?: boolean'));
  assert.ok(types.includes('rescanProviderConversation()'));
});


test('provider adapter readiness is reset after navigation and rescan waits for the new page', () => {
  const browser = fs.readFileSync(path.join(root, 'src/main/browser.cjs'), 'utf8');
  assert.ok(browser.includes('tab.captureStatus = null;'));
  assert.ok(browser.includes("new Set(['ready', 'no-message-elements', 'message-elements-found', 'response-sent', 'capture-error'])"));
  assert.ok(browser.includes('async requestProviderRescan()'));
  assert.ok(browser.includes('await this.waitForProviderAdapter(tab)'));
});

test('capture status panel wraps its explicit extraction action and guidance', () => {
  const css = fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8');
  assert.ok(css.includes('.capture-status-panel { flex-wrap:wrap; }'));
});


test('provider prompt insertion uses Electron native text input after focusing the composer', () => {
  const browser = fs.readFileSync(path.join(root, 'src/main/browser.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/index.cjs'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  assert.ok(browser.includes('webContents.insertText(pending.content)'));
  assert.ok(browser.includes('handleProviderComposerReady'));
  assert.ok(main.includes("ipcMain.on('willai:provider-composer-ready'"));
  assert.ok(preload.includes("ipcRenderer.send('willai:provider-composer-ready'"));
  assert.ok(preload.includes("ipcRenderer.on('willai:provider-text-inserted'"));
});

test('ChatGPT current assistant message and composer selectors are supported', () => {
  const preload = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  assert.ok(preload.includes('textarea[name="prompt-textarea"]'));
  assert.ok(preload.includes('textarea#mobile-composer-prompt'));
  assert.ok(preload.includes('#composer-submit-button'));
  assert.ok(preload.includes('data-content-search-unit-key$=":assistant"'));
  assert.ok(preload.includes('data-chatgpt-search-message-ids'));
});

test('DeepSeek current composer and send controls are supported', () => {
  const preload = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  assert.ok(preload.includes("'#chat-input'"));
  assert.ok(preload.includes("'button[aria-label=\"Send message\"]'"));
  assert.ok(preload.includes("'[data-testid=\"send-button\"]'"));
});
