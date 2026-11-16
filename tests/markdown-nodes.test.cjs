const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMarkdownNodes } = require('../src/main/markdown-nodes.cjs');

test('Markdown headings create a hierarchy and paragraphs attach to their heading', () => {
  const nodes = parseMarkdownNodes([
    '# Project',
    '',
    'Intro paragraph.',
    '',
    '## Decisions',
    '',
    'Decision paragraph.',
    '',
    '### Detail',
    '',
    'Detail paragraph.',
  ].join('\n'));

  const project = nodes.find((node) => node.content === '# Project');
  const decisions = nodes.find((node) => node.content === '## Decisions');
  const detail = nodes.find((node) => node.content === '### Detail');
  const intro = nodes.find((node) => node.content === 'Intro paragraph.');
  const decisionText = nodes.find((node) => node.content === 'Decision paragraph.');
  const detailText = nodes.find((node) => node.content === 'Detail paragraph.');

  assert.equal(project.nodeType, 'heading');
  assert.equal(decisions.parentIndex, nodes.indexOf(project));
  assert.equal(detail.parentIndex, nodes.indexOf(decisions));
  assert.equal(intro.parentIndex, nodes.indexOf(project));
  assert.equal(decisionText.parentIndex, nodes.indexOf(decisions));
  assert.equal(detailText.parentIndex, nodes.indexOf(detail));
});

test('nested Markdown lists become parent and child nodes while retaining inline Markdown', () => {
  const nodes = parseMarkdownNodes([
    '## Plan',
    '',
    '- First **important** item',
    '  - Nested item',
    '  - Second nested item',
    '- Second root item',
  ].join('\n'));

  const root = nodes.find((node) => node.content === '## Plan');
  const first = nodes.find((node) => node.content === 'First **important** item');
  const nested = nodes.find((node) => node.content === 'Nested item');
  const secondNested = nodes.find((node) => node.content === 'Second nested item');
  const secondRoot = nodes.find((node) => node.content === 'Second root item');

  assert.equal(first.nodeType, 'list-item');
  assert.equal(first.parentIndex, nodes.indexOf(root));
  assert.equal(nested.parentIndex, nodes.indexOf(first));
  assert.equal(secondNested.parentIndex, nodes.indexOf(first));
  assert.equal(secondRoot.parentIndex, nodes.indexOf(root));
  assert.equal(first.listOrdered, false);
});

test('ordered lists retain their ordered-list metadata', () => {
  const nodes = parseMarkdownNodes('1. One\n2. Two');
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].listOrdered, true);
  assert.equal(nodes[0].listStart, 1);
  assert.equal(nodes[1].position, 1);
});

test('fenced code blocks and tables remain intact as individual Markdown nodes', () => {
  const fence = String.fromCharCode(96).repeat(3);
  const markdown = [
    fence + 'typescript',
    'const answer = 42;',
    fence,
    '',
    '| Name | Value |',
    '| --- | --- |',
    '| Alpha | **One** |',
  ].join('\n');
  const nodes = parseMarkdownNodes(markdown);

  assert.equal(nodes[0].nodeType, 'code');
  assert.match(nodes[0].content, /typescript/);
  assert.match(nodes[0].content, /const answer = 42;/);
  assert.equal(nodes[1].nodeType, 'table');
  assert.equal(nodes[1].content, '| Name | Value |\n| --- | --- |\n| Alpha | **One** |');
});

test('a plain-text response is preserved as a paragraph node', () => {
  const source = 'A short answer without Markdown.';
  const nodes = parseMarkdownNodes(source);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].content, source);
  assert.equal(nodes[0].nodeType, 'paragraph');
});
