'use client';

import { useLang } from '@/i18n/LanguageContext';
import { BLOCKS } from './registry';
import { mergeContent } from './content';

/**
 * Turn saved sections into the panel array DeckLayout renders.
 *
 * Every page view already describes itself as `[{ id, label, node }]` — that
 * array is the seam the builder works against. With no saved layout the view's
 * own array is returned untouched, so a page that has never been edited
 * behaves exactly as it did before the CMS existed.
 */

/* Deck labels are the little chapter names in the page's side rail. A block
   that corresponds to one of the site's original sections keeps that section's
   translated label; anything new falls back to the block's own name. */
const DECK_LABEL_KEY = {
  hero: 'intro',
  marquee: 'practice',
  services: 'services',
  approach: 'approach',
  team: 'team',
  process: 'process',
  stories: 'stories',
  faq: 'faq',
  cta: 'contact',
};

/** One saved block, rendered in the reader's language. */
function BlockPanel({ section }) {
  const { lang, t } = useLang();
  const def = BLOCKS[section.type];
  if (!def) return null;

  // Nepali falls back to the English entry, and both fall back to the copy
  // that ships in the translations — a half-translated block still reads.
  const stored = section.data?.[lang] ?? section.data?.en ?? null;
  const content = mergeContent(def.defaults(t), stored);
  const Component = def.Component;
  return <Component content={content} />;
}

export function usePageLayout(sections, builtins) {
  const { t } = useLang();
  if (!Array.isArray(sections) || sections.length === 0) return builtins;

  const byId = new Map(builtins.map((panel) => [panel.id, panel]));
  const panels = [];

  for (const section of sections) {
    if (section.visible === false) continue;

    if (section.type === 'builtin') {
      // A panel the view owns. If the view no longer renders it (the page was
      // rewritten since the layout was saved) it is simply skipped.
      const panel = byId.get(section.data?.key);
      if (panel) panels.push(section.label ? { ...panel, label: section.label } : panel);
      continue;
    }

    const def = BLOCKS[section.type];
    if (!def) continue;
    const labelKey = DECK_LABEL_KEY[section.type];
    panels.push({
      id: `sec-${section.id}`,
      label: section.label || (labelKey && t.deck.labels[labelKey]) || def.label,
      node: <BlockPanel section={section} />,
    });
  }

  // A layout that hides everything would leave a blank page; show the original.
  return panels.length ? panels : builtins;
}
