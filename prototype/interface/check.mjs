import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const file = new URL('./index.html', import.meta.url);
const html = await readFile(file, 'utf8');
const scriptStart = html.indexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>');
assert.ok(scriptStart >= 0 && scriptEnd > scriptStart, 'Expected one inline prototype script.');
const inlineScript = html.slice(scriptStart + '<script>'.length, scriptEnd);
new vm.Script(inlineScript, { filename: 'prototype-inline.js' });

for (const marker of [
  'data-dest="newchat"', 'data-dest="home"', 'data-dest="work"',
  'data-dest="tree"', 'data-dest="prompts"', 'data-dest="notes"',
  'data-dest="browser"', 'function newConversationPage()',
  'function conversationsTreePage()', 'function createTreeBranch(parentId)',
  'Branch in new chat', 'SIMULATED RESPONSE', "dest:'newchat'",
  'function workbenchPage()', 'data-mode="original"',
  'data-mode="working"', 'data-mode="context"', 'function contextPreview()',
  'PROTOTYPE · NOT CONNECTED', 'Original Response',
  'data-action="explain"', 'Model Context'
]) {
  assert.ok(html.includes(marker), 'Missing expected UI marker: ' + marker);
}
assert.ok(html.includes('Ctrl K'), 'Search shortcut must be discoverable.');
assert.ok(html.includes('--bg:#090f1d'), 'Navy design token must be present.');
assert.ok(html.includes('--accent:#9874ff'), 'Violet accent token must be present.');
console.log('Prototype structure and embedded JavaScript syntax: PASS');
