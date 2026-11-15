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
    store.close();
    store.close();
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
    store.close();
    store.close();
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
    store.close();
    store.close();
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
    store.close();
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('SQLite database and bridge token survive an application restart', () => {
  const { directory, store } = makeStore();
  let reopened;
  try {
    const token = store.getBridgeInfo().token;
    const databasePath = store.databasePath;
    store.close();
    assert.ok(fs.existsSync(databasePath));
    reopened = new LocalStore(directory);
    assert.equal(reopened.getBridgeInfo().token, token);
    assert.equal(reopened.getSnapshot().conversations.length, 0);
  } finally {
    reopened?.close();
    store.close();
    store.close();
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('source URLs are limited to supported HTTPS AI providers', () => {
  assert.equal(normaliseSourceUrl('https://chatgpt.com/c/abc?foo=bar'), 'https://chatgpt.com/c/abc');
  assert.throws(() => normaliseSourceUrl('http://chatgpt.com/c/abc'));
  assert.throws(() => normaliseSourceUrl('https://example.com/chat'));
});


test('outline supports sibling insertion, indentation, outdent, and reordering', () => {
  const { directory, store } = makeStore();
  try {
    capture(store);
    const response = store.getSnapshot().conversations[0].responses[0];
    const first = response.nodes.find((node) => node.content === 'First paragraph.');
    const second = response.nodes.find((node) => node.content === 'Second paragraph.');
    assert.ok(first);
    assert.ok(second);

    const inserted = store.createSiblingNode(first.id, 'Inserted node.');
    let roots = store.getSnapshot().conversations[0].responses[0].nodes
      .filter((node) => !node.deletedAt && node.parentId === null)
      .sort((a, b) => a.position - b.position);
    assert.deepEqual(roots.map((node) => node.content), ['First paragraph.', 'Inserted node.', 'Second paragraph.']);

    assert.equal(store.moveNode(second.id, 'indent').ok, true);
    let moved = store.getSnapshot().conversations[0].responses[0].nodes.find((node) => node.id === second.id);
    assert.equal(moved.parentId, inserted.nodeId);

    assert.equal(store.moveNode(second.id, 'outdent').ok, true);
    moved = store.getSnapshot().conversations[0].responses[0].nodes.find((node) => node.id === second.id);
    assert.equal(moved.parentId, null);

    assert.equal(store.moveNode(second.id, 'up').ok, true);
    roots = store.getSnapshot().conversations[0].responses[0].nodes
      .filter((node) => !node.deletedAt && node.parentId === null)
      .sort((a, b) => a.position - b.position);
    assert.ok(roots.findIndex((node) => node.id === second.id) < roots.findIndex((node) => node.id === inserted.nodeId));
  } finally {
    store.close();
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


test('a growing provider response updates its existing Original Response and Working Nodes', () => {
  const { directory, store } = makeStore();
  try {
    const first = store.capture({
      provider: 'chatgpt',
      sourceUrl: 'https://chatgpt.com/c/growing-answer',
      title: 'Growing answer',
      sourceMessageId: 'assistant-message-growing',
      text: '# Answer\\n\\nThe first part.',
    });
    const original = store.getSnapshot().conversations[0].responses[0];
    const firstHeadingId = original.nodes.find((node) => node.nodeType === 'heading').id;

    const updated = store.capture({
      provider: 'chatgpt',
      sourceUrl: 'https://chatgpt.com/c/growing-answer',
      title: 'Growing answer',
      sourceMessageId: 'assistant-message-growing',
      text: '# Answer\\n\\nThe completed first part.\\n\\n## Details\\n\\nA second paragraph.',
    });

    const response = store.getSnapshot().conversations[0].responses[0];
    assert.equal(first.created, true);
    assert.equal(updated.created, false);
    assert.equal(updated.updated, true);
    assert.equal(store.getSnapshot().conversations[0].responses.length, 1);
    assert.match(response.originalContent, /completed first part/);
    assert.ok(response.nodes.some((node) => node.content === '## Details'));
    assert.ok(response.nodes.some((node) => node.content === 'A second paragraph.'));
    assert.equal(response.nodes.find((node) => node.nodeType === 'heading').id, firstHeadingId);
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('response revisions preserve a manually edited Working Node', () => {
  const { directory, store } = makeStore();
  try {
    store.capture({
      provider: 'chatgpt',
      sourceUrl: 'https://chatgpt.com/c/edited-growing-answer',
      title: 'Edited answer',
      sourceMessageId: 'assistant-message-edited',
      text: '# Answer\\n\\nOriginal wording.',
    });
    const response = store.getSnapshot().conversations[0].responses[0];
    const paragraph = response.nodes.find((node) => node.nodeType === 'paragraph');
    store.updateNode(paragraph.id, 'My edited wording.');

    store.capture({
      provider: 'chatgpt',
      sourceUrl: 'https://chatgpt.com/c/edited-growing-answer',
      title: 'Edited answer',
      sourceMessageId: 'assistant-message-edited',
      text: '# Answer\\n\\nFinal source wording.\\n\\nNew paragraph.',
    });

    const revised = store.getSnapshot().conversations[0].responses[0];
    const preserved = revised.nodes.find((node) => node.id === paragraph.id);
    assert.equal(revised.originalContent.includes('Final source wording.'), true);
    assert.equal(preserved.content, 'My edited wording.');
    assert.equal(preserved.initialContent, 'Final source wording.');
    assert.equal(preserved.provenance, 'human-edited');
    assert.ok(revised.nodes.some((node) => node.content === 'New paragraph.'));
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('capturing a Markdown answer creates typed and nested Working Nodes', () => {
  const { directory, store } = makeStore();
  try {
    const markdown = [
      '# Summary',
      '',
      'Introductory paragraph.',
      '',
      '## Steps',
      '',
      '- First item',
      '  - Nested item',
      '- Second item',
      '',
      '```typescript',
      'const answer = 42;',
      '```',
      '',
      '| Name | Value |',
      '| --- | --- |',
      '| Alpha | One |',
    ].join('\\n');
    store.capture({
      provider: 'chatgpt',
      sourceUrl: 'https://chatgpt.com/c/markdown-to-nodes',
      title: 'Markdown answer',
      sourceMessageId: 'assistant-markdown',
      text: markdown,
    });
    const nodes = store.getSnapshot().conversations[0].responses[0].nodes;
    assert.ok(nodes.some((node) => node.nodeType === 'heading' && node.content === '# Summary'));
    assert.ok(nodes.some((node) => node.nodeType === 'heading' && node.content === '## Steps'));
    const first = nodes.find((node) => node.content === 'First item');
    const nested = nodes.find((node) => node.content === 'Nested item');
    assert.ok(first && nested);
    assert.equal(nested.parentId, first.id);
    assert.ok(nodes.some((node) => node.nodeType === 'code' && /const answer = 42/.test(node.content)));
    assert.ok(nodes.some((node) => node.nodeType === 'table'));
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
