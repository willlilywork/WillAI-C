const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('WillAI-C starts in New Conversation with the browser hidden', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.match(app, /useState\(false\);/);
  assert.match(app, /setWorkspaceView<['"]newchat['"]|useState<['"]newchat['"]\s*\|/);
  assert.match(app, /<NewConversation/);
  assert.match(app, /Open provider and insert prompt/);
});

test('Electron startup does not create a provider tab automatically', () => {
  const main = fs.readFileSync(path.join(root, 'src/main/index.cjs'), 'utf8');
  assert.doesNotMatch(main, /did-finish-load[\s\S]{0,220}browser\.createTab\(['"]https:\/\/chatgpt\.com\//);
});

test('closing the last browser tab leaves the browser empty', () => {
  const browser = fs.readFileSync(path.join(root, 'src/main/browser.cjs'), 'utf8');
  assert.match(browser, /if \(wasActive\) this\.activeTabId = this\.tabs\.keys\(\)\.next\(\)\.value \|\| null;\s*this\.applyBounds\(\);\s*this\.emitState\(\);/);
  assert.doesNotMatch(browser, /if \(!this\.activeTabId\)\s*\{\s*this\.createTab\(['"]https:\/\/chatgpt\.com\//);
});

test('provider prompts are inserted only after the adapter reports readiness', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.match(app, /pendingPrompt\.dispatched/);
  assert.match(app, /\['ready', 'message-elements-found', 'response-sent'\]/);
  assert.match(app, /window\.willai\.insertPrompt\(pending\.content\)/);
});
