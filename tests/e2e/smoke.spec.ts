import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/** Draws a PNG in the browser: gradient, dark disc and bar on a light ground. */
async function testPng(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(320, 240);
    const c = canvas.getContext('2d');
    if (!c) throw new Error('No 2D context');
    const ground = c.createLinearGradient(0, 0, 320, 240);
    ground.addColorStop(0, '#f4f4f4');
    ground.addColorStop(1, '#7a7a7a');
    c.fillStyle = ground;
    c.fillRect(0, 0, 320, 240);
    c.fillStyle = '#202020';
    c.beginPath();
    c.arc(200, 110, 70, 0, 2 * Math.PI);
    c.fill();
    c.fillStyle = '#5a2020';
    c.fillRect(40, 60, 50, 160);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  return Buffer.from(bytes);
}

async function upload(page: Page): Promise<void> {
  await page.locator('#file-input').setInputFiles({
    name: 'test-scene.png',
    mimeType: 'image/png',
    buffer: await testPng(page),
  });
  await expect(page.locator('#image-info')).toHaveText('test-scene.png · 320×240');
}

async function downloadSvg(page: Page): Promise<{ name: string; svg: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download SVG' }).click(),
  ]);
  const path = await download.path();
  return { name: download.suggestedFilename(), svg: await readFile(path, 'utf8') };
}

/** Collects page errors and failed requests, which should never happen. */
function watchForProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return problems;
}

test('loads from a subpath with privacy note and credits', async ({ page }) => {
  const problems = watchForProblems(page);
  await page.goto('./');
  await expect(page).toHaveTitle('Line Art Playground');
  await expect(page.getByText('Your images are never uploaded')).toBeVisible();
  const credits = page.locator('#credits');
  for (const author of ['Lingdong Huang', 'Maksim Surguy', 'Gregg Wygonik']) {
    await expect(credits).toContainText(author);
  }
  await expect(page.locator('#algorithm-select option')).toHaveText(['SquiggleCam', 'linedraw']);
  expect(problems).toEqual([]);
});

test('SquiggleCam draws an uploaded image and exports SVG', async ({ page }) => {
  const problems = watchForProblems(page);
  await page.goto('./');
  await upload(page);

  // SquiggleCam redraws automatically. The 500×375 drawing has a line every
  // floor(375 / 50) = 7 px, i.e. 54 lines of 500 points.
  await expect(page.locator('#result-image')).toBeVisible();
  await expect(page.locator('#result-stats')).toHaveText('54 strokes · 27,000 points');

  const lineCount = page.getByRole('spinbutton', { name: 'Line count value' });
  await lineCount.fill('20');
  await lineCount.press('Enter');
  // floor(375 / 20) = 18 px apart: 21 lines.
  await expect(page.locator('#result-stats')).toHaveText('21 strokes · 10,500 points');

  const { name, svg } = await downloadSvg(page);
  expect(name).toBe('test-scene-squigglecam.svg');
  expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 500 375"/);
  expect(svg.match(/<path d="M [^"]+"/g)).toHaveLength(21);
  expect(problems).toEqual([]);
});

test('linedraw initialises Pyodide and exports SVG', async ({ page }) => {
  const problems = watchForProblems(page);
  await page.goto('./');
  await upload(page);
  await page.locator('#algorithm-select').selectOption('linedraw');
  await expect(page.locator('#runtime-note')).toContainText('downloads a Python runtime');

  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(page.locator('#status')).toHaveText(/^Done in/, { timeout: 240_000 });
  await expect(page.locator('#result-image')).toBeVisible();

  const { name, svg } = await downloadSvg(page);
  expect(name).toBe('test-scene-linedraw.svg');
  expect(svg).toMatch(/^<svg [^>]*width="[\d.]+" height="[\d.]+" viewBox="[-\d. ]+"/);
  const polylines = svg.match(/<polyline points="[^"]+"/g) ?? [];
  expect(polylines.length).toBeGreaterThan(10);
  await expect(page.locator('#result-stats')).toContainText(`${polylines.length} strokes`);
  expect(problems).toEqual([]);
});
