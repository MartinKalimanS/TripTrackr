// Tests of the static-site builder (step S-32). Run with `npm run test:scripts` (node --test).
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import {
  buildSite,
  fillPlaceholders,
  renderMarkdown,
  resolveConfig,
} from './build-site.mjs';

const require = createRequire(import.meta.url);
const bridge = require('../site/src/assets/bridge.js');

const FULL_ENV = {
  SITE_CONTACT_EMAIL: 'help@example.test',
  SITE_COMPANY: 'Example Travel',
  SITE_LEGAL_ENTITY: 'Example Travel s.r.o.',
  SITE_ADDRESS: '1 Main Street, Prague',
  SITE_JURISDICTION: 'Czech Republic',
  SITE_LAST_UPDATED: '2026-11-14',
};

describe('renderMarkdown', () => {
  test('renders headings with ids, emphasis and code, escaping raw HTML', () => {
    const html = renderMarkdown(
      '## Your data\n\nSome **bold**, _soft_ and `x < y` <script>.',
    );
    assert.match(html, /<h2 id="your-data">Your data<\/h2>/);
    assert.match(html, /<strong>bold<\/strong>/);
    assert.match(html, /<em>soft<\/em>/);
    assert.match(html, /<code>x &lt; y<\/code>/);
    assert.doesNotMatch(html, /<script>/);
  });

  test('renders pipe tables and flat lists', () => {
    const html = renderMarkdown(
      '| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- one\n- two\n\n1. first\n2. second',
    );
    assert.match(html, /<th scope="col">A<\/th>/);
    assert.match(html, /<td>2<\/td>/);
    assert.match(html, /<ul>\n<li>one<\/li>\n<li>two<\/li>\n<\/ul>/);
    assert.match(html, /<ol>\n<li>first<\/li>/);
  });

  test('marks the draft banner and refuses unsafe link targets', () => {
    assert.match(renderMarkdown('> **Draft** - review'), /<blockquote class="notice">/);
    assert.doesNotMatch(
      renderMarkdown('[x](javascript:alert(1))'),
      /<a href="javascript/,
    );
  });
});

describe('fillPlaceholders', () => {
  const config = resolveConfig(FULL_ENV);

  test('fills known placeholders and escapes values', () => {
    const escaped = resolveConfig({
      ...FULL_ENV,
      SITE_COMPANY: 'x',
      SITE_LEGAL_ENTITY: 'A & B',
    });
    const { html, unresolved } = fillPlaceholders(
      '[[PLACEHOLDER: legal entity name]] [[PLACEHOLDER: contact email]]',
      escaped,
    );
    assert.match(html, /A &amp; B <a href="mailto:help@example.test">/);
    assert.deepEqual(unresolved, []);
  });

  test('reports placeholders the configuration cannot answer', () => {
    const { unresolved } = fillPlaceholders('[[PLACEHOLDER: hosting region]]', config);
    assert.deepEqual(unresolved, ['hosting region']);
  });

  test('leaves legal placeholders open when their variable is unset', () => {
    const { unresolved } = fillPlaceholders(
      '[[PLACEHOLDER: jurisdiction]]',
      resolveConfig({}),
    );
    assert.deepEqual(unresolved, ['jurisdiction']);
  });
});

describe('resolveConfig', () => {
  test('applies documented defaults', () => {
    const config = resolveConfig({});
    assert.equal(config.SITE_URL, 'https://triptrackr.app');
    assert.equal(config.SITE_CONTACT_EMAIL, 'support@triptrackr.app');
    assert.equal(config.SITE_APP_SCHEME, 'triptrackr');
  });

  test('rejects malformed values', () => {
    assert.throws(() => resolveConfig({ SITE_URL: 'http://evil.test/path' }), /SITE_URL/);
    assert.throws(
      () => resolveConfig({ SITE_CONTACT_EMAIL: 'nope' }),
      /SITE_CONTACT_EMAIL/,
    );
    assert.throws(() => resolveConfig({ SITE_APP_SCHEME: 'a b' }), /SITE_APP_SCHEME/);
  });
});

describe('buildSite', () => {
  let outDir;
  before(async () => {
    outDir = await mkdtemp(path.join(os.tmpdir(), 'site-'));
  });
  after(() => rm(outDir, { recursive: true, force: true }));

  test('writes every page, the assets and the host files', async () => {
    const result = await buildSite({ outDir, env: FULL_ENV });
    const files = await readdir(outDir);
    for (const name of [
      'index.html',
      'privacy.html',
      'terms.html',
      'account-deletion.html',
      'support.html',
      'reset-password.html',
      'verify-email.html',
      '404.html',
      'style.css',
      'bridge.js',
      'robots.txt',
      'sitemap.xml',
      '_headers',
    ]) {
      assert.ok(files.includes(name), `${name} missing`);
    }
    assert.ok(result.pages.length >= 8);
  });

  test('fills the contact email and leaves no template token behind', async () => {
    await buildSite({ outDir, env: FULL_ENV });
    const privacy = await readFile(path.join(outDir, 'privacy.html'), 'utf8');
    const support = await readFile(path.join(outDir, 'support.html'), 'utf8');
    assert.match(privacy, /mailto:help@example\.test/);
    assert.match(support, /help@example\.test/);
    assert.doesNotMatch(privacy, /\[\[PLACEHOLDER: contact email\]\]/);
    for (const name of await readdir(outDir)) {
      if (name.endsWith('.html')) {
        const html = await readFile(path.join(outDir, name), 'utf8');
        assert.doesNotMatch(html, /__[A-Z_]+__/, `${name} has an unfilled token`);
      }
    }
  });

  test('bridge pages are noindex, load an external script and have no inline script', async () => {
    await buildSite({ outDir, env: FULL_ENV });
    for (const name of ['reset-password.html', 'verify-email.html']) {
      const html = await readFile(path.join(outDir, name), 'utf8');
      assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
      assert.match(html, /<script src="\/bridge\.js" defer><\/script>/);
      assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>/);
      assert.match(html, /connect-src 'none'/);
      assert.match(html, /data-scheme="triptrackr"/);
    }
  });

  test('reports open placeholders, and strict mode fails on them', async () => {
    const result = await buildSite({ outDir, env: FULL_ENV });
    assert.ok(result.unresolved.length > 0);
    await assert.rejects(
      buildSite({ outDir, env: FULL_ENV, strict: true }),
      /Strict build failed/,
    );
  });
});

describe('bridge.js', () => {
  const TOKEN = 'abcdefghijklmnop_-0123456789ABCDEF';

  test('accepts exactly one well-formed token', () => {
    assert.equal(bridge.readToken(`?token=${TOKEN}`), TOKEN);
    assert.equal(bridge.readToken(`?x=1&token=${TOKEN}`), TOKEN);
  });

  test('rejects missing, short, long, odd-character and repeated tokens', () => {
    assert.equal(bridge.readToken(''), null);
    assert.equal(bridge.readToken('?token=short'), null);
    assert.equal(bridge.readToken(`?token=${'a'.repeat(201)}`), null);
    assert.equal(bridge.readToken(`?token=${TOKEN}%26x=1`), null);
    assert.equal(bridge.readToken('?token=aaaaaaaaaaaaaaaa"onload=1'), null);
    assert.equal(bridge.readToken(`?token=${TOKEN}&token=${TOKEN}`), null);
  });

  test('builds the deep link only for known targets and schemes', () => {
    assert.equal(
      bridge.buildDeepLink('triptrackr', 'reset-password', TOKEN),
      `triptrackr://reset-password?token=${TOKEN}`,
    );
    assert.equal(bridge.buildDeepLink('triptrackr', 'other', TOKEN), null);
    assert.equal(bridge.buildDeepLink('javascript:x', 'verify-email', TOKEN), null);
    assert.equal(bridge.buildDeepLink('triptrackr', 'verify-email', 'bad token'), null);
  });

  test('never logs, stores or sends the token', async () => {
    const source = await readFile(
      new URL('../site/src/assets/bridge.js', import.meta.url),
      'utf8',
    );
    const code = source.replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(
      code,
      /console\.|fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|WebSocket|indexedDB/,
    );
  });
});
