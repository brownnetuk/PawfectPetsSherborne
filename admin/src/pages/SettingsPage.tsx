import { useEffect, useState } from 'react';
import * as api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Modal from '../components/Modal';
import { TrashIcon } from '../components/icons';
import type { BusinessInfo, EmailSettings, EmailTemplate, EmailTrigger, Staff } from '../types';

const INTAKE_URL = import.meta.env.VITE_INTAKE_URL ?? 'http://localhost:5173';

type Tab = 'business' | 'staff' | 'email' | 'templates';

const TAB_LABELS: Record<Tab, string> = {
  business: 'Business Info',
  staff: 'Staff',
  email: 'Email',
  templates: 'Email Templates',
};

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('business');

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="tabs">
        {(['business', 'staff', 'email', 'templates'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'business' && <BusinessInfoTab />}
      {tab === 'staff' && <StaffTab />}
      {tab === 'email' && <EmailTab />}
      {tab === 'templates' && <EmailTemplatesTab />}
    </div>
  );
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_TERMS_BYTES = 5 * 1024 * 1024;

function BusinessInfoTab() {
  const [info, setInfo] = useState<BusinessInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [town, setTown] = useState('');
  const [postcode, setPostcode] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [logoImage, setLogoImage] = useState('');
  const [logoError, setLogoError] = useState<string | null>(null);

  // termsFile is null until staff pick a new .docx this session -- the client
  // only ever has the already-parsed HTML after loading, never the original
  // file, so there's nothing to resend on an unrelated save unless a new file
  // was chosen. '' (set by Remove) explicitly clears the stored terms.
  const [termsFileName, setTermsFileName] = useState('');
  const [termsFile, setTermsFile] = useState<string | null>(null);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [termsSaving, setTermsSaving] = useState(false);
  const [termsSaved, setTermsSaved] = useState(false);

  function refresh() {
    api
      .getBusinessInfo()
      .then((i) => {
        setInfo(i);
        setName(i.name);
        setAddress(i.address);
        setTown(i.town);
        setPostcode(i.postcode);
        setTelephone(i.telephone);
        setEmail(i.email);
        setWebsite(i.website);
        setLogoImage(i.logoImage);
        setTermsFileName(i.termsFileName);
        setTermsFile(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load business info'));
  }
  useEffect(refresh, []);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError(null);
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError('That image is too large — please use one under 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoImage(reader.result as string);
    reader.onerror = () => setLogoError('Failed to read that file.');
    reader.readAsDataURL(file);
  }

  function handleTermsFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setTermsError(null);
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setTermsError('Please choose a .docx file.');
      return;
    }
    if (file.size > MAX_TERMS_BYTES) {
      setTermsError('That file is too large — please use one under 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setTermsFile(reader.result as string);
      setTermsFileName(file.name);
    };
    reader.onerror = () => setTermsError('Failed to read that file.');
    reader.readAsDataURL(file);
  }

  function handleRemoveTerms() {
    setTermsFile('');
    setTermsFileName('');
    setTermsError(null);
  }

  async function handlePreviewTerms() {
    setTermsError(null);
    if (termsFile) {
      setPreviewLoading(true);
      try {
        const { html } = await api.previewTerms(termsFile);
        setPreviewHtml(html);
      } catch (err) {
        setTermsError(err instanceof Error ? err.message : 'Failed to preview that file');
      } finally {
        setPreviewLoading(false);
      }
    } else {
      setPreviewHtml(info?.termsHtml ?? '');
    }
  }

  async function handleDownloadTerms() {
    setTermsError(null);
    try {
      const { blob, filename } = await api.downloadTermsFile();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setTermsError(err instanceof Error ? err.message : 'Failed to download that file');
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api.updateBusinessInfo({ name, address, town, postcode, telephone, email, website, logoImage });
      setSaved(true);
      refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save business info');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTerms(e: React.FormEvent) {
    e.preventDefault();
    if (termsFile === null) return;
    setTermsSaving(true);
    setTermsError(null);
    setTermsSaved(false);
    try {
      await api.updateBusinessInfo({ termsFile, termsFileName });
      setTermsSaved(true);
      refresh();
    } catch (err) {
      setTermsError(err instanceof Error ? err.message : 'Failed to save terms and conditions');
    } finally {
      setTermsSaving(false);
    }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!info) return <div className="empty-state">Loading…</div>;

  return (
    <>
      <div className="card">
        <h2>Business details</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
          Used to brand invoices, email templates, and other customer-facing documents generated by the app.
        </p>
        {saveError && <div className="error-banner">{saveError}</div>}
        <form onSubmit={handleSave}>
          <div className="field">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="PawfectPets Sherborne"
            />
          </div>
          <div className="field">
            <label>Address</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Town</label>
              <input type="text" value={town} onChange={(e) => setTown(e.target.value)} placeholder="Sherborne" />
            </div>
            <div className="field">
              <label>Postcode</label>
              <input type="text" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Telephone</label>
              <input type="text" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Website</label>
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://pawfectpetssherborne.co.uk"
              />
            </div>
          </div>
          <div className="field">
            <label>Logo</label>
            {logoError && <div className="error-banner">{logoError}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {logoImage && (
                <img
                  src={logoImage}
                  alt="Business logo"
                  style={{
                    height: 56,
                    maxWidth: 160,
                    objectFit: 'contain',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: 4,
                  }}
                />
              )}
              <input type="file" accept="image/*" onChange={handleLogoChange} />
              {logoImage && (
                <button type="button" className="btn-link" onClick={() => setLogoImage('')}>
                  Remove
                </button>
              )}
            </div>
          </div>
          <div className="modal-actions" style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {saved && (
              <span style={{ color: 'var(--brand-green)', fontSize: '0.85rem', fontWeight: 600 }}>Saved.</span>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Terms and Conditions</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
          Shown to customers on the intake form's agreement step, and in the customer PDF export.
        </p>
        {termsError && <div className="error-banner">{termsError}</div>}
        <form onSubmit={handleSaveTerms}>
          <div className="field">
            <label>Upload .docx</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <input type="file" accept=".docx" onChange={handleTermsFileChange} />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handlePreviewTerms}
                disabled={!termsFileName || previewLoading}
              >
                {previewLoading ? 'Loading…' : 'Preview'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleDownloadTerms}
                disabled={!info.termsFileName}
              >
                Download
              </button>
              {termsFileName && (
                <button type="button" className="btn-link" onClick={handleRemoveTerms}>
                  Remove
                </button>
              )}
            </div>
            <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
              {termsFileName ? `Uploaded: ${termsFileName}` : 'No terms uploaded yet.'} Upload a .docx to replace it.
            </div>
          </div>
          <div className="modal-actions" style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
            <button className="btn btn-primary" type="submit" disabled={termsSaving || termsFile === null}>
              {termsSaving ? 'Saving…' : 'Save changes'}
            </button>
            {termsSaved && (
              <span style={{ color: 'var(--brand-green)', fontSize: '0.85rem', fontWeight: 600 }}>Saved.</span>
            )}
          </div>
        </form>

        {previewHtml !== null && (
          <TermsPreviewModal html={previewHtml} onClose={() => setPreviewHtml(null)} />
        )}
      </div>
    </>
  );
}

function TermsPreviewModal({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <Modal title="Preview terms and conditions" onClose={onClose} wide>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: -6 }}>
        This is how it will appear to customers on the intake form's agreement step.
      </p>
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '14px 16px',
          maxHeight: 420,
          overflowY: 'auto',
          background: '#fafbfb',
          fontSize: '0.88rem',
        }}
        dangerouslySetInnerHTML={{
          __html: html || '<em style="color:var(--muted)">No content extracted from that file.</em>',
        }}
      />
      <div className="modal-actions">
        <button className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
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

// The fixed set of places in the app that offer "Send email" alongside
// "Copy link" -- kept in sync by hand with those call sites (CustomersPage,
// CustomerDetailPage, AddPetChoiceModal) and with the backend's EmailTrigger
// enum. One template per trigger, so there's never ambiguity about which
// template a given "Send email" button will use.
export const EMAIL_TRIGGERS: { value: EmailTrigger; label: string; description: string }[] = [
  {
    value: 'registration',
    label: 'New customer registration',
    description: 'Sent when staff create a new customer and choose "Send email" instead of copying the link.',
  },
  {
    value: 'update_info',
    label: 'Update info request',
    description: 'Sent when staff set a customer to "Update info" and choose "Send email".',
  },
  {
    value: 'add_pet',
    label: 'Add a pet',
    description: 'Sent when staff choose "Send email" from the "New pet" dialog instead of "Copy link".',
  },
];

function EmailTemplatesTab() {
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EmailTrigger | null>(null);
  const [deleting, setDeleting] = useState<EmailTrigger | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function refresh() {
    api.listEmailTemplates().then(setTemplates).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteEmailTemplate(deleting);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setDeleteBusy(false);
    }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!templates) return <div className="empty-state">Loading…</div>;

  const byTrigger = new Map(templates.map((t) => [t.trigger, t]));

  return (
    <div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Used for</th>
              <th>Name</th>
              <th>Subject</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {EMAIL_TRIGGERS.map((trigger) => {
              const template = byTrigger.get(trigger.value);
              return (
                <tr key={trigger.value}>
                  <td>
                    <div>{trigger.label}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 2 }}>
                      {trigger.description}
                    </div>
                  </td>
                  <td>{template?.name ?? <span style={{ color: 'var(--muted)' }}>Not configured</span>}</td>
                  <td>{template?.subject ?? '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="btn-link" onClick={() => setEditing(trigger.value)}>
                        {template ? 'Edit' : 'Set up'}
                      </button>
                      {template && (
                        <button
                          className="icon-btn icon-btn-danger"
                          title="Delete"
                          onClick={() => setDeleting(trigger.value)}
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditTemplateModal
          trigger={editing}
          template={byTrigger.get(editing) ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {deleting && (
        <Modal title="Delete email template?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            "Send email" for <strong>{EMAIL_TRIGGERS.find((t) => t.value === deleting)?.label}</strong> won't be
            available again until a new template is set up for it.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting…' : 'Delete template'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Kept in sync by hand with settings.service.ts's sendTriggeredEmail() --
// {{logo}} inserts the raw business logo <img>, everything else inserts its
// (HTML-escaped) value. Used by both the placeholder hint below and the
// Preview modal, so what staff see in Preview matches what actually sends.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TEMPLATE_PLACEHOLDERS: { key: string; hint: string }[] = [
  { key: 'name', hint: "the customer's name" },
  { key: 'link', hint: 'the link being sent' },
  { key: 'logo', hint: "the business's logo (Settings > Business Info)" },
  { key: 'businessName', hint: 'business name' },
  { key: 'businessAddress', hint: 'business address' },
  { key: 'businessTown', hint: 'business town' },
  { key: 'businessPostcode', hint: 'business postcode' },
  { key: 'businessTelephone', hint: 'business telephone' },
  { key: 'businessEmail', hint: 'business email' },
  { key: 'businessWebsite', hint: 'business website' },
];

function EditTemplateModal({
  trigger,
  template,
  onClose,
  onSaved,
}: {
  trigger: EmailTrigger;
  template: EmailTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const meta = EMAIL_TRIGGERS.find((t) => t.value === trigger)!;
  const [name, setName] = useState(template?.name ?? '');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    api.getBusinessInfo().then(setBusinessInfo).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.saveEmailTemplate(trigger, { name, subject, body });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`${template ? 'Edit' : 'Set up'} template — ${meta.label}`} onClose={onClose} wide>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: -6 }}>{meta.description}</p>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Template name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Welcome email"
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label>Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Welcome to PawfectPets Sherborne!"
            required
          />
        </div>
        <div className="field">
          <label>Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder={`Hi {{name}},\n\nPlease complete your registration using the link below:\n{{link}}\n\nThanks,\nPawfectPets Sherborne`}
            required
          />
          <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
            Sent as HTML. Available placeholders:{' '}
            {TEMPLATE_PLACEHOLDERS.map((p, i) => (
              <span key={p.key}>
                <code>{`{{${p.key}}}`}</code> ({p.hint}){i < TEMPLATE_PLACEHOLDERS.length - 1 ? ', ' : '.'}
              </span>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowPreview(true)}
            disabled={!businessInfo}
          >
            Preview
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </form>

      {showPreview && businessInfo && (
        <TemplatePreviewModal
          subject={subject}
          body={body}
          businessInfo={businessInfo}
          onClose={() => setShowPreview(false)}
        />
      )}
    </Modal>
  );
}

function TemplatePreviewModal({
  subject,
  body,
  businessInfo,
  onClose,
}: {
  subject: string;
  body: string;
  businessInfo: BusinessInfo;
  onClose: () => void;
}) {
  const vars: Record<string, string> = {
    name: 'Jane Smith',
    link: `${INTAKE_URL}/intake/sample-id`,
    businessName: businessInfo.name,
    businessAddress: businessInfo.address,
    businessTown: businessInfo.town,
    businessPostcode: businessInfo.postcode,
    businessTelephone: businessInfo.telephone,
    businessEmail: businessInfo.email,
    businessWebsite: businessInfo.website,
  };
  const logoTag = businessInfo.logoImage
    ? `<img src="${businessInfo.logoImage}" alt="${escapeHtml(businessInfo.name)}" style="max-height:60px;max-width:220px;display:block;" />`
    : '';
  const renderedSubject = subject.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
  const renderedBody = escapeHtml(body)
    .replace(/\{\{(\w+)\}\}/g, (_, key) => (key === 'logo' ? logoTag : escapeHtml(vars[key] ?? '')))
    .replace(/\n/g, '<br>');

  return (
    <Modal title="Preview email" onClose={onClose} wide>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: -6 }}>
        Filled in with a sample customer and your saved Business Info — this is how the sent email will look.
      </p>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ background: 'var(--sage)', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Subject</div>
          <div style={{ fontWeight: 600 }}>
            {renderedSubject || <em style={{ color: 'var(--muted)', fontWeight: 400 }}>(no subject)</em>}
          </div>
        </div>
        <div
          style={{ padding: '16px 20px', background: '#fff', lineHeight: 1.5 }}
          dangerouslySetInnerHTML={{
            __html: renderedBody || '<em style="color:var(--muted)">(no body)</em>',
          }}
        />
      </div>
      <div className="modal-actions">
        <button className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
