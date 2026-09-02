'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Footer from './Footer';
import { useLang } from '../i18n/LanguageContext';
import { fadeUp, staggerContainer } from '../animation/variants';

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
          viewport={animate ? { once: true, amount: 0.18 } : undefined}
        >
          {page.node}
        </motion.div>
      ))}
    </motion.div>
  );
}