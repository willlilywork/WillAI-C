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
  let scanTimer = null;
  let lastStatusKey = '';

  const selectors = {
    chatgpt: [
      '[data-message-author-role="assistant"]',
      'main [data-testid^="conversation-turn-"] [data-message-author-role="assistant"]',
    ],
    claude: [
      '.font-claude-message',
      '[data-testid="chat-message"][data-is-streaming="false"]',
      '[data-testid="chat-message"] .markdown',
    ],
    deepseek: [
      '.ds-markdown',
      '[data-message-author-role="assistant"]',
    ],
  };

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

  function textOf(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll(
      'button, svg, [aria-hidden="true"], [data-testid*="copy"], [data-testid*="feedback"], [data-testid*="toolbar"]',
    ).forEach((node) => node.remove());
    return String(clone.innerText || clone.textContent || '').replace(/\r/g, '').trim();
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

  function collectCandidates() {
    const unique = new Set();
    for (const selector of selectors[provider]) {
      document.querySelectorAll(selector).forEach((element) => unique.add(element));
    }

    return [...unique].filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      if (provider === 'deepseek' && element.closest('[data-message-author-role="user"]')) return false;
      if (provider === 'claude') {
        const role = (element.getAttribute('data-message-author-role') || '').toLowerCase();
        const testId = (element.getAttribute('data-testid') || '').toLowerCase();
        const label = (element.getAttribute('aria-label') || '').toLowerCase();
        if (role === 'user' || testId.includes('human') || label.includes('user message')) return false;
      }
      return true;
    });
  }

  function scan() {
    const elements = collectCandidates();
    let usableCount = 0;

    for (const element of elements) {
      if (!element.isConnected) continue;
      const text = textOf(element);
      if (text.length < 12 || text.length > 120000) continue;
      usableCount += 1;

      const hash = simpleHash(text);
      if (seen.get(element) === hash || pending.get(element) === hash) continue;
      pending.set(element, hash);

      setTimeout(() => {
        if (!element.isConnected) {
          pending.delete(element);
          return;
        }

        const stableText = textOf(element);
        const stableHash = simpleHash(stableText);
        if (stableHash !== hash) {
          pending.delete(element);
          scheduleScan();
          return;
        }

        pending.delete(element);
        if (stableText.length < 12 || seen.get(element) === stableHash) return;

        seen.set(element, stableHash);
        const blocks = stableText.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
        ipcRenderer.send('willai:provider-response', {
          provider,
          sourceMessageId: stableMessageId(element),
          text: stableText,
          blocks,
        });
        reportStatus('response-sent', usableCount, 'An assistant response was sent to WillAI-C for storage.');
      }, 1400);
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

  ipcRenderer.on('willai:insert-context', (_event, context) => {
    const text = '--- WillAI-C shared context ---\n'
      + String(context || '')
      + '\n--- End WillAI-C shared context ---\n\n';
    const composerSelectors = provider === 'chatgpt'
      ? ['#prompt-textarea', 'textarea[data-testid="prompt-textarea"]', '[contenteditable="true"][data-testid="prompt-textarea"]']
      : provider === 'claude'
        ? ['div[contenteditable="true"].ProseMirror', '[contenteditable="true"][data-placeholder]', 'textarea']
        : ['textarea', '[contenteditable="true"]'];

    let composer = null;
    for (const selector of composerSelectors) {
      composer = document.querySelector(selector);
      if (composer) break;
    }
    if (!composer) {
      ipcRenderer.send('willai:context-insert-result', { ok: false, error: 'Could not find the prompt composer on this page.' });
      return;
    }

    composer.focus();
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const start = composer.selectionStart ?? composer.value.length;
      const end = composer.selectionEnd ?? composer.value.length;
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(composer), 'value')?.set;
      setter?.call(composer, composer.value.slice(0, start) + text + composer.value.slice(end));
      composer.setSelectionRange(start + text.length, start + text.length);
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    } else {
      const inserted = document.execCommand('insertText', false, text);
      if (!inserted) {
        const selection = window.getSelection();
        if (selection) {
          const range = selection.rangeCount ? selection.getRangeAt(0) : document.createRange();
          range.deleteContents();
          range.insertNode(document.createTextNode(text));
          selection.removeAllRanges();
          selection.addRange(range);
        }
        composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
    }

    ipcRenderer.send('willai:context-insert-result', { ok: true });
  });
})();
