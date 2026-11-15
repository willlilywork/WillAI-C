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
async function shot(page, name) { await page.screenshot({ path: path.join(output, name), fullPage: false }); }
async function clickDest(page, dest) {
  await page.locator('.rail-btn[data-dest="' + dest + '"]').click();
  await page.waitForTimeout(100);
}
try {
  const page = await startPage(1440, 900);
  await shot(page, '01-home-1440x900.png');
  await clickDest(page, 'work');
  await page.locator('#workSearch').fill('knowledge');
  assert.ok((await page.locator('#conversationList').innerText()).includes('knowledge'));
  await page.locator('#workSearch').fill('');
  await shot(page, '02-work-library-1440x900.png');
  await page.locator('[data-open-conv="c1"]').click();
  await shot(page, '03-conversation-1440x900.png');
  await page.locator('[data-go="workbench"]').first().click();
  await shot(page, '04-workbench-working-1440x900.png');
  const sourceText = 'The original response should remain immutable. It is the evidence of what the provider returned at a particular time, including its wording, formatting, and source context.';
  const firstBlock = page.locator('.doc-block[data-block="idea"]');
  await firstBlock.evaluate(el => { el.innerText = 'Edited working copy for the preservation test.'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('[data-mode="original"]').click();
  assert.ok((await page.locator('.doc-block[data-block="idea"]').innerText()).includes(sourceText));
  assert.ok(!(await page.locator('#document').innerText()).includes('Edited working copy for the preservation test.'));
  await page.locator('[data-mode="working"]').click();
  assert.ok((await page.locator('.doc-block[data-block="idea"]').innerText()).includes('Edited working copy for the preservation test.'));
  await page.locator('.doc-block[data-block="idea"]').evaluate((el, text) => { el.innerText = text; el.dispatchEvent(new Event('input', { bubbles: true })); }, sourceText);
  await page.locator('[data-mode="original"]').click();
  await shot(page, '05-workbench-original-1440x900.png');
  await page.locator('[data-mode="working"]').click();
  await page.locator('[data-open-inspector="context"]').click();
  await page.locator('.inspector-tab[data-inspect="context"]').click();
  await page.locator('input[data-context="idea"]').check();
  assert.ok((await page.locator('#contextPreview').innerText()).includes('Preserve the source response'));
  await shot(page, '06-model-context-1440x900.png');
  await page.locator('#inspectorClose').click();
  await page.locator('[data-action="explain"]').click();
  assert.ok((await page.locator('#document').innerText()).includes('AI-generated child'));
  await shot(page, '07-child-artifact-1440x900.png');
  await clickDest(page, 'browser');
  await shot(page, '08-browser-session-1440x900.png');
  await clickDest(page, 'prompts');
  await page.locator('#variableValue').fill('structured response model');
  assert.ok((await page.locator('#promptPreview').innerText()).includes('structured response model'));
  await shot(page, '09-prompts-1440x900.png');
  await clickDest(page, 'notes');
  await shot(page, '10-notes-1440x900.png');
  await page.locator('#searchOpen').click();
  await page.locator('#commandInput').fill('Workbench');
  await shot(page, '11-command-palette-1440x900.png');
  await page.close();
  for (const size of [{w:1280,h:800},{w:1024,h:768},{w:900,h:700}]) {
    const p = await startPage(size.w, size.h);
    await shot(p, 'responsive-home-' + size.w + 'x' + size.h + '.png');
    await clickDest(p, 'work');
    await p.locator('[data-open-conv="c1"]').click();
    await p.locator('[data-go="workbench"]').first().click();
    await shot(p, 'responsive-workbench-' + size.w + 'x' + size.h + '.png');
    await clickDest(p, 'browser');
    await shot(p, 'responsive-browser-' + size.w + 'x' + size.h + '.png');
    const dimensions = await p.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(dimensions.document <= dimensions.viewport + 1, 'Horizontal overflow at ' + size.w + 'px: ' + JSON.stringify(dimensions));
    await p.close();
  }
  console.log('Captured 20 prototype review screenshots. Interaction and responsive smoke checks: PASS');
} finally { await browser.close(); }
