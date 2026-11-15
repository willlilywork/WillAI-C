const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseMarkdownNodes } = require('./markdown-nodes.cjs');

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
    fs.mkdirSync(userDataPath, { recursive: true });
    this.state = this.load();
    if (!fs.existsSync(this.filePath) || this.needsPersist) this.persist();
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
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
        if (conversation.folderId === undefined) conversation.folderId = null;
        if (conversation.pinned === undefined) conversation.pinned = false;
        if (conversation.archivedAt === undefined) conversation.archivedAt = null;
        if (conversation.temporary === undefined) conversation.temporary = false;
      }
      return parsed;
    } catch (error) {
      const backupPath = `${this.filePath}.corrupt-${Date.now()}`;
      fs.renameSync(this.filePath, backupPath);
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
  }

  persist() {
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
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

    if (duplicate) {
      conversation.updatedAt = now();
      this.persist();
      return { created: false, conversationId: conversation.id, responseId: duplicate.id };
    }

    const nodeSpecs = parseMarkdownNodes(originalContent);
    if (!nodeSpecs.length) throw new Error('The captured response did not contain readable Markdown blocks.');
    const capturedAt = now();
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
