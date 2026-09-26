import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Badge from './Badge';
import Modal from './Modal';
import PolicyDetailModal from './PolicyDetailModal';
import RichTextEditor from './RichTextEditor';
import SortableTh from './SortableTh';
import type { Policy } from '../types';

type SortKey = 'policyId' | 'name' | 'category' | 'version' | 'lastReviewed' | 'nextReview' | 'reviewed' | 'status';

export const REVIEW_FREQUENCY_OPTIONS: { value: string; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: '6-monthly', label: '6-Monthly' },
  { value: 'annually', label: 'Annually' },
];

export function reviewFrequencyLabel(value?: string): string {
  return REVIEW_FREQUENCY_OPTIONS.find((o) => o.value === value)?.label ?? '—';
}

export function currentVersion(policy: Policy) {
  return policy.versions[policy.versions.length - 1];
}

// Shared by NewPolicyModal (here) and PublishVersionModal
// (PolicyDetailModal.tsx) -- who's required to review a version. Purely
// presentational; the parent owns fetching the staff list and the selection.
export function StaffSignOffPicker({
  staff,
  selected,
  onToggle,
}: {
  staff: { _id: string; name: string }[] | null;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
      {staff === null ? (
        <div style={{ padding: 16, color: 'var(--muted)' }}>Loading…</div>
      ) : staff.length === 0 ? (
        <div style={{ padding: 16, color: 'var(--muted)' }}>No active staff found.</div>
      ) : (
        staff.map((s) => (
          <label
            key={s._id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderBottom: '1px solid var(--border)',
              fontWeight: 400,
              cursor: 'pointer',
            }}
          >
            <input type="checkbox" checked={selected.has(s._id)} onChange={() => onToggle(s._id)} />
            <span>{s.name}</span>
          </label>
        ))
      )}
    </div>
  );
}

export function policyStatusBadge(policy: Policy): string {
  if (policy.status === 'draft') return 'draft';
  const today = new Date().toISOString().slice(0, 10);
  if (policy.nextReviewDate && policy.nextReviewDate <= today) return 'due';
  const current = currentVersion(policy);
  if (current?.signOffs.some((s) => !s.signedAt)) return 'pending_review';
  return 'current';
}

export default function PoliciesTab() {
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('policyId');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<Policy | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  function refresh() {
    api
      .listPolicies()
      .then(setPolicies)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load policies'));
  }
  useEffect(refresh, []);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  // Version/Last reviewed/Reviewed aren't direct Policy fields -- they're
  // derived from the current (latest) version, same source the table cells
  // themselves read from.
  function sortValue(p: Policy, key: SortKey): string | number {
    const current = currentVersion(p);
    switch (key) {
      case 'policyId':
        // Numeric part of 'POL{n}' -- plain string sort would put POL10
        // before POL2.
        return parseInt(p.policyId.replace(/\D/g, ''), 10) || 0;
      case 'name':
        return p.name.toLowerCase();
      case 'category':
        return (p.category ?? '').toLowerCase();
      case 'version':
        return current?.version ?? 0;
      case 'lastReviewed':
        return current ? new Date(current.publishedAt).getTime() : 0;
      case 'nextReview':
        return p.nextReviewDate ?? '';
      case 'reviewed':
        return current?.signOffs.filter((s) => s.signedAt).length ?? 0;
      case 'status':
        return policyStatusBadge(p);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deletePolicy(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete this policy');
    } finally {
      setDeleteBusy(false);
    }
  }

  const categories = ['All', ...Array.from(new Set((policies ?? []).map((p) => p.category).filter(Boolean)))] as string[];
  const q = search.trim().toLowerCase();
  const filtered = (policies ?? [])
    .filter((p) => {
      if (category !== 'All' && p.category !== category) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const publishedCount = (policies ?? []).filter((p) => p.status === 'published').length;
  const today = new Date();
  const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dueSoon = (policies ?? []).filter(
    (p) => p.status === 'published' && p.nextReviewDate && p.nextReviewDate <= in30Days,
  );
  const awaitingSignOff = (policies ?? []).filter((p) => currentVersion(p)?.signOffs.some((s) => !s.signedAt));

  return (
    <div>
      <div className="page-header">
        <h1>Policies</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + New Policy
        </button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -8 }}>
        Double-click a row to open the full policy, publish a new version, or manage policy reviews.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 20, marginBottom: 20 }}>
        <div className="card" style={{ margin: 0 }}>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Published policies</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{publishedCount}</div>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Reviews due in 30 days</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{dueSoon.length}</div>
          {dueSoon.length > 0 && (
            <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{dueSoon.map((p) => p.name).join(', ')}</div>
          )}
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Awaiting review</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{awaitingSignOff.length}</div>
          {awaitingSignOff.length > 0 && (
            <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
              {awaitingSignOff.map((p) => p.name).join(', ')}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <div className="field" style={{ flexGrow: 1, minWidth: 180, maxWidth: 420, marginBottom: 0 }}>
            <input
              type="text"
              placeholder="Search policies"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={category === c ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        {!policies ? (
          <div className="empty-state">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No policies yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <SortableTh label="Policy ID" sortKey="policyId" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Policy" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Category" sortKey="category" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Version" sortKey="version" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Last reviewed" sortKey="lastReviewed" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Next review" sortKey="nextReview" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Reviewed" sortKey="reviewed" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const current = currentVersion(p);
                const signedCount = current?.signOffs.filter((s) => s.signedAt).length ?? 0;
                const totalCount = current?.signOffs.length ?? 0;
                return (
                  <tr key={p._id} onDoubleClick={() => setOpenId(p._id)} style={{ cursor: 'pointer' }}>
                    <td style={{ color: 'var(--muted)' }}>{p.policyId}</td>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{p.category || '—'}</td>
                    <td>{current ? `v${current.version}` : '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>
                      {current ? new Date(current.publishedAt).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td style={{ color: 'var(--muted)' }}>
                      {p.nextReviewDate ? new Date(p.nextReviewDate).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td>
                      {totalCount > 0 ? `${signedCount} of ${totalCount}` : '—'}
                    </td>
                    <td>
                      <Badge value={policyStatusBadge(p)} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleting(p)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <NewPolicyModal
          categories={categories.filter((c) => c !== 'All')}
          nextIdHint={`POL${(policies?.length ?? 0) + 1}`}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}

      {deleting && (
        <Modal title="Delete this policy?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently deletes <strong>{deleting.name}</strong> and all {deleting.versions.length} of its
            versions, including sign-off history. This can't be undone.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting…' : 'Delete policy'}
            </button>
          </div>
        </Modal>
      )}

      {openId && <PolicyDetailModal policyId={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  );
}

function NewPolicyModal({
  categories,
  nextIdHint,
  onClose,
  onSaved,
}: {
  categories: string[];
  nextIdHint: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [reference, setReference] = useState('');
  const [reviewFrequency, setReviewFrequency] = useState('');
  const [status, setStatus] = useState('draft');
  const [content, setContent] = useState('');
  const [staffOptions, setStaffOptions] = useState<{ _id: string; name: string }[] | null>(null);
  const [signOffStaffIds, setSignOffStaffIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listPolicyStaffOptions().then((list) => {
      setStaffOptions(list);
      // Defaults to everyone -- staff can uncheck anyone who doesn't need to sign this one.
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
      await api.createPolicy({
        name,
        category: category || undefined,
        reference: reference || undefined,
        reviewFrequency: reviewFrequency || undefined,
        content,
        status,
        signOffStaffIds: Array.from(signOffStaffIds),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create this policy');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Policy" onClose={onClose} wide>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label>Policy ID</label>
            <input type="text" value={nextIdHint} disabled />
            <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>Auto-assigned on save</span>
          </div>
          <div className="field">
            <label>Policy name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Escaped dog procedure" required autoFocus />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Category</label>
            <input type="text" list="policy-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Emergencies" />
            <datalist id="policy-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label>Reference</label>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Schedule 2, paragraph 5.1" />
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
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
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
            {saving ? 'Saving…' : 'Create Policy'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
