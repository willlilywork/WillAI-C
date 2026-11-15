import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const file = new URL('./index.html', import.meta.url);
const html = await readFile(file, 'utf8');
const scriptMatch = html.match(/<script>([\\s\\S]*?)<\\/script>/);
assert.ok(scriptMatch, 'Expected one inline prototype script.');
new vm.Script(scriptMatch[1], { filename: 'prototype-inline.js' });

for (const marker of [
  'data-dest="home"',
  'data-dest="work"',
  'data-dest="prompts"',
  'data-dest="notes"',
  'data-dest="browser"',
  'function workbenchPage()',
  "data-mode=\"original\"",
  "data-mode=\"working\"",
  "data-mode=\"context\"",
  'function contextPreview()',
  'PROTOTYPE · NOT CONNECTED'
]) {
  assert.ok(html.includes(marker), `Missing expected UI marker: ${marker}`);
}

assert.ok(html.includes('Ctrl K'), 'Search shortcut must be discoverable.');
assert.ok(html.includes('Model Context'), 'Context controls must be present.');
console.log('Prototype structure and embedded JavaScript syntax: PASS');
