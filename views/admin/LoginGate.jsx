'use client';

import { useState } from 'react';
import { Link } from '@/lib/router';
import { apiFetch } from '@/lib/api';

/**
 * The one sign-in screen for everything behind the dashboard.
 *
 * Credentials are checked against the stored admin account (see
 * server-lib/auth.js) — this form only posts them.
 */
export default function LoginGate({
  onAuthed,
  title = 'Admin sign in',
  subtitle = 'Sign in to manage the site.',
  backTo = '/',
  backLabel = '← Back to the site',
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Login failed.');
      onAuthed();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="editor-page">
      <div className="wrap editor-login">
        <img className="editor-login__mark" src="/logo.png" alt="" width="48" height="48" />
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {error && <div className="editor-error">{error}</div>}
        <form onSubmit={submit}>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'} <span className="arr">↗</span>
          </button>
        </form>
        <Link to={backTo} className="editor-back" style={{ marginTop: '1.5rem', display: 'inline-block' }}>
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
