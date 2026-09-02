'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LanguageProvider } from '@/i18n/LanguageContext';
import Navbar from '@/components/Navbar';
import MobileMenu from '@/components/MobileMenu';
import ChatWidget from '@/components/ChatWidget';
import PageTransition from '@/components/PageTransition';

function ScrollToTop({ pathname }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/* A thin gold letterhead rule that sweeps in on every route change — the
   "section change" cue, independent of the page's own enter/exit so it
   isn't held up by AnimatePresence's mode="wait" ordering below. */
function RouteBar({ pathname, reduced }) {
  if (reduced) return null;
  return (
    <AnimatePresence>
      <motion.span
        key={pathname}
        className="route-bar"
        initial={{ scaleX: 0, opacity: 1 }}
        animate={{ scaleX: 1, opacity: [1, 1, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.65, times: [0, 0.65, 1], ease: [0.22, 1, 0.36, 1] }}
        aria-hidden="true"
      />
    </AnimatePresence>
  );
}

export default function Providers({ children }) {
  // 'light' on the server and first client render (the inline <head> script has
  // already set the real <html data-theme> before paint, so there's no flash);
  // the saved theme is pulled into React state right after mount.
  const [theme, setTheme] = useState('light');
  const [themeReady, setThemeReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    try {
      const saved = localStorage.getItem('el-theme');
      if (saved === 'light' || saved === 'dark') setTheme(saved);
    } catch {}
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!themeReady) return; // don't clobber the stored theme before reading it
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('el-theme', theme);
    } catch {}
  }, [theme, themeReady]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <LanguageProvider>
      <RouteBar pathname={pathname} reduced={prefersReduced} />
      <ScrollToTop pathname={pathname} />
      <Navbar
        theme={theme}
        toggleTheme={toggleTheme}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <span id="top"></span>
      <PageTransition>{children}</PageTransition>
      <ChatWidget />
    </LanguageProvider>
  );
}
