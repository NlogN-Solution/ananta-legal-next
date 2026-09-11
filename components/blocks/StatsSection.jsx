'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { fadeUp, staggerContainer } from '../../animation/variants';

/**
 * A row of numbers with a line of context each — the proof-point strip.
 * Reuses the Approach section's stat styling so the figures match the ones
 * already on the home page.
 */
export default function StatsSection({ content = {} }) {
  const { label, head, stats = [] } = content;
  const prefersReducedMotion = useReducedMotion();
  const v = (variant) => (prefersReducedMotion ? undefined : variant);

  return (
    <motion.section initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.18 }}>
      <div className="wrap">
        {(label || head) && (
          <motion.div className="section-header" variants={v(staggerContainer)}>
            {label && (
              <motion.div className="sec-label mono" variants={v(fadeUp)}>{label}</motion.div>
            )}
            {head && (
              <motion.h2 className="sec-head" variants={v(fadeUp)}>
                {head}<span style={{ color: 'var(--olive)' }}>.</span>
              </motion.h2>
            )}
          </motion.div>
        )}
        <motion.div className="block-stats" variants={v(staggerContainer)}>
          {stats.map((stat, i) => (
            <motion.div className="block-stat" key={i} variants={v(fadeUp)}>
              <span className="block-stat__n">{stat.n}</span>
              <span className="block-stat__k">{stat.k}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.section>
  );
}
