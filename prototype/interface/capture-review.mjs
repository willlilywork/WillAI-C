import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, 'review', 'screenshots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

async function startPage(width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(here, 'index.html')).href);
  await page.waitForTimeout(150);
  return page;
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(output, name), fullPage: false });
}
async function clickDest(page, dest) {
  await page.locator('.rail-btn[data-dest="' + dest + '"]').click();
  await page.waitForTimeout(100);
  const viewport = page.viewportSize();
  await page.mouse.move(viewport.width - 16, viewport.height - 16);
}
async function assertNoHorizontalOverflow(page, width) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.viewport + 1,
    'Horizontal overflow at ' + width + 'px: ' + JSON.stringify(dimensions));
}

try {
  const page = await startPage(1440, 900);

  // The app now opens directly into New Conversation.
  assert.ok((await page.locator('h1').innerText()).includes('Start a new conversation'));
  assert.ok(await page.locator('#providerSelect').isVisible());
  await shot(page, 'v2-01-new-conversation-1440x900.png');

  // Provider choice and the local-only request-to-response presentation.
  await page.locator('#newChatInput').fill('Design a local-first research workspace for WillAI-C.');
  await page.locator('#providerSelect').selectOption('Claude');
  await page.locator('#sendNewChat').click();
  assert.ok((await page.locator('body').innerText()).includes('Design a local-first research workspace for WillAI-C.'));
  assert.ok((await page.locator('body').innerText()).includes('SIMULATED RESPONSE'));
  assert.ok((await page.locator('body').innerText()).includes('No request was sent to Claude'));
  await shot(page, 'v2-02-conversation-response-1440x900.png');

  // Tree begins as the current linear conversation path, then supports branching.
  await page.locator('[data-go="tree"]').first().click();
  assert.equal(await page.locator('.tree-node').count(), 2);
  assert.ok((await page.locator('.tree-status').innerText()).includes('1 path'));
  await shot(page, 'v2-03-conversations-tree-linear-1440x900.png');
  await page.locator('[data-branch-node="t2"]').click();
  assert.equal(await page.locator('.tree-node').count(), 3);
  assert.equal(await page.locator('.tree-node.branch').count(), 1);
  assert.ok((await page.locator('.tree-status').innerText()).includes('2 paths'));
  await shot(page, 'v2-04-conversations-tree-branched-1440x900.png');

  // Existing destinations remain available.
  await clickDest(page, 'home');
  await shot(page, 'v2-05-home-1440x900.png');
  await clickDest(page, 'work');
  await page.locator('#workSearch').fill('knowledge');
  assert.ok((await page.locator('#conversationList').innerText()).includes('knowledge'));
  await page.locator('#workSearch').fill('');
  await shot(page, 'v2-06-work-library-1440x900.png');
  await page.locator('[data-open-conv="c1"]').click();
  await shot(page, 'v2-07-conversation-1440x900.png');
  await page.locator('[data-go="workbench"]').first().click();
  await shot(page, 'v2-08-workbench-working-1440x900.png');

  const sourceText = 'The original response should remain immutable. It is the evidence of what the provider returned at a particular time, including its wording, formatting, and source context.';
  const firstBlock = page.locator('.doc-block[data-block="idea"]');
  await firstBlock.evaluate(el => {
    el.innerText = 'Edited working copy for the preservation test.';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('[data-mode="original"]').click();
  assert.ok((await page.locator('.doc-block[data-block="idea"]').innerText()).includes(sourceText));
  assert.ok(!(await page.locator('#document').innerText()).includes('Edited working copy for the preservation test.'));
  await page.locator('[data-mode="working"]').click();
  assert.ok((await page.locator('.doc-block[data-block="idea"]').innerText()).includes('Edited working copy for the preservation test.'));
  await page.locator('.doc-block[data-block="idea"]').evaluate((el, text) => {
    el.innerText = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, sourceText);
  await page.locator('[data-mode="original"]').click();
  await shot(page, 'v2-09-workbench-original-1440x900.png');
  await page.locator('[data-mode="working"]').click();
  await page.locator('[data-open-inspector="context"]').click();
  await page.locator('.inspector-tab[data-inspect="context"]').click();
  await page.locator('input[data-context="idea"]').check();
  assert.ok((await page.locator('#contextPreview').innerText()).includes('Preserve the source response'));
  await shot(page, 'v2-10-model-context-1440x900.png');
  await page.locator('#inspectorClose').click();
  await page.locator('[data-action="explain"]').click();
  assert.ok((await page.locator('#document').innerText()).includes('AI-generated child'));
  await shot(page, 'v2-11-child-artifact-1440x900.png');

  await page.waitForFunction(() => !document.querySelector('#toastRoot .toast'), { timeout: 5000 });
  await clickDest(page, 'browser');
  await shot(page, 'v2-12-browser-session-1440x900.png');
  await clickDest(page, 'prompts');
  await page.locator('#variableValue').fill('structured response model');
  assert.ok((await page.locator('#promptPreview').innerText()).includes('structured response model'));
  await shot(page, 'v2-13-prompts-1440x900.png');
  await clickDest(page, 'notes');
  await shot(page, 'v2-14-notes-1440x900.png');
  await page.locator('#searchOpen').click();
  await page.locator('#commandInput').fill('Workbench');
  await shot(page, 'v2-15-command-palette-1440x900.png');
  await page.close();

  for (const size of [{ w: 1280, h: 800 }, { w: 1024, h: 768 }, { w: 900, h: 700 }]) {
    const p = await startPage(size.w, size.h);
    await clickDest(p, 'home');
    assert.ok(await p.getByRole('heading', { name: 'Continue working' }).isVisible());
    await assertNoHorizontalOverflow(p, size.w);
    await shot(p, 'v2-responsive-home-' + size.w + 'x' + size.h + '.png');
    await clickDest(p, 'newchat');
    await shot(p, 'v2-responsive-new-conversation-' + size.w + 'x' + size.h + '.png');
    await clickDest(p, 'tree');
    await shot(p, 'v2-responsive-tree-' + size.w + 'x' + size.h + '.png');
    await clickDest(p, 'work');
    await p.locator('[data-open-conv="c1"]').click();
    await p.locator('[data-go="workbench"]').first().click();
    await shot(p, 'v2-responsive-workbench-' + size.w + 'x' + size.h + '.png');
    await clickDest(p, 'browser');
    await shot(p, 'v2-responsive-browser-' + size.w + 'x' + size.h + '.png');
    await assertNoHorizontalOverflow(p, size.w);
    await p.close();
  }

  console.log('Captured 27 review screenshots. New conversation, provider selection, response placeholder, branching, existing workspaces, immutable original, context selection, and responsive smoke checks: PASS');
} finally {
  await browser.close();
}
