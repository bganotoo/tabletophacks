import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

// Names that must never ship in a built-in pack. This is not a legal opinion
// on each term: it is the list of names whose owners claim them, or whose
// association with one specific work is strong enough that a buyer would
// reasonably ask where the table came from. See
// docs/superpowers/specs/2026-10-10-data-originality-audit.md for the audit
// that produced it. Matching is case-insensitive and on whole words.
const DENYLIST = [
  // Wizards of the Coast Product Identity, as declared in the SRD's OGL
  // section 1(e). These creatures are deliberately absent from every SRD.
  { pattern: /\bbeholders?\b/, why: 'WotC Product Identity' },
  { pattern: /\bgauths?\b/, why: 'WotC Product Identity' },
  { pattern: /\bcarrion crawlers?\b/, why: 'WotC Product Identity' },
  { pattern: /\btanar'ri\b/, why: 'WotC Product Identity' },
  { pattern: /\bbaatezu\b/, why: 'WotC Product Identity' },
  { pattern: /\bdisplacer beasts?\b/, why: 'WotC Product Identity' },
  { pattern: /\bgith(yanki|zerai)\b/, why: 'WotC Product Identity' },
  { pattern: /\bkuo-toa\b/, why: 'WotC Product Identity' },
  { pattern: /\bmind flayers?\b/, why: 'WotC Product Identity' },
  { pattern: /\billithids?\b/, why: 'WotC Product Identity' },
  { pattern: /\bslaad(i|s)?\b/, why: 'WotC Product Identity' },
  { pattern: /\bumber hulks?\b/, why: 'WotC Product Identity' },
  { pattern: /\byuan-ti\b/, why: 'WotC Product Identity' },
  // WotC settings, places, and characters.
  { pattern: /\b(forgotten realms|faerun|greyhawk|ravenloft|eberron|dragonlance|krynn|planescape|spelljammer|dark sun|athas|mystara)\b/, why: 'WotC campaign setting' },
  // ("Sigil", Planescape's city, is left off: it is an ordinary English word.)
  { pattern: /\b(waterdeep|baldur's gate|neverwinter|barovia)\b/, why: 'WotC setting location' },
  { pattern: /\b(strahd|drizzt|elminster|vecna|lolth|mordenkainen)\b/, why: 'WotC character' },
  { pattern: /\b(bigby|tenser|otiluke|leomund|melf|nystul|drawmij|rary|tasha|evard|xanathar|volo)'s\b/, why: 'WotC named spell or book' },
  // Tolkien terms the Middle-earth rights holders actively enforce.
  { pattern: /\b(hobbits?|balrogs?|nazgul|mithril|mordor|rivendell|gondor)\b/, why: 'Tolkien trademark (D&D uses "mithral" for this reason)' },
  // Found and replaced by the 2026-10-10 audit; kept here so they stay out.
  { pattern: /\bdawnbreaker\b/, why: 'artifact name from The Elder Scrolls V: Skyrim' },
  { pattern: /\boathkeeper\b/, why: 'sword name from A Song of Ice and Fire' },
  { pattern: /\bkettleblacks?\b/, why: 'family name from A Song of Ice and Fire' },
  { pattern: /\bcoldhands?\b/, why: 'character name from A Song of Ice and Fire' },
  { pattern: /\bnine-?fingers\b/, why: 'epithet of Logen Ninefingers (The First Law) and Frodo' },
  { pattern: /\bstormcrow\b/, why: "Gandalf's epithet in The Lord of the Rings" },
  { pattern: /\bcorvo\b/, why: 'protagonist of Dishonored' },
];

/** Strips diacritics so "Faerûn" and "Nazgûl" match their plain spellings. */
function fold(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Every string in a pack: table names, entry text, plurals, template values. */
function* strings(value, path) {
  if (typeof value === 'string') {
    yield { text: value, path };
  } else if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) yield* strings(v, `${path}[${i}]`);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      yield { text: k, path: `${path} (key)` };
      yield* strings(v, `${path}.${k}`);
    }
  }
}

const dataDir = new URL('./', import.meta.url);
const files = (await readdir(dataDir)).filter((f) => f.endsWith('.json'));

test('the denylist catches what it names', () => {
  const hits = (text) => DENYLIST.filter(({ pattern }) => pattern.test(fold(text)));
  assert.equal(hits('a Mind Flayer in the cellar').length, 1);
  assert.equal(hits('the Nazgûl ride at dawn').length, 1);
  assert.equal(hits('Elf of the Nine-Fingers').length, 1);
  assert.equal(hits("Tasha's Hideous Laughter").length, 1);
  // whole words only: an ordinary name or word that contains one is fine
  assert.equal(hits('Tasha Ashdown').length, 0);
  assert.equal(hits('a hobbitesque cottage').length, 0);
  assert.equal(hits('corvidae').length, 0);
});

for (const file of files) {
  test(`${file} uses no denylisted names`, async () => {
    const pack = JSON.parse(await readFile(new URL(file, dataDir), 'utf8'));
    const found = [];
    for (const { text, path } of strings(pack, file)) {
      for (const { pattern, why } of DENYLIST) {
        if (pattern.test(fold(text))) found.push(`${path}: "${text}" — ${why}`);
      }
    }
    assert.deepEqual(found, [], `denylisted names in ${file}:\n${found.join('\n')}`);
  });
}
