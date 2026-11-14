// Builds the static public site (step S-32) into site/dist. Dependency-free: Node only.
//
//   npm run site:build              build with whatever SITE_* variables are set
//   npm run site:build -- --strict  also fail while a [[PLACEHOLDER: ...]] or a draft banner remains
//
// Inputs:  docs/legal/*.md (privacy, terms, account deletion), site/src/** (layout, pages, assets).
// Output:  site/dist (git-ignored), one flat HTML file per page so /privacy, /reset-password etc.
//          resolve on GitHub Pages and Cloudflare Pages alike, query string intact.
//
// Configuration (all optional; documented in site/README.md):
//   SITE_URL             public origin of the site          default https://triptrackr.app
//   SITE_CONTACT_EMAIL   support and privacy mailbox         default support@triptrackr.app
//   SITE_COMPANY         brand shown in the site chrome      default TripTrackr
//   SITE_APP_SCHEME      deep-link scheme of the app         default triptrackr
//   Legal text only (no default: the placeholder stays, and --strict fails, until set):
//   SITE_LEGAL_ENTITY    operating entity, e.g. "Acme s.r.o."
//   SITE_ADDRESS         its registered address
//   SITE_JURISDICTION    governing law / courts
//   SITE_LAST_UPDATED    "Last updated" date of the legal texts

import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = Object.freeze({
  SITE_URL: 'https://triptrackr.app',
  SITE_CONTACT_EMAIL: 'support@triptrackr.app',
  SITE_COMPANY: 'TripTrackr',
  SITE_APP_SCHEME: 'triptrackr',
});

/** Legal markdown sources -> output page (clean URL: /privacy, /terms, /account-deletion). */
const LEGAL_PAGES = Object.freeze([
  { source: 'privacy-policy.md', out: 'privacy.html', title: 'Privacy Policy' },
  { source: 'terms-of-service.md', out: 'terms.html', title: 'Terms of Service' },
  {
    source: 'account-deletion.md',
    out: 'account-deletion.html',
    title: 'Delete your account',
  },
]);

const PLACEHOLDER_RE = /\[\[PLACEHOLDER:\s*([^\]]*?)\s*\]\]/g;
const TOKEN_RE = /__([A-Z][A-Z_]*[A-Z])__/g;
const DRAFT_BANNER_RE = /<blockquote class="notice">/;

// ---------------------------------------------------------------- escaping

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------- markdown subset

const SAFE_HREF_RE = /^(https?:\/\/|mailto:|\/|#)/i;

function renderInline(text) {
  const codeSpans = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(`<code>${code}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  out = out
    .replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, '<a href="$1">$1</a>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) =>
      SAFE_HREF_RE.test(href) ? `<a href="${href}">${label}</a>` : match,
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*([^*\s][^*]*)\*(?![\w*])/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\s][^_]*)_(?![\w])/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => codeSpans[Number(i)]);
}

function slugify(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

function splitRow(line) {
  const cells = line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/);
  return cells.map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

const isTableSeparator = (line) =>
  /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line.trim());
const isBlockStart = (line) =>
  /^(#{1,6}\s|>|\s*[-*]\s|\s*\d+\.\s|\||---+\s*$)/.test(line) || line.trim() === '';

function renderTable(lines) {
  const [head, , ...rows] = lines;
  const th = splitRow(head)
    .map((c) => `<th scope="col">${renderInline(c)}</th>`)
    .join('');
  const body = rows
    .map(
      (r) =>
        `<tr>${splitRow(r)
          .map((c) => `<td>${renderInline(c)}</td>`)
          .join('')}</tr>`,
    )
    .join('\n');
  return `<div class="table-wrap"><table>\n<thead><tr>${th}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table></div>`;
}

function takeList(lines, start) {
  const ordered = /^\s*\d+\.\s/.test(lines[start]);
  const marker = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
  const items = [];
  let i = start;
  while (i < lines.length && marker.test(lines[i])) {
    let item = lines[i].replace(marker, '');
    i += 1;
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      item += ` ${lines[i].trim()}`;
      i += 1;
    }
    items.push(`<li>${renderInline(item)}</li>`);
  }
  const tag = ordered ? 'ol' : 'ul';
  return { html: `<${tag}>\n${items.join('\n')}\n</${tag}>`, next: i };
}

/** Renders the Markdown subset used by docs/legal (no raw HTML, flat lists, pipe tables). */
export function renderMarkdown(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (line.trim() === '') {
      i += 1;
    } else if (heading) {
      const level = heading[1].length;
      html.push(
        `<h${level} id="${slugify(heading[2])}">${renderInline(heading[2])}</h${level}>`,
      );
      i += 1;
    } else if (/^---+\s*$/.test(line)) {
      html.push('<hr>');
      i += 1;
    } else if (line.startsWith('>')) {
      const quoted = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoted.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      const inner = renderMarkdown(quoted.join('\n'));
      const isDraft = /^\s*<p><strong>Draft/.test(inner);
      html.push(
        `<blockquote${isDraft ? ' class="notice"' : ''}>\n${inner}\n</blockquote>`,
      );
    } else if (
      line.trim().startsWith('|') &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const table = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        table.push(lines[i]);
        i += 1;
      }
      html.push(renderTable(table));
    } else if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      const list = takeList(lines, i);
      html.push(list.html);
      i = list.next;
    } else {
      const para = [];
      while (i < lines.length && (para.length === 0 || !isBlockStart(lines[i]))) {
        para.push(lines[i].trim());
        i += 1;
      }
      html.push(`<p>${renderInline(para.join(' '))}</p>`);
    }
  }
  return html.join('\n');
}

// ---------------------------------------------------------------- configuration and placeholders

/** Resolves the SITE_* variables. `explicit` marks the ones the owner really set. */
export function resolveConfig(env = {}) {
  const pick = (key) => (env[key] ?? '').trim();
  const config = {};
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    config[key] = pick(key) || fallback;
  }
  for (const key of [
    'SITE_LEGAL_ENTITY',
    'SITE_ADDRESS',
    'SITE_JURISDICTION',
    'SITE_LAST_UPDATED',
  ]) {
    config[key] = pick(key);
  }
  config.SITE_URL = config.SITE_URL.replace(/\/+$/, '');
  if (
    !/^https:\/\/[^\s/]+$/.test(config.SITE_URL) &&
    !/^http:\/\/localhost(:\d+)?$/.test(config.SITE_URL)
  ) {
    throw new Error(
      `SITE_URL must be an https origin without a path, got "${config.SITE_URL}"`,
    );
  }
  if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(config.SITE_CONTACT_EMAIL)) {
    throw new Error(
      `SITE_CONTACT_EMAIL is not an email address: "${config.SITE_CONTACT_EMAIL}"`,
    );
  }
  if (!/^[a-z][a-z0-9+.-]{1,31}$/.test(config.SITE_APP_SCHEME)) {
    throw new Error(`SITE_APP_SCHEME is not a URL scheme: "${config.SITE_APP_SCHEME}"`);
  }
  return config;
}

function placeholderValues(config) {
  const email = escapeHtml(config.SITE_CONTACT_EMAIL);
  const entity = escapeHtml(config.SITE_LEGAL_ENTITY);
  const address = escapeHtml(config.SITE_ADDRESS);
  return new Map([
    ['contact email', `<a href="mailto:${email}">${email}</a>`],
    ['date', escapeHtml(config.SITE_LAST_UPDATED)],
    ['legal entity name', entity],
    ['registered address', address],
    ['jurisdiction', escapeHtml(config.SITE_JURISDICTION)],
    [
      'legal entity name and registered address',
      entity && address ? `${entity}, ${address}` : '',
    ],
  ]);
}

/** Replaces the placeholders the configuration can answer; returns the rest as `unresolved`. */
export function fillPlaceholders(html, config) {
  const values = placeholderValues(config);
  const unresolved = [];
  const filled = html.replace(PLACEHOLDER_RE, (match, key) => {
    if (key === '…') return match; // the banner's own example of the syntax
    const value = values.get(key.toLowerCase());
    if (value) return value;
    unresolved.push(key);
    return match;
  });
  return { html: filled, unresolved };
}

function siteTokens(config, page) {
  return {
    CONTACT_EMAIL: escapeHtml(config.SITE_CONTACT_EMAIL),
    COMPANY: escapeHtml(config.SITE_COMPANY),
    SITE_URL: escapeHtml(config.SITE_URL),
    APP_SCHEME: escapeHtml(config.SITE_APP_SCHEME),
    TITLE: escapeHtml(page.title),
    ROBOTS: page.noindex ? 'noindex, nofollow' : 'index, follow',
    SCRIPT: page.script ? `<script src="${escapeHtml(page.script)}" defer></script>` : '',
    CONTENT: page.content,
  };
}

function applyTokens(template, tokens) {
  return template.replace(TOKEN_RE, (match, name) => {
    if (!(name in tokens)) throw new Error(`Unknown template token ${match}`);
    return tokens[name];
  });
}

// ---------------------------------------------------------------- pages

function parsePage(source, fallbackTitle) {
  const meta = {};
  const content = source.replace(
    /<!--\s*([a-z]+):\s*([^>]*?)\s*-->\n?/g,
    (_, key, value) => {
      meta[key] = value;
      return '';
    },
  );
  return {
    title: meta.title ?? fallbackTitle,
    script: meta.script ?? '',
    noindex: meta.robots === 'noindex',
    content: content.trim(),
  };
}

async function readSourcePages(srcDir) {
  const dir = path.join(srcDir, 'pages');
  const names = (await readdir(dir)).filter((n) => n.endsWith('.html')).sort();
  return Promise.all(
    names.map(async (name) => ({
      out: name,
      page: parsePage(await readFile(path.join(dir, name), 'utf8'), name),
    })),
  );
}

async function readLegalPages(legalDir) {
  return Promise.all(
    LEGAL_PAGES.map(async ({ source, out, title }) => {
      const markdown = await readFile(path.join(legalDir, source), 'utf8');
      const rendered = renderMarkdown(markdown);
      return {
        out,
        page: { title, script: '', noindex: false, content: rendered },
        legal: true,
      };
    }),
  );
}

function robotsTxt(config) {
  return [
    'User-agent: *',
    'Disallow: /reset-password',
    'Disallow: /verify-email',
    `Sitemap: ${config.SITE_URL}/sitemap.xml`,
    '',
  ].join('\n');
}

function sitemapXml(config, pages) {
  const urls = pages
    .filter(({ page }) => !page.noindex && page.title !== 'Page not found')
    .map(({ out }) => {
      const clean = out === 'index.html' ? '/' : `/${out.replace(/\.html$/, '')}`;
      return `  <url><loc>${escapeHtml(config.SITE_URL + clean)}</loc></url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

const HEADERS = `/*
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'

/reset-password
  Cache-Control: no-store

/verify-email
  Cache-Control: no-store
`;

// ---------------------------------------------------------------- build

/**
 * Builds the site. Returns the written file list, the placeholders still open and warnings.
 * Throws on a bad configuration, an unknown template token or (strict) any open placeholder.
 */
export async function buildSite({
  repoRoot = REPO_ROOT,
  outDir = path.join(repoRoot, 'site', 'dist'),
  env = process.env,
  strict = false,
} = {}) {
  const config = resolveConfig(env);
  const srcDir = path.join(repoRoot, 'site', 'src');
  const layout = await readFile(path.join(srcDir, 'layout.html'), 'utf8');
  const pages = [
    ...(await readSourcePages(srcDir)),
    ...(await readLegalPages(path.join(repoRoot, 'docs', 'legal'))),
  ];

  const unresolved = new Set();
  let draftBanners = 0;
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const { out, page, legal } of pages) {
    const tokens = siteTokens(config, page);
    const body = applyTokens(page.content, { ...tokens, CONTENT: '' });
    const filled = fillPlaceholders(body, config);
    filled.unresolved.forEach((key) => unresolved.add(`${out}: ${key}`));
    if (legal && DRAFT_BANNER_RE.test(filled.html)) draftBanners += 1;
    const html = applyTokens(layout, { ...tokens, CONTENT: filled.html });
    await writeFile(path.join(outDir, out), html);
  }

  await cp(path.join(srcDir, 'assets'), outDir, { recursive: true });
  await writeFile(path.join(outDir, 'robots.txt'), robotsTxt(config));
  await writeFile(path.join(outDir, 'sitemap.xml'), sitemapXml(config, pages));
  await writeFile(path.join(outDir, '_headers'), HEADERS);

  const warnings = [];
  if (unresolved.size > 0) warnings.push(`${unresolved.size} placeholder(s) still open`);
  if (draftBanners > 0)
    warnings.push(`${draftBanners} legal page(s) still carry the draft banner`);
  if (strict && warnings.length > 0) {
    throw new Error(
      `Strict build failed: ${warnings.join('; ')}\n  ${[...unresolved].join('\n  ')}`,
    );
  }
  return {
    outDir,
    pages: pages.map((p) => p.out),
    unresolved: [...unresolved],
    warnings,
    config,
  };
}

async function main() {
  const strict = process.argv.includes('--strict');
  const result = await buildSite({ strict });
  console.log(
    `site: ${result.pages.length} pages -> ${path.relative(REPO_ROOT, result.outDir)}`,
  );
  for (const warning of result.warnings) console.warn(`site: warning: ${warning}`);
  for (const key of result.unresolved) console.warn(`site:   open ${key}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
