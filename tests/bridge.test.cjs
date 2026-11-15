const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LocalStore } = require('../src/main/store.cjs');
const { createBridge } = require('../src/main/bridge.cjs');

const ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const BASE = 'http://127.0.0.1:43821';

test('local bridge authenticates the extension and serves explicit shared context', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'willai-c-bridge-'));
  const store = new LocalStore(directory);
  const bridge = createBridge({ store });
  const token = store.getBridgeInfo().token;

  await bridge.start();
  try {
    const unauthorised = await fetch(`${BASE}/v1/health`, {
      headers: { Origin: ORIGIN },
    });
    assert.equal(unauthorised.status, 401);

    const health = await fetch(`${BASE}/v1/health`, {
      headers: { Origin: ORIGIN, Authorization: `Bearer ${token}` },
    });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('access-control-allow-origin'), ORIGIN);

    const preflight = await fetch(`${BASE}/v1/captures`, {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(preflight.status, 204);

    const capture = await fetch(`${BASE}/v1/captures`, {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'chatgpt',
        sourceUrl: 'https://chatgpt.com/c/bridge-test',
        title: 'Bridge test',
        sourceMessageId: 'bridge-message-1',
        text: 'A captured response block.',
        blocks: ['A captured response block.'],
      }),
    });
    assert.equal(capture.status, 201);
    const result = await capture.json();
    assert.equal(result.created, true);

    const snapshot = store.getSnapshot();
    assert.equal(snapshot.conversations.length, 1);
    const node = snapshot.conversations[0].responses[0].nodes[0];
    store.setNodeContext(node.id, true);

    const context = await fetch(`${BASE}/v1/context?sourceUrl=${encodeURIComponent('https://chatgpt.com/c/bridge-test')}`, {
      headers: { Origin: ORIGIN, Authorization: `Bearer ${token}` },
    });
    assert.equal(context.status, 200);
    assert.match((await context.json()).context, /A captured response block/);
  } finally {
    await bridge.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
