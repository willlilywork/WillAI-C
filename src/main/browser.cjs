const { WebContentsView, session, dialog, app } = require('electron');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { navigationTarget, providerFromUrl, isWebUrl } = require('./url-tools.cjs');

const SESSION_PARTITION = 'persist:willai-c-browser';
const ALLOWED_PERMISSIONS = new Set(['media', 'geolocation', 'notifications', 'clipboard-read']);

class BrowserController {
  constructor({ window, onState, onCapture, onVisit }) {
    this.window = window;
    this.onState = onState || (() => {});
    this.onCapture = onCapture || (() => {});
    this.onVisit = onVisit || (() => {});
    this.lastVisitByTab = new Map();
    this.tabs = new Map();
    this.adapterReadyWaiters = new Map();
    this.pendingPromptSubmissions = new Map();
    this.activeTabId = null;
    const initialSize = typeof window.getContentSize === 'function' ? window.getContentSize() : [1280, 800];
    this.contentBounds = {
      x: 0,
      y: 0,
      width: Math.max(1, Math.round(Number(initialSize?.[0]) || 1280)),
      height: Math.max(1, Math.round(Number(initialSize?.[1]) || 800)),
    };
    this.browserVisible = false;
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

  recordVisit(tab, contents) {
    const url = contents.getURL();
    if (!isWebUrl(url)) return;
    if (this.lastVisitByTab.get(tab.id) === url) return;
    this.lastVisitByTab.set(tab.id, url);
    this.onVisit({ url, title: contents.getTitle() || tab.title || url });
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
      // A zero-sized native view also collapses the provider page's DOM viewport.
      // Keep a valid layout size and hide the native view instead.
      tab.view.setBounds(this.contentBounds);
      tab.view.setVisible(this.browserVisible && tab.id === this.activeTabId);
    }
  }

  setContentBounds(bounds) {
    const next = {
      x: Math.round(Number(bounds.x) || 0),
      y: Math.round(Number(bounds.y) || 0),
      width: Math.max(0, Math.round(Number(bounds.width) || 0)),
      height: Math.max(0, Math.round(Number(bounds.height) || 0)),
    };
    if (next.width > 0 && next.height > 0) {
      this.contentBounds = next;
      this.browserVisible = true;
    } else {
      // Hide without collapsing the page viewport. Background provider DOM
      // interaction and response capture need a normal, non-zero layout.
      this.browserVisible = false;
    }
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
      this.recordVisit(tab, contents);
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
      this.recordVisit(tab, contents);
      this.emitState();
    });
    contents.on('render-process-gone', () => {
      tab.isLoading = false;
      tab.title = 'Page crashed';
      this.emitState();
    });
    contents.on('destroyed', () => {
      this.tabs.delete(id);
      this.lastVisitByTab.delete(id);
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
    this.applyBounds();
    this.emitState();
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

  waitForProviderAdapter(tab, timeoutMs = 25000) {
    const readyStates = new Set(['ready', 'no-message-elements', 'message-elements-found', 'response-sent']);
    if (tab.captureStatus && readyStates.has(tab.captureStatus.state)) return Promise.resolve();
    if (!tab.view || tab.view.webContents.isDestroyed()) return Promise.reject(new Error('The provider tab was closed before it became ready.'));

    return new Promise((resolve, reject) => {
      const waiter = {
        finish: (error) => {
          clearTimeout(timer);
          const waiters = this.adapterReadyWaiters.get(tab.id) || [];
          this.adapterReadyWaiters.set(tab.id, waiters.filter((item) => item !== waiter));
          if (error) reject(error);
          else resolve();
        },
      };
      const waiters = this.adapterReadyWaiters.get(tab.id) || [];
      waiters.push(waiter);
      this.adapterReadyWaiters.set(tab.id, waiters);
      const timer = setTimeout(() => waiter.finish(new Error('The provider adapter did not become ready. Open the Browser workspace to inspect the provider page.')), timeoutMs);
    });
  }

  async sendPrompt(provider, content) {
    const urls = {
      chatgpt: 'https://chatgpt.com/',
      claude: 'https://claude.ai/new',
      deepseek: 'https://chat.deepseek.com/',
    };
    const selectedProvider = String(provider || '').toLowerCase();
    const prompt = String(content || '').trim();
    if (!Object.prototype.hasOwnProperty.call(urls, selectedProvider)) {
      return { ok: false, error: 'This AI provider is not supported.' };
    }
    if (!prompt) return { ok: false, error: 'Enter a prompt before sending.' };
    if (prompt.length > 100000) return { ok: false, error: 'The prompt is too long to send in one request.' };

    let tab = [...this.tabs.values()].find((item) => providerFromUrl(item.url) === selectedProvider);
    try {
      if (!tab) {
        const tabId = await this.createTab(urls[selectedProvider], { background: true });
        tab = this.tabs.get(tabId);
      }
      if (!tab || tab.view.webContents.isDestroyed()) {
        return { ok: false, error: 'WillAI-C could not open the selected provider session.' };
      }

      this.activateTab(tab.id);
      await this.waitForProviderAdapter(tab);
      const requestId = randomUUID();

      return await new Promise((resolve) => {
        const timer = setTimeout(() => {
          this.pendingPromptSubmissions.delete(requestId);
          resolve({ ok: false, error: 'The provider did not confirm that the prompt was sent. Open Browser to review the composer.' });
        }, 25000);
        this.pendingPromptSubmissions.set(requestId, {
          tabId: tab.id,
          provider: selectedProvider,
          timer,
          resolve,
        });
        try {
          tab.view.webContents.send('willai:send-prompt', { requestId, provider: selectedProvider, content: prompt });
        } catch (error) {
          clearTimeout(timer);
          this.pendingPromptSubmissions.delete(requestId);
          resolve({ ok: false, error: error instanceof Error ? error.message : 'Could not send the prompt to the provider page.' });
        }
      });
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not prepare the selected provider.' };
    }
  }

  handlePromptSubmitResult(webContents, payload) {
    const tab = this.getTabByWebContents(webContents);
    if (!tab) return false;
    let pageUrl;
    try { pageUrl = new URL(webContents.getURL()); } catch { return false; }
    const provider = providerFromUrl(pageUrl.href);
    const requestId = String(payload?.requestId || '');
    const pending = this.pendingPromptSubmissions.get(requestId);
    if (pageUrl.protocol !== 'https:' || !provider || !pending
      || pending.tabId !== tab.id || pending.provider !== provider || payload?.provider !== provider) return false;

    clearTimeout(pending.timer);
    this.pendingPromptSubmissions.delete(requestId);
    pending.resolve(payload.ok
      ? { ok: true, provider, tabId: tab.id }
      : { ok: false, provider, error: String(payload.error || 'The provider page could not submit this prompt.') });
    return true;
  }

  requestProviderRescan() {
    const tab = this.getActiveTab();
    if (!tab || tab.view.webContents.isDestroyed()) {
      return { ok: false, error: 'Open a supported provider conversation in the Browser workspace first.' };
    }
    let url = '';
    try { url = tab.view.webContents.getURL(); } catch {}
    const provider = providerFromUrl(url);
    if (!provider) return { ok: false, error: 'The active browser tab is not a supported AI provider.' };
    try {
      tab.view.webContents.send('willai:rescan-provider-conversation');
      return { ok: true, provider };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not request a provider conversation scan.' };
    }
  }

  insertContext(context) {
    const tab = this.getActiveTab();
    if (!tab || !context) return { ok: false, error: 'No active page or no shared context.' };
    tab.view.webContents.send('willai:insert-context', String(context));
    return { ok: true };
  }

  insertPrompt(prompt) {
    const tab = this.getActiveTab();
    if (!tab || !prompt) return { ok: false, error: 'No active page or no prompt text.' };
    tab.view.webContents.send('willai:insert-prompt', String(prompt));
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
    if (['ready', 'no-message-elements', 'message-elements-found', 'response-sent'].includes(state)) {
      const waiters = this.adapterReadyWaiters.get(tab.id) || [];
      this.adapterReadyWaiters.delete(tab.id);
      for (const waiter of waiters) waiter.finish();
    }
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
    for (const waiters of this.adapterReadyWaiters.values()) {
      for (const waiter of waiters) waiter.finish(new Error('WillAI-C is closing.'));
    }
    this.adapterReadyWaiters.clear();
    for (const pending of this.pendingPromptSubmissions.values()) {
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, error: 'WillAI-C closed before the provider confirmed the request.' });
    }
    this.pendingPromptSubmissions.clear();
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
