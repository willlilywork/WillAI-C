const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getSnapshot: () => ipcRenderer.invoke('willai:get-snapshot'),
  searchWorkspace: (query, limit) => ipcRenderer.invoke('willai:search-workspace', query, limit),
  getBrowserState: () => ipcRenderer.invoke('willai:get-browser-state'),
  createTab: (url) => ipcRenderer.invoke('willai:create-tab', url),
  activateTab: (tabId) => ipcRenderer.invoke('willai:activate-tab', tabId),
  closeTab: (tabId) => ipcRenderer.invoke('willai:close-tab', tabId),
  navigate: (value) => ipcRenderer.invoke('willai:navigate', value),
  goBack: () => ipcRenderer.invoke('willai:go-back'),
  goForward: () => ipcRenderer.invoke('willai:go-forward'),
  reload: () => ipcRenderer.invoke('willai:reload'),
  setBrowserBounds: (bounds) => ipcRenderer.invoke('willai:set-browser-bounds', bounds),
  insertContext: (conversationId) => ipcRenderer.invoke('willai:insert-context', conversationId),
  updateNode: (nodeId, content) => ipcRenderer.invoke('willai:update-node', nodeId, content),
  setNodeContext: (nodeId, enabled) => ipcRenderer.invoke('willai:set-node-context', nodeId, enabled),
  createChildNode: (responseId, parentId) => ipcRenderer.invoke('willai:create-child-node', responseId, parentId ?? null),
  createSiblingNode: (nodeId, content) => ipcRenderer.invoke('willai:create-sibling-node', nodeId, content ?? ''),
  moveNode: (nodeId, direction) => ipcRenderer.invoke('willai:move-node', nodeId, direction),
  deleteNode: (nodeId) => ipcRenderer.invoke('willai:delete-node', nodeId),
  setResponsePinned: (responseId, pinned) => ipcRenderer.invoke('willai:set-response-pinned', responseId, pinned),
  copyText: (text) => ipcRenderer.invoke('willai:copy-text', String(text ?? '')),
  createFolder: (input) => ipcRenderer.invoke('willai:create-folder', input),
  updateFolder: (folderId, patch) => ipcRenderer.invoke('willai:update-folder', folderId, patch),
  deleteFolder: (folderId) => ipcRenderer.invoke('willai:delete-folder', folderId),
  moveConversation: (conversationId, folderId) => ipcRenderer.invoke('willai:move-conversation', conversationId, folderId),
  setConversationFlags: (conversationId, patch) => ipcRenderer.invoke('willai:set-conversation-flags', conversationId, patch),
  bulkDeleteConversations: (ids) => ipcRenderer.invoke('willai:bulk-delete-conversations', ids),
  savePrompt: (input) => ipcRenderer.invoke('willai:save-prompt', input),
  deletePrompt: (promptId) => ipcRenderer.invoke('willai:delete-prompt', promptId),
  setPromptFavorite: (promptId, favorite) => ipcRenderer.invoke('willai:set-prompt-favorite', promptId, favorite),
  expandPrompt: (promptId, variables) => ipcRenderer.invoke('willai:expand-prompt', promptId, variables),
  recordPromptHistory: (content, provider) => ipcRenderer.invoke('willai:record-prompt-history', content, provider),
  enqueuePrompt: (content, title) => ipcRenderer.invoke('willai:enqueue-prompt', content, title),
  removePromptQueueItem: (itemId) => ipcRenderer.invoke('willai:remove-prompt-queue-item', itemId),
  insertPrompt: (content) => ipcRenderer.invoke('willai:insert-prompt', content),
  saveNote: (input) => ipcRenderer.invoke('willai:save-note', input),
  deleteNote: (noteId) => ipcRenderer.invoke('willai:delete-note', noteId),
  setConversationReferences: (conversationId, references) => ipcRenderer.invoke('willai:set-conversation-references', conversationId, references),
  addBookmark: (input) => ipcRenderer.invoke('willai:add-bookmark', input),
  deleteBookmark: (bookmarkId) => ipcRenderer.invoke('willai:delete-bookmark', bookmarkId),
  updateWorkspaceSettings: (patch) => ipcRenderer.invoke('willai:update-workspace-settings', patch),
  exportConversation: (conversationId, format, responseIds) => ipcRenderer.invoke('willai:export-conversation', conversationId, format, responseIds),
  exportPrompts: () => ipcRenderer.invoke('willai:export-prompts'),
  importPrompts: () => ipcRenderer.invoke('willai:import-prompts'),
  onBrowserState: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('willai:browser-state', listener);
    return () => ipcRenderer.removeListener('willai:browser-state', listener);
  },
  onCapture: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('willai:capture-received', listener);
    return () => ipcRenderer.removeListener('willai:capture-received', listener);
  },
  onSnapshotChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('willai:snapshot-changed', listener);
    return () => ipcRenderer.removeListener('willai:snapshot-changed', listener);
  },
  onCaptureError: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('willai:capture-error', listener);
    return () => ipcRenderer.removeListener('willai:capture-error', listener);
  },
  onContextInsertResult: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('willai:context-insert-result', listener);
    return () => ipcRenderer.removeListener('willai:context-insert-result', listener);
  },
};

contextBridge.exposeInMainWorld('willai', api);
