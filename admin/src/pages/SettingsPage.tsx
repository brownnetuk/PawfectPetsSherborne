import { useEffect, useState } from 'react';
import * as api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Modal from '../components/Modal';
import { TrashIcon } from '../components/icons';
import type { EmailSettings, Staff } from '../types';

type Tab = 'staff' | 'email';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('staff');

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="tabs">
        {(['staff', 'email'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'staff' ? 'Staff' : 'Email'}
          </button>
        ))}
      </div>

      {tab === 'staff' && <StaffTab />}
      {tab === 'email' && <EmailTab />}
    </div>
  );
}

function StaffTab() {
  const { staff: currentStaff } = useAuth();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [deletingStaff, setDeletingStaff] = useState<Staff | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function refresh() {
    api.listStaff().then(setStaff).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  async function handleDelete() {
    if (!deletingStaff) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteStaff(deletingStaff.id);
      setDeletingStaff(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete staff account');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
          New staff account
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {!staff || staff.length === 0 ? (
          <div className="empty-state">{staff === null ? 'Loading…' : 'No staff accounts yet.'}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const isSelf = s.id === currentStaff?.id;
                return (
                  <tr key={s.id}>
                    <td>
                      {s.name}
                      {isSelf && <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}> (you)</span>}
                    </td>
                    <td>{s.email}</td>
                    <td>
                      <button
                        className="icon-btn icon-btn-danger"
                        title={isSelf ? "You can't delete your own account while signed in" : 'Delete'}
                        disabled={isSelf}
                        style={isSelf ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
                        onClick={() => setDeletingStaff(s)}
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <NewStaffModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            refresh();
          }}
        />
      )}

      {deletingStaff && (
        <Modal title="Delete staff account?" onClose={() => setDeletingStaff(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This removes <strong>{deletingStaff.name}</strong>'s ability to log in. Any active session of
            theirs stays valid until their token expires.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeletingStaff(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete account'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NewStaffModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.registerStaff(name, email, password);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create staff account');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New staff account" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
            At least 8 characters.
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EmailTab() {
  const { staff: currentStaff } = useAuth();
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [fromName, setFromName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  function refresh() {
    api
      .getEmailSettings()
      .then((s) => {
        setSettings(s);
        setTenantId(s.tenantId);
        setClientId(s.clientId);
        setFromAddress(s.fromAddress);
        setFromName(s.fromName);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load email settings'));
  }
  useEffect(refresh, []);
  useEffect(() => {
    if (currentStaff?.email) setTestTo(currentStaff.email);
  }, [currentStaff]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api.updateEmailSettings({
        tenantId: tenantId || undefined,
        clientId: clientId || undefined,
        fromAddress: fromAddress || undefined,
        fromName: fromName || undefined,
        clientSecret: clientSecret || undefined,
      });
      setClientSecret('');
      setSaved(true);
      refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save email settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      await api.sendTestEmail(testTo);
      setTestResult({ ok: true, message: `Test email sent to ${testTo}.` });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to send test email',
      });
    } finally {
      setTesting(false);
    }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!settings) return <div className="empty-state">Loading…</div>;

  return (
    <div>
      <div className="card">
        <h2>Microsoft 365 connection</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
          Used to send email from within the app via Microsoft Graph. Requires an Azure app
          registration with the <code>Mail.Send</code> application permission (admin consent
          granted) — see the admin README for setup steps.
        </p>
        {saveError && <div className="error-banner">{saveError}</div>}
        <form onSubmit={handleSave}>
          <div className="field-row">
            <div className="field">
              <label>Tenant ID</label>
              <input
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </div>
            <div className="field">
              <label>Client (application) ID</label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </div>
          </div>
          <div className="field">
            <label>Client secret</label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={settings.clientSecretConfigured ? 'Configured — leave blank to keep unchanged' : 'Not set'}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>From address</label>
              <input
                type="email"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
                placeholder="bookings@pawfectpetssherborne.co.uk"
              />
            </div>
            <div className="field">
              <label>From name</label>
              <input
                type="text"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="PawfectPets Sherborne"
              />
            </div>
          </div>
          <div className="modal-actions" style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            {saved && (
              <span style={{ color: 'var(--brand-green)', fontSize: '0.85rem', fontWeight: 600 }}>Saved.</span>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Send a test email</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
          Confirms the settings above actually work end-to-end.
        </p>
        {testResult && (
          <div
            className={testResult.ok ? undefined : 'error-banner'}
            style={
              testResult.ok
                ? {
                    background: 'var(--sage-badge)',
                    color: 'var(--brand-green)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    marginBottom: 16,
                    fontSize: '0.88rem',
                    fontWeight: 500,
                  }
                : undefined
            }
          >
            {testResult.message}
          </div>
        )}
        <div className="field-row">
          <div className="field">
            <label>Send to</label>
            <input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-secondary" onClick={handleTest} disabled={testing || !testTo}>
          {testing ? 'Sending…' : 'Send test email'}
        </button>
      </div>
    </div>
  );
}
