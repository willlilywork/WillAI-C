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
  assert.match(app, /Send request/);
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

test('workspace folders support drag and drop plus bulk conversation actions', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src/main/preload.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/index.cjs'), 'utf8');

  assert.match(app, /application\/x-willai-folder/);
  assert.match(app, /application\/x-willai-conversation/);
  assert.match(app, /onDrop=\{\(event\) => handleFolderDrop/);
  assert.match(app, /archiveSelectedConversations/);
  assert.match(app, /moveSelectedConversations/);
  assert.match(preload, /moveFolder: \(folderId, parentId\)/);
  assert.match(preload, /bulkSetConversationFlags:/);
  assert.match(preload, /bulkMoveConversations:/);
  assert.match(main, /willai:move-folder/);
  assert.match(main, /willai:bulk-set-conversation-flags/);
  assert.match(main, /willai:bulk-move-conversations/);
});

test('provider requests use the background submit bridge', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.match(app, /window\.willai\.sendPrompt\(provider, content\)/);
  assert.match(app, /setBrowserBounds\(\{ x: 0, y: 0, width: 0, height: 0 \}\)/);
});
