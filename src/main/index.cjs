const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, clipboard, dialog } = require('electron');
const { LocalStore } = require('./store.cjs');
const { BrowserController } = require('./browser.cjs');

let mainWindow;
let store;
let browser;

function assertTrustedRenderer(event) {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
    throw new Error('Untrusted renderer IPC sender.');
  }
}

function publishBrowserState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('willai:browser-state', browser?.getState() || { tabs: [], activeTabId: null });
  }
}

function registerRendererIpc() {
  ipcMain.handle('willai:get-snapshot', (event) => {
    assertTrustedRenderer(event);
    return store.getSnapshot();
  });
  ipcMain.handle('willai:get-browser-state', (event) => {
    assertTrustedRenderer(event);
    return browser?.getState() || { tabs: [], activeTabId: null };
  });
  ipcMain.handle('willai:create-tab', (event, url) => {
    assertTrustedRenderer(event);
    return browser.createTab(url || 'https://chatgpt.com/');
  });
  ipcMain.handle('willai:activate-tab', (event, tabId) => {
    assertTrustedRenderer(event);
    browser.activateTab(String(tabId));
    return browser.getState();
  });
  ipcMain.handle('willai:close-tab', (event, tabId) => {
    assertTrustedRenderer(event);
    browser.closeTab(String(tabId));
    return browser.getState();
  });
  ipcMain.handle('willai:navigate', (event, value) => {
    assertTrustedRenderer(event);
    return browser.navigate(String(value || ''));
  });
  ipcMain.handle('willai:go-back', (event) => {
    assertTrustedRenderer(event);
    browser.goBack();
  });
  ipcMain.handle('willai:go-forward', (event) => {
    assertTrustedRenderer(event);
    browser.goForward();
  });
  ipcMain.handle('willai:reload', (event) => {
    assertTrustedRenderer(event);
    browser.reload();
  });
  ipcMain.handle('willai:set-browser-bounds', (event, bounds) => {
    assertTrustedRenderer(event);
    browser.setContentBounds(bounds || {});
  });
  ipcMain.handle('willai:insert-context', (event, conversationId) => {
    assertTrustedRenderer(event);
    const conversation = store.getSnapshot().conversations.find((item) => item.id === conversationId);
    if (!conversation?.sharedContextPreview) return { ok: false, error: 'No model context is selected for this conversation.' };
    return browser.insertContext(conversation.sharedContextPreview);
  });
  ipcMain.handle('willai:update-node', (event, nodeId, nodeContent) => {
    assertTrustedRenderer(event);
    return store.updateNode(String(nodeId), String(nodeContent ?? ''));
  });
  ipcMain.handle('willai:set-node-context', (event, nodeId, enabled) => {
    assertTrustedRenderer(event);
    return store.setNodeContext(String(nodeId), Boolean(enabled));
  });
  ipcMain.handle('willai:create-child-node', (event, responseId, parentId) => {
    assertTrustedRenderer(event);
    return store.createChildNode(String(responseId), parentId ? String(parentId) : null);
  });
  ipcMain.handle('willai:delete-node', (event, nodeId) => {
    assertTrustedRenderer(event);
    return store.deleteNode(String(nodeId));
  });
  ipcMain.handle('willai:set-response-pinned', (event, responseId, pinned) => {
    assertTrustedRenderer(event);
    return store.setResponsePinned(String(responseId), Boolean(pinned));
  });
  ipcMain.handle('willai:copy-text', (event, value) => {
    assertTrustedRenderer(event);
    clipboard.writeText(String(value ?? ''));
    return { ok: true };
  });

  ipcMain.handle('willai:create-folder', (event, input) => {
    assertTrustedRenderer(event);
    return store.createFolder(input || {});
  });
  ipcMain.handle('willai:update-folder', (event, folderId, patch) => {
    assertTrustedRenderer(event);
    return store.updateFolder(String(folderId), patch || {});
  });
  ipcMain.handle('willai:delete-folder', (event, folderId) => {
    assertTrustedRenderer(event);
    return store.deleteFolder(String(folderId));
  });
  ipcMain.handle('willai:move-conversation', (event, conversationId, folderId) => {
    assertTrustedRenderer(event);
    return store.moveConversation(String(conversationId), folderId ? String(folderId) : null);
  });
  ipcMain.handle('willai:set-conversation-flags', (event, conversationId, patch) => {
    assertTrustedRenderer(event);
    return store.setConversationFlags(String(conversationId), patch || {});
  });
  ipcMain.handle('willai:bulk-delete-conversations', (event, ids) => {
    assertTrustedRenderer(event);
    return store.bulkDeleteConversations(ids);
  });
  ipcMain.handle('willai:save-prompt', (event, input) => {
    assertTrustedRenderer(event);
    return store.savePrompt(input || {});
  });
  ipcMain.handle('willai:delete-prompt', (event, promptId) => {
    assertTrustedRenderer(event);
    return store.deletePrompt(String(promptId));
  });
  ipcMain.handle('willai:set-prompt-favorite', (event, promptId, favorite) => {
    assertTrustedRenderer(event);
    return store.setPromptFavorite(String(promptId), Boolean(favorite));
  });
  ipcMain.handle('willai:expand-prompt', (event, promptId, variables) => {
    assertTrustedRenderer(event);
    return store.expandPrompt(String(promptId), variables || {});
  });
  ipcMain.handle('willai:record-prompt-history', (event, content, provider) => {
    assertTrustedRenderer(event);
    return store.recordPromptHistory(String(content || ''), provider || null);
  });
  ipcMain.handle('willai:enqueue-prompt', (event, content, title) => {
    assertTrustedRenderer(event);
    return store.enqueuePrompt(String(content || ''), String(title || 'Queued prompt'));
  });
  ipcMain.handle('willai:remove-prompt-queue-item', (event, itemId) => {
    assertTrustedRenderer(event);
    return store.removePromptQueueItem(String(itemId));
  });
  ipcMain.handle('willai:insert-prompt', (event, content) => {
    assertTrustedRenderer(event);
    return browser.insertPrompt(String(content || ''));
  });
  ipcMain.handle('willai:save-note', (event, input) => {
    assertTrustedRenderer(event);
    return store.saveNote(input || {});
  });
  ipcMain.handle('willai:delete-note', (event, noteId) => {
    assertTrustedRenderer(event);
    return store.deleteNote(String(noteId));
  });
  ipcMain.handle('willai:set-conversation-references', (event, conversationId, references) => {
    assertTrustedRenderer(event);
    return store.setConversationReferences(String(conversationId), references || []);
  });
  ipcMain.handle('willai:add-bookmark', (event, input) => {
    assertTrustedRenderer(event);
    return store.addBookmark(input || {});
  });
  ipcMain.handle('willai:delete-bookmark', (event, bookmarkId) => {
    assertTrustedRenderer(event);
    return store.deleteBookmark(String(bookmarkId));
  });
  ipcMain.handle('willai:update-workspace-settings', (event, patch) => {
    assertTrustedRenderer(event);
    return store.updateWorkspaceSettings(patch || {});
  });
  ipcMain.handle('willai:export-conversation', async (event, conversationId, format, responseIds) => {
    assertTrustedRenderer(event);
    const supported = new Set(['txt', 'markdown', 'html', 'json', 'pdf']);
    if (!supported.has(String(format))) throw new Error('Unsupported export format.');
    const exportFormat = String(format) === 'pdf' ? 'html' : String(format);
    const content = store.exportConversationContent(String(conversationId), exportFormat, responseIds || null);
    const conversation = store.getConversationExport(String(conversationId), responseIds || null);
    const safeTitle = String(conversation.title || 'conversation').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'conversation';
    const extension = String(format) === 'markdown' ? 'md' : String(format);
    const choice = await dialog.showSaveDialog(mainWindow, {
      title: 'Export conversation',
      defaultPath: path.join(app.getPath('documents'), safeTitle + '.' + extension),
      buttonLabel: 'Export',
    });
    if (choice.canceled || !choice.filePath) return { canceled: true };
    if (String(format) === 'pdf') {
      const printWindow = new BrowserWindow({
        show: false,
        width: 1000,
        height: 1400,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      try {
        await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(content));
        const pdf = await printWindow.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: { top: 0.55, bottom: 0.55, left: 0.6, right: 0.6 },
        });
        fs.writeFileSync(choice.filePath, pdf);
      } finally {
        if (!printWindow.isDestroyed()) printWindow.close();
      }
    } else {
      fs.writeFileSync(choice.filePath, content, 'utf8');
    }
    return { canceled: false, filePath: choice.filePath };
  });
  ipcMain.handle('willai:export-prompts', async (event) => {
    assertTrustedRenderer(event);
    const choice = await dialog.showSaveDialog(mainWindow, {
      title: 'Export prompt library',
      defaultPath: path.join(app.getPath('documents'), 'WillAI-C-Prompts.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (choice.canceled || !choice.filePath) return { canceled: true };
    fs.writeFileSync(choice.filePath, store.exportPrompts(), 'utf8');
    return { canceled: false, filePath: choice.filePath };
  });
  ipcMain.handle('willai:import-prompts', async (event) => {
    assertTrustedRenderer(event);
    const choice = await dialog.showOpenDialog(mainWindow, {
      title: 'Import prompt library',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (choice.canceled || !choice.filePaths?.[0]) return { canceled: true, imported: 0 };
    const parsed = JSON.parse(fs.readFileSync(choice.filePaths[0], 'utf8'));
    return { canceled: false, ...store.importPrompts(parsed) };
  });

  ipcMain.on('willai:provider-response', (event, payload) => {
    if (!browser) return;
    const accepted = browser.handleProviderCapture(event.sender, payload || {});
    if (!accepted) return;
    try {
      const result = store.capture({
        ...payload,
        sourceUrl: event.sender.getURL(),
        title: event.sender.getTitle() || payload.title,
      });
      browser.markCaptured(event.sender);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('willai:capture-received', result);
        mainWindow.webContents.send('willai:snapshot-changed');
      }
    } catch (error) {
      browser.markCaptureError(event.sender, error.message);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('willai:capture-error', {
          provider: payload?.provider || 'unknown',
          error: error.message,
        });
      }
      console.warn('WillAI-C capture was rejected:', error.message);
    }
  });

  ipcMain.on('willai:provider-status', (event, payload) => {
    browser?.handleProviderStatus(event.sender, payload || {});
  });

  ipcMain.on('willai:context-insert-result', (_event, result) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('willai:context-insert-result', result);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: '#101316',
    title: 'WillAI-C',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  browser = new BrowserController({
    window: mainWindow,
    onState: publishBrowserState,
    onVisit: (visit) => store.recordBrowserVisit(visit),
  });

  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.webContents.once('did-finish-load', async () => {
    try {
      await browser.createTab('https://chatgpt.com/');
      publishBrowserState();
    } catch (error) {
      console.error('Could not open the first browser tab:', error.message);
    }
  });

  mainWindow.on('resize', () => browser?.applyBounds());
  mainWindow.on('maximize', () => browser?.applyBounds());
  mainWindow.on('unmaximize', () => browser?.applyBounds());
  mainWindow.on('closed', () => {
    browser?.destroy();
    browser = null;
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  app.setName('WillAI-C');
  store = new LocalStore(app.getPath('userData'));
  registerRendererIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  browser?.destroy();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
