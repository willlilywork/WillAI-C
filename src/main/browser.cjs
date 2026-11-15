const { WebContentsView, session, dialog, app } = require('electron');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { navigationTarget, providerFromUrl, isWebUrl } = require('./url-tools.cjs');

const SESSION_PARTITION = 'persist:willai-c-browser';
const ALLOWED_PERMISSIONS = new Set(['media', 'geolocation', 'notifications', 'clipboard-read']);

class BrowserController {
  constructor({ window, onState, onCapture }) {
    this.window = window;
    this.onState = onState || (() => {});
    this.onCapture = onCapture || (() => {});
    this.tabs = new Map();
    this.activeTabId = null;
    this.contentBounds = { x: 230, y: 98, width: 800, height: 600 };
    this.browserSession = session.fromPartition(SESSION_PARTITION);
    this.permissionGrants = new Set();
    this.installPermissionHandlers();
  }

  installPermissionHandlers() {
    this.browserSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
      const origin = details.requestingOrigin || webContents.getURL();
      let host = '';
      try {
        const url = new URL(origin);
        if (url.protocol !== 'https:') return callback(false);
        host = url.hostname;
      } catch {
        return callback(false);
      }

      if (!ALLOWED_PERMISSIONS.has(permission)) return callback(false);
      const key = `${origin}|${permission}`;
      if (this.permissionGrants.has(key)) return callback(true);

      const label = permission === 'media'
        ? 'microphone or camera'
        : permission === 'geolocation'
          ? 'your location'
          : permission === 'notifications'
            ? 'desktop notifications'
            : 'clipboard access';

      dialog.showMessageBox(this.window, {
        type: 'question',
        title: 'Website permission request',
        message: `${host} is requesting access to ${label}.`,
        detail: 'WillAI-C asks before granting website permissions. You can change this behaviour in site settings later.',
        buttons: ['Allow for this session', 'Block'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      }).then(({ response }) => {
        const allowed = response === 0;
        if (allowed) this.permissionGrants.add(key);
        callback(allowed);
      }).catch(() => callback(false));
    });

    this.browserSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
      return this.permissionGrants.has(`${requestingOrigin}|${permission}`);
    });

    this.browserSession.on('will-download', (event, item) => {
      const suggested = item.getFilename() || 'download';
      const defaultPath = path.join(app.getPath('downloads'), suggested);
      dialog.showSaveDialog(this.window, {
        title: 'Save download',
        defaultPath,
        buttonLabel: 'Save',
      }).then(({ canceled, filePath }) => {
        if (canceled || !filePath) item.cancel();
        else item.setSavePath(filePath);
      }).catch(() => item.cancel());
    });
  }

  emitState() {
    this.onState(this.getState());
  }

  getState() {
    const tabs = [...this.tabs.values()].map((tab) => ({
      id: tab.id,
      title: tab.title || 'New tab',
      url: tab.url || '',
      isLoading: tab.isLoading,
      canGoBack: tab.view.webContents.navigationHistory.canGoBack(),
      canGoForward: tab.view.webContents.navigationHistory.canGoForward(),
      favicon: tab.favicon || '',
      provider: providerFromUrl(tab.url),
      captureStatus: tab.captureStatus || null,
    }));
    return { tabs, activeTabId: this.activeTabId };
  }

  getActiveTab() {
    return this.tabs.get(this.activeTabId) || null;
  }

  getTabByWebContents(webContents) {
    for (const tab of this.tabs.values()) {
      if (tab.view.webContents.id === webContents.id) return tab;
    }
    return null;
  }

  applyBounds() {
    for (const tab of this.tabs.values()) {
      if (tab.id === this.activeTabId) {
        tab.view.setBounds(this.contentBounds);
      } else {
        tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      }
    }
  }

  setContentBounds(bounds) {
    const next = {
      x: Math.round(Number(bounds.x) || 0),
      y: Math.round(Number(bounds.y) || 0),
      width: Math.max(0, Math.round(Number(bounds.width) || 0)),
      height: Math.max(0, Math.round(Number(bounds.height) || 0)),
    };
    if (next.width > 0 && next.height > 0) this.contentBounds = next;
    this.applyBounds();
  }

  async createTab(input = 'https://chatgpt.com/', options = {}) {
    const url = navigationTarget(input);
    const id = randomUUID();
    const view = new WebContentsView({
      webPreferences: {
        partition: SESSION_PARTITION,
        preload: path.join(__dirname, 'provider-capture-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });

    const tab = {
      id,
      view,
      title: 'New tab',
      url: '',
      favicon: '',
      isLoading: true,
      captureStatus: null,
      createdAt: new Date().toISOString(),
    };
    this.tabs.set(id, tab);
    this.window.contentView.addChildView(view);

    const contents = view.webContents;
    contents.setWindowOpenHandler(({ url: target }) => {
      if (isWebUrl(target)) this.createTab(target).catch(() => {});
      return { action: 'deny' };
    });

    contents.on('will-navigate', (event, target) => {
      if (!isWebUrl(target)) event.preventDefault();
    });
    contents.on('will-redirect', (event, target) => {
      if (!isWebUrl(target)) event.preventDefault();
    });
    contents.on('did-start-loading', () => {
      tab.isLoading = true;
      this.emitState();
    });
    contents.on('did-stop-loading', () => {
      tab.isLoading = false;
      tab.url = contents.getURL();
      tab.title = contents.getTitle() || tab.title;
      this.emitState();
    });
    contents.on('page-title-updated', (_event, title) => {
      tab.title = title || tab.title;
      this.emitState();
    });
    contents.on('page-favicon-updated', (_event, favicons) => {
      tab.favicon = Array.isArray(favicons) ? (favicons[0] || '') : '';
      this.emitState();
    });
    contents.on('did-navigate', (_event, targetUrl) => {
      tab.url = targetUrl;
      this.emitState();
    });
    contents.on('did-navigate-in-page', (_event, targetUrl) => {
      tab.url = targetUrl;
      this.emitState();
    });
    contents.on('render-process-gone', () => {
      tab.isLoading = false;
      tab.title = 'Page crashed';
      this.emitState();
    });
    contents.on('destroyed', () => {
      this.tabs.delete(id);
      if (this.activeTabId === id) this.activeTabId = this.tabs.keys().next().value || null;
      this.applyBounds();
      this.emitState();
    });

    if (!options.background || !this.activeTabId) this.activateTab(id);
    else this.applyBounds();

    await contents.loadURL(url);
    tab.url = contents.getURL();
    tab.title = contents.getTitle() || tab.title;
    this.emitState();
    return id;
  }

  activateTab(tabId) {
    if (!this.tabs.has(tabId)) return;
    this.activeTabId = tabId;
    this.applyBounds();
    this.emitState();
  }

  closeTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    const wasActive = this.activeTabId === tabId;
    this.window.contentView.removeChildView(tab.view);
    this.tabs.delete(tabId);
    tab.view.webContents.close();
    if (wasActive) this.activeTabId = this.tabs.keys().next().value || null;
    if (!this.activeTabId) {
      this.createTab('https://chatgpt.com/').catch(() => {});
    } else {
      this.applyBounds();
      this.emitState();
    }
  }

  navigate(input) {
    const tab = this.getActiveTab();
    if (!tab) return this.createTab(input);
    const target = navigationTarget(input);
    return tab.view.webContents.loadURL(target);
  }

  goBack() {
    const tab = this.getActiveTab();
    if (tab?.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack();
  }

  goForward() {
    const tab = this.getActiveTab();
    if (tab?.view.webContents.navigationHistory.canGoForward()) tab.view.webContents.navigationHistory.goForward();
  }

  reload() {
    this.getActiveTab()?.view.webContents.reload();
  }

  insertContext(context) {
    const tab = this.getActiveTab();
    if (!tab || !context) return { ok: false, error: 'No active page or no shared context.' };
    tab.view.webContents.send('willai:insert-context', String(context));
    return { ok: true };
  }

  handleProviderStatus(webContents, payload) {
    const tab = this.getTabByWebContents(webContents);
    if (!tab) return false;
    let pageUrl;
    try { pageUrl = new URL(webContents.getURL()); } catch { return false; }
    const provider = providerFromUrl(pageUrl.href);
    if (pageUrl.protocol !== 'https:' || !provider || payload?.provider !== provider) return false;

    const allowedStates = new Set([
      'ready',
      'scanning',
      'no-message-elements',
      'message-elements-found',
      'response-sent',
      'capture-error',
    ]);
    const state = allowedStates.has(payload.state) ? payload.state : 'ready';
    tab.captureStatus = {
      provider,
      state,
      candidateCount: Math.max(0, Math.min(10000, Number(payload.candidateCount) || 0)),
      capturedCount: tab.captureStatus?.capturedCount || 0,
      message: String(payload.message || '').slice(0, 240),
      updatedAt: new Date().toISOString(),
    };
    this.emitState();
    return true;
  }

  markCaptured(webContents) {
    const tab = this.getTabByWebContents(webContents);
    if (!tab) return;
    const provider = providerFromUrl(tab.url);
    if (!provider) return;
    tab.captureStatus = {
      provider,
      state: 'response-sent',
      candidateCount: tab.captureStatus?.candidateCount || 0,
      capturedCount: (tab.captureStatus?.capturedCount || 0) + 1,
      message: 'Assistant response saved to the WillAI workspace.',
      updatedAt: new Date().toISOString(),
    };
    this.emitState();
  }

  markCaptureError(webContents, error) {
    const tab = this.getTabByWebContents(webContents);
    if (!tab) return;
    const provider = providerFromUrl(tab.url);
    if (!provider) return;
    tab.captureStatus = {
      provider,
      state: 'capture-error',
      candidateCount: tab.captureStatus?.candidateCount || 0,
      capturedCount: tab.captureStatus?.capturedCount || 0,
      message: String(error || 'Response could not be saved.').slice(0, 240),
      updatedAt: new Date().toISOString(),
    };
    this.emitState();
  }

  handleProviderCapture(webContents, payload) {
    const tab = this.getTabByWebContents(webContents);
    if (!tab) return false;
    let pageUrl;
    try { pageUrl = new URL(webContents.getURL()); } catch { return false; }
    if (pageUrl.protocol !== 'https:' || providerFromUrl(pageUrl.href) === null) return false;
    if (payload?.provider !== providerFromUrl(pageUrl.href)) return false;
    this.onCapture({
      ...payload,
      sourceUrl: pageUrl.href,
      title: webContents.getTitle() || payload.title || 'AI conversation',
    }, tab);
    return true;
  }

  destroy() {
    for (const tab of this.tabs.values()) {
      try {
        this.window.contentView.removeChildView(tab.view);
        tab.view.webContents.close();
      } catch {}
    }
    this.tabs.clear();
  }
}

module.exports = { BrowserController, SESSION_PARTITION };
