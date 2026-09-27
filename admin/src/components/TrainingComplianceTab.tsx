import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Badge from './Badge';
import type { TrainingComplianceRow } from '../types';

export default function TrainingComplianceTab() {
  const [rows, setRows] = useState<TrainingComplianceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api
      .getTrainingCompliance()
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the compliance audit'));
  }
  useEffect(refresh, []);

  const compliantCount = (rows ?? []).filter((r) => r.status === 'compliant').length;
  const dueCount = (rows ?? []).filter((r) => r.status === 'due').length;
  const overdueCount = (rows ?? []).filter((r) => r.status === 'overdue').length;

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 20, marginBottom: 20 }}>
        <div className="card" style={{ margin: 0 }}>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Compliant</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{compliantCount}</div>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Due soon</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--warn)' }}>{dueCount}</div>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Overdue</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--error)' }}>{overdueCount}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {!rows ? (
          <div className="empty-state">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">No staff have been assigned a training module yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Staff</th>
                <th>Module</th>
                <th>Last Score</th>
                <th>Result</th>
                <th>Completed</th>
                <th>Next Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.moduleId}-${r.staffId}`}>
                  <td>
                    <strong>{r.staffName}</strong>
                  </td>
                  <td>{r.moduleName}</td>
                  <td style={{ color: 'var(--muted)' }}>{r.lastScorePercent !== undefined ? `${r.lastScorePercent}%` : '—'}</td>
                  <td>
                    {r.lastPassed === undefined ? (
                      '—'
                    ) : (
                      <span className={`badge badge-${r.lastPassed ? 'completed' : 'declined'}`}>
                        {r.lastPassed ? 'Pass' : 'Fail'}
                      </span>
                    )}
                  </td>
                  <td style={{ color: 'var(--muted)' }}>
                    {r.lastCompletedAt ? new Date(r.lastCompletedAt).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td style={{ color: 'var(--muted)' }}>
                    {new Date(r.nextDueDate ?? r.dueDate).toLocaleDateString('en-GB')}
                  </td>
                  <td>
                    <Badge value={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
