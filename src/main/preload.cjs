const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('willai', {
  getSnapshot: () => ipcRenderer.invoke('willai:get-snapshot'),
  getBridgeInfo: () => ipcRenderer.invoke('willai:get-bridge-info'),
  copyText: (text) => ipcRenderer.invoke('willai:copy-text', String(text ?? '')),
  openSourceUrl: (url) => ipcRenderer.invoke('willai:open-source', String(url ?? '')),
  updateNode: (nodeId, content) => ipcRenderer.invoke('willai:update-node', nodeId, content),
  setNodeContext: (nodeId, enabled) => ipcRenderer.invoke('willai:set-node-context', nodeId, enabled),
  createChildNode: (responseId, parentId) => ipcRenderer.invoke('willai:create-child-node', responseId, parentId ?? null),
  deleteNode: (nodeId) => ipcRenderer.invoke('willai:delete-node', nodeId),
  onCapture: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('willai:capture-received', listener);
    return () => ipcRenderer.removeListener('willai:capture-received', listener);
  },
});
