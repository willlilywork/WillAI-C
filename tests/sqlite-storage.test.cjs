const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LocalStore } = require('../src/main/store.cjs');

test('SQLite persists workspace data and provides indexed full-text search', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'willai-c-sqlite-'));
  let store;
  let reopened;
  try {
    store = new LocalStore(directory);
    const captured = store.capture({
      provider: 'chatgpt',
      sourceUrl: 'https://chatgpt.com/c/sqlite-test',
      title: 'SQLite architecture research',
      sourceMessageId: 'sqlite-message-1',
      text: '# SQLite research\n\nA unique paragraph about transactional local storage.',
    });
    store.savePrompt({ title: 'SQLite prompt', content: 'Inspect SQLite FTS indexing.' });
    store.saveNote({ title: 'Database decision', content: 'SQLite is the local source of truth.' });
    const response = store.getSnapshot().conversations[0].responses[0];
    store.setNodeContext(response.nodes[0].id, true);

    assert.ok(store.searchWorkspace('transactional local').some((item) => item.kind === 'Original Response' && item.conversationId === captured.conversationId));
    assert.ok(store.searchWorkspace('FTS indexing').some((item) => item.kind === 'Prompt' && item.title === 'SQLite prompt'));
    assert.ok(store.searchWorkspace('source truth').some((item) => item.kind === 'Note' && item.title === 'Database decision'));

    const Database = require('better-sqlite3');
    const inspection = new Database(store.databasePath, { readonly: true });
    try {
      const tables = inspection.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
      for (const name of ['conversations', 'responses', 'working_nodes', 'folders', 'prompts', 'notes', 'search_documents', 'workspace_fts']) {
        assert.ok(tables.includes(name), 'Missing SQLite table: ' + name);
      }
      assert.equal(inspection.pragma('foreign_key_check').length, 0);
    } finally {
      inspection.close();
    }

    store.close();
    reopened = new LocalStore(directory);
    const afterRestart = reopened.getSnapshot();
    assert.equal(afterRestart.conversations[0].responses[0].nodes[0].includeInModelContext, true);
    assert.equal(afterRestart.prompts[0].title, 'SQLite prompt');
    assert.equal(afterRestart.notes[0].title, 'Database decision');
    assert.ok(reopened.searchWorkspace('transactional local').length > 0);
  } finally {
    reopened?.close();
    store?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
