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

  const capturedHashes = new WeakMap();
  const pendingHashes = new WeakMap();
  let scanTimer;

  function candidates() {
    if (provider === 'chatgpt') {
      return [...document.querySelectorAll('[data-message-author-role="assistant"]')];
    }
    if (provider === 'claude') {
      const messageBodies = [...document.querySelectorAll('.font-claude-message')];
      if (messageBodies.length) return messageBodies;
      return [...document.querySelectorAll('[data-testid="chat-message"]')]
        .filter((element) => /assistant/i.test(element.getAttribute('data-testid') || ''));
    }
    return [...document.querySelectorAll('.ds-markdown, [data-role="assistant"] .markdown-body')]
      .filter((element) => !element.parentElement?.closest('.ds-markdown')); 
  }

  function textOf(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('button, svg, [aria-hidden="true"], [data-testid*="copy"]').forEach((node) => node.remove());
    return String(clone.innerText || clone.textContent || '').replace(/\r/g, '').trim();
  }

  function hashText(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function sourceMessageId(element) {
    return element.getAttribute('data-message-id') || element.id || null;
  }

  function scheduleCapture(element) {
    const text = textOf(element);
    if (text.length < 8) return;
    const hash = hashText(text);
    if (capturedHashes.get(element) === hash || pendingHashes.get(element) === hash) return;
    pendingHashes.set(element, hash);

    window.setTimeout(() => {
      const latestText = textOf(element);
      const latestHash = hashText(latestText);
      if (latestHash !== hash) {
        pendingHashes.delete(element);
        scheduleCapture(element);
        return;
      }
      pendingHashes.delete(element);
      capturedHashes.set(element, hash);

      const blocks = latestText.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
      chrome.runtime.sendMessage({
        type: 'WILLAI_CAPTURE_RESPONSE',
        payload: {
          provider,
          sourceUrl: `${location.origin}${location.pathname}`,
          title: document.title,
          sourceMessageId: sourceMessageId(element),
          text: latestText,
          blocks,
        },
      }, (result) => {
        // Keep the response eligible for a manual re-scan if pairing is incomplete.
        if (chrome.runtime.lastError || !result?.ok) capturedHashes.delete(element);
      });
    }, 1500);
  }

  function scan() {
    for (const element of candidates()) scheduleCapture(element);
  }

  function queueScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 350);
  }

  const observer = new MutationObserver(queueScan);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  scan();

  function findComposer() {
    const selectors = provider === 'chatgpt'
      ? ['#prompt-textarea', '[data-testid="prompt-textarea"]', 'textarea']
      : provider === 'claude'
        ? ['div.ProseMirror[contenteditable="true"]', '[contenteditable="true"]', 'textarea']
        : ['textarea', '[contenteditable="true"]'];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.getClientRects().length) return element;
    }
    return null;
  }

  function insertSharedContext(context) {
    const composer = findComposer();
    if (!composer) return false;

    const wrapped = `--- WillAI-C shared context ---\n${context}\n--- End WillAI-C shared context ---\n\n`;
    composer.focus();

    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const existing = composer.value || '';
      composer.value = `${wrapped}${existing}`;
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: wrapped }));
      return true;
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(composer);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const inserted = document.execCommand('insertText', false, wrapped);
    if (!inserted) composer.textContent = `${wrapped}${composer.textContent || ''}`;
    composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: wrapped }));
    return true;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'WILLAI_RESCAN') {
      scan();
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type !== 'WILLAI_INSERT_CONTEXT') return undefined;
    const inserted = insertSharedContext(String(message.context || ''));
    sendResponse({ ok: inserted, error: inserted ? undefined : 'Could not find the AI message composer on this page.' });
    return false;
  });
})();
