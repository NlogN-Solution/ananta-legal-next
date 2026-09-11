'use client';

import Hero from '@/components/Hero';
import Services from '@/components/Services';
import Approach from '@/components/Approach';
import Team from '@/components/Team';
import Process from '@/components/Process';
import Stories from '@/components/Stories';
import FAQ from '@/components/FAQ';
import CTA from '@/components/CTA';
import MarqueeSection from '@/components/blocks/MarqueeSection';
import TextSection from '@/components/blocks/TextSection';
import CardsSection from '@/components/blocks/CardsSection';
import StatsSection from '@/components/blocks/StatsSection';
import { BLOCK_SCHEMA } from './schema';

/**
 * What each block type actually renders.
 *
 * Only the browser needs this half — it pulls in every section component — so
 * it is a client module. The schema it is keyed against (lib/blocks/schema.js)
 * stays plain data so the server can validate against it too.
 */
export const BLOCK_COMPONENTS = {
  hero: Hero,
  marquee: MarqueeSection,
  services: Services,
  approach: Approach,
  team: Team,
  process: Process,
  stories: Stories,
  faq: FAQ,
  cta: CTA,
  text: TextSection,
  cards: CardsSection,
  stats: StatsSection,
};

/** Schema + component together, which is what the builder and renderer want. */
export const BLOCKS = Object.fromEntries(
  Object.entries(BLOCK_SCHEMA).map(([type, def]) => [
    type,
    { ...def, Component: BLOCK_COMPONENTS[type] },
  ])
);

export { PALETTE, blockLabel, blockDef, emptyData } from './schema';
