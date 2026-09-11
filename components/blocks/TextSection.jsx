'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { fadeUp, staggerContainer } from '../../animation/variants';
import { useLineReveal } from '../../animation/gsapHooks';

/**
 * A plain prose section: the site's standard section header (label, heading,
 * intro) followed by any number of paragraphs.
 *
 * Built from the same `.sec-label` / `.sec-head` / `.sec-intro` classes every
 * hand-written section uses, so a section added from the dashboard is
 * typographically indistinguishable from one composed in code.
 */
export default function TextSection({ content = {} }) {
  const { label, head, intro, body = [] } = content;
  const prefersReducedMotion = useReducedMotion();
  const headRef = useLineReveal();
  const v = (variant) => (prefersReducedMotion ? undefined : variant);

  return (
    <motion.section initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.18 }}>
      <div className="wrap">
        <motion.div className="section-header" variants={v(staggerContainer)}>
          {label && (
            <motion.div className="sec-label mono" variants={v(fadeUp)}>{label}</motion.div>
          )}
          {head && (
            <h2 className="sec-head" ref={headRef}>
              {head}<span style={{ color: 'var(--olive)' }}>.</span>
            </h2>
          )}
          {intro && (
            <motion.p className="sec-intro" variants={v(fadeUp)}>{intro}</motion.p>
          )}
        </motion.div>

        {body.length > 0 && (
          <motion.div className="block-prose" variants={v(staggerContainer)}>
            {body.map((paragraph, i) => (
              <motion.p key={i} variants={v(fadeUp)}>{paragraph}</motion.p>
            ))}
          </motion.div>
        )}
      </div>
    </motion.section>
  );
}
