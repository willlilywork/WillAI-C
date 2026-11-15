const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LocalStore } = require('../src/main/store.cjs');

function makeStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'willai-c-workspace-'));
  return { directory, store: new LocalStore(directory) };
}

function capture(store, suffix = 'one', text = '# Response\n\nA captured paragraph.') {
  return store.capture({
    provider: 'chatgpt',
    sourceUrl: 'https://chatgpt.com/c/' + suffix,
    title: 'Conversation ' + suffix,
    sourceMessageId: 'message-' + suffix,
    text,
  });
}

test('folder hierarchy, conversation assignment, and folder deletion preserve conversations', () => {
  const { directory, store } = makeStore();
  try {
    const captured = capture(store);
    const parent = store.createFolder({ name: 'Projects', color: '#112233' });
    const child = store.createFolder({ name: 'Research', parentId: parent.folderId });
    store.moveConversation(captured.conversationId, child.folderId);

    let snapshot = store.getSnapshot();
    assert.equal(snapshot.folders.length, 2);
    assert.equal(snapshot.conversations[0].folderId, child.folderId);
    assert.equal(snapshot.folders.find((folder) => folder.id === child.folderId).parentId, parent.folderId);

    store.deleteFolder(child.folderId);
    snapshot = store.getSnapshot();
    assert.equal(snapshot.conversations[0].folderId, parent.folderId);
    assert.equal(snapshot.folders.length, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('conversation pinning, archiving, response pinning, and bulk delete persist', () => {
  const { directory, store } = makeStore();
  try {
    const a = capture(store, 'a');
    const b = capture(store, 'b');
    const response = store.getSnapshot().conversations.find((item) => item.id === a.conversationId).responses[0];

    store.setConversationFlags(a.conversationId, { pinned: true, archived: true });
    store.setResponsePinned(response.id, true);

    let snapshot = store.getSnapshot();
    const conversation = snapshot.conversations.find((item) => item.id === a.conversationId);
    assert.equal(conversation.pinned, true);
    assert.ok(conversation.archivedAt);
    assert.equal(conversation.responses[0].pinned, true);

    const result = store.bulkDeleteConversations([a.conversationId, b.conversationId]);
    assert.equal(result.deleted, 2);
    assert.equal(store.getSnapshot().conversations.length, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('prompt variables expand, favourites update, and usage enters local history', () => {
  const { directory, store } = makeStore();
  try {
    const created = store.savePrompt({
      title: 'Research prompt',
      content: 'Research {{subject}} in {{region}}.',
      category: 'Research',
      tags: ['research'],
    });
    store.setPromptFavorite(created.promptId, true);
    const expanded = store.expandPrompt(created.promptId, { subject: 'battery recycling', region: 'Canada' });
    assert.equal(expanded.content, 'Research battery recycling in Canada.');
    assert.deepEqual(expanded.variables, ['subject', 'region']);

    const snapshot = store.getSnapshot();
    assert.equal(snapshot.prompts[0].favorite, true);
    assert.equal(snapshot.prompts[0].usageCount, 1);
    assert.equal(snapshot.promptHistory[0].content, expanded.content);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('prompt import and export round-trip prompt records', () => {
  const { directory, store } = makeStore();
  try {
    const result = store.importPrompts({
      version: 1,
      prompts: [
        { title: 'Prompt A', content: 'First reusable prompt.' },
        { title: 'Prompt B', content: 'Step one.\n\nStep two.', kind: 'chain', steps: ['Step one.', 'Step two.'] },
      ],
    });
    assert.equal(result.imported, 2);
    const exported = JSON.parse(store.exportPrompts());
    assert.equal(exported.prompts.length, 2);
    assert.equal(exported.prompts[1].kind, 'chain');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('global and conversation notes are stored independently', () => {
  const { directory, store } = makeStore();
  try {
    const captured = capture(store);
    store.saveNote({ title: 'Global note', content: 'Available everywhere.' });
    store.saveNote({ title: 'Chat note', content: 'Only for this conversation.', conversationId: captured.conversationId });

    const snapshot = store.getSnapshot();
    assert.equal(snapshot.notes.length, 2);
    assert.equal(snapshot.notes.filter((note) => !note.conversationId).length, 1);
    assert.equal(snapshot.notes.find((note) => note.conversationId)?.title, 'Chat note');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('reference conversations contribute only explicitly shared nodes to context', () => {
  const { directory, store } = makeStore();
  try {
    const original = capture(store, 'original');
    const referencing = capture(store, 'referencing', 'A separate response.');
    const referencedConversation = store.getSnapshot().conversations.find((item) => item.id === original.conversationId);
    const node = referencedConversation.responses[0].nodes[0];

    store.setNodeContext(node.id, true);
    store.setConversationReferences(referencing.conversationId, [original.conversationId]);

    const referencingConversation = store.getSnapshot().conversations.find((item) => item.id === referencing.conversationId);
    assert.match(referencingConversation.sharedContextPreview, /# Response/);
    assert.match(referencingConversation.sharedContextPreview, /Source: chatgpt — Conversation original/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('prompt queue, bookmarks, and browser history are local and validated', () => {
  const { directory, store } = makeStore();
  try {
    const queued = store.enqueuePrompt('Check the assumptions.', 'Assumption check');
    assert.equal(store.getSnapshot().promptQueue[0].id, queued.itemId);
    store.removePromptQueueItem(queued.itemId);
    assert.equal(store.getSnapshot().promptQueue.length, 0);

    store.addBookmark({ name: 'OpenAI', url: 'https://openai.com/' });
    assert.equal(store.getSnapshot().bookmarks.length, 1);
    assert.throws(() => store.addBookmark({ url: 'file:///secret.txt' }));

    store.recordBrowserVisit({ title: 'OpenAI', url: 'https://openai.com/' });
    assert.equal(store.getSnapshot().browserHistory[0].title, 'OpenAI');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('conversation exports are available as Markdown, text, JSON, and HTML', () => {
  const { directory, store } = makeStore();
  try {
    const captured = capture(store, 'export', '# Export test\n\nA **bold** paragraph.');
    assert.match(store.exportConversationContent(captured.conversationId, 'markdown'), /# Export test/);
    assert.match(store.exportConversationContent(captured.conversationId, 'txt'), /A \*\*bold\*\* paragraph/);
    assert.equal(JSON.parse(store.exportConversationContent(captured.conversationId, 'json')).title, 'Conversation export');
    assert.match(store.exportConversationContent(captured.conversationId, 'html'), /<strong>bold<\/strong>/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('legacy local data is migrated without discarding conversations', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'willai-c-migration-'));
  try {
    const filePath = path.join(directory, 'willai-c-data.json');
    fs.writeFileSync(filePath, JSON.stringify({
      schemaVersion: 1,
      bridgeToken: 'legacy-token',
      conversations: [{ id: 'legacy', title: 'Legacy conversation', responses: [], updatedAt: new Date().toISOString() }],
    }), 'utf8');

    const store = new LocalStore(directory);
    const snapshot = store.getSnapshot();
    assert.equal(snapshot.conversations[0].id, 'legacy');
    assert.equal(snapshot.folders.length, 0);
    const disk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(disk.dataVersion, 2);
    assert.equal(disk.bridgeToken, 'legacy-token');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
