const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

test('background request dispatch waits for the provider adapter before posting the prompt', () => {
  const browser = fs.readFileSync(path.join(root, 'src/main/browser.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/index.cjs'), 'utf8');
  assert.ok(browser.includes('waitForProviderAdapter(tab)'));
  assert.ok(browser.includes("webContents.send('willai:send-prompt'"));
  assert.ok(main.includes("ipcMain.handle('willai:send-prompt'"));
});

test('a hidden provider view keeps a non-zero DOM viewport for background submission', () => {
  const browser = fs.readFileSync(path.join(root, 'src/main/browser.cjs'), 'utf8');
  assert.ok(browser.includes('tab.view.setBounds(this.contentBounds)'));
  assert.ok(browser.includes('tab.view.setVisible(this.browserVisible && tab.id === this.activeTabId)'));
  assert.ok(browser.includes('this.browserVisible = false'));
  assert.ok(browser.includes('if (next.width > 0 && next.height > 0)'));
});

test('provider page waits for its composer and enabled send control', () => {
  const preload = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  assert.ok(preload.includes('requestNativePromptInsert'));
  assert.ok(preload.includes('button[data-testid="send-button"]'));
  assert.ok(preload.includes('button[aria-label="Send message"]'));
  assert.ok(preload.includes('#composer-submit-button'));
  assert.ok(preload.includes('button[type="submit"]'));
  assert.ok(preload.includes('button.click()'));
  assert.ok(preload.includes('findSendButton(composer)'));
  assert.ok(preload.includes('willai:prompt-submit-result'));
});

test('response capture waits for generation to finish before finalising a stable answer', () => {
  const preload = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  assert.ok(preload.includes('CAPTURE_STABILITY_DELAY_MS = 2400'));
  assert.ok(preload.includes('function isProviderGenerating()'));
  assert.ok(preload.includes('if (isProviderGenerating())'));
});

test('renderer keeps New Conversation visible while background requests execute', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.ok(app.includes("setWorkspaceView('newchat')"));
  assert.ok(app.includes('setBrowserOpen(false)'));
  assert.ok(app.includes('window.willai.sendPrompt(provider, content)'));
});


test('the Browser workspace can explicitly rescan loaded provider messages through the trusted IPC bridge', () => {
  const browser = fs.readFileSync(path.join(root, 'src/main/browser.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/index.cjs'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src/main/preload.cjs'), 'utf8');
  const provider = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.ok(browser.includes('requestProviderRescan()'));
  assert.ok(browser.includes("webContents.send('willai:rescan-provider-conversation')"));
  assert.ok(main.includes("ipcMain.handle('willai:rescan-provider-conversation'"));
  assert.ok(preload.includes("ipcRenderer.invoke('willai:rescan-provider-conversation')"));
  assert.ok(provider.includes("ipcRenderer.on('willai:rescan-provider-conversation'"));
  assert.ok(provider.includes("reportStatus("));
  assert.ok(app.includes('Extract loaded responses'));
  assert.ok(app.includes('scroll up to load them'));
});

test('capture event TypeScript contract includes response revisions and rescan API', () => {
  const types = fs.readFileSync(path.join(root, 'src/renderer/types.d.ts'), 'utf8');
  assert.ok(types.includes('updated?: boolean'));
  assert.ok(types.includes('rescanProviderConversation()'));
});


test('provider adapter readiness is reset after navigation and rescan waits for the new page', () => {
  const browser = fs.readFileSync(path.join(root, 'src/main/browser.cjs'), 'utf8');
  assert.ok(browser.includes('tab.captureStatus = null;'));
  assert.ok(browser.includes("new Set(['ready', 'no-message-elements', 'message-elements-found', 'response-sent', 'capture-error'])"));
  assert.ok(browser.includes('async requestProviderRescan()'));
  assert.ok(browser.includes('await this.waitForProviderAdapter(tab)'));
});

test('capture status panel wraps its explicit extraction action and guidance', () => {
  const css = fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8');
  assert.ok(css.includes('.capture-status-panel { flex-wrap:wrap; }'));
});


test('hidden provider tabs are not timer-throttled and use CDP-first input', () => {
  const browser = fs.readFileSync(path.join(root, 'src/main/browser.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/index.cjs'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  assert.match(browser, /backgroundThrottling:\s*false/);
  assert.ok(browser.includes("debuggerApi.sendCommand('Input.insertText'"));
  assert.ok(browser.includes('webContents.insertText(text)')); // compatibility fallback
  assert.ok(browser.includes('handleProviderComposerReady'));
  assert.ok(main.includes("ipcMain.on('willai:provider-composer-ready'"));
  assert.ok(preload.includes("ipcRenderer.send('willai:provider-composer-ready'"));
  assert.ok(preload.includes("ipcRenderer.on('willai:provider-text-inserted'"));
  assert.match(browser, /timeoutMs = 35000/);
  assert.match(browser, /}, 60000\);/);
});

test('ChatGPT current assistant message and composer selectors are supported', () => {
  const preload = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  assert.ok(preload.includes('textarea[name="prompt-textarea"]'));
  assert.ok(preload.includes('textarea#mobile-composer-prompt'));
  assert.ok(preload.includes('#composer-submit-button'));
  assert.ok(preload.includes('data-content-search-unit-key$=":assistant"'));
  assert.ok(preload.includes('data-chatgpt-search-message-ids'));
});

test('current ChatGPT app-shell and Claude response DOM structures are covered', () => {
  const preload = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  assert.ok(preload.includes('[data-conversation-role="assistant"]'));
  assert.ok(preload.includes('[data-conversation-role="user"]'));
  assert.ok(preload.includes('[data-markdown-text-style="assistant-message"]'));
  assert.ok(preload.includes('form[data-chatgpt-composer] [data-composer-markdown][contenteditable="true"][role="textbox"]'));
  assert.ok(preload.includes('.font-claude-response'));
  assert.ok(preload.includes('data-turn-key'));
  assert.ok(preload.includes("attributeFilter:"));
});

test('composer verification normalizes non-breaking spaces and carriage returns', () => {
  const preload = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  assert.match(preload, /replace\(\/\\u00a0\/g, ' '\)/);
  assert.match(preload, /replace\(\/\\r\/g, ''\)/);
  assert.ok(preload.includes('actual !== expected'));
});

test('DeepSeek current composer and send controls are supported', () => {
  const preload = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  assert.ok(preload.includes("'#chat-input'"));
  assert.ok(preload.includes("'button[aria-label=\"Send message\"]'"));
  assert.ok(preload.includes("'[data-testid=\"send-button\"]'"));
});


// Load BrowserController with a minimal Electron module so its CDP insertion
// helper can be exercised without starting an actual desktop window.
function loadBrowserControllerForTest() {
  const modulePath = require.resolve('../src/main/browser.cjs');
  const previous = require.cache[modulePath];
  delete require.cache[modulePath];
  const originalLoad = Module._load;
  const fakeSession = {
    setPermissionRequestHandler() {},
    setPermissionCheckHandler() {},
    on() {},
  };
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') {
      return {
        WebContentsView: class WebContentsView {},
        session: { fromPartition: () => fakeSession },
        dialog: {},
        app: {},
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(modulePath).BrowserController;
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
    if (previous) require.cache[modulePath] = previous;
  }
}

test('CDP inserts text into the hidden provider target without taking OS focus', async () => {
  const BrowserController = loadBrowserControllerForTest();
  let attached = false;
  let focused = false;
  let fallbackCalls = 0;
  const commands = [];
  const webContents = {
    debugger: {
      isAttached: () => attached,
      attach: (version) => { assert.equal(version, '1.3'); attached = true; },
      sendCommand: async (method, params) => { commands.push({ method, params }); },
      detach: () => { attached = false; },
    },
    isDestroyed: () => false,
    focus: () => { focused = true; },
    insertText: async () => { fallbackCalls += 1; },
  };

  const text = 'A request with multiple lines\nsecond line';
  const method = await BrowserController.prototype.insertTextIntoProvider.call({}, webContents, text);

  assert.equal(method, 'cdp');
  assert.deepEqual(commands, [{ method: 'Input.insertText', params: { text } }]);
  assert.equal(focused, false);
  assert.equal(fallbackCalls, 0);
  assert.equal(attached, false);
});

test('CDP insertion falls back to Electron native insertion only when CDP fails', async () => {
  const BrowserController = loadBrowserControllerForTest();
  let attached = false;
  let focused = false;
  let inserted = '';
  const webContents = {
    debugger: {
      isAttached: () => attached,
      attach: () => { attached = true; },
      sendCommand: async () => { throw new Error('CDP unavailable'); },
      detach: () => { attached = false; },
    },
    isDestroyed: () => false,
    focus: () => { focused = true; },
    insertText: async (text) => { inserted = text; },
  };

  const method = await BrowserController.prototype.insertTextIntoProvider.call({}, webContents, 'fallback text');

  assert.equal(method, 'electron');
  assert.equal(inserted, 'fallback text');
  assert.equal(focused, true);
  assert.equal(attached, false);
});

// Execute the isolated provider preload against a tiny DOM fixture. This tests
// the event bridge and, importantly, verifies the full prompt before clicking Send.
function createProviderPreloadHarness() {
  const source = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  const listeners = new Map();
  const sent = [];
  const queried = [];
  let clickCount = 0;

  class FakeElement {
    constructor() {
      this.isConnected = true;
      this.disabled = false;
      this.innerText = '';
      this.textContent = '';
      this.attributes = {};
    }
    focus() {}
    getClientRects() { return [1]; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    matches() { return false; }
    closest(selector) { return selector === 'form' ? form : null; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
  }
  class FakeTextArea extends FakeElement {}
  class FakeInput extends FakeElement {}
  class FakeButton extends FakeElement {
    click() {
      clickCount += 1;
      composer.innerText = '';
      composer.textContent = '';
    }
  }

  const composer = new FakeElement();
  const button = new FakeButton();
  const form = {
    requestSubmit() {
      clickCount += 1;
      composer.innerText = '';
      composer.textContent = '';
    },
    querySelectorAll(selector) {
      return selector === 'button[data-testid="send-button"]' ? [button] : [];
    },
  };
  const selection = { removeAllRanges() {}, addRange() {} };
  const document = {
    readyState: 'complete',
    documentElement: {},
    querySelector(selector) {
      queried.push(selector);
      return selector === 'form[data-chatgpt-composer] [data-composer-markdown][contenteditable="true"][role="textbox"]'
        ? composer : null;
    },
    querySelectorAll() { return []; },
    createRange() {
      return { selectNodeContents() {}, collapse() {} };
    },
  };
  const ipcRenderer = {
    on(channel, callback) { listeners.set(channel, callback); },
    send(channel, payload) { sent.push({ channel, payload }); },
  };
  class FakeMutationObserver {
    observe() {}
    disconnect() {}
  }
  const window = {
    crypto: { randomUUID: () => 'capture-fixture-id' },
    getSelection: () => selection,
  };
  const context = {
    require: (name) => {
      assert.equal(name, 'electron');
      return { ipcRenderer };
    },
    ipcRenderer,
    location: { hostname: 'chatgpt.com', href: 'https://chatgpt.com/' },
    document,
    window,
    HTMLElement: FakeElement,
    HTMLTextAreaElement: FakeTextArea,
    HTMLInputElement: FakeInput,
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    MutationObserver: FakeMutationObserver,
    setTimeout,
    clearTimeout,
    Date,
    String,
    Array,
    Map,
    Set,
    WeakMap,
    Promise,
    RegExp,
    Math,
  };
  vm.runInNewContext(source, context, { filename: 'provider-capture-preload.cjs' });

  function emit(channel, payload) {
    const callback = listeners.get(channel);
    assert.ok(callback, 'listener was registered for ' + channel);
    callback({}, payload);
  }
  function results(channel) {
    return sent.filter((item) => item.channel === channel).map((item) => item.payload);
  }
  return { composer, queried, emit, results, get clickCount() { return clickCount; } };
}

test('provider preload refuses to send a partial prompt from the composer', () => {
  const harness = createProviderPreloadHarness();
  const requestId = 'partial-prompt';
  const expected = 'A complete prompt that must not be truncated';
  harness.emit('willai:send-prompt', { requestId, provider: 'chatgpt', content: expected });
  assert.ok(harness.queried.includes('form[data-chatgpt-composer] [data-composer-markdown][contenteditable="true"][role="textbox"]'));
  assert.equal(harness.results('willai:provider-composer-ready').length, 1);

  harness.composer.innerText = 'A complete prompt';
  harness.composer.textContent = 'A complete prompt';
  harness.emit('willai:provider-text-inserted', { requestId, ok: true, method: 'cdp' });

  const result = harness.results('willai:prompt-submit-result').at(-1);
  assert.equal(result.ok, false);
  assert.match(result.error, /complete prompt/i);
  assert.equal(harness.clickCount, 0);
});

test('provider preload submits only after the complete prompt is present', async () => {
  const harness = createProviderPreloadHarness();
  const requestId = 'complete-prompt';
  const expected = 'Full prompt with\u00a0space\r\nsecond line';
  harness.emit('willai:send-prompt', { requestId, provider: 'chatgpt', content: expected });
  harness.composer.innerText = 'Full prompt with space\nsecond line';
  harness.composer.textContent = harness.composer.innerText;
  harness.emit('willai:provider-text-inserted', { requestId, ok: true, method: 'cdp' });

  await new Promise((resolve) => setTimeout(resolve, 650));
  const result = harness.results('willai:prompt-submit-result').at(-1);
  assert.equal(result.ok, true);
  assert.equal(harness.clickCount, 1);
});


function createCapturePreloadHarness(hostname, selector, attributeName, attributeValue) {
  const source = fs.readFileSync(path.join(root, 'src/main/provider-capture-preload.cjs'), 'utf8');
  const listeners = new Map();
  const sent = [];
  const candidate = {
    nodeType: 1,
    tagName: 'P',
    childNodes: [{ nodeType: 3, nodeValue: 'Captured assistant answer from current DOM.' }],
    parentElement: null,
    isConnected: true,
    attributes: {
      [attributeName]: attributeValue,
      'data-turn-key': 'fixture-turn-2026',
    },
    matches(value) {
      if (value.includes('[data-markdown-text-style="assistant-message"]')) {
        return this.attributes['data-markdown-text-style'] === 'assistant-message';
      }
      if (value.includes('.font-claude-response')) {
        return String(this.attributes.class || '').split(/\s+/).includes('font-claude-response');
      }
      return false;
    },
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    contains(other) { return other === this; },
  };
  const document = {
    readyState: 'complete',
    documentElement: {},
    querySelectorAll(value) { return value === selector ? [candidate] : []; },
  };
  const ipcRenderer = {
    on(channel, callback) { listeners.set(channel, callback); },
    send(channel, payload) { sent.push({ channel, payload }); },
  };
  class FakeMutationObserver { observe() {} disconnect() {} }
  const fastTimeout = (callback, _delay, ...args) => setTimeout(callback, 5, ...args);
  const context = {
    require: () => ({ ipcRenderer }),
    ipcRenderer,
    location: { hostname, href: 'https://' + hostname + '/' },
    document,
    window: { crypto: { randomUUID: () => 'fixture-capture-id' } },
    HTMLElement: class HTMLElement {},
    HTMLTextAreaElement: class HTMLTextAreaElement {},
    HTMLInputElement: class HTMLInputElement {},
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    MutationObserver: FakeMutationObserver,
    setTimeout: fastTimeout,
    clearTimeout,
    Date,
    String,
    Array,
    Map,
    Set,
    WeakMap,
    Promise,
    RegExp,
    Math,
  };
  // Use the same HTMLElement constructor for the candidate that the preload sees.
  const Element = context.HTMLElement;
  Object.setPrototypeOf(candidate, Element.prototype);
  vm.runInNewContext(source, context, { filename: 'provider-capture-preload.cjs' });

  return {
    sent,
    emit(channel, payload) {
      const callback = listeners.get(channel);
      assert.ok(callback, 'listener was registered for ' + channel);
      callback({}, payload);
    },
    async waitForCapture() {
      await new Promise((resolve) => setTimeout(resolve, 40));
      const capture = sent.find((item) => item.channel === 'willai:provider-response');
      assert.ok(capture, 'provider adapter captured a response');
      return capture.payload;
    },
  };
}

test('current ChatGPT and Claude response bodies become captured Original Response payloads', async () => {
  const cases = [
    {
      hostname: 'chatgpt.com',
      selector: '[data-markdown-text-style="assistant-message"]',
      attributeName: 'data-markdown-text-style',
      attributeValue: 'assistant-message',
    },
    {
      hostname: 'claude.ai',
      selector: '.font-claude-response',
      attributeName: 'class',
      attributeValue: 'font-claude-response',
    },
  ];
  for (const fixture of cases) {
    const harness = createCapturePreloadHarness(
      fixture.hostname,
      fixture.selector,
      fixture.attributeName,
      fixture.attributeValue,
    );
    const payload = await harness.waitForCapture();
    assert.equal(payload.provider, fixture.hostname === 'chatgpt.com' ? 'chatgpt' : 'claude');
    assert.equal(payload.sourceMessageId.includes('data-turn-key'), true);
    assert.equal(payload.text, 'Captured assistant answer from current DOM.');
    harness.emit('willai:provider-capture-result', { captureId: payload.captureId, ok: true });
  }
});
