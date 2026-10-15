/**
 * In-product reference for the `{...}` template syntax. Structured as data so
 * the test suite can strict-run every example — a documented example that stops
 * parsing fails CI, exactly like a broken content pack (see the design doc at
 * docs/superpowers/specs/2026-07-03-syntax-reference-design.md).
 *
 * `SYNTAX_REFERENCE_TABLES` is a small, self-contained demo pack (same JSON
 * shape as data/*.json) so the examples never depend on the current contents of
 * the real built-in packs. Every example's `template` uses only these tables
 * plus pure syntax.
 */

/** @type {Record<string, unknown>} */
export const SYNTAX_REFERENCE_TABLES = {
  color: [
    { text: 'crimson', tags: ['warm'], weight: 2 },
    { text: 'amber', tags: ['warm'] },
    { text: 'gold', tags: ['warm'] },
    { text: 'azure', tags: ['cool'] },
    { text: 'viridian', tags: ['cool'] },
    { text: 'violet', tags: ['cool'] },
  ],
  beast: [
    { text: 'wolf' },
    { text: 'owl' },
    { text: 'stag' },
    { text: 'adder' },
    { text: 'ox' },
  ],
  metal: ['iron', 'bronze', 'silver', 'gold'],
  mood: ['restless', 'watchful', 'weary'],
  hero: [
    { text: 'Mara', tags: ['f'], gender: 'f' },
    { text: 'Tomas', tags: ['m'], gender: 'm' },
  ],
  pronoun: [
    { text: 'she/her', tags: ['f'], they: 'she', their: 'her' },
    { text: 'he/him', tags: ['m'], they: 'he', their: 'his' },
  ],
};

/**
 * @typedef {{ template: string, note: string }} Example
 * @typedef {{ id: string, title: string, summary: string, examples: Example[] }} Section
 */

/** @type {Section[]} */
export const SYNTAX_REFERENCE = [
  {
    id: 'lookup',
    title: 'Table lookups',
    summary:
      'Wrap a table name in braces to pull one random entry from it. This is the core of every template — everything else layers onto a lookup.',
    examples: [
      { template: '{beast}', note: 'One entry from the beast table.' },
      {
        template: 'a {color} {beast}',
        note: 'Braces sit inside ordinary text; the words between them are printed as-is.',
      },
    ],
  },
  {
    id: 'tags',
    title: 'Tag filters',
    summary:
      'Entries can carry tags. Append #tag to draw only from entries with that tag, or #!tag to exclude them. Stack several to narrow further.',
    examples: [
      { template: '{color#warm}', note: 'Only colours tagged warm (crimson, amber, gold).' },
      { template: '{color#!warm}', note: 'Everything except warm colours — the cool ones.' },
    ],
  },
  {
    id: 'transforms',
    title: 'Text transforms',
    summary:
      'Chain .capitalize, .upper, or .lower onto a lookup to reshape the drawn text. Transforms apply after the entry is picked and expanded.',
    examples: [
      { template: '{beast.capitalize}', note: 'Capitalise the first letter — good for names.' },
      { template: '{metal.upper} ORE', note: 'Uppercase the whole word.' },
    ],
  },
  {
    id: 'capture',
    title: 'Captures',
    summary:
      'Add @name to save a lookup so you can reuse the exact same result later with @name. Without a capture, each {table} is an independent new roll.',
    examples: [
      {
        template: 'The {beast@b} watched. The {@b} did not blink.',
        note: 'Both @b print the one beast captured first — the same word twice.',
      },
      {
        template: '{color@c} banners and {@c.upper} shields',
        note: 'A captured value can still take transforms when reused.',
      },
    ],
  },
  {
    id: 'silent',
    title: 'Silent lookups',
    summary:
      'Put ? before a table name to pick and capture an entry without printing it. Read the entry later with @name — its text, or any property it carries.',
    examples: [
      {
        template: '{?pronoun@p}{hero@h} lost {@p.their} way.',
        note: 'The pronoun set is drawn but prints nothing; @p.their reads one of its properties.',
      },
      {
        template: '{?beast@b}Guarding the gate: the {@b}.',
        note: 'Capture first, print where you want it.',
      },
    ],
  },
  {
    id: 'dynamic-tags',
    title: 'Matching tags',
    summary:
      'A tag filter can take its tag from a capture, #@name.property, so a later lookup matches an earlier pick. #$name reads a variable the caller supplied; when it is not set, the filter is skipped.',
    examples: [
      {
        template: '{hero@h} lost {?pronoun#@h.gender@p}{@p.their} way.',
        note: "Mara gets she/her and Tomas he/him: the pronoun table is filtered by the hero's gender.",
      },
      {
        template: '{color#$tone}',
        note: 'With no tone variable set this draws from every colour; a caller can set it to warm or cool.',
      },
    ],
  },
  {
    id: 'dice',
    title: 'Dice',
    summary:
      'Roll polyhedral dice with {NdM}, optionally with a +/- modifier. The result is the numeric total, using the same seedable RNG as everything else.',
    examples: [
      { template: '{3d6} gold', note: 'Roll three six-sided dice and total them.' },
      { template: 'AC {1d4+11}', note: 'Add a flat modifier to the roll.' },
    ],
  },
  {
    id: 'range',
    title: 'Ranges',
    summary:
      'Pick a whole number between two bounds, inclusive, with {min-max}. Handy when you want a value but not a specific dice shape.',
    examples: [
      { template: '{2-12} survivors', note: 'A uniform number from 2 to 12.' },
      { template: 'level {1-20}', note: 'Any inclusive integer range works.' },
    ],
  },
  {
    id: 'alternatives',
    title: 'Alternatives',
    summary:
      'List choices separated by | to pick one at random. Append *N to an option to weight it — a higher number makes it more likely.',
    examples: [
      { template: 'a {tall|short|hulking} figure', note: 'One of the three, each equally likely.' },
      {
        template: 'mostly {calm*5|furious}',
        note: 'Weights bias the draw — calm comes up five times as often as furious.',
      },
    ],
  },
  {
    id: 'repetition',
    title: 'Repetition',
    summary:
      'Prefix a lookup with {Nx ...} to draw it N times, joined with commas. The count can be a number, a range, or dice. Add .unique to avoid repeats and .join("…") to change the separator.',
    examples: [
      { template: '{3x beast}', note: 'Three beasts, comma-separated (repeats allowed).' },
      {
        template: '{2-4x color.unique.join(" and ")}',
        note: 'A random 2–4 distinct colours joined with " and ".',
      },
    ],
  },
  {
    id: 'article',
    title: 'Smart article',
    summary:
      'Write {a} before a lookup and it becomes "a" or "an" to match the next word — vowel sounds get "an". "a" and "an" are reserved, so they are never table names.',
    examples: [
      { template: '{a} {beast}', note: 'Prints "a wolf" but "an owl" — chosen by the next word.' },
      { template: '{a} {color} gem', note: 'The article looks at the word that actually follows it.' },
    ],
  },
  {
    id: 'escaping',
    title: 'Literal braces',
    summary:
      'To print a real { or } rather than open an expansion, double it: {{ and }}. Everything else is passed through untouched.',
    examples: [
      { template: 'use {{table}} for a lookup', note: 'Prints the literal text "use {table} for a lookup".' },
      { template: '{{ {beast} }}', note: 'Literal braces around a real lookup.' },
    ],
  },
];
