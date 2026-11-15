const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LocalStore, normaliseSourceUrl } = require('../src/main/store.cjs');

function makeStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'willai-c-test-'));
  return { directory, store: new LocalStore(directory) };
}

function capture(store) {
  return store.capture({
    provider: 'chatgpt',
    sourceUrl: 'https://chatgpt.com/c/conversation-123?model=gpt',
    title: 'Test conversation',
    sourceMessageId: 'assistant-message-1',
    text: 'First paragraph.\n\nSecond paragraph.',
    blocks: ['First paragraph.', 'Second paragraph.'],
  });
}

test('original response remains unchanged when working nodes are edited', () => {
  const { directory, store } = makeStore();
  try {
    const result = capture(store);
    const conversation = store.getSnapshot().conversations[0];
    const response = conversation.responses[0];
    const firstNode = response.nodes[0];

    store.updateNode(firstNode.id, 'A human-edited version.');
    const updated = store.getSnapshot().conversations[0].responses[0];

    assert.equal(updated.originalContent, 'First paragraph.\n\nSecond paragraph.');
    assert.equal(updated.nodes[0].content, 'A human-edited version.');
    assert.equal(updated.nodes[0].provenance, 'human-edited');
    assert.equal(result.created, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('private nodes are excluded until explicitly enabled for model context', () => {
  const { directory, store } = makeStore();
  try {
    capture(store);
    const conversation = store.getSnapshot().conversations[0];
    const node = conversation.responses[0].nodes[0];

    store.updateNode(node.id, 'A private note.');
    assert.equal(store.getContextForSource(conversation.sourceUrl).context, '');

    store.setNodeContext(node.id, true);
    const context = store.getContextForSource(conversation.sourceUrl).context;
    assert.match(context, /A private note\./);
    assert.match(context, /WillAI-C shared context/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('deleting a parent also excludes its descendants from context', () => {
  const { directory, store } = makeStore();
  try {
    const captured = capture(store);
    const conversation = store.getSnapshot().conversations[0];
    const response = conversation.responses[0];
    const parent = response.nodes[0];
    const child = store.createChildNode(response.id, parent.id);
    store.updateNode(child.nodeId, 'Child information.');
    store.setNodeContext(child.nodeId, true);

    store.deleteNode(parent.id);
    assert.equal(store.getContextForSource(conversation.sourceUrl).context, '');
    assert.equal(captured.created, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('capture deduplicates stable message ids', () => {
  const { directory, store } = makeStore();
  try {
    const first = capture(store);
    const second = capture(store);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(store.getSnapshot().conversations[0].responses.length, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('pairing token survives an application restart', () => {
  const { directory, store } = makeStore();
  try {
    const token = store.getBridgeInfo().token;
    const reopened = new LocalStore(directory);
    assert.equal(reopened.getBridgeInfo().token, token);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('source URLs are limited to supported HTTPS AI providers', () => {
  assert.equal(normaliseSourceUrl('https://chatgpt.com/c/abc?foo=bar'), 'https://chatgpt.com/c/abc');
  assert.throws(() => normaliseSourceUrl('http://chatgpt.com/c/abc'));
  assert.throws(() => normaliseSourceUrl('https://example.com/chat'));
});
