// Discoverability metadata, enforced across every page.
//
// This suite auto-discovers every index.html in the repo, the same way
// data/data.test.js auto-discovers every pack: a new tool page gets its
// metadata checked just by existing, and shipping one without a description,
// a canonical URL, or a sitemap entry fails `npm test`.
//
// The HTML is read with regexes rather than a DOM parser on purpose — a
// parser would be the project's first npm dependency, and these are
// hand-written head blocks this repo controls and this file keeps uniform.
//
// See docs/superpowers/specs/2026-10-10-seo-metadata-design.md.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

/** Canonical origin. If the apex/www decision ever flips, this and the eight
 *  <link rel="canonical"> tags change together — a partial flip fails here. */
const SITE_ORIGIN = 'https://tabletophacks.com';

const SKIP_DIRS = new Set(['.git', 'node_modules', 'docs']);

/** Every index.html in the repo, as repo-relative POSIX paths. */
function findPages(dir = ROOT, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      findPages(join(dir, entry.name), found);
    } else if (entry.name === 'index.html') {
      found.push(relative(ROOT, join(dir, entry.name)).split(sep).join('/'));
    }
  }
  return found;
}

/** The canonical site URL a given index.html is served at. */
function urlForPage(page) {
  const dir = page.slice(0, -'index.html'.length); // '' or 'tools/dice/'
  return `${SITE_ORIGIN}/${dir}`;
}

/** Attribute values are escaped and element text is not, so both sides of a
 *  comparison (og:title vs <title>) get decoded before they are compared. */
const decode = (s) =>
  s === undefined
    ? s
    : s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1];

/** content of the <meta> whose `key` attribute equals `value`. Attribute order
 *  is not assumed: this repo writes `content` first. */
function metaContent(html, key, value) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (attr(tag, key)?.toLowerCase() === value.toLowerCase()) {
      return decode(attr(tag, 'content'));
    }
  }
  return undefined;
}

const metaByName = (html, name) => metaContent(html, 'name', name);
const metaByProperty = (html, property) => metaContent(html, 'property', property);

/** hrefs of every <link> tag carrying the given rel (rel may list several). */
function linkHrefs(html, rel) {
  const hrefs = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rels = tag.match(/rel=["']([^"']*)["']/i)?.[1] ?? '';
    if (!rels.split(/\s+/).includes(rel)) continue;
    const href = tag.match(/href=["']([^"']*)["']/i)?.[1];
    if (href) hrefs.push(href);
  }
  return hrefs;
}

const title = (html) => decode(html.match(/<title>([^<]*)<\/title>/i)?.[1])?.trim();

/** Parsed contents of every <script type="application/ld+json"> block. */
function jsonLd(html, page) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(m[1]));
    } catch (err) {
      assert.fail(`${page}: JSON-LD block does not parse — ${err.message}`);
    }
  }
  return blocks;
}

/** Pixel size of a PNG, straight out of its IHDR chunk — cheaper and more
 *  honest than trusting the og:image:width we wrote by hand. */
function pngSize(file) {
  const head = readFileSync(file).subarray(0, 24);
  assert.equal(head.subarray(1, 4).toString(), 'PNG', `${file} is not a PNG`);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

const PAGES = findPages();

/** Every page links these from its footer, so the Privacy page and the
 *  backup/restore home are one click from anywhere — including from the one
 *  tool page that is all some visitors ever open. */
const FOOTER_LINKS = ['/', '/your-data/', '/privacy/'];

function assertFooter(html) {
  const footer = html.match(/<footer\b[^>]*\bsite-footer\b[\s\S]*?<\/footer>/i)?.[0];
  assert.ok(footer, 'missing <footer class="site-footer">');
  const hrefs = [...footer.matchAll(/href=["']([^"']*)["']/gi)].map((m) => m[1]);
  for (const href of FOOTER_LINKS) {
    assert.ok(hrefs.includes(href), `footer does not link ${href}`);
  }
}

const REQUIRED_OG = [
  'og:type',
  'og:site_name',
  'og:title',
  'og:description',
  'og:url',
  'og:image',
  'og:image:width',
  'og:image:height',
  'og:image:alt',
];

test('the repo has pages to check', () => {
  assert.ok(PAGES.length >= 8, `expected at least 8 pages, found ${PAGES.length}`);
  assert.ok(PAGES.includes('index.html'), 'landing page not discovered');
});

for (const page of PAGES) {
  describe(page, () => {
    const html = readFileSync(join(ROOT, page), 'utf8');
    const canonicalUrl = urlForPage(page);

    test('has a search-result description', () => {
      const description = metaByName(html, 'description');
      assert.ok(description, 'missing <meta name="description">');
      assert.ok(
        description.length >= 50 && description.length <= 200,
        `description is ${description.length} chars; aim for 120-160 so it is ` +
          `neither useless nor truncated: ${JSON.stringify(description)}`,
      );
    });

    test('declares its canonical URL', () => {
      const hrefs = linkHrefs(html, 'canonical');
      assert.equal(hrefs.length, 1, `expected exactly one canonical link, got ${hrefs.length}`);
      assert.equal(
        hrefs[0],
        canonicalUrl,
        'canonical must be the directory form at the canonical origin',
      );
    });

    test('has the Open Graph tags an unfurler needs', () => {
      for (const property of REQUIRED_OG) {
        assert.ok(metaByProperty(html, property), `missing <meta property="${property}">`);
      }
      assert.equal(metaByProperty(html, 'og:type'), 'website');
      assert.equal(metaByProperty(html, 'og:site_name'), 'Tabletop Hacks');
      assert.equal(metaByProperty(html, 'og:url'), canonicalUrl, 'og:url must match canonical');
      assert.equal(
        metaByProperty(html, 'og:title'),
        title(html),
        'og:title must match <title> — two different headlines for one page is a bug, not a feature',
      );
      assert.equal(
        metaByProperty(html, 'og:description'),
        metaByName(html, 'description'),
        'og:description must match the meta description',
      );
    });

    test('points og:image at an absolute, real, correctly sized file', () => {
      const image = metaByProperty(html, 'og:image');
      assert.ok(
        image.startsWith(`${SITE_ORIGIN}/`),
        `og:image must be absolute — relative values are not reliably resolved by unfurlers (got ${image})`,
      );
      const file = image.slice(`${SITE_ORIGIN}/`.length);
      assert.ok(existsSync(join(ROOT, file)), `og:image references a missing file: ${file}`);
      assert.equal(metaByProperty(html, 'og:image:width'), '1200');
      assert.equal(metaByProperty(html, 'og:image:height'), '630');
      assert.deepEqual(
        pngSize(join(ROOT, file)),
        { width: 1200, height: 630 },
        'the declared og:image dimensions must match the file on disk',
      );
    });

    test('requests a large Twitter card', () => {
      assert.equal(metaByName(html, 'twitter:card'), 'summary_large_image');
    });

    test('links the icons and the manifest', () => {
      const icons = linkHrefs(html, 'icon');
      assert.ok(icons.includes('/favicon.ico'), 'missing <link rel="icon" href="/favicon.ico">');
      assert.ok(icons.includes('/favicon.svg'), 'missing <link rel="icon" href="/favicon.svg">');
      assert.deepEqual(linkHrefs(html, 'apple-touch-icon'), ['/apple-touch-icon.png']);
      assert.deepEqual(linkHrefs(html, 'manifest'), ['/site.webmanifest']);
      assert.equal(metaByName(html, 'theme-color'), '#0d0d1a');
    });

    test('carries the site footer', () => {
      assertFooter(html);
    });

    // The landing page and the site pages (Privacy, Your data) are not
    // applications; only the tools claim to be SoftwareApplications.
    if (page.startsWith('tools/')) {
      test('describes itself as a free SoftwareApplication', () => {
        const app = jsonLd(html, page).find((b) => b['@type'] === 'SoftwareApplication');
        assert.ok(app, 'missing SoftwareApplication JSON-LD');
        assert.equal(app['@context'], 'https://schema.org');
        assert.ok(app.name, 'JSON-LD has no name');
        assert.equal(app.url, canonicalUrl, 'JSON-LD url must match canonical');
        assert.ok(app.description, 'JSON-LD has no description');
        assert.equal(app.applicationCategory, 'GameApplication');
        assert.ok(app.operatingSystem, 'JSON-LD has no operatingSystem');
        assert.equal(app.offers?.price, '0', 'the free tier should say so, in the markup too');
        assert.equal(app.offers?.priceCurrency, 'USD');
      });
    }
  });
}

test('the 404 page carries the site footer too', () => {
  assertFooter(readFileSync(join(ROOT, '404.html'), 'utf8'));
});

describe('site-wide crawl files', () => {
  test('the required static files exist', () => {
    for (const file of [
      'robots.txt',
      'sitemap.xml',
      'site.webmanifest',
      'favicon.ico',
      'favicon.svg',
      'apple-touch-icon.png',
      'icon-192.png',
      'icon-512.png',
      'og-image.png',
    ]) {
      const path = join(ROOT, file);
      assert.ok(existsSync(path), `missing ${file}`);
      assert.ok(statSync(path).size > 0, `${file} is empty`);
    }
  });

  test('robots.txt points at the sitemap', () => {
    const robots = readFileSync(join(ROOT, 'robots.txt'), 'utf8');
    assert.match(robots, /^User-agent:\s*\*/m);
    assert.ok(
      robots.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`),
      'robots.txt must name the sitemap with an absolute URL',
    );
  });

  // The check that actually earns its keep: shipping a ninth tool and
  // forgetting the sitemap is the realistic failure, and it is invisible
  // until a search engine quietly never indexes the page.
  test('the sitemap lists exactly the pages in the repo', () => {
    const xml = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
    const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
    const expected = PAGES.map(urlForPage).sort();
    assert.deepEqual(listed, expected);
  });

  test('site.webmanifest is valid and its icons exist', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'site.webmanifest'), 'utf8'));
    assert.equal(manifest.name, 'Tabletop Hacks');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.theme_color, '#0d0d1a');
    assert.ok(manifest.icons.length > 0);
    for (const icon of manifest.icons) {
      assert.ok(icon.src.startsWith('/'), `manifest icon src must be root-absolute: ${icon.src}`);
      const file = join(ROOT, icon.src.slice(1));
      assert.ok(existsSync(file), `manifest references a missing icon: ${icon.src}`);
      if (icon.type === 'image/png') {
        const [w, h] = icon.sizes.split('x').map(Number);
        assert.deepEqual(
          pngSize(file),
          { width: w, height: h },
          `${icon.src} is not the ${icon.sizes} the manifest claims`,
        );
      }
    }
  });
});
