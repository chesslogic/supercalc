import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff']
]);

function getContentType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
}

function resolveRequestPath(rootDir, requestPathname) {
  const normalizedPath = requestPathname === '/' ? '/index.html' : requestPathname;
  const decodedPath = decodeURIComponent(normalizedPath);
  const relativePath = decodedPath.replace(/^\/+/, '').split('/').join(path.sep);
  const resolvedPath = path.resolve(rootDir, relativePath);
  const pathFromRoot = path.relative(rootDir, resolvedPath);
  if (pathFromRoot.startsWith('..') || path.isAbsolute(pathFromRoot)) {
    return null;
  }
  return resolvedPath;
}

async function startStaticServer(rootDir = REPO_ROOT) {
  const server = createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Method not allowed');
      return;
    }

    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    const filePath = resolveRequestPath(rootDir, requestUrl.pathname);
    if (!filePath) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }

    try {
      const fileContents = await readFile(filePath);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': getContentType(filePath)
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      response.end(fileContents);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine local smoke-test server address.');
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}/`
  };
}

test('app boots without browser exceptions and attaches key dynamic UI', { timeout: 120000 }, async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => {
    server.close();
  });

  const browser = await chromium.launch({
    headless: true
  });
  t.after(async () => {
    await browser.close();
  });

  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const requestFailures = [];
  const badResponses = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error?.stack || error?.message || String(error));
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('requestfailed', (request) => {
    requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`);
  });
  page.on('response', (response) => {
    if (response.url().startsWith(url) && response.status() >= 400) {
      badResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(() => (
    window._weaponsState?.groups?.length > 0
    && window.enemyDataLoaded === true
    && document.querySelectorAll('#calculator-weapon-sort option').length > 0
    && document.getElementById('calculator-weapon-loading')?.classList.contains('hidden')
    && document.getElementById('calculator-enemy-loading')?.classList.contains('hidden')
  ));

  await page.click('button[data-tab="weapons"]');
  await page.waitForFunction(() => (
    document.querySelectorAll('#typeFilters .chip').length > 0
    && document.querySelectorAll('#roleFilters .chip').length > 0
  ));

  await page.click('button[data-tab="enemies"]');
  await page.waitForFunction(() => (
    document.querySelectorAll('#enemyFactionFilters .chip').length > 0
    && document.querySelectorAll('#enemyTableBody tr').length > 0
  ));

  const dynamicState = await page.evaluate(() => ({
    calculatorSortOptions: document.querySelectorAll('#calculator-weapon-sort option').length,
    weaponTypeChips: document.querySelectorAll('#typeFilters .chip').length,
    weaponRoleChips: document.querySelectorAll('#roleFilters .chip').length,
    enemyFactionChips: document.querySelectorAll('#enemyFactionFilters .chip').length,
    enemyTableRows: document.querySelectorAll('#enemyTableBody tr').length
  }));

  assert.ok(dynamicState.calculatorSortOptions > 0, 'expected calculator sort options to be populated');
  assert.ok(dynamicState.weaponTypeChips > 0, 'expected weapon type chips to be attached');
  assert.ok(dynamicState.weaponRoleChips > 0, 'expected weapon role chips to be attached');
  assert.ok(dynamicState.enemyFactionChips > 0, 'expected enemy faction chips to be attached');
  assert.ok(dynamicState.enemyTableRows > 0, 'expected enemy rows to be rendered');

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(requestFailures, []);
  assert.deepEqual(badResponses, []);
});
