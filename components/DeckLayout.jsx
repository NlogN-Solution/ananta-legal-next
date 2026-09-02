'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Footer from './Footer';
import { useLang } from '../i18n/LanguageContext';
import { fadeUp, staggerContainer } from '../animation/variants';

/**
 * Reveal trigger for each panel.
 *
 * `amount` is a fraction of the *element*, so a percentage threshold silently
 * breaks on anything taller than the viewport divided by that fraction: a blog
 * post carrying a 17-page document is ~17,000px tall, and 18% of it is five
 * screens' worth — an intersection that can never happen, leaving the panel
 * stuck at opacity 0 forever. Triggering on "any part visible" and pulling the
 * bottom edge in with a margin keeps the same staged feel at every height.
 */
const REVEAL_VIEWPORT = { once: true, amount: 'some', margin: '0px 0px -80px 0px' };

/**
 * DeckLayout — shared responsive vertical page stack with smooth scroll
 * triggered animations for every route.
 *
 * props:
 *   pages:  [{ id, label, node }]
 *   footer: include the colophon/footer spread (default true)
 *   reveal: animate panels in as they scroll into view (default true).
 *           Pass false when the stack is mounted somewhere the reader hasn't
 *           scrolled to — the admin preview, for one — otherwise every panel
 *           sits at opacity 0 waiting for an intersection that never fires.
 */
export default function DeckLayout({ pages, footer = true, reveal = true }) {
  const { t } = useLang();
  const prefersReducedMotion = useReducedMotion();
  const animate = reveal && !prefersReducedMotion;

  const allPages = footer
    ? [...pages, { id: 'colophon', label: t.deck.labels.colophon, node: <Footer /> }]
    : pages;

  return (
    <motion.div
      className="page-stack"
      variants={prefersReducedMotion ? undefined : staggerContainer}
      initial="hidden"
      animate="show"
    >
      {allPages.map((page) => (
        <motion.div
          key={page.id}
          className="page-panel"
          variants={animate ? fadeUp : undefined}
          initial={animate ? 'hidden' : false}
          whileInView={animate ? 'show' : undefined}
          viewport={animate ? REVEAL_VIEWPORT : undefined}
        >
          {page.node}
        </motion.div>
      ))}
    </motion.div>
  );
}