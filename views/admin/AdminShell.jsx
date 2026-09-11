'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from '@/lib/router';
import { apiFetch } from '@/lib/api';
import LoginGate from './LoginGate';

/**
 * The dashboard frame: one sign-in, one navigation rail, one place every admin
 * task lives. Each panel is an ordinary page underneath it, so a link straight
 * to /admin/media still lands in the same shell.
 *
 * The gate is a convenience, not the security boundary — every /api route the
 * panels call checks the session itself.
 */

const ICONS = {
  overview: <><path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z" /></>,
  blog: <><path d="M5 4h9l5 5v11a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" /><path d="M14 4v5h5M8 13h8M8 17h5" /></>,
  pages: <><rect x="4" y="4" width="16" height="6" rx="1" /><rect x="4" y="14" width="7" height="6" rx="1" /><rect x="13" y="14" width="7" height="6" rx="1" /></>,
  media: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-6 6-3-3-4 4" /></>,
  account: <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0115 0" /></>,
};

const NAV = [
  { href: '/admin', label: 'Overview', icon: 'overview', exact: true },
  { href: '/admin/blog', label: 'Blog', icon: 'blog' },
  { href: '/admin/pages', label: 'Pages', icon: 'pages' },
  { href: '/admin/media', label: 'Media', icon: 'media' },
  { href: '/admin/account', label: 'Account', icon: 'account' },
];

export default function AdminShell({ children }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(null); // null = still checking
  const [username, setUsername] = useState('');
  // The site's nav bar (and its theme switch) is hidden here, so the rail
  // carries the switch instead. It writes the same key the site reads.
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    try {
      setTheme(document.documentElement.getAttribute('data-theme') || 'light');
    } catch {
      /* nothing to read before hydration */
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('el-theme', next);
    } catch {
      /* private mode — the change still applies for this session */
    }
  };

  const loadAccount = useCallback(() => {
    apiFetch('/api/account')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setUsername(d.username || ''))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    apiFetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setAuthed(Boolean(d.authenticated));
        if (d.authenticated) loadAccount();
      })
      .catch(() => active && setAuthed(false));
    return () => {
      active = false;
    };
  }, [loadAccount]);

  const logout = async () => {
    await apiFetch('/api/logout', { method: 'POST' });
    setAuthed(false);
    navigate('/admin');
  };

  if (authed === null) {
    return (
      <div className="adm">
        <div className="adm-layout">
          <p className="adm-empty">Checking your session…</p>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <LoginGate
        onAuthed={() => {
          setAuthed(true);
          loadAccount();
        }}
        subtitle="Sign in to manage posts, pages and media."
      />
    );
  }

  const isActive = (item) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <div className="adm">
      <div className="adm-layout">
        <aside className="adm-rail">
          <div className="adm-brand">
            <img src="/logo.png" alt="" width="28" height="28" />
            <span>
              Ananta Legal
              <small>Dashboard</small>
            </span>
          </div>

          <nav className="adm-nav">
            {NAV.map((item) => (
              <Link key={item.href} to={item.href} aria-current={isActive(item) ? 'page' : undefined}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {ICONS[item.icon]}
                </svg>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="adm-rail__foot">
            {username && <span className="adm-who">{username}</span>}
            <Link to="/">View the site ↗</Link>
            <button type="button" onClick={toggleTheme}>
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <button type="button" onClick={logout}>Log out</button>
          </div>
        </aside>

        <main className="adm-main">{children}</main>
      </div>
    </div>
  );
}
