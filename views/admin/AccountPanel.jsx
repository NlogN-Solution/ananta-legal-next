'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

/**
 * Username and password.
 *
 * The account lives in the database (seeded once from ADMIN_USER /
 * ADMIN_PASSWORD), which is what makes changing it here possible at all. The
 * current password is always required — a borrowed session shouldn't be able
 * to lock the owner out.
 */
export default function AccountPanel() {
  const [account, setAccount] = useState(null);
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch('/api/account')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load your account.'))))
      .then((d) => {
        if (!active) return;
        setAccount(d);
        setUsername(d.username || '');
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setDone('');

    if (newPassword && newPassword !== confirm) {
      setError('The new password and its confirmation are different.');
      return;
    }
    if (!newPassword && username === account?.username) {
      setError('Nothing to change yet.');
      return;
    }

    setBusy(true);
    try {
      const r = await apiFetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, currentPassword, newPassword: newPassword || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not update your credentials.');
      setAccount((prev) => ({ ...prev, username: d.username }));
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setDone(
        newPassword
          ? 'Updated. Your new password is live — use it next time you sign in.'
          : 'Username updated.'
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Account</h1>
          <p>The single administrator sign-in for this dashboard.</p>
        </div>
      </div>

      {error && <div className="adm-msg adm-msg--err">{error}</div>}
      {done && <div className="adm-msg adm-msg--ok">{done}</div>}

      {account && !account.editable && (
        <div className="adm-msg adm-msg--note">
          Credentials are being read from the environment (ADMIN_USER / ADMIN_PASSWORD) because no
          database is configured, so they can't be changed from here. Set DATABASE_URL and sign in
          once — the account is created from those values and becomes editable.
        </div>
      )}

      <form className="adm-card" onSubmit={submit}>
        <h2>Credentials</h2>
        <p style={{ marginBottom: '1rem' }}>
          Change the username, the password, or both. Your current password confirms the change.
        </p>

        <label className="adm-field">
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            disabled={!account?.editable}
          />
        </label>

        <label className="adm-field">
          <span>Current password</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            disabled={!account?.editable}
          />
        </label>

        <label className="adm-field">
          <span>New password</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            disabled={!account?.editable}
          />
          <small>At least 8 characters. Leave blank to keep the current one.</small>
        </label>

        <label className="adm-field">
          <span>Confirm new password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            disabled={!account?.editable}
          />
        </label>

        <button className="adm-btn adm-btn--primary" disabled={busy || !account?.editable}>
          {busy ? 'Saving…' : 'Update credentials'}
        </button>
      </form>
    </>
  );
}
