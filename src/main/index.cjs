const path = require('node:path');
const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
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
  ipcMain.handle('willai:copy-text', (event, value) => {
    assertTrustedRenderer(event);
    clipboard.writeText(String(value ?? ''));
    return { ok: true };
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('willai:capture-received', result);
        mainWindow.webContents.send('willai:snapshot-changed');
      }
    } catch (error) {
      console.warn('WillAI-C capture was rejected:', error.message);
    }
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
  browser = new BrowserController({ window: mainWindow, onState: publishBrowserState });

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
