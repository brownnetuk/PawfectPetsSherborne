import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/client';
import type { CrmActivity } from '../types';

function customerLabel(customer: CrmActivity['customer']): string {
  return typeof customer === 'string' ? customer : customer.name;
}
function customerId(customer: CrmActivity['customer']): string {
  return typeof customer === 'string' ? customer : customer._id;
}

export default function ActivityPage() {
  const navigate = useNavigate();
  const [activity, setActivity] = useState<CrmActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listActivities().then(setActivity).catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Activity</h1>
      </div>
      {error && <div className="error-banner">{error}</div>}

      {!activity || activity.length === 0 ? (
        <div className="empty-state">{activity === null ? 'Loading…' : 'No activity logged yet.'}</div>
      ) : (
        <div className="card">
          {activity.map((a) => (
            <div
              key={a._id}
              style={{ padding: '12px 0', borderBottom: '1px solid #eef1f2', cursor: 'pointer' }}
              onClick={() => navigate(`/customers/${customerId(a.customer)}`)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{a.subject}</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  {new Date(a.createdAt).toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                {customerLabel(a.customer)} · {a.type} · {a.createdBy}
              </div>
              {a.description && <div style={{ marginTop: 4 }}>{a.description}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
