'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { fadeUp, staggerContainer } from '../../animation/variants';
import { useLineReveal } from '../../animation/gsapHooks';

/**
 * A section header plus a grid of titled cards — the shape most "three things
 * we do" sections take. Cards carry an optional link so a grid can double as
 * navigation.
 */
export default function CardsSection({ content = {} }) {
  const { label, head, intro, items = [] } = content;
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

        <motion.div className="block-cards" variants={v(staggerContainer)}>
          {items.map((item, i) => {
            const card = (
              <>
                <h3>{item.title}</h3>
                {item.desc && <p>{item.desc}</p>}
              </>
            );
            return item.href ? (
              <motion.a className="block-card" key={i} href={item.href} variants={v(fadeUp)}>
                {card}
                <span className="block-card__arr" aria-hidden="true">↗</span>
              </motion.a>
            ) : (
              <motion.div className="block-card" key={i} variants={v(fadeUp)}>{card}</motion.div>
            );
          })}
        </motion.div>
      </div>
    </motion.section>
  );
}
