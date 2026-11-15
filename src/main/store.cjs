const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

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
    if (!fs.existsSync(this.filePath)) this.persist();
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return {
        schemaVersion: 1,
        bridgeToken: crypto.randomBytes(32).toString('hex'),
        conversations: [],
      };
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.conversations)) {
        throw new Error('Unsupported local data schema.');
      }
      if (!parsed.bridgeToken) parsed.bridgeToken = crypto.randomBytes(32).toString('hex');
      return parsed;
    } catch (error) {
      const backupPath = `${this.filePath}.corrupt-${Date.now()}`;
      fs.renameSync(this.filePath, backupPath);
      return {
        schemaVersion: 1,
        bridgeToken: crypto.randomBytes(32).toString('hex'),
        conversations: [],
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
    return { conversations };
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
      };
      this.state.conversations.push(conversation);
    } else {
      conversation.title = title || conversation.title;
      conversation.provider = provider;
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

    const suppliedBlocks = Array.isArray(input.blocks)
      ? input.blocks.map((block) => cleanText(block)).filter(Boolean)
      : [];
    const blocks = suppliedBlocks.length
      ? suppliedBlocks
      : originalContent.split(/\n\s*\n/).map(cleanText).filter(Boolean);
    const safeBlocks = blocks.length ? blocks : [originalContent];
    const capturedAt = now();
    const response = {
      id: crypto.randomUUID(),
      sourceMessageId,
      fingerprint: contentFingerprint,
      originalContent,
      capturedAt,
      nodes: safeBlocks.map((content, index) => ({
        id: crypto.randomUUID(),
        parentId: null,
        content,
        initialContent: content,
        position: index,
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
      const node = {
        id: crypto.randomUUID(),
        parentId: parentId || null,
        content: '',
        initialContent: '',
        position: response.nodes.length,
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

  buildContext(conversation) {
    const nodes = flattenNodes(conversation)
      .filter((node) => !node.deletedAt && node.includeInModelContext && node.content.trim())
      .sort((a, b) => a.position - b.position);

    if (!nodes.length) return '';
    const sections = nodes.map((node, index) => `${index + 1}. ${node.content}`);
    return [
      '[WillAI-C shared context]',
      `Source: ${conversation.provider} — ${conversation.title}`,
      ...sections,
      '[End WillAI-C shared context]',
    ].join('\n\n');
  }

  getContextForSource(sourceUrl) {
    const normalised = normaliseSourceUrl(sourceUrl);
    const conversation = this.state.conversations.find((item) => item.sourceUrl === normalised);
    return { context: conversation ? this.buildContext(conversation) : '' };
  }
}

module.exports = { LocalStore, normaliseSourceUrl };
