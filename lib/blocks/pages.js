/**
 * The pages the builder can compose, and what each one is made of by default.
 *
 * Two kinds of section appear in a layout:
 *
 *   block    — a section from the block catalogue (lib/blocks/registry). Its
 *              copy is editable field by field, in both languages.
 *   builtin  — a panel the page's own view renders (the contact form, the
 *              practice-area grid, the story chapters). It can be reordered,
 *              hidden or removed, but its content stays in the code, because
 *              it is markup with behaviour rather than a slab of copy.
 *
 * The home page is entirely blocks, so it is editable end to end. The other
 * pages keep their bespoke panels and can have blocks added around them.
 *
 * `builtins` here must match the `id`s the corresponding view puts in its
 * PAGES array — that array is the seam the builder reorders.
 */

export const PAGES = [
  {
    key: 'home',
    name: 'Home',
    path: '/',
    layout: [
      { type: 'hero' },
      { type: 'marquee' },
      { type: 'services' },
      { type: 'approach' },
      { type: 'team' },
      { type: 'process' },
      { type: 'stories' },
      { type: 'faq' },
      { type: 'cta' },
    ],
  },
  {
    key: 'about',
    name: 'About',
    path: '/about',
    layout: [
      { type: 'builtin', key: 'about-intro' },
      { type: 'builtin', key: 'about-team' },
      { type: 'builtin', key: 'about-bio' },
      { type: 'builtin', key: 'about-values' },
      { type: 'builtin', key: 'about-cta' },
    ],
  },
  {
    key: 'practice-areas',
    name: 'Practice areas',
    path: '/practice-areas',
    layout: [
      { type: 'builtin', key: 'pa-intro' },
      { type: 'builtin', key: 'pa-grid' },
      { type: 'builtin', key: 'pa-cta' },
    ],
  },
  {
    key: 'our-story',
    name: 'Our story',
    path: '/our-story',
    layout: [
      { type: 'builtin', key: 'origin-intro' },
      { type: 'builtin', key: 'origin-journey' },
      { type: 'builtin', key: 'origin-why' },
      { type: 'builtin', key: 'origin-motivation' },
      { type: 'builtin', key: 'origin-cta' },
    ],
  },
  {
    key: 'contact',
    name: 'Contact',
    path: '/contact',
    layout: [
      { type: 'builtin', key: 'contact-intro' },
      { type: 'builtin', key: 'contact-form' },
      { type: 'builtin', key: 'contact-map' },
    ],
  },
  {
    key: 'guide',
    name: 'Free guide',
    path: '/guide',
    layout: [
      { type: 'builtin', key: 'lm-intro' },
      { type: 'builtin', key: 'lm-offer' },
    ],
  },
  {
    key: 'blog',
    name: 'Blog index',
    path: '/blog',
    layout: [
      { type: 'builtin', key: 'blog-intro' },
      { type: 'builtin', key: 'blog-grid' },
      { type: 'builtin', key: 'blog-cta' },
    ],
  },
];

export const PAGE_KEYS = PAGES.map((p) => p.key);
export const findPage = (key) => PAGES.find((p) => p.key === key) || null;
export const isPageKey = (key) => PAGE_KEYS.includes(String(key));
