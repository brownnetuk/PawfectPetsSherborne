import { useEffect, useState } from 'react';
import * as api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Badge from './Badge';
import Modal from './Modal';
import {
  currentVersion,
  policyStatusBadge,
  REVIEW_FREQUENCY_OPTIONS,
  reviewFrequencyLabel,
  StaffSignOffPicker,
} from './PoliciesTab';
import RichTextEditor from './RichTextEditor';
import type { Policy } from '../types';

const LABEL_CAPTION_STYLE: React.CSSProperties = {
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted)',
  fontWeight: 700,
  marginBottom: 4,
};

export default function PolicyDetailModal({
  policyId,
  onClose,
  onChanged,
}: {
  policyId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { staff } = useAuth();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [showPublishVersion, setShowPublishVersion] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    api
      .getPolicy(policyId)
      .then(setPolicy)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this policy'));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [policyId]);

  async function handleSignOff(signedName: string) {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.signOffPolicy(policyId, signedName);
      setPolicy(updated);
      setShowReviewModal(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit your review');
    } finally {
      setBusy(false);
    }
  }

  async function handleSendReminder() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.sendPolicyReminder(policyId);
      setPolicy(updated);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reminder');
    } finally {
      setBusy(false);
    }
  }

  async function handleResetToV1() {
    setBusy(true);
    setResetError(null);
    try {
      const updated = await api.resetPolicyToV1(policyId);
      setPolicy(updated);
      setShowResetConfirm(false);
      onChanged();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Failed to reset this policy');
    } finally {
      setBusy(false);
    }
  }

  if (!policy) {
    return (
      <Modal title="Policy" onClose={onClose} xl>
        {error && <div className="error-banner">{error}</div>}
        <div className="empty-state">Loading…</div>
      </Modal>
    );
  }

  const current = currentVersion(policy);
  const mySignOff = current?.signOffs.find((s) => s.staff === staff?.id);
  const iNeedToSign = !!mySignOff && !mySignOff.signedAt;
  const anyOutstanding = current?.signOffs.some((s) => !s.signedAt) ?? false;

  return (
    <>
      <Modal title={policy.name} onClose={onClose} xl>
        {error && <div className="error-banner">{error}</div>}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 14,
            padding: '10px 0 16px',
            borderBottom: '1px solid var(--border)',
            marginBottom: 16,
          }}
        >
          <div>
            <div style={LABEL_CAPTION_STYLE}>Policy ID</div>
            {policy.policyId}
          </div>
          <div>
            <div style={LABEL_CAPTION_STYLE}>Category</div>
            {policy.category || '—'}
          </div>
          <div>
            <div style={LABEL_CAPTION_STYLE}>Reference</div>
            {policy.reference || '—'}
          </div>
          <div>
            <div style={LABEL_CAPTION_STYLE}>Status</div>
            <Badge value={policyStatusBadge(policy)} />
          </div>
          <div>
            <div style={LABEL_CAPTION_STYLE}>Review Frequency</div>
            {reviewFrequencyLabel(policy.reviewFrequency)}
          </div>
          <div>
            <div style={LABEL_CAPTION_STYLE}>Next Review Date</div>
            {policy.nextReviewDate ? new Date(policy.nextReviewDate).toLocaleDateString('en-GB') : '—'}
          </div>
          <div>
            <div style={LABEL_CAPTION_STYLE}>Current Version</div>
            {current ? `v${current.version}` : '—'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <article style={{ flexGrow: 1, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '24px 28px' }}>
            {current ? (
              <div dangerouslySetInnerHTML={{ __html: current.content }} />
            ) : (
              <div className="empty-state">No version published yet.</div>
            )}
          </article>
          <aside style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {iNeedToSign && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowReviewModal(true)} disabled={busy}>
                  Policy Review
                </button>
              )}
              {anyOutstanding && (
                <button className="btn btn-secondary btn-sm" onClick={handleSendReminder} disabled={busy}>
                  Send Reminder
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => setShowPublishVersion(true)}>
                Publish New Version
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowEditDetails(true)}>
                Edit Details
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAudit(true)}>
                Audit
              </button>
              {policy.versions.length > 1 && (
                <button className="btn btn-danger btn-sm" onClick={() => setShowResetConfirm(true)}>
                  Reset to v1
                </button>
              )}
            </div>
            <section className="card" style={{ margin: 0 }}>
              <h2 style={{ marginTop: 0 }}>{current ? `Policy Reviews for v${current.version}` : 'Policy Reviews'}</h2>
              {!current || current.signOffs.length === 0 ? (
                <div className="empty-state">No staff need to review this policy.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {current.signOffs.map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                      <span>{s.staffName}</span>
                      {s.signedAt ? (
                        <span style={{ color: 'var(--brand-green)', fontWeight: 600, fontSize: '0.8rem' }}>
                          Reviewed{' '}
                          {new Date(s.signedAt).toLocaleString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--warn)', fontWeight: 600, fontSize: '0.8rem' }} title={s.reminderSentAt ? `Reminder sent ${new Date(s.reminderSentAt).toLocaleString('en-GB')}` : undefined}>
                          Not yet reviewed
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="card" style={{ margin: 0 }}>
              <h2 style={{ marginTop: 0 }}>Version history</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[...policy.versions].reverse().map((v) => (
                  <div key={v._id}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                      v{v.version} · {new Date(v.publishedAt).toLocaleDateString('en-GB')}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
                      {v.changeSummary || 'No summary'} — {v.publishedBy}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </Modal>

      {showEditDetails && (
        <EditPolicyModal
          policy={policy}
          onClose={() => setShowEditDetails(false)}
          onSaved={(updated) => {
            setPolicy(updated);
            setShowEditDetails(false);
            onChanged();
          }}
        />
      )}

      {showPublishVersion && (
        <PublishVersionModal
          policyId={policyId}
          initialContent={current?.content ?? ''}
          onClose={() => setShowPublishVersion(false)}
          onSaved={(updated) => {
            setPolicy(updated);
            setShowPublishVersion(false);
            onChanged();
          }}
        />
      )}

      {showAudit && (
        <Modal title={`Audit Log — ${policy.name}`} onClose={() => setShowAudit(false)} wide>
          {policy.auditLog.length === 0 ? (
            <div className="empty-state">No changes logged yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Changed By</th>
                  <th>Action</th>
                  <th>Changes Made</th>
                </tr>
              </thead>
              <tbody>
                {[...policy.auditLog]
                  .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
                  .map((entry, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(entry.at).toLocaleString('en-GB')}</td>
                      <td>{entry.actor}</td>
                      <td>{entry.action}</td>
                      <td>{entry.changes || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}

      {showReviewModal && (
        <PolicyReviewModal
          defaultName={staff?.name ?? ''}
          busy={busy}
          error={error}
          onClose={() => setShowReviewModal(false)}
          onAgree={handleSignOff}
        />
      )}

      {showResetConfirm && current && (
        <Modal title="Reset this policy to v1?" onClose={() => setShowResetConfirm(false)}>
          {resetError && <div className="error-banner">{resetError}</div>}
          <p>
            This permanently deletes {current.version === 2 ? 'v2' : `v2–v${current.version}`} and all of
            their review history, leaving only v1's content and reviews. This can't be undone.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setShowResetConfirm(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleResetToV1} disabled={busy}>
              {busy ? 'Resetting…' : 'Reset to v1'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function PolicyReviewModal({
  defaultName,
  busy,
  error,
  onClose,
  onAgree,
}: {
  defaultName: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onAgree: (signedName: string) => void;
}) {
  const [signedName, setSignedName] = useState(defaultName);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signedName.trim()) return;
    onAgree(signedName.trim());
  }

  return (
    <Modal title="Policy Review" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <p>I have read the policy and agree to the information contained within.</p>
        <div className="field">
          <label>Type your name to confirm</label>
          <input
            type="text"
            value={signedName}
            onChange={(e) => setSignedName(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !signedName.trim()}>
            {busy ? 'Submitting…' : 'Agree'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditPolicyModal({
  policy,
  onClose,
  onSaved,
}: {
  policy: Policy;
  onClose: () => void;
  onSaved: (policy: Policy) => void;
}) {
  const [name, setName] = useState(policy.name);
  const [category, setCategory] = useState(policy.category ?? '');
  const [reference, setReference] = useState(policy.reference ?? '');
  const [reviewFrequency, setReviewFrequency] = useState(policy.reviewFrequency ?? '');
  const [status, setStatus] = useState(policy.status);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updatePolicy(policy._id, {
        name,
        category: category || undefined,
        reference: reference || undefined,
        reviewFrequency: reviewFrequency || undefined,
        status,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save this policy');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit Policy" onClose={onClose} wide>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label>Policy ID</label>
            <input type="text" value={policy.policyId} disabled />
          </div>
          <div className="field">
            <label>Policy name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Category</label>
            <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className="field">
            <label>Reference</label>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Review Frequency</label>
            <select value={reviewFrequency} onChange={(e) => setReviewFrequency(e.target.value)}>
              <option value="">-- Select --</option>
              {REVIEW_FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as Policy['status'])}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PublishVersionModal({
  policyId,
  initialContent,
  onClose,
  onSaved,
}: {
  policyId: string;
  initialContent: string;
  onClose: () => void;
  onSaved: (policy: Policy) => void;
}) {
  const [content, setContent] = useState(initialContent);
  const [changeSummary, setChangeSummary] = useState('');
  const [staffOptions, setStaffOptions] = useState<{ _id: string; name: string }[] | null>(null);
  const [signOffStaffIds, setSignOffStaffIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listPolicyStaffOptions().then((list) => {
      setStaffOptions(list);
      setSignOffStaffIds(new Set(list.map((s) => s._id)));
    });
  }, []);

  function toggleSignOffStaff(id: string) {
    setSignOffStaffIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.replace(/<[^>]*>/g, '').trim()) {
      setError('Enter the policy content.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.publishPolicyVersion(policyId, {
        content,
        changeSummary: changeSummary || undefined,
        signOffStaffIds: Array.from(signOffStaffIds),
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish this version');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Publish New Version" onClose={onClose} wide>
      {error && <div className="error-banner">{error}</div>}
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: -6 }}>
        Publishing resets Policy Review to whoever's selected below -- an old review doesn't carry forward onto
        changed content, and that includes you: you'll need to review it again too.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>What changed?</label>
          <input
            type="text"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            placeholder="e.g. Added microchip database step"
          />
        </div>
        <div className="field">
          <label>Content</label>
          <RichTextEditor value={content} onChange={setContent} />
        </div>
        <div className="field">
          <label>
            Who needs to review this policy?{' '}
            {signOffStaffIds.size > 0 && (
              <span style={{ fontWeight: 400, color: 'var(--muted)' }}>({signOffStaffIds.size} selected)</span>
            )}
          </label>
          <StaffSignOffPicker staff={staffOptions} selected={signOffStaffIds} onToggle={toggleSignOffStaff} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Publishing…' : 'Publish Version'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
