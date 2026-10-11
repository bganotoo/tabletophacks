// Static accessibility checks on every HTML page, in the style of
// seo.test.js: regexes over hand-written markup, no DOM parser, no npm
// dependency. Controls built at runtime in app.js are out of reach here; the
// browser probe in the mobile/a11y pass covered those.
//
// See docs/superpowers/specs/2026-10-10-mobile-a11y-pass-design.md.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SKIP_DIRS = new Set(['.git', 'node_modules', 'docs']);

function findHtml(dir = ROOT, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) findHtml(join(dir, entry.name), found);
    } else if (entry.name.endsWith('.html')) {
      found.push(relative(ROOT, join(dir, entry.name)).split(sep).join('/'));
    }
  }
  return found;
}

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1];
const stripTags = (s) => s.replace(/<[^>]*>/g, '').trim();

for (const page of findHtml()) {
  describe(page, () => {
    const html = readFileSync(join(ROOT, page), 'utf8');

    test('declares a language and a responsive viewport', () => {
      assert.match(html, /<html\b[^>]*\blang=["'][a-z]{2}/i, 'missing <html lang>');
      assert.match(html, /<meta\b[^>]*width=device-width/i, 'missing viewport meta');
    });

    test('every button has an accessible name', () => {
      for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
        const tag = `<button${m[1]}>`;
        assert.ok(
          stripTags(m[2]) || attr(tag, 'aria-label') || attr(tag, 'title'),
          `${tag} has no text, aria-label, or title`,
        );
      }
    });

    test('every form control is labelled', () => {
      const labelFors = new Set([...html.matchAll(/<label\b[^>]*\bfor=["']([^"']+)["']/gi)].map((m) => m[1]));
      // Spans of <label>…</label>, so a control nested inside one counts.
      const labelSpans = [...html.matchAll(/<label\b[\s\S]*?<\/label>/gi)].map((m) => [m.index, m.index + m[0].length]);
      for (const m of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
        const tag = m[0];
        const type = (attr(tag, 'type') ?? '').toLowerCase();
        if (type === 'hidden' || type === 'file' || /\shidden[\s/>]/i.test(tag)) continue;
        const id = attr(tag, 'id');
        const ok =
          attr(tag, 'aria-label') ||
          attr(tag, 'aria-labelledby') ||
          (id && labelFors.has(id)) ||
          labelSpans.some(([a, b]) => m.index > a && m.index < b);
        assert.ok(ok, `${tag} has no label`);
      }
    });
  });
}
