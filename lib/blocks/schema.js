
/**
 * The block catalogue: every kind of section the page builder can place.
 *
 * This half is pure data — labels, field schemas and fallback copy — so it can
 * be read on the server (the API validates a saved layout against it) as well
 * as in the browser. The React component for each type lives next door in
 * registry.jsx, which is a client module; keeping them apart is what lets the
 * server see the schema at all.
 *
 * Each entry ties together three things that must agree — the component that
 * renders it (registry.jsx), the fields the dashboard offers, and the copy
 * it falls back to. `defaults(t)` reads the translation bundle for the current
 * language, so a block dropped onto a page arrives filled in with real text
 * (in both English and Nepali) instead of empty inputs, and a field the admin
 * never touches keeps rendering the shipped wording.
 *
 * Field types understood by the editor:
 *   text      one line
 *   textarea  several lines of prose
 *   lines     a list of short strings, one per line
 *   image     a URL, with the media library as a picker
 *   list      repeating group, `of` describing each row's fields
 */

const f = (name, label, type = 'text', extra = {}) => ({ name, label, type, ...extra });

export const BLOCK_SCHEMA = {
  hero: {
    label: 'Hero',
    summary: 'Opening screen: badge, two-line headline, intro, two buttons and three proof points.',
    defaults: (t) => t.hero,
    fields: [
      f('badge', 'Badge'),
      f('hlLine1', 'Headline line 1'),
      f('hlLine2', 'Headline line 2 (accent)'),
      f('sub', 'Intro paragraph', 'textarea'),
      f('cta1', 'Primary button'),
      f('cta2', 'Secondary button'),
      f('features', 'Proof points', 'list', {
        of: [f('l1', 'Top line'), f('l2', 'Bottom line')],
        max: 3,
        note: 'Three, to match the three icons in the design.',
      }),
      f('panelWords', 'Seal words', 'lines'),
      f('panelBrand', 'Seal brand'),
    ],
  },

  marquee: {
    label: 'Keyword strip',
    summary: 'Chapter break: a heading over the scrolling strip of practice keywords.',
    defaults: (t) => ({ ...t.divider, items: t.marquee }),
    fields: [
      f('label', 'Eyebrow'),
      f('head', 'Heading'),
      f('items', 'Keywords', 'lines'),
    ],
  },

  services: {
    label: 'Services grid',
    summary: 'Numbered cards, each linking to a practice area.',
    defaults: (t) => t.services,
    fields: [
      f('label', 'Eyebrow'),
      f('head', 'Heading'),
      f('intro', 'Intro', 'textarea'),
      f('learnMore', 'Card link text'),
      f('items', 'Services', 'list', {
        of: [
          f('title', 'Title'),
          f('desc', 'Description', 'textarea'),
          f('slug', 'Practice-area slug', 'text', { placeholder: 'company-formation' }),
        ],
      }),
    ],
  },

  approach: {
    label: 'Approach + stats',
    summary: 'A single emphasised sentence with a row of supporting figures.',
    defaults: (t) => t.approach,
    fields: [
      f('label', 'Eyebrow'),
      f('leadPre', 'Sentence, before the emphasis'),
      f('leadMark', 'Emphasised words'),
      f('leadPost', 'Sentence, after the emphasis'),
      f('stats', 'Figures', 'list', { of: [f('n', 'Figure'), f('k', 'Meaning', 'textarea')] }),
    ],
  },

  team: {
    label: 'Team',
    summary: 'The advocates, with photo, role and focus.',
    defaults: (t) => ({ ...t.team, members: t.about.team }),
    fields: [
      f('label', 'Eyebrow'),
      f('head', 'Heading'),
      f('sub', 'Intro', 'textarea'),
      f('members', 'People', 'list', {
        of: [
          f('image', 'Photo', 'image'),
          f('name', 'Name'),
          f('title', 'Role'),
          f('degree', 'Qualification'),
          f('focus', 'Focus'),
        ],
      }),
    ],
  },

  process: {
    label: 'Process steps',
    summary: 'The numbered "how it works" sequence.',
    defaults: (t) => t.process,
    fields: [
      f('label', 'Eyebrow'),
      f('head', 'Heading'),
      f('steps', 'Steps', 'list', {
        of: [f('num', 'Step label'), f('title', 'Title'), f('desc', 'Description', 'textarea')],
      }),
    ],
  },

  stories: {
    label: 'Client stories',
    summary: 'Quotes from founders, with name and role.',
    defaults: (t) => t.stories,
    fields: [
      f('label', 'Eyebrow'),
      f('head', 'Heading'),
      f('quotes', 'Quotes', 'list', {
        of: [f('text', 'Quote', 'textarea'), f('name', 'Name'), f('role', 'Role')],
      }),
    ],
  },

  faq: {
    label: 'FAQ',
    summary: 'Expandable questions and answers.',
    defaults: (t) => t.faq,
    fields: [
      f('label', 'Eyebrow'),
      f('head', 'Heading'),
      f('items', 'Questions', 'list', {
        of: [f('q', 'Question'), f('a', 'Answer', 'textarea')],
      }),
    ],
  },

  cta: {
    label: 'Call to action',
    summary: 'The closing panel with the booking button.',
    defaults: (t) => t.cta,
    fields: [
      f('h1', 'Small heading'),
      f('h2', 'Large heading'),
      f('p', 'Paragraph', 'textarea'),
      f('btn', 'Button'),
      f('mailto', 'Email address'),
    ],
  },

  text: {
    label: 'Text section',
    summary: 'A section header and free paragraphs. The general-purpose block.',
    defaults: () => ({ label: '', head: 'A new section', intro: '', body: [] }),
    fields: [
      f('label', 'Eyebrow'),
      f('head', 'Heading'),
      f('intro', 'Intro', 'textarea'),
      f('body', 'Paragraphs', 'lines', { note: 'One paragraph per line.' }),
    ],
  },

  cards: {
    label: 'Card grid',
    summary: 'A section header over titled cards, each optionally a link.',
    defaults: () => ({ label: '', head: 'Three things', intro: '', items: [] }),
    fields: [
      f('label', 'Eyebrow'),
      f('head', 'Heading'),
      f('intro', 'Intro', 'textarea'),
      f('items', 'Cards', 'list', {
        of: [
          f('title', 'Title'),
          f('desc', 'Description', 'textarea'),
          f('href', 'Link (optional)', 'text', { placeholder: '/practice-areas' }),
        ],
      }),
    ],
  },

  stats: {
    label: 'Figures',
    summary: 'A standalone row of numbers with context.',
    defaults: (t) => ({ label: '', head: '', stats: t.approach.stats }),
    fields: [
      f('label', 'Eyebrow'),
      f('head', 'Heading'),
      f('stats', 'Figures', 'list', { of: [f('n', 'Figure'), f('k', 'Meaning', 'textarea')] }),
    ],
  },
};

/** Block types offered in the "add a section" palette, in menu order. */
export const PALETTE = [
  'text', 'cards', 'stats', 'faq', 'cta',
  'hero', 'marquee', 'services', 'approach', 'process', 'stories', 'team',
];

export const blockDef = (type) => BLOCK_SCHEMA[type] || null;
export const blockLabel = (type) => BLOCK_SCHEMA[type]?.label || type;

/** Every field name a block stores, including nested list rows. */
export function emptyData(type) {
  const def = BLOCK_SCHEMA[type];
  if (!def) return {};
  const out = {};
  for (const field of def.fields) {
    out[field.name] = field.type === 'list' || field.type === 'lines' ? [] : '';
  }
  return out;
}
