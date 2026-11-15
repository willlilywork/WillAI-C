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
      'main [data-message-author-role="assistant"]',
      '[data-message-author-role="assistant"]',
      'main [data-testid^="conversation-turn-"] .markdown',
      'main article[data-testid*="conversation-turn"] .markdown',
      'main .markdown.prose',
    ],
    claude: [
      '.font-claude-message',
      '[data-testid="chat-message"][data-is-streaming="false"]',
      '[data-testid="chat-message"] .markdown',
      '[data-testid="chat-message"]',
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
    for (const selector of selectors[provider]) {
      const matches = Array.from(document.querySelectorAll(selector)).filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        if (element.closest('[data-message-author-role="user"], [data-testid*="user-message"]')) return false;
        const role = (element.getAttribute('data-message-author-role') || '').toLowerCase();
        const testId = (element.getAttribute('data-testid') || '').toLowerCase();
        const label = (element.getAttribute('aria-label') || '').toLowerCase();
        if (role === 'user' || testId.includes('human') || label.includes('user message')) return false;
        return true;
      });
      const outermost = matches.filter((element) =>
        !matches.some((other) => other !== element && other.contains(element)),
      );
      if (outermost.length) return outermost;
    }
    return [];
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
          pending.delete(element);
          scheduleScan();
          return;
        }

        pending.delete(element);
        if (stableText.length < 1 || seen.get(element) === stableHash) return;

        seen.set(element, stableHash);
        ipcRenderer.send('willai:provider-response', {
          provider,
          sourceMessageId: stableMessageId(element),
          text: stableText,
        });
        // The main process reports success only after LocalStore.capture completes.
        // Do not publish a provisional success here: it could arrive after and mask
        // a persistence error from the main process.
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
