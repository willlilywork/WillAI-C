const MarkdownIt = require('markdown-it');

const parser = new MarkdownIt({
  html: false,
  linkify: false,
  breaks: false,
  typographer: false,
});

function quoteLines(value, depth) {
  const prefix = Array(Math.max(1, depth)).fill('>').join(' ') + ' ';
  return String(value).split('\n').map((line) => line ? prefix + line : '>').join('\n');
}

function parseMarkdownNodes(markdown) {
  const source = String(markdown ?? '').replace(/\r\n?/g, '\n').trim();
  if (!source) return [];

  const tokens = parser.parse(source, {});
  const sourceLines = source.split('\n');
  const nodes = [];
  const positions = new Map();
  const headingStack = [];
  const listStack = [];
  const listItemStack = [];

  let pendingHeadingLevel = null;
  let blockquoteDepth = 0;
  let tableDepth = 0;

  const currentHeadingParent = () => headingStack.at(-1)?.index ?? null;

  function addNode(content, parentIndex, nodeType, extra = {}) {
    const key = parentIndex === null ? 'root' : String(parentIndex);
    const position = positions.get(key) || 0;
    positions.set(key, position + 1);

    const index = nodes.length;
    nodes.push({
      content: String(content ?? '').trim(),
      parentIndex,
      nodeType,
      position,
      ...extra,
    });
    return index;
  }

  function appendToCurrentListItem(content) {
    const itemIndex = listItemStack.at(-1)?.index;
    if (itemIndex === undefined) return false;

    const node = nodes[itemIndex];
    node.content = node.content
      ? (node.content + '\n\n' + content).trim()
      : String(content).trim();
    return true;
  }

  for (const token of tokens) {
    if (tableDepth > 0) {
      if (token.type === 'table_close') tableDepth -= 1;
      continue;
    }

    if (token.type === 'heading_open') {
      pendingHeadingLevel = Number(String(token.tag || 'h1').slice(1)) || 1;
      continue;
    }

    if (token.type === 'heading_close') {
      pendingHeadingLevel = null;
      continue;
    }

    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      listStack.push({
        ordered: token.type === 'ordered_list_open',
        start: Number(token.attrGet('start') || 1),
        nextIndex: 0,
      });
      continue;
    }

    if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
      listStack.pop();
      continue;
    }

    if (token.type === 'list_item_open') {
      const parentIndex = listItemStack.length
        ? listItemStack.at(-1).index
        : currentHeadingParent();
      const list = listStack.at(-1) || { ordered: false, start: 1 };
      const listIndex = list.nextIndex++;
      const index = addNode('', parentIndex, 'list-item', {
        listOrdered: Boolean(list.ordered),
        listStart: list.start || 1,
        listIndex,
      });
      listItemStack.push({ index });
      continue;
    }

    if (token.type === 'list_item_close') {
      listItemStack.pop();
      continue;
    }

    if (token.type === 'blockquote_open') {
      blockquoteDepth += 1;
      continue;
    }

    if (token.type === 'blockquote_close') {
      blockquoteDepth = Math.max(0, blockquoteDepth - 1);
      continue;
    }

    if (token.type === 'table_open') {
      tableDepth = 1;
      const [start, end] = token.map || [];
      const tableMarkdown = Number.isInteger(start) && Number.isInteger(end)
        ? sourceLines.slice(start, end).join('\n')
        : '';
      if (tableMarkdown) {
        const parentIndex = listItemStack.length
          ? listItemStack.at(-1).index
          : currentHeadingParent();
        addNode(tableMarkdown, parentIndex, 'table');
      }
      continue;
    }

    if (token.type === 'inline') {
      let content = String(token.content || '').trim();
      if (!content) continue;

      if (pendingHeadingLevel !== null) {
        while (headingStack.length && headingStack.at(-1).level >= pendingHeadingLevel) {
          headingStack.pop();
        }
        const parentIndex = currentHeadingParent();
        const level = pendingHeadingLevel;
        const index = addNode('#'.repeat(level) + ' ' + content, parentIndex, 'heading', {
          headingLevel: level,
        });
        headingStack.push({ level, index });
        pendingHeadingLevel = null;
        continue;
      }

      if (blockquoteDepth > 0) content = quoteLines(content, blockquoteDepth);

      if (!appendToCurrentListItem(content)) {
        addNode(
          content,
          currentHeadingParent(),
          blockquoteDepth > 0 ? 'blockquote' : 'paragraph',
        );
      }
      continue;
    }

    if (token.type === 'fence' || token.type === 'code_block') {
      const [start, end] = token.map || [];
      let content = Number.isInteger(start) && Number.isInteger(end)
        ? sourceLines.slice(start, end).join('\n')
        : '';

      if (!content) {
        const info = token.type === 'fence' ? String(token.info || '').trim() : '';
        const code = String(token.content || '').replace(/\n+$/, '');
        const fence = String.fromCharCode(96).repeat(3);
        content = fence + info + '\n' + code + '\n' + fence;
      }

      const parentIndex = listItemStack.length
        ? listItemStack.at(-1).index
        : currentHeadingParent();
      addNode(content, parentIndex, 'code');
      continue;
    }

    if (token.type === 'hr') {
      const parentIndex = listItemStack.length
        ? listItemStack.at(-1).index
        : currentHeadingParent();
      addNode('---', parentIndex, 'divider');
      continue;
    }

    if (token.type === 'html_block') {
      const parentIndex = listItemStack.length
        ? listItemStack.at(-1).index
        : currentHeadingParent();
      addNode(String(token.content || ''), parentIndex, 'html');
    }
  }

  if (!nodes.length) addNode(source, null, 'paragraph');
  return nodes;
}

module.exports = { parseMarkdownNodes };
