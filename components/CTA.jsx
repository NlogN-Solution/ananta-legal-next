'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useLang } from '../i18n/LanguageContext';
import { mergeContent } from '../lib/blocks/content';
import { fadeUp, staggerContainer } from '../animation/variants';
import { useLineReveal } from '../animation/gsapHooks';
import { whatsappUrl } from '../lib/whatsapp';

export default function CTA({ content }) {
  const { t } = useLang();
  const c = mergeContent(t.cta, content);
  const prefersReducedMotion = useReducedMotion();
  const headRef = useLineReveal();

  return (
    <motion.section
      id="contact-cta"
      className="cta"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.18 }}
    >
      <motion.div className="wrap" variants={prefersReducedMotion ? undefined : staggerContainer}>
        <h2 ref={headRef}>
          {c.h1}
          <br />
          {c.h2}
        </h2>
        <motion.p variants={prefersReducedMotion ? undefined : fadeUp}>{c.p}</motion.p>
        <motion.div className="row" variants={prefersReducedMotion ? undefined : fadeUp}>
          <a href={whatsappUrl()} target="_blank" rel="noreferrer" className="btn btn-light">
            {c.btn} <span className="arr">↗</span>
          </a>
          <a href={`mailto:${c.mailto}`} className="mailto">
            {c.mailto}
          </a>
        </motion.div>
      </motion.div>
    </motion.section>
  );
}