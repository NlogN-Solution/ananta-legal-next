'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from './translations';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  // Server render (and first client render, for hydration parity) always starts
  // at 'en'; the saved choice is applied from localStorage right after mount.
  const [lang, setLang] = useState('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('el-lang');
      if (saved === 'en' || saved === 'ne') setLang(saved);
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return; // don't overwrite the stored value before we've read it
    try {
      localStorage.setItem('el-lang', lang);
    } catch {}
    document.documentElement.setAttribute('lang', lang === 'ne' ? 'ne' : 'en');
  }, [lang, ready]);

  const toggle = () => setLang((p) => (p === 'en' ? 'ne' : 'en'));

  const value = {
    lang,
    setLang,
    toggle,
    t: translations[lang] || translations.en,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Safe fallback if used outside a provider.
    return {
      lang: 'en',
      setLang: () => {},
      toggle: () => {},
      t: translations.en,
    };
  }
  return ctx;
}