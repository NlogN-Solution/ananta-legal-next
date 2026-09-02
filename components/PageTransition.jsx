'use client';

import { useContext, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LayoutRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

/**
 * Reproduces the old `<AnimatedRoutes>` from src/App.jsx: an
 * `AnimatePresence mode="wait"` wrapping a `motion.main` keyed on the current
 * path, so each route fades/slides in and the outgoing route plays its exit
 * variant before the next one mounts.
 *
 * The App Router unmounts the old segment tree as soon as navigation starts,
 * which would kill the exit animation — `FrozenRouter` freezes the router
 * context for the outgoing subtree so it can finish animating out.
 */
function FrozenRouter({ children }) {
  const context = useContext(LayoutRouterContext ?? {});
  const frozenRef = useRef(null);
  if (frozenRef.current === null) frozenRef.current = context;
  const frozen = frozenRef.current;

  if (!frozen || !LayoutRouterContext) return children;
  return (
    <LayoutRouterContext.Provider value={frozen}>
      {children}
    </LayoutRouterContext.Provider>
  );
}

export default function PageTransition({ children }) {
  const pathname = usePathname();
  const prefersReduced = useReducedMotion();

  return (
    <AnimatePresence mode="wait">
      <motion.main
        key={pathname}
        initial={prefersReduced ? false : { opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.99 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <FrozenRouter>{children}</FrozenRouter>
      </motion.main>
    </AnimatePresence>
  );
}
