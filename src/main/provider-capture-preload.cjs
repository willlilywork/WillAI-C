const { ipcRenderer } = require('electron');

(() => {
  const host = location.hostname.toLowerCase();
  const provider = host === 'chatgpt.com' || host === 'chat.openai.com'
    ? 'chatgpt'
    : host === 'claude.ai'
      ? 'claude'
      : host === 'deepseek.com' || host.endsWith('.deepseek.com')
        ? 'deepseek'
        : null;

  if (!provider) return;

  const seen = new WeakMap();
  const pending = new WeakMap();
  const retries = new WeakMap();
  const inFlight = new Map();
  let scanTimer = null;
  let lastStatusKey = '';
  const CAPTURE_STABILITY_DELAY_MS = 2400;

  const selectors = {
    chatgpt: [
      'main [data-app-action-timeline-scroll][role="region"] [data-content-search-unit-key$=":assistant"]',
      'main [data-app-action-timeline-scroll][role="region"] [data-chatgpt-search-unit-key$=":assistant"]',
      'main [data-message-author-role="assistant"] .markdown',
      'main [data-message-author-role="assistant"] .prose',
      'main [data-message-author-role="assistant"] [data-message-content]',
      'main [data-testid^="conversation-turn-"] [data-message-author-role="assistant"] .markdown',
      'main [data-testid^="conversation-turn-"] .markdown',
      'main article[data-testid*="conversation-turn"] .markdown',
      'main [data-message-author-role="assistant"]',
      'main [data-testid^="conversation-turn-"]',
      'main .markdown.prose',
      '[data-message-author-role="assistant"] .markdown',
      '[data-message-author-role="assistant"]',
    ],
    claude: [
      '.font-claude-message',
      '[data-testid="chat-message"][data-is-streaming="false"]',
      '[data-testid="chat-message"] .markdown',
      '[data-testid="chat-message"]',
    ],
    deepseek: [
      '[data-message-author-role="assistant"] .ds-markdown',
      '.ds-markdown',
      '[data-message-author-role="assistant"]',
      '[class*="AssistantMessage"]',
      '[class*="markdown-body"]',
    ],
  };

  const generationStopSelectors = {
    chatgpt: [
      'button[data-testid="stop-button"]',
      '[data-testid*="stop-generating"]',
      'button[aria-label*="Stop" i]',
      'button[title*="Stop" i]',
    ],
    claude: [
      'button[data-testid*="stop"]',
      'button[aria-label*="Stop response" i]',
      'button[aria-label*="Stop generating" i]',
    ],
    deepseek: [
      'button[data-testid*="stop"]',
      '[class*="stop-generating"]',
      'button[aria-label*="Stop" i]',
      '[role="button"][aria-label*="Stop" i]',
      'button[title*="Stop" i]',
    ],
  };

  function isProviderGenerating() {
    for (const selector of generationStopSelectors[provider] || []) {
      let controls = [];
      try { controls = Array.from(document.querySelectorAll(selector)); } catch { continue; }
      if (controls.some((control) => control.isConnected
        && control.getClientRects().length > 0
        && !control.disabled
        && control.getAttribute('aria-disabled') !== 'true')) return true;
    }
    return false;
  }

  function reportStatus(state, candidateCount, message) {
    const key = [state, candidateCount, message].join('|');
    if (key === lastStatusKey) return;
    lastStatusKey = key;
    ipcRenderer.send('willai:provider-status', {
      provider,
      state,
      candidateCount,
      message,
    });
  }


  const BLOCK_TAGS = new Set([
    'ARTICLE', 'BLOCKQUOTE', 'DIV', 'FIGURE', 'H1', 'H2', 'H3', 'H4',
    'H5', 'H6', 'HR', 'LI', 'MAIN', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'UL',
  ]);

  function ignored(element) {
    return element.matches(
      'button, svg, script, style, nav, footer, [aria-hidden="true"], '
      + '[data-testid*="copy"], [data-testid*="feedback"], '
      + '[data-testid*="toolbar"], [role="toolbar"]',
    ) || Boolean(element.closest('[aria-hidden="true"], [data-testid*="toolbar"]'));
  }

  function inlineMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return String(node.nodeValue || '').replace(/[\t\r\n ]+/g, ' ');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node;
    if (ignored(el)) return '';
    const tag = el.tagName;
    if (tag === 'BR') return '\n';
    if (tag === 'IMG') {
      const alt = el.getAttribute('alt') || '';
      const src = el.getAttribute('src') || '';
      return src ? '![' + alt + '](' + src + ')' : alt;
    }
    const children = Array.from(el.childNodes).map(inlineMarkdown).join('');
    if (tag === 'STRONG' || tag === 'B') return '**' + children.trim() + '**';
    if (tag === 'EM' || tag === 'I') return '*' + children.trim() + '*';
    if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') return '~~' + children.trim() + '~~';
    if (tag === 'CODE') {
      const tick = String.fromCharCode(96);
      const runs = children.match(new RegExp(tick + '+', 'g')) || [];
      const fence = tick.repeat(Math.max(1, ...runs.map((run) => run.length + 1)));
      return fence + children.trim() + fence;
    }
    if (tag === 'A') {
      const href = el.getAttribute('href');
      if (!href) return children;
      let url = href;
      try { url = new URL(href, location.href).href; } catch {}
      return '[' + children.trim() + '](' + url + ')';
    }
    if (tag === 'SUB') return '~' + children.trim() + '~';
    if (tag === 'SUP') return '^' + children.trim() + '^';
    return children;
  }

  function renderPre(el) {
    const codeEl = el.querySelector('code') || el;
    const code = String(codeEl.innerText || codeEl.textContent || '').replace(/\r/g, '').replace(/\n+$/, '');
    const classes = String(codeEl.className || '') + ' ' + String(el.className || '');
    const language = (classes.match(/language-([a-z0-9_+#.-]+)/i) || [])[1] || '';
    const fence = String.fromCharCode(96).repeat(3);
    return fence + language + '\n' + code + '\n' + fence;
  }

  function renderTable(el) {
    const rows = Array.from(el.querySelectorAll('tr')).map((row) =>
      Array.from(row.children)
        .filter((cell) => cell.tagName === 'TH' || cell.tagName === 'TD')
        .map((cell) => inlineMarkdown(cell).trim().replace(/\|/g, '\\|')),
    ).filter((row) => row.length);
    if (!rows.length) return '';
    const width = Math.max(...rows.map((row) => row.length));
    const format = (row) => '| ' + Array.from({ length: width }, (_, i) => row[i] || '').join(' | ') + ' |';
    return [format(rows[0]), format(Array(width).fill('---')), ...rows.slice(1).map(format)].join('\n');
  }

  function renderList(el, depth = 0) {
    const ordered = el.tagName === 'OL';
    const start = Number(el.getAttribute('start') || 1);
    const lines = [];
    const items = Array.from(el.children).filter((child) => child.tagName === 'LI');
    items.forEach((item, index) => {
      let inline = '';
      const extraBlocks = [];
      const nestedLists = [];
      const flush = () => {
        const value = inline.trim();
        if (value) extraBlocks.push(value);
        inline = '';
      };
      for (const child of Array.from(item.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE && (child.tagName === 'UL' || child.tagName === 'OL')) {
          flush();
          nestedLists.push(child);
        } else if (child.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(child.tagName)) {
          flush();
          const rendered = renderBlock(child, depth + 1);
          if (rendered) extraBlocks.push(rendered);
        } else {
          inline += inlineMarkdown(child);
        }
      }
      flush();
      const indent = '  '.repeat(depth);
      const marker = ordered ? String(start + index) + '. ' : '- ';
      const first = extraBlocks.shift() || '';
      const parts = first.split('\n');
      lines.push(indent + marker + (parts.shift() || ''));
      for (const line of parts) lines.push(indent + '  ' + line);
      for (const block of extraBlocks) {
        for (const line of block.split('\n')) lines.push(indent + '  ' + line);
      }
      for (const list of nestedLists) {
        const nested = renderList(list, depth + 1);
        if (nested) lines.push(nested);
      }
    });
    return lines.join('\n');
  }

  function renderChildren(el, depth = 0) {
    const blocks = [];
    let inline = '';
    const flush = () => {
      const value = inline.trim();
      if (value) blocks.push(value);
      inline = '';
    };
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(child.tagName)) {
        flush();
        const rendered = renderBlock(child, depth);
        if (rendered) blocks.push(rendered);
      } else {
        inline += inlineMarkdown(child);
      }
    }
    flush();
    return blocks.join('\n\n');
  }

  function renderBlock(node, depth = 0) {
    if (node.nodeType === Node.TEXT_NODE) return String(node.nodeValue || '').trim();
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node;
    if (ignored(el)) return '';
    const tag = el.tagName;
    if (tag === 'PRE') return renderPre(el);
    if (tag === 'TABLE') return renderTable(el);
    if (tag === 'UL' || tag === 'OL') return renderList(el, depth);
    if (tag === 'BLOCKQUOTE') {
      return renderChildren(el, depth).split('\n').map((line) => line ? '> ' + line : '>').join('\n');
    }
    if (tag === 'HR') return '---';
    if (/^H[1-6]$/.test(tag)) return '#'.repeat(Number(tag.slice(1))) + ' ' + inlineMarkdown(el).trim();
    if (tag === 'P') return inlineMarkdown(el).trim();
    return renderChildren(el, depth);
  }

  function markdownOf(element) {
    return renderBlock(element)
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function simpleHash(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function stableMessageId(element) {
    const chatGptMessageIds = element.getAttribute('data-chatgpt-search-message-ids');
    if (chatGptMessageIds) return String(chatGptMessageIds).trim().slice(0, 200);

    const direct = element.getAttribute('data-message-id') || element.id;
    if (direct && direct.length > 3) return String(direct).slice(0, 200);

    let ancestor = element.parentElement;
    let depth = 0;
    while (ancestor && depth < 5) {
      const testId = ancestor.getAttribute('data-testid') || '';
      if (/conversation-turn-\w+|message-[\w-]{6,}/i.test(testId)) {
        return testId.slice(0, 200);
      }
      const messageId = ancestor.getAttribute('data-message-id');
      if (messageId) return messageId.slice(0, 200);
      ancestor = ancestor.parentElement;
      depth += 1;
    }

    // Never use a generic data-testid such as "chat-message" as a unique ID.
    // The main process will deduplicate this response by its content fingerprint.
    return null;
  }

  function isUserContent(element) {
    if (element.closest('[data-message-author-role="user"], [data-testid*="user-message"], [aria-label*="user message" i]')) return true;
    const roleRoot = element.closest('[data-message-author-role]');
    return Boolean(roleRoot && (roleRoot.getAttribute('data-message-author-role') || '').toLowerCase() !== 'assistant');
  }

  function collectCandidates() {
    const candidates = new Set();
    for (const selector of selectors[provider]) {
      let matches = [];
      try { matches = Array.from(document.querySelectorAll(selector)); } catch { continue; }
      for (const element of matches) {
        if (!(element instanceof HTMLElement) || !element.isConnected || ignored(element) || isUserContent(element)) continue;
        const testId = (element.getAttribute('data-testid') || '').toLowerCase();
        const label = (element.getAttribute('aria-label') || '').toLowerCase();
        if (testId.includes('human') || label.includes('user message')) continue;
        let body = element;
        if (provider === 'chatgpt' && !element.matches('.markdown, .prose, [data-message-content]')) {
          const preferred = element.querySelector('.markdown, .prose, [data-message-content]');
          if (preferred instanceof HTMLElement && !isUserContent(preferred)) body = preferred;
        }
        if (markdownOf(body).length > 0) candidates.add(body);
      }
    }
    const all = Array.from(candidates);
    return all.filter((element) => !all.some((other) => other !== element && element.contains(other)));
  }
  function scan() {
    const elements = collectCandidates();
    let usableCount = 0;

    for (const element of elements) {
      if (!element.isConnected) continue;
      const text = markdownOf(element);
      if (text.length < 1 || text.length > 120000) continue;
      usableCount += 1;

      const hash = simpleHash(text);
      if (seen.get(element) === hash || pending.get(element) === hash) continue;
      pending.set(element, hash);

      setTimeout(() => {
        if (!element.isConnected) {
          pending.delete(element);
          return;
        }

        const stableText = markdownOf(element);
        const stableHash = simpleHash(stableText);
        if (stableHash !== hash) {
          if (pending.get(element) === hash) pending.delete(element);
          scheduleScan();
          return;
        }

        if (pending.get(element) === hash) pending.delete(element);
        if (stableText.length < 1 || seen.get(element) === stableHash) return;
        // A pause in streaming is not a completed answer. Wait for the
        // provider's stop-generation control to disappear before capturing.
        if (isProviderGenerating()) {
          scheduleScan();
          return;
        }

        const captureId = window.crypto?.randomUUID?.() || String(Date.now()) + '-' + simpleHash(stableText);
        pending.set(element, stableHash);
        inFlight.set(captureId, { element, hash: stableHash });
        ipcRenderer.send('willai:provider-response', { captureId, provider, sourceMessageId: stableMessageId(element), text: stableText });

        setTimeout(() => {
          const waiting = inFlight.get(captureId);
          if (!waiting) return;
          inFlight.delete(captureId);
          pending.delete(waiting.element);
          const attempts = retries.get(waiting.element) || 0;
          if (attempts < 3) {
            retries.set(waiting.element, attempts + 1);
            setTimeout(scheduleScan, 1200 * (attempts + 1));
          }
        }, 10000);
      }, CAPTURE_STABILITY_DELAY_MS);
    }

    if (usableCount === 0) {
      reportStatus(
        'no-message-elements',
        0,
        'The provider adapter is running, but its assistant-message selectors found no readable responses on this page.',
      );
    } else {
      reportStatus(
        'message-elements-found',
        usableCount,
        'The provider adapter found readable message elements. Completed responses are monitored automatically.',
      );
    }
  }

  ipcRenderer.on('willai:rescan-provider-conversation', () => {
    reportStatus(
      'scanning',
      0,
      'Scanning assistant responses currently loaded in this provider page.',
    );
    scan();
  });

  function scheduleScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 500);
  }

  const observer = new MutationObserver(scheduleScan);
  const start = () => {
    if (!document.documentElement) return;
    reportStatus('ready', 0, 'The WillAI-C provider adapter is loaded on this page.');
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    scan();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  ipcRenderer.on('willai:provider-capture-result', (_event, result) => {
    const waiting = inFlight.get(result?.captureId);
    if (!waiting) return;
    inFlight.delete(result.captureId);
    pending.delete(waiting.element);
    if (result.ok) {
      seen.set(waiting.element, waiting.hash);
      retries.delete(waiting.element);
      return;
    }
    const attempts = retries.get(waiting.element) || 0;
    reportStatus('capture-error', 1, 'The answer was detected but could not be saved: ' + String(result.error || 'unknown error'));
    if (attempts < 3) {
      retries.set(waiting.element, attempts + 1);
      setTimeout(scheduleScan, 1200 * (attempts + 1));
    }
  });

  function findComposer() {
    const composerSelectors = provider === 'chatgpt'
      ? [
        '#prompt-textarea',
        'textarea[name="prompt-textarea"]',
        'textarea#mobile-composer-prompt',
        'textarea[data-testid="prompt-textarea"]',
        '[contenteditable="true"][data-testid="prompt-textarea"]',
        '[contenteditable="true"][role="textbox"]',
      ]
      : provider === 'claude'
        ? [
          'div[contenteditable="true"].ProseMirror',
          '[contenteditable="true"][data-placeholder]',
          'textarea',
        ]
        : [
          '#chat-input',
          'textarea[placeholder*="Send a message" i]',
          'textarea[data-testid="chat-input"]',
          'div[contenteditable="true"][role="textbox"]',
          'textarea',
          '[contenteditable="true"]',
        ];

    for (const selector of composerSelectors) {
      let composer = null;
      try { composer = document.querySelector(selector); } catch { continue; }
      if (composer instanceof HTMLElement && composer.isConnected
        && composer.getClientRects().length > 0
        && composer.getAttribute('aria-disabled') !== 'true'
        && composer.getAttribute('disabled') === null) return composer;
    }
    return null;
  }

  function readComposerText(composer) {
    if (!composer) return '';
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) return composer.value || '';
    return String(composer.innerText || composer.textContent || '');
  }

  function prepareComposerForNativeInsert(composer) {
    composer.focus();
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      if (composer.value.trim()) {
        return { ok: false, error: 'The provider composer already contains unsent text. Clear it before sending a new WillAI-C request.' };
      }
      composer.setSelectionRange(0, 0);
      return { ok: true };
    }

    if (readComposerText(composer).trim()) {
      return { ok: false, error: 'The provider composer already contains unsent text. Clear it before sending a new WillAI-C request.' };
    }
    const selection = window.getSelection();
    if (!selection) return { ok: false, error: 'Could not focus the provider composer selection.' };
    const range = document.createRange();
    range.selectNodeContents(composer);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return { ok: true };
  }

  function normaliseComposerText(value) {
    return String(value || '').replace(/\\u00a0/g, ' ').replace(/\\r/g, '').trim();
  }

  function findSendButton(composer) {
    if (!composer) return null;
    const selectors = provider === 'chatgpt'
      ? [
        '#composer-submit-button',
        'button#composer-submit-button',
        'button[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label="Send message"]',
        'button[aria-label="Send"]',
        'button[type="submit"]',
      ]
      : provider === 'claude'
        ? [
          'button[data-testid="send-button"]',
          'button[aria-label="Send message"]',
          'button[aria-label="Send"]',
          'button[type="submit"]',
        ]
        : [
          'button[aria-label="Send message"]',
          '[data-testid="send-button"]',
          'button[type="submit"]',
          '[role="button"][aria-label="Send message"]',
          '[role="button"][aria-label="Send"]',
        ];

    const form = composer.closest('form');
    const shell = composer.closest('[data-testid*="composer"], [class*="composer"], [class*="Composer"]');
    const fallbackScope = shell || form || composer.parentElement?.parentElement?.parentElement || composer.parentElement;
    const scopes = [form, shell, fallbackScope].filter((scope, index, all) => scope && all.indexOf(scope) === index);

    for (const scope of scopes) {
      for (const selector of selectors) {
        let buttons = [];
        try { buttons = Array.from(scope.querySelectorAll(selector)); } catch { continue; }
        const button = buttons.find((candidate) => candidate instanceof HTMLElement
          && candidate.getClientRects().length > 0
          && !candidate.disabled
          && candidate.getAttribute('aria-disabled') !== 'true');
        if (button) return button;
      }
    }
    return null;
  }

  const pendingSubmissions = new Set();
  const submissionComposers = new Map();

  function reportPromptSubmission(requestId, ok, error) {
    pendingSubmissions.delete(requestId);
    submissionComposers.delete(requestId);
    ipcRenderer.send('willai:prompt-submit-result', { requestId, provider, ok, ...(error ? { error } : {}) });
  }

  function verifyPromptStarted(requestId, attempt = 0) {
    if (!pendingSubmissions.has(requestId)) return;
    const composer = submissionComposers.get(requestId);
    const text = normaliseComposerText(readComposerText(composer));
    if (!text || isProviderGenerating()) {
      reportPromptSubmission(requestId, true);
      return;
    }
    if (attempt >= 20) {
      reportPromptSubmission(requestId, false, 'The provider send control was activated, but the page did not confirm that generation started. Check the open provider tab before retrying.');
      return;
    }
    setTimeout(() => verifyPromptStarted(requestId, attempt + 1), 250);
  }

  function waitForSendControl(requestId, attempt = 0) {
    if (!pendingSubmissions.has(requestId)) return;
    const composer = submissionComposers.get(requestId);
    const button = findSendButton(composer);
    if (button) {
      try {
        button.click();
        setTimeout(() => verifyPromptStarted(requestId), 250);
      } catch (error) {
        reportPromptSubmission(requestId, false, error instanceof Error ? error.message : 'The send button could not be activated.');
      }
      return;
    }
    if (attempt >= 49) {
      reportPromptSubmission(requestId, false, 'The prompt was inserted, but the provider composer did not expose an enabled send control. Open Browser to inspect the provider page.');
      return;
    }
    setTimeout(() => waitForSendControl(requestId, attempt + 1), 200);
  }

  function requestNativePromptInsert(requestId, attempt = 0) {
    if (!pendingSubmissions.has(requestId)) return;
    const composer = findComposer();
    if (composer) {
      const prepared = prepareComposerForNativeInsert(composer);
      if (!prepared.ok) {
        reportPromptSubmission(requestId, false, prepared.error);
        return;
      }
      submissionComposers.set(requestId, composer);
      ipcRenderer.send('willai:provider-composer-ready', { requestId, provider });
      return;
    }
    if (attempt >= 59) {
      reportPromptSubmission(requestId, false, 'The provider page loaded, but its prompt composer did not become available. Open Browser to inspect the signed-in provider page.');
      return;
    }
    setTimeout(() => requestNativePromptInsert(requestId, attempt + 1), 200);
  }

  ipcRenderer.on('willai:provider-text-inserted', (_event, result) => {
    const requestId = String(result?.requestId || '');
    if (!requestId || !pendingSubmissions.has(requestId)) return;
    if (!result.ok) {
      reportPromptSubmission(requestId, false, String(result.error || 'Electron could not insert text into the provider composer.'));
      return;
    }
    const composer = submissionComposers.get(requestId);
    const actual = normaliseComposerText(readComposerText(composer));
    if (!actual) {
      reportPromptSubmission(requestId, false, 'Electron reported text insertion, but the provider composer remained empty.');
      return;
    }
    setTimeout(() => waitForSendControl(requestId), 250);
  });

  ipcRenderer.on('willai:send-prompt', (_event, request) => {
    const requestId = String(request?.requestId || '');
    if (!requestId || pendingSubmissions.has(requestId)) return;
    if (request?.provider !== provider) {
      ipcRenderer.send('willai:prompt-submit-result', { requestId, provider, ok: false, error: 'The request was routed to a different provider page.' });
      return;
    }
    pendingSubmissions.add(requestId);
    requestNativePromptInsert(requestId);
  });



  ipcRenderer.on('willai:insert-context', (_event, context) => {
    const text = '--- WillAI-C shared context ---\n'
      + String(context || '')
      + '\n--- End WillAI-C shared context ---\n\n';
    insertTextIntoComposer(text);
  });

  ipcRenderer.on('willai:insert-prompt', (_event, prompt) => {
    insertTextIntoComposer(String(prompt || ''));
  });
})();
