const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseMarkdownNodes } = require('./markdown-nodes.cjs');
const Database = require('better-sqlite3');

const SUPPORTED_PROVIDERS = new Set(['chatgpt', 'claude', 'deepseek']);
const MAX_TEXT_LENGTH = 120_000;

function now() {
  return new Date().toISOString();
}

function cleanText(value, maxLength = MAX_TEXT_LENGTH) {
  return String(value ?? '').replace(/\u0000/g, '').slice(0, maxLength).trim();
}

function normaliseSourceUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error('A valid source URL is required.');
  }

  const host = url.hostname.toLowerCase();
  const allowed =
    host === 'chatgpt.com' ||
    host === 'chat.openai.com' ||
    host === 'claude.ai' ||
    host === 'deepseek.com' ||
    host.endsWith('.deepseek.com');

  if (url.protocol !== 'https:' || !allowed) {
    throw new Error('Captures are accepted only from supported AI websites.');
  }

  return `${url.origin}${url.pathname}`.replace(/\/$/, '') || url.origin;
}

function fingerprint(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function flattenNodes(conversation) {
  return conversation.responses.flatMap((response) => response.nodes || []);
}

class LocalStore {
  constructor(userDataPath) {
    this.directory = userDataPath;
    this.filePath = path.join(userDataPath, 'willai-c-data.json');
    this.databasePath = path.join(userDataPath, 'willai-c-data.sqlite3');
    this.legacyBackupPath = this.filePath + '.migrated-backup';
    fs.mkdirSync(userDataPath, { recursive: true });

    this.db = new Database(this.databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.migrateSchema();

    const initialized = this.db.prepare("SELECT value FROM app_metadata WHERE key = 'storage_initialized'").get();
    if (initialized) {
      this.state = this.loadDatabaseState();
      this.normalizeState();
    } else {
      this.state = this.loadLegacyState();
      this.normalizeState();
      this.persist();
      if (fs.existsSync(this.filePath) && !fs.existsSync(this.legacyBackupPath)) {
        try { fs.copyFileSync(this.filePath, this.legacyBackupPath); } catch (error) {
          console.warn('WillAI-C could not create the legacy JSON backup:', error.message);
        }
      }
    }
  }

  defaultState() {
    return {
      schemaVersion: 1,
      dataVersion: 2,
      bridgeToken: crypto.randomBytes(32).toString('hex'),
      conversations: [],
      folders: [],
      prompts: [],
      promptHistory: [],
      notes: [],
      bookmarks: [],
      browserHistory: [],
      promptQueue: [],
      settings: { autoArchiveDays: 0, autoDeleteDays: 0 },
    };
  }

  migrateSchema() {
    const version = Number(this.db.pragma('user_version', { simple: true })) || 0;
    if (version > 1) throw new Error('This WillAI-C database was created by a newer application version.');
    if (version === 1) return;

    const createSchema = this.db.transaction(() => {
      this.db.exec('CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      this.db.exec(
        'CREATE TABLE IF NOT EXISTS folders (' +
        'id TEXT PRIMARY KEY, parent_id TEXT, name TEXT NOT NULL, position INTEGER NOT NULL, ' +
        'color TEXT, icon TEXT, payload_json TEXT NOT NULL, ' +
        'FOREIGN KEY(parent_id) REFERENCES folders(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED)'
      );
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_folders_parent_position ON folders(parent_id, position)');
      this.db.exec(
        'CREATE TABLE IF NOT EXISTS conversations (' +
        'id TEXT PRIMARY KEY, provider TEXT NOT NULL, title TEXT NOT NULL, source_url TEXT NOT NULL, ' +
        'created_at TEXT NOT NULL, updated_at TEXT NOT NULL, folder_id TEXT, pinned INTEGER NOT NULL DEFAULT 0, ' +
        'archived_at TEXT, temporary INTEGER NOT NULL DEFAULT 0, payload_json TEXT NOT NULL, ' +
        'FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED)'
      );
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_folder ON conversations(folder_id, updated_at DESC)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_provider ON conversations(provider, updated_at DESC)');
      this.db.exec(
        'CREATE TABLE IF NOT EXISTS responses (' +
        'id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, source_message_id TEXT, captured_at TEXT NOT NULL, ' +
        'position INTEGER NOT NULL DEFAULT 0, original_content TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, ' +
        'payload_json TEXT NOT NULL, ' +
        'FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED)'
      );
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_responses_conversation ON responses(conversation_id, position)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_responses_source_message ON responses(source_message_id)');
      this.db.exec(
        'CREATE TABLE IF NOT EXISTS working_nodes (' +
        'id TEXT PRIMARY KEY, response_id TEXT NOT NULL, parent_id TEXT, position INTEGER NOT NULL DEFAULT 0, ' +
        'sequence INTEGER NOT NULL DEFAULT 0, content TEXT NOT NULL, node_type TEXT, ' +
        'include_in_model_context INTEGER NOT NULL DEFAULT 0, provenance TEXT, deleted_at TEXT, payload_json TEXT NOT NULL, ' +
        'FOREIGN KEY(response_id) REFERENCES responses(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED, ' +
        'FOREIGN KEY(parent_id) REFERENCES working_nodes(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED)'
      );
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_nodes_outline ON working_nodes(response_id, parent_id, position)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_nodes_context ON working_nodes(response_id, include_in_model_context, deleted_at)');
      this.db.exec(
        'CREATE TABLE IF NOT EXISTS prompts (' +
        'id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT, favorite INTEGER NOT NULL DEFAULT 0, ' +
        'usage_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, payload_json TEXT NOT NULL)'
      );
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_prompts_updated ON prompts(updated_at DESC)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_prompts_favorite ON prompts(favorite, updated_at DESC)');
      this.db.exec(
        'CREATE TABLE IF NOT EXISTS prompt_history (' +
        'id TEXT PRIMARY KEY, prompt_id TEXT, prompt_title TEXT NOT NULL, provider TEXT, content TEXT NOT NULL, ' +
        'used_at TEXT NOT NULL, payload_json TEXT NOT NULL, ' +
        'FOREIGN KEY(prompt_id) REFERENCES prompts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED)'
      );
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_prompt_history_used ON prompt_history(used_at DESC)');
      this.db.exec(
        'CREATE TABLE IF NOT EXISTS notes (' +
        'id TEXT PRIMARY KEY, conversation_id TEXT, title TEXT NOT NULL, content TEXT NOT NULL, ' +
        'pinned INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, payload_json TEXT NOT NULL, ' +
        'FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED)'
      );
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_notes_conversation ON notes(conversation_id, updated_at DESC)');
      this.db.exec(
        'CREATE TABLE IF NOT EXISTS bookmarks (' +
        'id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, payload_json TEXT NOT NULL)'
      );
      this.db.exec(
        'CREATE TABLE IF NOT EXISTS browser_history (' +
        'id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, visited_at TEXT NOT NULL, payload_json TEXT NOT NULL)'
      );
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_browser_history_visited ON browser_history(visited_at DESC)');
      this.db.exec(
        'CREATE TABLE IF NOT EXISTS prompt_queue (' +
        'id TEXT PRIMARY KEY, position INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, ' +
        'created_at TEXT NOT NULL, payload_json TEXT NOT NULL)'
      );
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_prompt_queue_position ON prompt_queue(position)');
      this.db.exec('CREATE TABLE IF NOT EXISTS workspace_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL)');
      this.db.exec(
        'CREATE TABLE IF NOT EXISTS search_documents (' +
        'id TEXT PRIMARY KEY, kind TEXT NOT NULL, entity_id TEXT NOT NULL, conversation_id TEXT, ' +
        'title TEXT NOT NULL, body TEXT NOT NULL)'
      );
      this.db.exec(
        "CREATE VIRTUAL TABLE IF NOT EXISTS workspace_fts USING fts5(title, body, content='search_documents', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2')"
      );
      this.db.exec(
        'CREATE TRIGGER IF NOT EXISTS search_documents_ai AFTER INSERT ON search_documents BEGIN ' +
        'INSERT INTO workspace_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body); END'
      );
      this.db.exec(
        "CREATE TRIGGER IF NOT EXISTS search_documents_ad AFTER DELETE ON search_documents BEGIN " +
        "INSERT INTO workspace_fts(workspace_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body); END"
      );
      this.db.exec(
        'CREATE TRIGGER IF NOT EXISTS search_documents_au AFTER UPDATE ON search_documents BEGIN ' +
        "INSERT INTO workspace_fts(workspace_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body); " +
        'INSERT INTO workspace_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body); END'
      );
      this.db.pragma('user_version = 1');
    });
    createSchema();
  }

  loadLegacyState() {
    if (!fs.existsSync(this.filePath)) return this.defaultState();

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.conversations)) {
        throw new Error('Unsupported local data schema.');
      }
      if (!parsed.bridgeToken) parsed.bridgeToken = crypto.randomBytes(32).toString('hex');
      this.needsPersist = false;
      const collections = ['folders', 'prompts', 'promptHistory', 'notes', 'bookmarks', 'browserHistory', 'promptQueue'];
      for (const key of collections) {
        if (!Array.isArray(parsed[key])) {
          parsed[key] = [];
          this.needsPersist = true;
        }
      }
      if (!parsed.settings || typeof parsed.settings !== 'object') {
        parsed.settings = { autoArchiveDays: 0, autoDeleteDays: 0 };
        this.needsPersist = true;
      }
      if (parsed.dataVersion !== 2) {
        parsed.dataVersion = 2;
        this.needsPersist = true;
      }
      for (const conversation of parsed.conversations) {
        if (!Array.isArray(conversation.referenceConversationIds)) conversation.referenceConversationIds = [];
        if (!Array.isArray(conversation.responses)) conversation.responses = [];
        if (conversation.folderId === undefined) conversation.folderId = null;
        if (conversation.pinned === undefined) conversation.pinned = false;
        if (conversation.archivedAt === undefined) conversation.archivedAt = null;
        if (conversation.temporary === undefined) conversation.temporary = false;
        for (const response of conversation.responses) {
          if (!Array.isArray(response.nodes)) response.nodes = [];
          for (const node of response.nodes) {
            if (node.parentId === undefined) node.parentId = null;
            if (node.deletedAt === undefined) node.deletedAt = null;
            if (node.includeInModelContext === undefined) node.includeInModelContext = false;
          }
        }
      }
      return parsed;
    } catch (error) {
      const backupPath = this.filePath + '.corrupt-' + Date.now();
      fs.renameSync(this.filePath, backupPath);
      return this.defaultState();
    }
  }

  normalizeState() {
    if (!this.state || typeof this.state !== 'object') this.state = this.defaultState();
    const collectionNames = ['conversations', 'folders', 'prompts', 'promptHistory', 'notes', 'bookmarks', 'browserHistory', 'promptQueue'];
    for (const key of collectionNames) if (!Array.isArray(this.state[key])) this.state[key] = [];
    if (!this.state.settings || typeof this.state.settings !== 'object') this.state.settings = { autoArchiveDays: 0, autoDeleteDays: 0 };

    this.state.folders = this.state.folders.filter((item) => item && typeof item === 'object');
    for (const folder of this.state.folders) {
      if (!folder.id) folder.id = crypto.randomUUID();
      folder.name = cleanText(folder.name, 80) || 'Untitled folder';
      folder.position = Number.isFinite(Number(folder.position)) ? Number(folder.position) : 0;
      folder.color = /^#[0-9a-f]{6}$/i.test(String(folder.color || '')) ? folder.color : '#8db69a';
      folder.icon = cleanText(folder.icon, 8) || '▤';
    }
    const folderIds = new Set(this.state.folders.map((item) => item.id));
    for (const folder of this.state.folders) if (folder.parentId && !folderIds.has(folder.parentId)) folder.parentId = null;

    this.state.conversations = this.state.conversations.filter((item) => item && typeof item === 'object');
    for (const conversation of this.state.conversations) {
      if (!conversation.id) conversation.id = crypto.randomUUID();
      conversation.provider = SUPPORTED_PROVIDERS.has(String(conversation.provider || '').toLowerCase())
        ? String(conversation.provider).toLowerCase() : 'chatgpt';
      conversation.title = cleanText(conversation.title, 240) || 'Untitled conversation';
      conversation.sourceUrl = cleanText(conversation.sourceUrl, 2000);
      conversation.createdAt = conversation.createdAt || now();
      conversation.updatedAt = conversation.updatedAt || conversation.createdAt;
      if (conversation.folderId && !folderIds.has(conversation.folderId)) conversation.folderId = null;
      if (!Array.isArray(conversation.responses)) conversation.responses = [];
      conversation.referenceConversationIds = [...new Set((conversation.referenceConversationIds || []))]
        .filter((id) => id !== conversation.id);
      for (const response of conversation.responses) {
        if (!response.id) response.id = crypto.randomUUID();
        response.capturedAt = response.capturedAt || conversation.updatedAt;
        response.originalContent = String(response.originalContent || '');
        if (!Array.isArray(response.nodes)) response.nodes = [];
        for (const node of response.nodes) {
          if (!node.id) node.id = crypto.randomUUID();
          node.content = String(node.content || '');
          if (node.parentId && !response.nodes.some((candidate) => candidate.id === node.parentId)) node.parentId = null;
          if (node.includeInModelContext === undefined) node.includeInModelContext = false;
          if (node.deletedAt === undefined) node.deletedAt = null;
          node.position = Number.isFinite(Number(node.position)) ? Number(node.position) : 0;
          node.sequence = Number.isFinite(Number(node.sequence)) ? Number(node.sequence) : node.position;
          node.nodeType = node.nodeType || 'paragraph';
          node.provenance = node.provenance || 'captured';
          node.updatedAt = node.updatedAt || response.capturedAt;
          node.createdAt = node.createdAt || node.updatedAt;
        }
      }
    }

    const conversationIds = new Set(this.state.conversations.map((item) => item.id));
    for (const conversation of this.state.conversations) conversation.referenceConversationIds = conversation.referenceConversationIds.filter((id) => conversationIds.has(id));
    this.state.prompts = this.state.prompts.filter((item) => item && typeof item === 'object');
    for (const prompt of this.state.prompts) {
      if (!prompt.id) prompt.id = crypto.randomUUID();
      prompt.title = cleanText(prompt.title, 120) || 'Untitled prompt';
      prompt.content = String(prompt.content || '');
      prompt.category = cleanText(prompt.category, 60) || 'General';
      prompt.favorite = Boolean(prompt.favorite);
      prompt.usageCount = Number(prompt.usageCount) || 0;
      prompt.tags = Array.isArray(prompt.tags) ? prompt.tags : [];
      prompt.updatedAt = prompt.updatedAt || now();
      prompt.createdAt = prompt.createdAt || prompt.updatedAt;
    }
    const promptIds = new Set(this.state.prompts.map((item) => item.id));
    for (const item of this.state.promptHistory) {
      if (!item.id) item.id = crypto.randomUUID();
      item.promptTitle = String(item.promptTitle || 'Previous prompt');
      item.content = String(item.content || '');
      item.usedAt = item.usedAt || now();
      if (item.promptId && !promptIds.has(item.promptId)) item.promptId = null;
    }
    this.state.notes = this.state.notes.filter((item) => item && typeof item === 'object');
    for (const note of this.state.notes) {
      if (!note.id) note.id = crypto.randomUUID();
      note.title = cleanText(note.title, 120) || 'Untitled note';
      note.content = String(note.content || '');
      note.pinned = Boolean(note.pinned);
      note.updatedAt = note.updatedAt || now();
      note.createdAt = note.createdAt || note.updatedAt;
      if (note.conversationId && !conversationIds.has(note.conversationId)) note.conversationId = null;
    }
    this.state.bookmarks = this.state.bookmarks.filter((item) => item && item.id && item.url);
    for (const bookmark of this.state.bookmarks) {
      bookmark.name = cleanText(bookmark.name, 160) || 'Saved website';
      bookmark.createdAt = bookmark.createdAt || now();
    }
    this.state.browserHistory = this.state.browserHistory.filter((item) => item && item.id);
    for (const item of this.state.browserHistory) {
      item.title = cleanText(item.title, 200) || item.url || 'Website';
      item.url = String(item.url || '');
      item.visitedAt = item.visitedAt || now();
    }
    this.state.promptQueue = this.state.promptQueue.filter((item) => item && item.id);
    for (const item of this.state.promptQueue) {
      item.title = cleanText(item.title, 120) || 'Queued prompt';
      item.content = String(item.content || '');
      item.position = Number(item.position) || 0;
      item.createdAt = item.createdAt || now();
    }
    this.state.settings.autoArchiveDays = Math.max(0, Number(this.state.settings.autoArchiveDays) || 0);
    this.state.settings.autoDeleteDays = Math.max(0, Number(this.state.settings.autoDeleteDays) || 0);
    this.state.schemaVersion = 1;
    this.state.dataVersion = 2;
  }

  loadDatabaseState() {
    const metadata = new Map(this.db.prepare('SELECT key, value FROM app_metadata').all().map((row) => [row.key, row.value]));
    const state = this.defaultState();
    state.bridgeToken = metadata.get('bridgeToken') || state.bridgeToken;
    state.schemaVersion = Number(metadata.get('schemaVersion')) || 1;
    state.dataVersion = Number(metadata.get('dataVersion')) || 2;

    state.folders = this.db.prepare('SELECT payload_json FROM folders ORDER BY position, name').all().map((row) => JSON.parse(row.payload_json));

    const conversations = new Map();
    for (const row of this.db.prepare('SELECT payload_json FROM conversations ORDER BY updated_at DESC').all()) {
      const conversation = JSON.parse(row.payload_json);
      conversation.responses = [];
      conversations.set(conversation.id, conversation);
    }

    const responses = new Map();
    for (const row of this.db.prepare('SELECT id, conversation_id, payload_json FROM responses ORDER BY conversation_id, position').all()) {
      const response = JSON.parse(row.payload_json);
      response.nodes = [];
      responses.set(row.id, response);
      const conversation = conversations.get(row.conversation_id);
      if (conversation) conversation.responses.push(response);
    }

    for (const row of this.db.prepare('SELECT response_id, payload_json FROM working_nodes ORDER BY response_id, sequence, position').all()) {
      const node = JSON.parse(row.payload_json);
      const response = responses.get(row.response_id);
      if (response) response.nodes.push(node);
    }

    state.conversations = [...conversations.values()];
    state.prompts = this.db.prepare('SELECT payload_json FROM prompts ORDER BY updated_at DESC').all().map((row) => JSON.parse(row.payload_json));
    state.promptHistory = this.db.prepare('SELECT prompt_id, payload_json FROM prompt_history ORDER BY used_at DESC').all().map((row) => {
      const item = JSON.parse(row.payload_json);
      item.promptId = row.prompt_id;
      return item;
    });
    state.notes = this.db.prepare('SELECT conversation_id, payload_json FROM notes ORDER BY updated_at DESC').all().map((row) => {
      const item = JSON.parse(row.payload_json);
      item.conversationId = row.conversation_id;
      return item;
    });
    state.bookmarks = this.db.prepare('SELECT payload_json FROM bookmarks ORDER BY name COLLATE NOCASE').all().map((row) => JSON.parse(row.payload_json));
    state.browserHistory = this.db.prepare('SELECT payload_json FROM browser_history ORDER BY visited_at DESC LIMIT 1000').all().map((row) => JSON.parse(row.payload_json));
    state.promptQueue = this.db.prepare('SELECT payload_json FROM prompt_queue ORDER BY position').all().map((row) => JSON.parse(row.payload_json));
    state.settings = Object.fromEntries(this.db.prepare('SELECT key, value_json FROM workspace_settings').all().map((row) => [row.key, JSON.parse(row.value_json)]));
    if (state.settings.autoArchiveDays === undefined) state.settings.autoArchiveDays = 0;
    if (state.settings.autoDeleteDays === undefined) state.settings.autoDeleteDays = 0;
    this.state = state;
    this.normalizeState();
    return this.state;
  }

  persist() {
    this.normalizeState();
    const upsertFolder = this.db.prepare(
      'INSERT INTO folders (id, parent_id, name, position, color, icon, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id, name=excluded.name, position=excluded.position, color=excluded.color, icon=excluded.icon, payload_json=excluded.payload_json'
    );
    const upsertConversation = this.db.prepare(
      'INSERT INTO conversations (id, provider, title, source_url, created_at, updated_at, folder_id, pinned, archived_at, temporary, payload_json) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET provider=excluded.provider, title=excluded.title, source_url=excluded.source_url, created_at=excluded.created_at, updated_at=excluded.updated_at, folder_id=excluded.folder_id, pinned=excluded.pinned, archived_at=excluded.archived_at, temporary=excluded.temporary, payload_json=excluded.payload_json'
    );
    const upsertResponse = this.db.prepare(
      'INSERT INTO responses (id, conversation_id, source_message_id, captured_at, position, original_content, pinned, payload_json) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET conversation_id=excluded.conversation_id, source_message_id=excluded.source_message_id, captured_at=excluded.captured_at, position=excluded.position, original_content=excluded.original_content, pinned=excluded.pinned, payload_json=excluded.payload_json'
    );
    const upsertNode = this.db.prepare(
      'INSERT INTO working_nodes (id, response_id, parent_id, position, sequence, content, node_type, include_in_model_context, provenance, deleted_at, payload_json) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET response_id=excluded.response_id, parent_id=excluded.parent_id, position=excluded.position, sequence=excluded.sequence, content=excluded.content, node_type=excluded.node_type, include_in_model_context=excluded.include_in_model_context, provenance=excluded.provenance, deleted_at=excluded.deleted_at, payload_json=excluded.payload_json'
    );
    const upsertPrompt = this.db.prepare(
      'INSERT INTO prompts (id, title, category, favorite, usage_count, updated_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET title=excluded.title, category=excluded.category, favorite=excluded.favorite, usage_count=excluded.usage_count, updated_at=excluded.updated_at, payload_json=excluded.payload_json'
    );
    const upsertPromptHistory = this.db.prepare(
      'INSERT INTO prompt_history (id, prompt_id, prompt_title, provider, content, used_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET prompt_id=excluded.prompt_id, prompt_title=excluded.prompt_title, provider=excluded.provider, content=excluded.content, used_at=excluded.used_at, payload_json=excluded.payload_json'
    );
    const upsertNote = this.db.prepare(
      'INSERT INTO notes (id, conversation_id, title, content, pinned, updated_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET conversation_id=excluded.conversation_id, title=excluded.title, content=excluded.content, pinned=excluded.pinned, updated_at=excluded.updated_at, payload_json=excluded.payload_json'
    );
    const upsertBookmark = this.db.prepare(
      'INSERT INTO bookmarks (id, name, url, created_at, payload_json) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET name=excluded.name, url=excluded.url, created_at=excluded.created_at, payload_json=excluded.payload_json'
    );
    const upsertHistory = this.db.prepare(
      'INSERT INTO browser_history (id, title, url, visited_at, payload_json) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET title=excluded.title, url=excluded.url, visited_at=excluded.visited_at, payload_json=excluded.payload_json'
    );
    const upsertQueue = this.db.prepare(
      'INSERT INTO prompt_queue (id, position, title, content, created_at, payload_json) VALUES (?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET position=excluded.position, title=excluded.title, content=excluded.content, created_at=excluded.created_at, payload_json=excluded.payload_json'
    );
    const upsertSetting = this.db.prepare(
      'INSERT INTO workspace_settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json'
    );
    const upsertMetadata = this.db.prepare(
      'INSERT INTO app_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    );
    const upsertSearchDocument = this.db.prepare(
      'INSERT INTO search_documents (id, kind, entity_id, conversation_id, title, body) VALUES (?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, entity_id=excluded.entity_id, conversation_id=excluded.conversation_id, title=excluded.title, body=excluded.body ' +
      'WHERE search_documents.kind != excluded.kind OR search_documents.entity_id != excluded.entity_id OR ' +
      'search_documents.conversation_id IS NOT excluded.conversation_id OR search_documents.title != excluded.title OR search_documents.body != excluded.body'
    );

    const removeMissing = (table, records) => {
      const ids = new Set(records.map((record) => String(record.id)));
      const remove = this.db.prepare('DELETE FROM ' + table + ' WHERE id = ?');
      for (const row of this.db.prepare('SELECT id FROM ' + table).all()) {
        if (!ids.has(row.id)) remove.run(row.id);
      }
    };
    const without = (value, key) => {
      const result = { ...value };
      delete result[key];
      return result;
    };

    const transaction = this.db.transaction(() => {
      this.db.pragma('defer_foreign_keys = ON');

      for (const folder of this.state.folders) {
        upsertFolder.run(folder.id, folder.parentId || null, folder.name, folder.position || 0,
          folder.color || '#8db69a', folder.icon || '▤', JSON.stringify(folder));
      }
      for (const conversation of this.state.conversations) {
        const base = without(conversation, 'responses');
        upsertConversation.run(conversation.id, conversation.provider, conversation.title, conversation.sourceUrl,
          conversation.createdAt, conversation.updatedAt, conversation.folderId || null, Number(Boolean(conversation.pinned)),
          conversation.archivedAt || null, Number(Boolean(conversation.temporary)), JSON.stringify(base));
      }
      for (const conversation of this.state.conversations) {
        for (const [position, response] of (conversation.responses || []).entries()) {
          const base = without(response, 'nodes');
          upsertResponse.run(response.id, conversation.id, response.sourceMessageId || null, response.capturedAt,
            Number(response.position ?? position), response.originalContent || '', Number(Boolean(response.pinned)), JSON.stringify(base));
        }
      }
      for (const conversation of this.state.conversations) {
        for (const response of conversation.responses || []) {
          for (const node of response.nodes || []) {
            upsertNode.run(node.id, response.id, node.parentId || null, Number(node.position) || 0,
              Number(node.sequence ?? node.position) || 0, node.content || '', node.nodeType || 'paragraph',
              Number(Boolean(node.includeInModelContext)), node.provenance || 'captured', node.deletedAt || null,
              JSON.stringify(node));
          }
        }
      }
      for (const prompt of this.state.prompts) {
        upsertPrompt.run(prompt.id, prompt.title, prompt.category || 'General', Number(Boolean(prompt.favorite)),
          Number(prompt.usageCount) || 0, prompt.updatedAt || now(), JSON.stringify(prompt));
      }
      for (const item of this.state.promptHistory) {
        upsertPromptHistory.run(item.id, item.promptId || null, item.promptTitle || '', item.provider || null,
          item.content || '', item.usedAt || now(), JSON.stringify(item));
      }
      for (const note of this.state.notes) {
        upsertNote.run(note.id, note.conversationId || null, note.title || '', note.content || '',
          Number(Boolean(note.pinned)), note.updatedAt || now(), JSON.stringify(note));
      }
      for (const bookmark of this.state.bookmarks) {
        upsertBookmark.run(bookmark.id, bookmark.name || '', bookmark.url, bookmark.createdAt || now(), JSON.stringify(bookmark));
      }
      for (const item of this.state.browserHistory) {
        upsertHistory.run(item.id, item.title || '', item.url || '', item.visitedAt || now(), JSON.stringify(item));
      }
      for (const item of this.state.promptQueue) {
        upsertQueue.run(item.id, Number(item.position) || 0, item.title || '', item.content || '',
          item.createdAt || now(), JSON.stringify(item));
      }
      for (const [key, value] of Object.entries(this.state.settings || {})) {
        upsertSetting.run(key, JSON.stringify(value));
      }
      const settingKeys = Object.keys(this.state.settings || {});
      if (settingKeys.length) {
        this.db.prepare('DELETE FROM workspace_settings WHERE key NOT IN (' + settingKeys.map(() => '?').join(',') + ')')
          .run(...settingKeys);
      } else {
        this.db.exec('DELETE FROM workspace_settings');
      }

      const searchDocuments = [];
      for (const conversation of this.state.conversations) {
        searchDocuments.push({ id: 'conversation:' + conversation.id, kind: 'Conversation', entityId: conversation.id, conversationId: conversation.id, title: conversation.title || 'Conversation', body: conversation.sourceUrl || '' });
        for (const response of conversation.responses || []) {
          searchDocuments.push({ id: 'response:' + response.id, kind: 'Original Response', entityId: response.id, conversationId: conversation.id, title: conversation.title || 'Conversation', body: response.originalContent || '' });
          for (const node of response.nodes || []) if (!node.deletedAt) {
            searchDocuments.push({ id: 'node:' + node.id, kind: 'Working Node', entityId: node.id, conversationId: conversation.id, title: conversation.title || 'Conversation', body: node.content || '' });
          }
        }
      }
      for (const prompt of this.state.prompts) searchDocuments.push({ id: 'prompt:' + prompt.id, kind: 'Prompt', entityId: prompt.id, conversationId: null, title: prompt.title || '', body: [prompt.content, prompt.category, ...(prompt.tags || [])].join(' ') });
      for (const item of this.state.promptHistory) searchDocuments.push({ id: 'prompt-history:' + item.id, kind: 'Prompt History', entityId: item.id, conversationId: null, title: item.promptTitle || 'Previous prompt', body: item.content || '' });
      for (const note of this.state.notes) searchDocuments.push({ id: 'note:' + note.id, kind: 'Note', entityId: note.id, conversationId: note.conversationId || null, title: note.title || 'Untitled note', body: note.content || '' });
      for (const bookmark of this.state.bookmarks) searchDocuments.push({ id: 'bookmark:' + bookmark.id, kind: 'Bookmark', entityId: bookmark.id, conversationId: null, title: bookmark.name || bookmark.url, body: bookmark.url || '' });
      for (const item of this.state.browserHistory) searchDocuments.push({ id: 'history:' + item.id, kind: 'Browser History', entityId: item.id, conversationId: null, title: item.title || item.url, body: item.url || '' });
      for (const item of searchDocuments) upsertSearchDocument.run(item.id, item.kind, item.entityId, item.conversationId, item.title, item.body);
      removeMissing('search_documents', searchDocuments.map((item) => ({ id: item.id })));

      this.state.schemaVersion = 1;
      this.state.dataVersion = 2;
      upsertMetadata.run('schemaVersion', String(this.state.schemaVersion));
      upsertMetadata.run('dataVersion', String(this.state.dataVersion));
      upsertMetadata.run('bridgeToken', String(this.state.bridgeToken || ''));
      upsertMetadata.run('storage_initialized', '1');
      upsertMetadata.run('storageEngine', 'sqlite');
    });
    transaction();
  }

  searchWorkspace(input, limit = 80) {
    const query = cleanText(input, 400);
    if (!query) return [];
    const tokens = query.match(/[\p{L}\p{N}_-]+/gu) || [];
    if (!tokens.length) return [];
    const matchExpression = tokens.map((token) => '"' + token.replace(/"/g, '""') + '"*').join(' AND ');
    const maxResults = Math.max(1, Math.min(80, Number(limit) || 80));
    const rows = this.db.prepare(
      'SELECT d.kind, d.entity_id, d.conversation_id, d.title, d.body, ' +
      "snippet(workspace_fts, 1, '', '', '…', 18) AS excerpt " +
      'FROM workspace_fts JOIN search_documents d ON d.rowid = workspace_fts.rowid ' +
      'WHERE workspace_fts MATCH ? ORDER BY bm25(workspace_fts), d.title COLLATE NOCASE LIMIT ?'
    ).all(matchExpression, maxResults);
    return rows.map((row) => {
      const conversation = row.conversation_id ? this.state.conversations.find((item) => item.id === row.conversation_id) : null;
      const provider = conversation ? ({ chatgpt: 'ChatGPT', claude: 'Claude', deepseek: 'DeepSeek' }[conversation.provider] || conversation.provider) : null;
      const subtitles = {
        'Conversation': provider ? provider + ' · Conversation' : 'Conversation',
        'Original Response': provider ? provider + ' · Original response' : 'Original response',
        'Working Node': provider ? provider + ' · Working node' : 'Working node',
        'Prompt': 'Saved prompt',
        'Prompt History': 'Prompt history',
        'Note': row.conversation_id ? 'Conversation note' : 'Global note',
        'Bookmark': 'Saved website',
        'Browser History': 'Browser history',
      };
      return {
        id: row.entity_id, kind: row.kind, title: row.title, subtitle: subtitles[row.kind] || row.kind,
        excerpt: cleanText(row.excerpt || row.body || row.title, 500),
        ...(row.conversation_id ? { conversationId: row.conversation_id } : {}),
        ...(row.kind === 'Bookmark' || row.kind === 'Browser History' ? { url: row.body } : {}),
      };
    });
  }

  close() {
    if (!this.db || !this.db.open) return;
    try { this.db.pragma('wal_checkpoint(TRUNCATE)'); } catch {}
    this.db.close();
  }

  getBridgeInfo() {
    return { host: '127.0.0.1', port: 43821, token: this.state.bridgeToken };
  }

  getSnapshot() {
    const conversations = [...this.state.conversations]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((conversation) => ({
        ...conversation,
        responses: conversation.responses.map((response) => ({
          ...response,
          nodes: (response.nodes || []).filter((node) => !node.deletedAt),
        })),
        sharedContextPreview: this.buildContext(conversation),
      }));
    return {
      conversations,
      folders: [...this.state.folders].sort((a, b) => a.position - b.position),
      prompts: [...this.state.prompts].sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt.localeCompare(a.updatedAt)),
      promptHistory: [...this.state.promptHistory].slice(0, 100),
      notes: [...this.state.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      bookmarks: [...this.state.bookmarks].sort((a, b) => a.name.localeCompare(b.name)),
      browserHistory: [...this.state.browserHistory].slice(0, 200),
      promptQueue: [...this.state.promptQueue].sort((a, b) => a.position - b.position),
      settings: { ...this.state.settings },
    };
  }

  createFolder(input) {
    const name = cleanText(input?.name, 80);
    if (!name) throw new Error('Folder name is required.');
    const parentId = input?.parentId ? String(input.parentId) : null;
    if (parentId && !this.state.folders.some((folder) => folder.id === parentId)) {
      throw new Error('Parent folder not found.');
    }
    const timestamp = now();
    const siblings = this.state.folders.filter((folder) => (folder.parentId || null) === parentId);
    const folder = {
      id: crypto.randomUUID(),
      name,
      parentId,
      color: /^#[0-9a-f]{6}$/i.test(String(input?.color || '')) ? input.color : '#8db69a',
      icon: cleanText(input?.icon, 8) || '▤',
      position: siblings.length,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.state.folders.push(folder);
    this.persist();
    return { folderId: folder.id };
  }

  updateFolder(folderId, patch = {}) {
    const folder = this.state.folders.find((item) => item.id === folderId);
    if (!folder) throw new Error('Folder not found.');
    if (patch.name !== undefined) {
      const name = cleanText(patch.name, 80);
      if (!name) throw new Error('Folder name cannot be empty.');
      folder.name = name;
    }
    if (patch.color !== undefined && /^#[0-9a-f]{6}$/i.test(String(patch.color))) folder.color = patch.color;
    if (patch.icon !== undefined) folder.icon = cleanText(patch.icon, 8) || '▤';
    folder.updatedAt = now();
    this.persist();
    return { ok: true };
  }

  moveFolder(folderId, parentId = null) {
    const folder = this.state.folders.find((item) => item.id === String(folderId));
    if (!folder) throw new Error('Folder not found.');
    const nextParentId = parentId ? String(parentId) : null;
    if (nextParentId && !this.state.folders.some((item) => item.id === nextParentId)) {
      throw new Error('Target folder not found.');
    }

    let ancestorId = nextParentId;
    const visited = new Set();
    while (ancestorId) {
      if (ancestorId === folder.id) throw new Error('Moving this folder would create a hierarchy cycle.');
      if (visited.has(ancestorId)) throw new Error('The existing folder hierarchy contains a cycle.');
      visited.add(ancestorId);
      const ancestor = this.state.folders.find((item) => item.id === ancestorId);
      if (!ancestor) throw new Error('Target folder not found.');
      ancestorId = ancestor.parentId || null;
    }

    const previousParentId = folder.parentId || null;
    if (previousParentId === nextParentId) return { ok: true, moved: false };

    this.state.folders
      .filter((item) => (item.parentId || null) === previousParentId && item.id !== folder.id)
      .sort((a, b) => a.position - b.position)
      .forEach((item, index) => { item.position = index; });

    const targetSiblings = this.state.folders
      .filter((item) => (item.parentId || null) === nextParentId && item.id !== folder.id)
      .sort((a, b) => a.position - b.position);
    folder.parentId = nextParentId;
    folder.position = targetSiblings.length;
    folder.updatedAt = now();
    this.persist();
    return { ok: true, moved: true };
  }

  deleteFolder(folderId) {
    const folder = this.state.folders.find((item) => item.id === folderId);
    if (!folder) throw new Error('Folder not found.');
    for (const item of this.state.folders) {
      if (item.parentId === folderId) item.parentId = folder.parentId || null;
    }
    for (const conversation of this.state.conversations) {
      if (conversation.folderId === folderId) conversation.folderId = folder.parentId || null;
    }
    this.state.folders = this.state.folders.filter((item) => item.id !== folderId);
    this.persist();
    return { ok: true };
  }

  moveConversation(conversationId, folderId) {
    const conversation = this.state.conversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error('Conversation not found.');
    if (folderId && !this.state.folders.some((folder) => folder.id === folderId)) throw new Error('Folder not found.');
    conversation.folderId = folderId || null;
    conversation.updatedAt = now();
    this.persist();
    return { ok: true };
  }

  setConversationFlags(conversationId, patch = {}) {
    const conversation = this.state.conversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error('Conversation not found.');
    if (patch.pinned !== undefined) conversation.pinned = Boolean(patch.pinned);
    if (patch.archived !== undefined) conversation.archivedAt = patch.archived ? now() : null;
    if (patch.temporary !== undefined) conversation.temporary = Boolean(patch.temporary);
    conversation.updatedAt = now();
    this.persist();
    return { ok: true };
  }

  bulkSetConversationFlags(conversationIds, patch = {}) {
    const ids = new Set((Array.isArray(conversationIds) ? conversationIds : []).map(String));
    if (!ids.size) return { updated: 0 };
    const timestamp = now();
    let updated = 0;
    for (const conversation of this.state.conversations) {
      if (!ids.has(conversation.id)) continue;
      if (patch.pinned !== undefined) conversation.pinned = Boolean(patch.pinned);
      if (patch.archived !== undefined) {
        conversation.archivedAt = patch.archived
          ? (conversation.archivedAt || timestamp)
          : null;
      }
      if (patch.temporary !== undefined) conversation.temporary = Boolean(patch.temporary);
      conversation.updatedAt = timestamp;
      updated += 1;
    }
    if (updated) this.persist();
    return { updated };
  }

  bulkMoveConversations(conversationIds, folderId = null) {
    const ids = new Set((Array.isArray(conversationIds) ? conversationIds : []).map(String));
    if (!ids.size) return { moved: 0 };
    const targetFolderId = folderId ? String(folderId) : null;
    if (targetFolderId && !this.state.folders.some((folder) => folder.id === targetFolderId)) {
      throw new Error('Target folder not found.');
    }
    const timestamp = now();
    let moved = 0;
    for (const conversation of this.state.conversations) {
      if (!ids.has(conversation.id)) continue;
      conversation.folderId = targetFolderId;
      conversation.updatedAt = timestamp;
      moved += 1;
    }
    if (moved) this.persist();
    return { moved };
  }

  bulkDeleteConversations(conversationIds) {
    const ids = new Set((Array.isArray(conversationIds) ? conversationIds : []).map(String));
    if (!ids.size) return { deleted: 0 };
    const before = this.state.conversations.length;
    this.state.conversations = this.state.conversations.filter((item) => !ids.has(item.id));
    this.state.notes = this.state.notes.filter((note) => !note.conversationId || !ids.has(note.conversationId));
    for (const conversation of this.state.conversations) {
      conversation.referenceConversationIds = (conversation.referenceConversationIds || []).filter((id) => !ids.has(id));
    }
    this.persist();
    return { deleted: before - this.state.conversations.length };
  }

  savePrompt(input = {}) {
    const title = cleanText(input.title, 120);
    const content = cleanText(input.content, 12000);
    if (!title || !content) throw new Error('Prompt title and content are required.');
    const timestamp = now();
    const existing = input.id ? this.state.prompts.find((item) => item.id === String(input.id)) : null;
    const prompt = existing || {
      id: crypto.randomUUID(),
      createdAt: timestamp,
      favorite: false,
      usageCount: 0,
    };
    prompt.title = title;
    prompt.content = content;
    prompt.category = cleanText(input.category, 60) || 'General';
    prompt.tags = Array.isArray(input.tags) ? [...new Set(input.tags.map((tag) => cleanText(tag, 30)).filter(Boolean))].slice(0, 20) : [];
    prompt.kind = input.kind === 'chain' ? 'chain' : 'prompt';
    prompt.steps = prompt.kind === 'chain' && Array.isArray(input.steps)
      ? input.steps.map((step) => cleanText(step, 12000)).filter(Boolean).slice(0, 30)
      : [];
    prompt.favorite = input.favorite === undefined ? Boolean(prompt.favorite) : Boolean(input.favorite);
    prompt.updatedAt = timestamp;
    if (!existing) this.state.prompts.push(prompt);
    this.persist();
    return { promptId: prompt.id };
  }

  deletePrompt(promptId) {
    this.state.prompts = this.state.prompts.filter((item) => item.id !== promptId);
    for (const item of this.state.promptHistory) if (item.promptId === promptId) item.promptId = null;
    for (const item of this.state.promptHistory) if (item.promptId === promptId) item.promptId = null;
    this.persist();
    return { ok: true };
  }

  setPromptFavorite(promptId, favorite) {
    const prompt = this.state.prompts.find((item) => item.id === promptId);
    if (!prompt) throw new Error('Prompt not found.');
    prompt.favorite = Boolean(favorite);
    prompt.updatedAt = now();
    this.persist();
    return { ok: true };
  }

  expandPrompt(promptId, variables = {}) {
    const prompt = this.state.prompts.find((item) => item.id === promptId);
    if (!prompt) throw new Error('Prompt not found.');
    const content = prompt.content.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (_match, key) => {
      return Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : `{{${key}}}`;
    });
    prompt.usageCount = (prompt.usageCount || 0) + 1;
    prompt.updatedAt = now();
    this.state.promptHistory.unshift({
      id: crypto.randomUUID(),
      promptId: prompt.id,
      promptTitle: prompt.title,
      content,
      usedAt: now(),
    });
    this.state.promptHistory = this.state.promptHistory.slice(0, 200);
    this.persist();
    return { content, variables: [...new Set([...prompt.content.matchAll(/\{\{([a-zA-Z0-9_-]+)\}\}/g)].map((match) => match[1]))] };
  }

  recordPromptHistory(content, provider = null) {
    const value = cleanText(content, 12000);
    if (!value) return { ok: false };
    this.state.promptHistory.unshift({
      id: crypto.randomUUID(),
      promptId: null,
      promptTitle: 'Manual prompt',
      content: value,
      provider: cleanText(provider, 24) || null,
      usedAt: now(),
    });
    this.state.promptHistory = this.state.promptHistory.slice(0, 200);
    this.persist();
    return { ok: true };
  }

  importPrompts(input) {
    const items = Array.isArray(input) ? input : input?.prompts;
    if (!Array.isArray(items)) throw new Error('Prompt import must contain a prompts array.');
    let imported = 0;
    for (const item of items.slice(0, 1000)) {
      try {
        this.savePrompt({
          title: item.title,
          content: item.content,
          category: item.category,
          tags: item.tags,
          kind: item.kind,
          steps: item.steps,
          favorite: item.favorite,
        });
        imported += 1;
      } catch {}
    }
    return { imported };
  }

  exportPrompts() {
    return JSON.stringify({ version: 1, prompts: this.state.prompts }, null, 2);
  }

  removePromptQueueItem(itemId) {
    this.state.promptQueue = this.state.promptQueue.filter((item) => item.id !== itemId);
    this.state.promptQueue.forEach((item, index) => { item.position = index; });
    this.persist();
    return { ok: true };
  }

  enqueuePrompt(content, title = 'Queued prompt') {
    const value = cleanText(content, 12000);
    if (!value) throw new Error('Prompt content is required.');
    const item = {
      id: crypto.randomUUID(),
      title: cleanText(title, 120) || 'Queued prompt',
      content: value,
      position: this.state.promptQueue.length,
      createdAt: now(),
    };
    this.state.promptQueue.push(item);
    this.persist();
    return { itemId: item.id };
  }

  saveNote(input = {}) {
    const content = cleanText(input.content, 30000);
    if (!content) throw new Error('Note content is required.');
    const conversationId = input.conversationId ? String(input.conversationId) : null;
    if (conversationId && !this.state.conversations.some((item) => item.id === conversationId)) {
      throw new Error('Conversation not found.');
    }
    const timestamp = now();
    const existing = input.id ? this.state.notes.find((item) => item.id === String(input.id)) : null;
    const note = existing || { id: crypto.randomUUID(), createdAt: timestamp, pinned: false };
    note.title = cleanText(input.title, 120) || content.split('\n')[0].slice(0, 80) || 'Untitled note';
    note.content = content;
    note.conversationId = conversationId;
    note.pinned = input.pinned === undefined ? Boolean(note.pinned) : Boolean(input.pinned);
    note.updatedAt = timestamp;
    if (!existing) this.state.notes.push(note);
    this.persist();
    return { noteId: note.id };
  }

  deleteNote(noteId) {
    this.state.notes = this.state.notes.filter((item) => item.id !== noteId);
    this.persist();
    return { ok: true };
  }

  setConversationReferences(conversationId, referenceIds) {
    const conversation = this.state.conversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error('Conversation not found.');
    const ids = [...new Set((Array.isArray(referenceIds) ? referenceIds : []).map(String))]
      .filter((id) => id !== conversationId && this.state.conversations.some((item) => item.id === id));
    conversation.referenceConversationIds = ids.slice(0, 20);
    conversation.updatedAt = now();
    this.persist();
    return { ok: true };
  }

  addBookmark(input = {}) {
    let url;
    try { url = new URL(String(input.url || '')); } catch { throw new Error('A valid bookmark URL is required.'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only web URLs can be bookmarked.');
    const normalized = url.href;
    const existing = this.state.bookmarks.find((item) => item.url === normalized);
    if (existing) return { bookmarkId: existing.id, created: false };
    const bookmark = {
      id: crypto.randomUUID(),
      name: cleanText(input.name, 160) || url.hostname,
      url: normalized,
      createdAt: now(),
    };
    this.state.bookmarks.push(bookmark);
    this.persist();
    return { bookmarkId: bookmark.id, created: true };
  }

  deleteBookmark(bookmarkId) {
    this.state.bookmarks = this.state.bookmarks.filter((item) => item.id !== bookmarkId);
    this.persist();
    return { ok: true };
  }

  recordBrowserVisit(input = {}) {
    let url;
    try { url = new URL(String(input.url || '')); } catch { return { ok: false }; }
    if (!['http:', 'https:'].includes(url.protocol)) return { ok: false };
    const visit = {
      id: crypto.randomUUID(),
      url: url.href,
      title: cleanText(input.title, 200) || url.hostname,
      visitedAt: now(),
    };
    this.state.browserHistory.unshift(visit);
    this.state.browserHistory = this.state.browserHistory.slice(0, 1000);
    this.persist();
    return { ok: true };
  }

  updateWorkspaceSettings(patch = {}) {
    const next = { ...this.state.settings };
    for (const key of ['autoArchiveDays', 'autoDeleteDays']) {
      if (patch[key] !== undefined) {
        const value = Math.max(0, Math.min(3650, Number(patch[key]) || 0));
        next[key] = value;
      }
    }
    this.state.settings = next;
    this.persist();
    return { ok: true };
  }

  getConversationExport(conversationId, responseIds = null) {
    const conversation = this.state.conversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error('Conversation not found.');
    const allowed = Array.isArray(responseIds) && responseIds.length ? new Set(responseIds.map(String)) : null;
    return {
      ...conversation,
      responses: conversation.responses
        .filter((response) => !allowed || allowed.has(response.id))
        .map((response) => ({
          ...response,
          nodes: (response.nodes || []).filter((node) => !node.deletedAt),
        })),
    };
  }

  capture(input) {
    const provider = cleanText(input.provider, 24).toLowerCase();
    if (!SUPPORTED_PROVIDERS.has(provider)) throw new Error('Unsupported AI provider.');

    const sourceUrl = normaliseSourceUrl(input.sourceUrl);
    const sourceHost = new URL(sourceUrl).hostname.toLowerCase();
    const providerMatches = provider === 'chatgpt'
      ? sourceHost === 'chatgpt.com' || sourceHost === 'chat.openai.com'
      : provider === 'claude'
        ? sourceHost === 'claude.ai'
        : sourceHost === 'deepseek.com' || sourceHost.endsWith('.deepseek.com');
    if (!providerMatches) throw new Error('Provider does not match the source website.');
    const title = cleanText(input.title, 240) || 'Untitled conversation';
    const originalContent = cleanText(input.text, MAX_TEXT_LENGTH);
    if (!originalContent) throw new Error('The captured response is empty.');

    let conversation = this.state.conversations.find((item) => item.sourceUrl === sourceUrl);
    if (!conversation) {
      conversation = {
        id: crypto.randomUUID(),
        provider,
        title,
        sourceUrl,
        createdAt: now(),
        updatedAt: now(),
        responses: [],
        folderId: null,
        pinned: false,
        archivedAt: null,
        temporary: false,
        referenceConversationIds: [],
      };
      this.state.conversations.push(conversation);
    } else {
      conversation.title = title || conversation.title;
      conversation.provider = provider;
      if (!Array.isArray(conversation.referenceConversationIds)) conversation.referenceConversationIds = [];
    }

    const sourceMessageId = cleanText(input.sourceMessageId, 200) || null;
    const contentFingerprint = fingerprint(originalContent);
    const duplicate = conversation.responses.find((response) =>
      sourceMessageId
        ? response.sourceMessageId === sourceMessageId
        : response.fingerprint === contentFingerprint,
    );

    if (duplicate && duplicate.fingerprint === contentFingerprint) {
      return { created: false, updated: false, conversationId: conversation.id, responseId: duplicate.id };
    }

    const nodeSpecs = parseMarkdownNodes(originalContent);
    if (!nodeSpecs.length) throw new Error('The captured response did not contain readable Markdown blocks.');
    const capturedAt = now();

    if (duplicate) {
      const existingBySequence = new Map(
        (duplicate.nodes || [])
          .filter((node) => !node.deletedAt && node.provenance !== 'human-created')
          .map((node) => [Number(node.sequence), node]),
      );
      const nodeIds = nodeSpecs.map((_, index) => existingBySequence.get(index)?.id || crypto.randomUUID());
      const refreshedNodes = nodeSpecs.map((spec, index) => {
        const previous = existingBySequence.get(index);
        const sourceContent = spec.content;
        return {
          id: nodeIds[index],
          parentId: spec.parentIndex === null ? null : nodeIds[spec.parentIndex],
          content: previous && previous.provenance !== 'captured' ? previous.content : sourceContent,
          initialContent: sourceContent,
          position: spec.position,
          sequence: index,
          nodeType: spec.nodeType,
          headingLevel: spec.headingLevel || null,
          listOrdered: Boolean(spec.listOrdered),
          listStart: spec.listStart || 1,
          listIndex: spec.listIndex ?? spec.position,
          provenance: previous?.provenance || 'captured',
          includeInModelContext: Boolean(previous?.includeInModelContext),
          createdAt: previous?.createdAt || capturedAt,
          updatedAt: capturedAt,
          deletedAt: null,
        };
      });
      const refreshedIds = new Set(refreshedNodes.map((node) => node.id));
      const retainedNodes = (duplicate.nodes || [])
        .filter((node) => !refreshedIds.has(node.id))
        .map((node) => node.provenance === 'captured' && node.content === node.initialContent && !node.deletedAt
          ? { ...node, deletedAt: capturedAt, updatedAt: capturedAt }
          : node);

      duplicate.originalContent = originalContent;
      duplicate.fingerprint = contentFingerprint;
      duplicate.contentFormat = 'markdown';
      duplicate.updatedAt = capturedAt;
      duplicate.nodes = [...refreshedNodes, ...retainedNodes];
      conversation.updatedAt = capturedAt;
      this.persist();
      return { created: false, updated: true, conversationId: conversation.id, responseId: duplicate.id };
    }

    const nodeIds = nodeSpecs.map(() => crypto.randomUUID());
    const response = {
      id: crypto.randomUUID(),
      sourceMessageId,
      fingerprint: contentFingerprint,
      contentFormat: 'markdown',
      pinned: false,
      originalContent,
      capturedAt,
      nodes: nodeSpecs.map((spec, index) => ({
        id: nodeIds[index],
        parentId: spec.parentIndex === null ? null : nodeIds[spec.parentIndex],
        content: spec.content,
        initialContent: spec.content,
        position: spec.position,
        sequence: index,
        nodeType: spec.nodeType,
        headingLevel: spec.headingLevel || null,
        listOrdered: Boolean(spec.listOrdered),
        listStart: spec.listStart || 1,
        listIndex: spec.listIndex ?? spec.position,
        provenance: 'captured',
        includeInModelContext: false,
        createdAt: capturedAt,
        updatedAt: capturedAt,
        deletedAt: null,
      })),
    };

    conversation.responses.push(response);
    conversation.updatedAt = capturedAt;
    this.persist();
    return { created: true, conversationId: conversation.id, responseId: response.id };
  }

  findNode(nodeId) {
    for (const conversation of this.state.conversations) {
      for (const response of conversation.responses) {
        const node = (response.nodes || []).find((item) => item.id === nodeId && !item.deletedAt);
        if (node) return { conversation, response, node };
      }
    }
    throw new Error('Node not found.');
  }

  updateNode(nodeId, content) {
    const { conversation, node } = this.findNode(nodeId);
    const nextContent = cleanText(content);
    if (node.content !== nextContent) {
      node.content = nextContent;
      node.provenance = node.provenance === 'captured' ? 'human-edited' : node.provenance;
      node.updatedAt = now();
      conversation.updatedAt = node.updatedAt;
      this.persist();
    }
    return { ok: true };
  }

  setNodeContext(nodeId, includeInModelContext) {
    const { conversation, node } = this.findNode(nodeId);
    node.includeInModelContext = Boolean(includeInModelContext);
    node.updatedAt = now();
    conversation.updatedAt = node.updatedAt;
    this.persist();
    return { ok: true };
  }

  createChildNode(responseId, parentId) {
    for (const conversation of this.state.conversations) {
      const response = conversation.responses.find((item) => item.id === responseId);
      if (!response) continue;
      if (parentId && !(response.nodes || []).some((node) => node.id === parentId && !node.deletedAt)) {
        throw new Error('Parent node not found in this response.');
      }
      const timestamp = now();
      const siblings = (response.nodes || []).filter((item) => (item.parentId || null) === (parentId || null));
      const nextSequence = (response.nodes || []).reduce((max, item) => Math.max(max, Number(item.sequence) || 0), -1) + 1;
      const node = {
        id: crypto.randomUUID(),
        parentId: parentId || null,
        content: '',
        initialContent: '',
        position: siblings.length,
        sequence: nextSequence,
        nodeType: 'paragraph',
        headingLevel: null,
        listOrdered: false,
        listStart: 1,
        provenance: 'human-created',
        includeInModelContext: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };
      response.nodes.push(node);
      conversation.updatedAt = timestamp;
      this.persist();
      return { nodeId: node.id };
    }
    throw new Error('Response not found.');
  }

  createSiblingNode(nodeId, content = '') {
    const { conversation, response, node } = this.findNode(nodeId);
    const siblings = (response.nodes || []).filter((item) => !item.deletedAt && (item.parentId || null) === (node.parentId || null)).sort((a, b) => a.position - b.position);
    if (!siblings.some((item) => item.id === node.id)) throw new Error('Node is not present in its parent outline.');
    const position = node.position + 1;
    for (const sibling of siblings) if (sibling.position >= position) sibling.position += 1;
    const timestamp = now();
    const sequence = (response.nodes || []).reduce((max, item) => Math.max(max, Number(item.sequence) || 0), -1) + 1;
    const value = cleanText(content);
    const created = {
      id: crypto.randomUUID(), parentId: node.parentId || null, content: value, initialContent: value,
      position, sequence, nodeType: 'paragraph', headingLevel: null, listOrdered: false, listStart: 1,
      listIndex: position, provenance: 'human-created', includeInModelContext: false,
      createdAt: timestamp, updatedAt: timestamp, deletedAt: null,
    };
    response.nodes.push(created);
    conversation.updatedAt = timestamp;
    this.persist();
    return { nodeId: created.id };
  }

  moveNode(nodeId, direction) {
    const { conversation, response, node } = this.findNode(nodeId);
    const nodes = (response.nodes || []).filter((item) => !item.deletedAt);
    const parentId = (item) => item.parentId || null;
    const previousParent = parentId(node);
    const siblings = (id) => nodes.filter((item) => parentId(item) === (id || null)).sort((a, b) => a.position - b.position);
    let nextParent = previousParent;

    if (direction === 'up' || direction === 'down') {
      const group = siblings(previousParent);
      const index = group.findIndex((item) => item.id === node.id);
      const target = group[index + (direction === 'up' ? -1 : 1)];
      if (!target) return { ok: false, parentId: previousParent };
      const position = node.position;
      node.position = target.position;
      target.position = position;
    } else if (direction === 'indent') {
      const group = siblings(previousParent);
      const index = group.findIndex((item) => item.id === node.id);
      const targetParent = group[index - 1];
      if (!targetParent) return { ok: false, parentId: previousParent };
      nextParent = targetParent.id;
      node.parentId = nextParent;
      node.position = siblings(nextParent).filter((item) => item.id !== node.id).length;
    } else if (direction === 'outdent') {
      if (!node.parentId) return { ok: false, parentId: null };
      const parent = nodes.find((item) => item.id === node.parentId);
      if (!parent) return { ok: false, parentId: previousParent };
      nextParent = parentId(parent);
      const targetGroup = siblings(nextParent).filter((item) => item.id !== node.id);
      const parentIndex = targetGroup.findIndex((item) => item.id === parent.id);
      if (parentIndex < 0) return { ok: false, parentId: previousParent };
      const insertion = parentIndex + 1;
      for (const sibling of targetGroup) if (sibling.position >= insertion) sibling.position += 1;
      node.parentId = nextParent;
      node.position = insertion;
    } else {
      throw new Error('Unsupported node movement.');
    }

    const normalise = (id) => siblings(id).sort((a, b) => a.position - b.position).forEach((item, index) => { item.position = index; });
    normalise(previousParent);
    if (nextParent !== previousParent) normalise(nextParent);
    const timestamp = now();
    node.updatedAt = timestamp;
    conversation.updatedAt = timestamp;
    this.persist();
    return { ok: true, parentId: node.parentId || null };
  }

  setResponsePinned(responseId, pinned) {
    for (const conversation of this.state.conversations) {
      const response = conversation.responses.find((item) => item.id === responseId);
      if (!response) continue;
      response.pinned = Boolean(pinned);
      conversation.updatedAt = now();
      this.persist();
      return { ok: true };
    }
    throw new Error('Response not found.');
  }

  deleteNode(nodeId) {
    const { conversation, response } = this.findNode(nodeId);
    const allNodes = response.nodes || [];
    const idsToDelete = new Set([nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of allNodes) {
        if (node.parentId && idsToDelete.has(node.parentId) && !idsToDelete.has(node.id)) {
          idsToDelete.add(node.id);
          changed = true;
        }
      }
    }
    const timestamp = now();
    for (const node of allNodes) {
      if (idsToDelete.has(node.id)) {
        node.deletedAt = timestamp;
        node.includeInModelContext = false;
      }
    }
    conversation.updatedAt = timestamp;
    this.persist();
    return { ok: true };
  }

  buildContext(conversation, visited = new Set()) {
    if (visited.has(conversation.id)) return '';
    visited.add(conversation.id);
    const allNodes = flattenNodes(conversation)
      .filter((node) => !node.deletedAt)
      .sort((a, b) => (a.sequence ?? a.position) - (b.sequence ?? b.position));
    const childrenByParent = new Map();
    for (const node of allNodes) {
      const key = node.parentId || 'root';
      if (!childrenByParent.has(key)) childrenByParent.set(key, []);
      childrenByParent.get(key).push(node);
    }

    for (const siblings of childrenByParent.values()) siblings.sort((a, b) => Number(a.position ?? a.sequence ?? 0) - Number(b.position ?? b.sequence ?? 0));

    const lines = [];
    const visit = (parentId, depth) => {
      const children = childrenByParent.get(parentId || 'root') || [];
      for (const node of children) {
        let nextDepth = depth;
        if (node.includeInModelContext && node.content.trim()) {
          const indent = '  '.repeat(depth);
          const content = String(node.content).replace(/\n/g, '\n' + indent + '  ');
          if (node.nodeType === 'list-item') {
            const marker = node.listOrdered
              ? String((node.listIndex ?? node.position ?? 0) + (node.listStart || 1)) + '. '
              : '- ';
            lines.push(indent + marker + content);
            nextDepth += 1;
          } else {
            lines.push(indent + content);
          }
        }
        visit(node.id, nextDepth);
      }
    };
    visit(null, 0);

    const sections = [];
    if (lines.length) sections.push(`Source: ${conversation.provider} — ${conversation.title}\n${lines.join('\n')}`);
    for (const referenceId of conversation.referenceConversationIds || []) {
      if (referenceId === conversation.id) continue;
      const reference = this.state.conversations.find((item) => item.id === referenceId);
      if (!reference) continue;
      const referenceContext = this.buildContext(reference, new Set(visited));
      if (referenceContext) sections.push(referenceContext.slice('[WillAI-C shared context]'.length, -'[End WillAI-C shared context]'.length).trim());
    }

    if (!sections.length) return '';
    return [
      '[WillAI-C shared context]',
      ...sections,
      '[End WillAI-C shared context]',
    ].join('\n\n');
  }

  exportConversationContent(conversationId, format, responseIds = null) {
    const conversation = this.getConversationExport(conversationId, responseIds);
    const responses = conversation.responses;
    if (format === 'json') return JSON.stringify(conversation, null, 2);
    if (format === 'txt') {
      return responses.map((response, index) =>
        'Response ' + (index + 1) + ' — ' + new Date(response.capturedAt).toLocaleString() + '\n\n'
        + response.originalContent,
      ).join('\n\n' + '='.repeat(72) + '\n\n');
    }
    if (format === 'html') {
      const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      })[char]);
      const markdown = new (require('markdown-it'))({ html: false, linkify: true });
      const body = responses.map((response, index) =>
        '<section><h2>Response ' + (index + 1) + '</h2><p class="meta">' + escape(response.capturedAt) + '</p>'
        + markdown.render(response.originalContent) + '</section>',
      ).join('\n');
      return '<!doctype html><html><head><meta charset="utf-8"><title>' + escape(conversation.title)
        + '</title><style>body{font:16px/1.65 system-ui;max-width:900px;margin:40px auto;padding:0 24px;color:#20252b}h1,h2{line-height:1.25}section{border-top:1px solid #ddd;padding:24px 0}.meta{color:#68727e;font-size:12px}pre{overflow:auto;background:#f3f5f7;padding:16px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 10px}</style></head><body>'
        + '<h1>' + escape(conversation.title) + '</h1><p>' + escape(conversation.provider) + ' · '
        + escape(conversation.sourceUrl) + '</p>' + body + '</body></html>';
    }
    const heading = '# ' + conversation.title + '\n\nProvider: ' + conversation.provider
      + '\nSource: ' + conversation.sourceUrl + '\n\n';
    const body = responses.map((response, index) =>
      '## Response ' + (index + 1) + '\n\nCaptured: ' + response.capturedAt + '\n\n' + response.originalContent,
    ).join('\n\n---\n\n');
    return heading + body + '\n';
  }

  getContextForSource(sourceUrl) {
    const normalised = normaliseSourceUrl(sourceUrl);
    const conversation = this.state.conversations.find((item) => item.sourceUrl === normalised);
    return { context: conversation ? this.buildContext(conversation) : '' };
  }
}

module.exports = { LocalStore, normaliseSourceUrl };
