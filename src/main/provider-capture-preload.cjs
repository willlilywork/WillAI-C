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
  let scanTimer;

  const selectors = {
    chatgpt: '[data-message-author-role="assistant"], article[data-testid^="conversation-turn"] [data-message-author-role="assistant"]',
    claude: '.font-claude-message, [data-testid="chat-message"][data-is-streaming="false"]',
    deepseek: '.ds-markdown, [data-message-author-role="assistant"]',
  };

  function textOf(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('button, svg, [aria-hidden="true"], [data-testid*="copy"]').forEach((node) => node.remove());
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

  function scan() {
    const elements = [...document.querySelectorAll(selectors[provider])];
    for (const element of elements) {
      if (!(element instanceof HTMLElement)) continue;
      if (provider === 'deepseek' && element.closest('[data-message-author-role="user"]')) continue;
      const text = textOf(element);
      if (text.length < 12 || text.length > 120000) continue;

      const hash = simpleHash(text);
      if (seen.get(element) === hash || pending.get(element) === hash) continue;
      pending.set(element, hash);

      setTimeout(() => {
        const stableText = textOf(element);
        const stableHash = simpleHash(stableText);
        if (stableHash !== hash) {
          pending.delete(element);
          scan();
          return;
        }
        pending.delete(element);
        if (seen.get(element) === stableHash) return;
        seen.set(element, stableHash);
        const messageId = element.getAttribute('data-message-id')
          || element.getAttribute('data-testid')
          || element.id
          || null;
        const blocks = stableText.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
        ipcRenderer.send('willai:provider-response', {
          provider,
          sourceMessageId: messageId ? String(messageId).slice(0, 200) : null,
          text: stableText,
          blocks,
        });
      }, 1400);
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 500);
  }

  const observer = new MutationObserver(scheduleScan);
  const start = () => {
    if (!document.documentElement) return;
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    scan();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  ipcRenderer.on('willai:insert-context', (_event, context) => {
    const text = `--- WillAI-C shared context ---\n${String(context || '')}\n--- End WillAI-C shared context ---\n\n`;
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
