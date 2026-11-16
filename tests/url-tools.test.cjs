const test = require('node:test');
const assert = require('node:assert/strict');
const { providerFromUrl, isWebUrl, navigationTarget } = require('../src/main/url-tools.cjs');

test('provider detection recognises the supported AI sites', () => {
  assert.equal(providerFromUrl('https://chatgpt.com/c/abc'), 'chatgpt');
  assert.equal(providerFromUrl('https://claude.ai/chat/abc'), 'claude');
  assert.equal(providerFromUrl('https://chat.deepseek.com/'), 'deepseek');
  assert.equal(providerFromUrl('https://example.com/'), null);
});

test('browser navigation accepts http and https URLs only', () => {
  assert.equal(isWebUrl('https://example.com'), true);
  assert.equal(isWebUrl('http://localhost:3000'), true);
  assert.equal(isWebUrl('file:///C:/secret.txt'), false);
  assert.equal(isWebUrl('javascript:alert(1)'), false);
});

test('address bar input resolves websites and search queries', () => {
  assert.equal(navigationTarget('example.com/path'), 'https://example.com/path');
  assert.equal(navigationTarget('https://example.com'), 'https://example.com');
  assert.equal(navigationTarget('cats in space'), 'https://www.google.com/search?q=cats%20in%20space');
  assert.throws(() => navigationTarget('javascript:alert(1)'));
});
