const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getSnapshot: () => ipcRenderer.invoke('willai:get-snapshot'),
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
  deleteNode: (nodeId) => ipcRenderer.invoke('willai:delete-node', nodeId),
  copyText: (text) => ipcRenderer.invoke('willai:copy-text', String(text ?? '')),
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
  onContextInsertResult: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('willai:context-insert-result', listener);
    return () => ipcRenderer.removeListener('willai:context-insert-result', listener);
  },
};

contextBridge.exposeInMainWorld('willai', api);
