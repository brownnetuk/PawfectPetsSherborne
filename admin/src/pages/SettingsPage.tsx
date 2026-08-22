import { useEffect, useRef, useState } from 'react';
import * as api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Modal from '../components/Modal';
import NamedListCard from '../components/NamedListCard';
import PdfTemplateDesigner from '../components/PdfTemplateDesigner';
import RichTextEditor from '../components/RichTextEditor';
import type { RichTextEditorHandle } from '../components/RichTextEditor';
import { PencilIcon, SortIcon, TrashIcon } from '../components/icons';
import { buildItemsTableHtml, escapeHtml, interpolateBody, interpolateSubject } from '../utils/emailTemplate';
import type {
  BusinessInfo,
  EmailSettings,
  EmailTemplate,
  EmailTrigger,
  InvoiceTerm,
  Product,
  Staff,
} from '../types';

const INTAKE_URL = import.meta.env.VITE_INTAKE_URL ?? 'http://localhost:5173';

type Tab = 'business' | 'staff' | 'email' | 'templates' | 'invoices' | 'financial';

const TAB_LABELS: Record<Tab, string> = {
  business: 'Business Info',
  staff: 'Staff',
  email: 'Email',
  templates: 'Email Templates',
  invoices: 'Invoices',
  financial: 'Finance',
};

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('business');

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="tabs">
        {(['business', 'staff', 'email', 'templates', 'invoices', 'financial'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'business' && <BusinessInfoTab />}
      {tab === 'staff' && <StaffTab />}
      {tab === 'email' && <EmailTab />}
      {tab === 'templates' && <EmailTemplatesTab />}
      {tab === 'invoices' && <InvoicesSettingsTab />}
      {tab === 'financial' && <FinancialTab />}
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
  const [termsVersion, setTermsVersion] = useState('');
  const [termsDocumentDate, setTermsDocumentDate] = useState('');
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
        setTermsVersion(i.termsVersion);
        setTermsDocumentDate(i.termsDocumentDate);
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
    setTermsSaving(true);
    setTermsError(null);
    setTermsSaved(false);
    try {
      const patch: Record<string, unknown> = { termsVersion, termsDocumentDate };
      if (termsFile !== null) {
        patch.termsFile = termsFile;
        patch.termsFileName = termsFileName;
      }
      await api.updateBusinessInfo(patch);
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
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label>Version</label>
              <input type="text" value={termsVersion} onChange={(e) => setTermsVersion(e.target.value)} placeholder="e.g. v2.1" />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label>Document date</label>
              <input type="text" value={termsDocumentDate} onChange={(e) => setTermsDocumentDate(e.target.value)} placeholder="e.g. 1 January 2026" />
            </div>
          </div>
          <div className="modal-actions" style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
            <button className="btn btn-primary" type="submit" disabled={termsSaving}>
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

      <DocumentNumberingCard />
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
  {
    value: 'invoice',
    label: 'Invoice Template',
    description: 'Sent from Invoices & Quotes when staff choose "Send" on an invoice.',
  },
  {
    value: 'quote',
    label: 'Quote Template',
    description: 'Sent from Invoices & Quotes when staff choose "Send" on a quote.',
  },
];

// invoice/quote templates are edited as raw HTML (RichTextEditor) and sent
// through as-is aside from placeholder substitution; the other three are
// staff-authored plain text (escaped, newlines become <br>) -- kept in sync
// by hand with EmailTrigger.INVOICE/QUOTE in settings.service.ts.
function isHtmlBodyTrigger(trigger: EmailTrigger): boolean {
  return trigger === 'invoice' || trigger === 'quote';
}

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

// Sample line items for the invoice/quote template Preview -- matches the
// column set and inline-style markup buildItemsTableHtml() generates in
// backend/src/common/invoice-email.util.ts, so what staff see in Preview
// matches what actually sends.
const SAMPLE_LINE_ITEMS = [
  { description: '30 Minute Weekday Group Walk', quantity: 3, unitPrice: 10.5, discountPercent: 0 },
  { description: '1 Daily Pet Visit (Up to 20 Mins)', quantity: 1, unitPrice: 10, discountPercent: 10 },
];

function sampleSubtotal(): number {
  return SAMPLE_LINE_ITEMS.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice * (1 - item.discountPercent / 100),
    0,
  );
}

const BUSINESS_PLACEHOLDERS = [
  { key: 'logo', hint: "the business's logo (Settings > Business Info)" },
  { key: 'businessName', hint: 'business name' },
  { key: 'businessAddress', hint: 'business address' },
  { key: 'businessTown', hint: 'business town' },
  { key: 'businessPostcode', hint: 'business postcode' },
  { key: 'businessTelephone', hint: 'business telephone' },
  { key: 'businessEmail', hint: 'business email' },
  { key: 'businessWebsite', hint: 'business website' },
];

// Settings > Invoices > Bank Details -- invoice/quote-only, same as the
// document number/date placeholders, since paying-in details have no
// meaning for the other three (non-payment) triggers.
const BANK_PLACEHOLDERS = [
  { key: 'bank_name', hint: 'bank name (Settings > Invoices > Bank Details)' },
  { key: 'sort_code', hint: 'sort code' },
  { key: 'account_number', hint: 'account number' },
];

const TRIGGER_PLACEHOLDERS: Record<EmailTrigger, { key: string; hint: string }[]> = {
  registration: [
    { key: 'name', hint: "the customer's name" },
    { key: 'link', hint: 'the link being sent' },
    ...BUSINESS_PLACEHOLDERS,
  ],
  update_info: [
    { key: 'name', hint: "the customer's name" },
    { key: 'link', hint: 'the link being sent' },
    ...BUSINESS_PLACEHOLDERS,
  ],
  add_pet: [
    { key: 'name', hint: "the customer's name" },
    { key: 'link', hint: 'the link being sent' },
    ...BUSINESS_PLACEHOLDERS,
  ],
  invoice: [
    { key: 'customer_name', hint: "the customer's name" },
    { key: 'subject', hint: "the invoice's Subject field -- wrap in {{#if subject}}...{{/if}} since it's optional" },
    { key: 'items_table', hint: 'an auto-generated table of the line items' },
    { key: 'subtotal', hint: 'the subtotal amount (no £ sign)' },
    { key: 'total', hint: 'the total amount (no £ sign)' },
    { key: 'invoice_number', hint: 'the invoice number' },
    { key: 'invoice_date', hint: 'the issue date' },
    { key: 'due_date', hint: 'the due date' },
    ...BANK_PLACEHOLDERS,
    ...BUSINESS_PLACEHOLDERS,
  ],
  quote: [
    { key: 'customer_name', hint: "the customer's name" },
    { key: 'subject', hint: "the quote's Subject field -- wrap in {{#if subject}}...{{/if}} since it's optional" },
    { key: 'items_table', hint: 'an auto-generated table of the line items' },
    { key: 'subtotal', hint: 'the subtotal amount (no £ sign)' },
    { key: 'total', hint: 'the total amount (no £ sign)' },
    { key: 'quote_number', hint: 'the quote number' },
    { key: 'quote_date', hint: 'the issue date' },
    { key: 'valid_until', hint: 'the valid-until date' },
    ...BANK_PLACEHOLDERS,
    ...BUSINESS_PLACEHOLDERS,
  ],
};

// Prefilled the first time staff "Set up" the Invoice/Quote template, so
// they start from a working layout rather than a blank editor. Each logical
// section (document details, items, totals) is its own bordered/shaded
// "card" -- plain unstyled tables/paragraphs directly on the white email
// background read as unfinished, so nothing here is left bare.
function buildDocumentTemplateStarter(kind: 'invoice' | 'quote'): string {
  const noun = kind === 'invoice' ? 'invoice' : 'quote';
  const numberField = kind === 'invoice' ? 'invoice_number' : 'quote_number';
  const numberLabel = kind === 'invoice' ? 'Invoice #' : 'Quote #';
  const dateField = kind === 'invoice' ? 'invoice_date' : 'quote_date';
  const dateLabel = kind === 'invoice' ? 'Invoice Date' : 'Quote Date';
  const dueField = kind === 'invoice' ? 'due_date' : 'valid_until';
  const dueLabel = kind === 'invoice' ? 'Due Date' : 'Valid Until';
  const card = 'background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;';
  const row = 'padding:5px 0;';
  return `<div style="max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
<div style="background:#0f3a5f;color:#fff;padding:20px 24px;">
{{logo}}
<strong style="font-size:1.15rem;">{{businessName}}</strong>
</div>
<div style="padding:24px;background:#ffffff;">
<p style="margin:0 0 16px;">Hi {{customer_name}},</p>
<p style="margin:0 0 20px;">Please find your ${noun} below.{{#if subject}} {{subject}}{{/if}}</p>
<div style="${card}padding:16px 20px;margin-bottom:20px;">
<table style="width:100%;border-collapse:collapse;font-size:14px;">
<tr><td style="${row}color:#6b7280;">${numberLabel}</td><td style="${row}text-align:right;font-weight:700;">{{${numberField}}}</td></tr>
<tr><td style="${row}color:#6b7280;">${dateLabel}</td><td style="${row}text-align:right;">{{${dateField}}}</td></tr>
{{#if ${dueField}}}<tr><td style="${row}color:#6b7280;">${dueLabel}</td><td style="${row}text-align:right;">{{${dueField}}}</td></tr>{{/if}}
</table>
</div>
<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
{{items_table}}
</div>
<div style="${card}padding:16px 20px;max-width:280px;margin-left:auto;">
<table style="width:100%;border-collapse:collapse;font-size:14px;">
<tr><td style="${row}color:#6b7280;">Sub Total</td><td style="${row}text-align:right;">£{{subtotal}}</td></tr>
<tr><td style="padding:8px 0 0;font-weight:700;border-top:1px solid #e5e7eb;">Total (£)</td><td style="padding:8px 0 0;text-align:right;font-weight:700;border-top:1px solid #e5e7eb;">£{{total}}</td></tr>
</table>
</div>
{{#if bank_name}}<div style="${card}padding:16px 20px;margin-top:20px;">
<div style="font-weight:700;margin-bottom:8px;">Payment Details</div>
<table style="width:100%;border-collapse:collapse;font-size:14px;">
<tr><td style="${row}color:#6b7280;">Bank Name</td><td style="${row}text-align:right;">{{bank_name}}</td></tr>
<tr><td style="${row}color:#6b7280;">Sort Code</td><td style="${row}text-align:right;">{{sort_code}}</td></tr>
<tr><td style="${row}color:#6b7280;">Account Number</td><td style="${row}text-align:right;">{{account_number}}</td></tr>
</table>
</div>{{/if}}
</div>
</div>`;
}

const INVOICE_TEMPLATE_STARTER = buildDocumentTemplateStarter('invoice');
const QUOTE_TEMPLATE_STARTER = buildDocumentTemplateStarter('quote');

function starterBody(trigger: EmailTrigger): string {
  if (trigger === 'invoice') return INVOICE_TEMPLATE_STARTER;
  if (trigger === 'quote') return QUOTE_TEMPLATE_STARTER;
  return '';
}

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
  const [name, setName] = useState(template?.name ?? (isHtmlBodyTrigger(trigger) ? meta.label : ''));
  const [subject, setSubject] = useState(
    template?.subject ?? (isHtmlBodyTrigger(trigger) ? `Your ${trigger} from {{businessName}}` : ''),
  );
  const [body, setBody] = useState(template?.body ?? starterBody(trigger));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const richTextRef = useRef<RichTextEditorHandle>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.getBusinessInfo().then(setBusinessInfo).catch(() => {});
  }, []);

  // Inserts at the current cursor position in whichever body editor is
  // active -- RichTextEditor owns its own cursor internally (via the ref
  // handle), but the plain <textarea> is rendered right here, so its
  // insertion has to be handled directly against its own selection range.
  function handleInsertPlaceholder(token: string) {
    if (isHtmlBodyTrigger(trigger)) {
      richTextRef.current?.insertText(token);
      return;
    }
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // RichTextEditor isn't a native input, so the form's `required` attribute
    // can't enforce a non-empty body for it the way it does for the textarea.
    if (isHtmlBodyTrigger(trigger) && !body.replace(/<[^>]*>/g, '').trim()) {
      setError('Email body is required.');
      return;
    }
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <label>Email Body</label>
            <select
              className="insert-var-select"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) handleInsertPlaceholder(e.target.value);
                e.target.value = '';
              }}
            >
              <option value="" disabled>
                Insert variable…
              </option>
              {TRIGGER_PLACEHOLDERS[trigger].map((p) => (
                <option key={p.key} value={`{{${p.key}}}`}>
                  {`{{${p.key}}}`} — {p.hint}
                </option>
              ))}
            </select>
          </div>
          {isHtmlBodyTrigger(trigger) ? (
            <RichTextEditor ref={richTextRef} value={body} onChange={setBody} />
          ) : (
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder={`Hi {{name}},\n\nPlease complete your registration using the link below:\n{{link}}\n\nThanks,\nPawfectPets Sherborne`}
              required
            />
          )}
          <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
            Sent as HTML.
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
          trigger={trigger}
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
  trigger,
  subject,
  body,
  businessInfo,
  onClose,
}: {
  trigger: EmailTrigger;
  subject: string;
  body: string;
  businessInfo: BusinessInfo;
  onClose: () => void;
}) {
  const businessVars: Record<string, string> = {
    businessName: businessInfo.name,
    businessAddress: businessInfo.address,
    businessTown: businessInfo.town,
    businessPostcode: businessInfo.postcode,
    businessTelephone: businessInfo.telephone,
    businessEmail: businessInfo.email,
    businessWebsite: businessInfo.website,
  };
  const htmlBody = isHtmlBodyTrigger(trigger);
  const isQuote = trigger === 'quote';
  const vars: Record<string, string | undefined> = htmlBody
    ? {
        ...businessVars,
        customer_name: 'Jane Smith',
        subject: 'August boarding',
        subtotal: sampleSubtotal().toFixed(2),
        total: sampleSubtotal().toFixed(2),
        bank_name: businessInfo.bankName,
        sort_code: businessInfo.sortCode,
        account_number: businessInfo.accountNumber,
        ...(isQuote
          ? { quote_number: 'QUO-2026-00001', quote_date: '21/08/2026', valid_until: '28/08/2026' }
          : { invoice_number: 'INV-2026-00001', invoice_date: '21/08/2026', due_date: '28/08/2026' }),
      }
    : {
        ...businessVars,
        name: 'Jane Smith',
        link: `${INTAKE_URL}/intake/sample-id`,
      };
  const logoTag = businessInfo.logoImage
    ? `<img src="${businessInfo.logoImage}" alt="${escapeHtml(businessInfo.name)}" style="max-height:60px;max-width:220px;display:block;" />`
    : '';
  const rawVars: Record<string, string> = htmlBody
    ? { logo: logoTag, items_table: buildItemsTableHtml(SAMPLE_LINE_ITEMS) }
    : { logo: logoTag };
  const renderedSubject = interpolateSubject(subject, vars);
  const renderedBody = interpolateBody(body, vars, rawVars, htmlBody);

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

function InvoicesSettingsTab() {
  return (
    <div>
      <InvoiceTermsCard />
      <BankDetailsCard />
      <ProductsCard />
      <PdfTemplateDesigner />
    </div>
  );
}

function DocumentNumberingCard() {
  const [invoiceNumberTemplate, setInvoiceNumberTemplate] = useState('');
  const [invoiceNextNumber, setInvoiceNextNumber] = useState('1');
  const [quoteNumberTemplate, setQuoteNumberTemplate] = useState('');
  const [quoteNextNumber, setQuoteNextNumber] = useState('1');
  const [paymentNumberTemplate, setPaymentNumberTemplate] = useState('');
  const [paymentNextNumber, setPaymentNextNumber] = useState('1');
  const [creditNoteNumberTemplate, setCreditNoteNumberTemplate] = useState('');
  const [creditNoteNextNumber, setCreditNoteNextNumber] = useState('1');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .getBusinessInfo()
      .then((info) => {
        setInvoiceNumberTemplate(info.invoiceNumberTemplate);
        setInvoiceNextNumber(String(info.invoiceNextNumber));
        setQuoteNumberTemplate(info.quoteNumberTemplate);
        setQuoteNextNumber(String(info.quoteNextNumber));
        setPaymentNumberTemplate(info.paymentNumberTemplate);
        setPaymentNextNumber(String(info.paymentNextNumber));
        setCreditNoteNumberTemplate(info.creditNoteNumberTemplate);
        setCreditNoteNextNumber(String(info.creditNoteNextNumber));
        setLoaded(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load document numbering'));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api.updateBusinessInfo({
        invoiceNumberTemplate,
        invoiceNextNumber: Number(invoiceNextNumber) || 1,
        quoteNumberTemplate,
        quoteNextNumber: Number(quoteNextNumber) || 1,
        paymentNumberTemplate,
        paymentNextNumber: Number(paymentNextNumber) || 1,
        creditNoteNumberTemplate,
        creditNoteNextNumber: Number(creditNoteNextNumber) || 1,
      });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save document numbering');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h2>Document Numbering</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
        Use <code>{'{year}'}</code> and <code>{'{seq}'}</code> as placeholders in the template. The next number
        updates automatically each time an invoice or quote is created — change it here to skip ahead or match an
        existing sequence.
      </p>
      {error && <div className="error-banner">{error}</div>}
      {saveError && <div className="error-banner">{saveError}</div>}
      {!loaded ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <div className="field">
              <label>Invoice Number Template</label>
              <input
                type="text"
                value={invoiceNumberTemplate}
                onChange={(e) => setInvoiceNumberTemplate(e.target.value)}
                placeholder="INV-{year}-{seq}"
              />
            </div>
            <div className="field">
              <label>Next Invoice Number</label>
              <input
                type="number"
                min="1"
                step="1"
                value={invoiceNextNumber}
                onChange={(e) => setInvoiceNextNumber(e.target.value)}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Quote Number Template</label>
              <input
                type="text"
                value={quoteNumberTemplate}
                onChange={(e) => setQuoteNumberTemplate(e.target.value)}
                placeholder="QUO-{year}-{seq}"
              />
            </div>
            <div className="field">
              <label>Next Quote Number</label>
              <input
                type="number"
                min="1"
                step="1"
                value={quoteNextNumber}
                onChange={(e) => setQuoteNextNumber(e.target.value)}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Payment ID Template</label>
              <input
                type="text"
                value={paymentNumberTemplate}
                onChange={(e) => setPaymentNumberTemplate(e.target.value)}
                placeholder="PAY-{year}-{seq}"
              />
            </div>
            <div className="field">
              <label>Next Payment ID</label>
              <input
                type="number"
                min="1"
                step="1"
                value={paymentNextNumber}
                onChange={(e) => setPaymentNextNumber(e.target.value)}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Credit Note Number Template</label>
              <input
                type="text"
                value={creditNoteNumberTemplate}
                onChange={(e) => setCreditNoteNumberTemplate(e.target.value)}
                placeholder="CN-{year}-{seq}"
              />
            </div>
            <div className="field">
              <label>Next Credit Note Number</label>
              <input
                type="number"
                min="1"
                step="1"
                value={creditNoteNextNumber}
                onChange={(e) => setCreditNoteNextNumber(e.target.value)}
              />
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
      )}
    </div>
  );
}

function BankDetailsCard() {
  const [bankName, setBankName] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .getBusinessInfo()
      .then((info) => {
        setBankName(info.bankName);
        setSortCode(info.sortCode);
        setAccountNumber(info.accountNumber);
        setLoaded(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bank details'));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api.updateBusinessInfo({ bankName, sortCode, accountNumber });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save bank details');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h2>Bank Details</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
        Shown to customers on invoices so they know where to send payment.
      </p>
      {error && <div className="error-banner">{error}</div>}
      {saveError && <div className="error-banner">{saveError}</div>}
      {!loaded ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Bank Name</label>
            <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Sort Code</label>
              <input
                type="text"
                value={sortCode}
                onChange={(e) => setSortCode(e.target.value)}
                placeholder="00-00-00"
              />
            </div>
            <div className="field">
              <label>Account Number</label>
              <input type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
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
      )}
    </div>
  );
}

function InvoiceTermsCard() {
  const [terms, setTerms] = useState<InvoiceTerm[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<InvoiceTerm | null>(null);
  const [deleting, setDeleting] = useState<InvoiceTerm | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function refresh() {
    api
      .listInvoiceTerms()
      .then(setTerms)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load invoice terms'));
  }
  useEffect(refresh, []);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteInvoiceTerm(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete term');
    } finally {
      setDeleteBusy(false);
    }
  }

  // Only one term can be default -- the backend already enforces that (clears
  // it off every other term), so a click here can always just set it true;
  // there's no case where we'd need to send false to unset a term as default
  // other than picking a different one instead.
  async function handleSetDefault(term: InvoiceTerm) {
    setError(null);
    try {
      await api.updateInvoiceTerm(term._id, {
        text: term.text,
        plusDays: term.endOfMonth ? null : (term.plusDays ?? null),
        endOfMonth: term.endOfMonth ?? false,
        isDefault: !term.isDefault,
      });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update default term');
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2>Invoice Terms</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
            Standard terms staff can add to an invoice.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
          Add term
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!terms || terms.length === 0 ? (
        <div className="empty-state">{terms === null ? 'Loading…' : 'No invoice terms yet.'}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Term</th>
              <th>Plus Days</th>
              <th>Default</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {terms.map((t) => (
              <tr key={t._id}>
                <td style={{ whiteSpace: 'pre-wrap' }}>{t.text}</td>
                <td>{t.endOfMonth ? 'End of month' : (t.plusDays ?? '—')}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!t.isDefault}
                    onChange={() => handleSetDefault(t)}
                    title="Applied to all new invoices and quotes"
                  />
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button className="icon-btn" title="Edit" onClick={() => setEditing(t)}>
                      <PencilIcon />
                    </button>
                    <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => setDeleting(t)}>
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(showNew || editing) && (
        <EditInvoiceTermModal
          term={editing}
          onClose={() => {
            setShowNew(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowNew(false);
            setEditing(null);
            refresh();
          }}
        />
      )}

      {deleting && (
        <Modal title="Delete invoice term?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>This permanently removes this term.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting…' : 'Delete term'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EditInvoiceTermModal({
  term,
  onClose,
  onSaved,
}: {
  term: InvoiceTerm | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(term?.text ?? '');
  const [endOfMonth, setEndOfMonth] = useState(term?.endOfMonth ?? false);
  const [plusDays, setPlusDays] = useState(term?.plusDays != null ? String(term.plusDays) : '');
  const [isDefault, setIsDefault] = useState(term?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const input = {
        text,
        endOfMonth,
        plusDays: endOfMonth ? null : plusDays === '' ? null : Number(plusDays),
        isDefault,
      };
      if (term) {
        await api.updateInvoiceTerm(term._id, input);
      } else {
        await api.createInvoiceTerm(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save term');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={term ? 'Edit invoice term' : 'Add invoice term'} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Term</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            required
            autoFocus
            placeholder="e.g. Payment due within 14 days of invoice date."
          />
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
            <input type="checkbox" checked={endOfMonth} onChange={(e) => setEndOfMonth(e.target.checked)} />
            End of the month
          </label>
          <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
            Always due on the last working day of the invoice's month, instead of a fixed number
            of days.
          </div>
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Default
          </label>
          <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
            Applied automatically to all new invoices and quotes. Only one term can be the
            default — ticking this unticks it on any other term.
          </div>
        </div>
        {!endOfMonth && (
          <div className="field">
            <label>Plus Days</label>
            <input
              type="number"
              min="0"
              step="1"
              value={plusDays}
              onChange={(e) => setPlusDays(e.target.value)}
              placeholder="e.g. 14"
            />
            <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
              Days added to the invoice/quote date to work out its due date. Leave blank if this
              term shouldn't set a due date automatically.
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : term ? 'Save term' : 'Add term'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SortableTh<K extends string>({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: K;
  activeKey: K;
  dir: 'asc' | 'desc';
  onSort: (key: K) => void;
}) {
  return (
    <th onClick={() => onSort(sortKey)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label}
      <SortIcon direction={activeKey === sortKey ? dir : null} />
    </th>
  );
}

type ProductSortKey = 'productCode' | 'name' | 'description' | 'price';

function ProductsCard() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<ProductSortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function refresh() {
    api
      .listProducts()
      .then(setProducts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load products'));
  }
  useEffect(refresh, []);

  function toggleSort(key: ProductSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sortedProducts = products
    ? [...products].sort((a, b) => {
        const cmp =
          sortKey === 'price' ? a.price - b.price : (a[sortKey] ?? '').localeCompare(b[sortKey] ?? '');
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : null;

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteProduct(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete product');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2>Products</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
            A reusable catalog of products and services for invoices and quotes.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
          Add product
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!products || products.length === 0 ? (
        <div className="empty-state">{products === null ? 'Loading…' : 'No products yet.'}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <SortableTh label="Product Code" sortKey="productCode" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableTh label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableTh label="Description" sortKey="description" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableTh label="Price" sortKey="price" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedProducts!.map((p) => (
              <tr key={p._id}>
                <td>{p.productCode}</td>
                <td>{p.name}</td>
                <td>{p.description || '—'}</td>
                <td>£{p.price.toFixed(2)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button className="icon-btn" title="Edit" onClick={() => setEditing(p)}>
                      <PencilIcon />
                    </button>
                    <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => setDeleting(p)}>
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(showNew || editing) && (
        <EditProductModal
          product={editing}
          onClose={() => {
            setShowNew(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowNew(false);
            setEditing(null);
            refresh();
          }}
        />
      )}

      {deleting && (
        <Modal title="Delete product?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently removes <strong>{deleting.name}</strong> from the product catalog.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting…' : 'Delete product'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EditProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [productCode, setProductCode] = useState(product?.productCode ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(String(product?.price ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const input = {
        productCode,
        name,
        description: description || undefined,
        price: Number(price) || 0,
      };
      if (product) {
        await api.updateProduct(product._id, input);
      } else {
        await api.createProduct(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={product ? 'Edit product' : 'Add product'} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Product Code</label>
          <input type="text" value={productCode} onChange={(e) => setProductCode(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div className="field">
          <label>Price (£)</label>
          <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : product ? 'Save product' : 'Add product'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FinancialTab() {
  return (
    <div>
      <NamedListCard
        title="Payment Methods"
        description="Shown as options when staff record a payment against an invoice."
        itemNoun="payment method"
        namePlaceholder="e.g. Bank Transfer"
        list={api.listPaymentMethods}
        create={api.createPaymentMethod}
        update={api.updatePaymentMethod}
        remove={api.deletePaymentMethod}
      />
      <NamedListCard
        title="Expense Categories"
        description="Shown as options when staff record an expense on the Financial page."
        itemNoun="expense category"
        itemNounPlural="expense categories"
        namePlaceholder="e.g. Insurance"
        list={api.listExpenseCategories}
        create={api.createExpenseCategory}
        update={api.updateExpenseCategory}
        remove={api.deleteExpenseCategory}
      />
      <NamedListCard
        title="Vendors"
        description="Shown as Payee options when staff record an expense on the Financial page."
        itemNoun="vendor"
        namePlaceholder="e.g. Acme Pet Supplies"
        list={api.listVendors}
        create={api.createVendor}
        update={api.updateVendor}
        remove={api.deleteVendor}
      />
    </div>
  );
}

