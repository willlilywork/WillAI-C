const path = require('node:path');
const { app, BrowserWindow, ipcMain, clipboard, shell } = require('electron');
const { LocalStore } = require('./store.cjs');
const { createBridge } = require('./bridge.cjs');

let mainWindow;
let store;
let bridge;

function registerIpc() {
  ipcMain.handle('willai:get-snapshot', () => store.getSnapshot());
  ipcMain.handle('willai:get-bridge-info', () => {
    const { host, port, token } = store.getBridgeInfo();
    return { host, port, token, running: Boolean(bridge) };
  });
  ipcMain.handle('willai:copy-text', (_event, value) => {
    clipboard.writeText(String(value ?? ''));
    return { ok: true };
  });
  ipcMain.handle('willai:open-source', async (_event, value) => {
    let url;
    try { url = new URL(String(value)); } catch { throw new Error('Invalid source URL.'); }
    const host = url.hostname.toLowerCase();
    const allowed = host === 'chatgpt.com' || host === 'chat.openai.com' || host === 'claude.ai' || host === 'deepseek.com' || host.endsWith('.deepseek.com');
    if (url.protocol !== 'https:' || !allowed) throw new Error('Unsupported source website.');
    await shell.openExternal(url.toString());
    return { ok: true };
  });
  ipcMain.handle('willai:update-node', (_event, nodeId, content) => store.updateNode(nodeId, content));
  ipcMain.handle('willai:set-node-context', (_event, nodeId, enabled) => store.setNodeContext(nodeId, enabled));
  ipcMain.handle('willai:create-child-node', (_event, responseId, parentId) => store.createChildNode(responseId, parentId));
  ipcMain.handle('willai:delete-node', (_event, nodeId) => store.deleteNode(nodeId));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: '#111315',
    title: 'WillAI-C',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow›ÛŠ	ØÛÜÙY	Ë

HOˆÈXZ[•Ú[™İÈH[ÈJNÂŸB‚˜\Ú[”™XYJ
K[Š\Ş[˜È

HOˆÂˆİÜ™HH™]ÈØØ[İÜ™J\™Ù]]
	İ\Ù\‘]IÊJNÂˆ™YÚ\İ\’\Ê
NÂˆœšYÙHHÜ™X]PœšYÙJÂˆİÜ™KˆÛØ\\™Nˆ
™\İ[
HOˆÂˆYˆ
XZ[•Ú[™İÈ	‰ˆ[XZ[•Ú[™İËš\Ñ\İ›ŞYY

JHÂˆXZ[•Ú[™İËÙXÛÛ[ËœÙ[™
	İÚ[ZN˜Ø\\™K\™XÙZ]™Y	Ë™\İ[
NÂˆBˆKˆJNÂ‚ˆHÂˆ]ØZ]œšYÙKœİ\

NÂˆHØ]Ú
\œ›ÜŠHÂˆÛÛœÛÛK™\œ›ÜŠÚ[RKPÈØØ[œšYÙHÛİ[›İİ\ÛˆÜ	ØœšYÙKœÜN˜\œ›Ü‹›Y\ÜØYÙJNÂˆœšYÙHH[ÂˆB‚ˆÜ™X]UÚ[™İÊ
NÂˆ\›ÛŠ	ØXİ]˜]IË

HOˆÂˆYˆ
œ›İÜÙ\•Ú[™İË™Ù][Ú[™İÜÊ
K›[™İOOH
HÜ™X]UÚ[™İÊ
NÂˆJNÂŸJNÂ‚˜\›ÛŠ	Ø™Y›Ü™K\]Z]	Ë

HOˆÂˆYˆ
œšYÙJHœšYÙKœİÜ

NÂŸJNÂ‚˜\›ÛŠ	İÚ[™İËX[XÛÜÙY	Ë

HOˆÂˆYˆ
›ØÙ\ÜËœ]›Ü›HOOH	Ù\Ú[‰ÊH\œ]Z]

NÂŸJNÂ