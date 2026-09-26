import { useEffect, useRef, useState } from 'react';
import * as api from '../api/client';
import Modal from '../components/Modal';
import RichTextEditor from '../components/RichTextEditor';
import { TrashIcon } from '../components/icons';
import type {
  BusinessInfo,
  Conversation,
  Customer,
  EmailGroup,
  EmailMessage,
  EmailMessageRecipient,
  EmailTemplate,
  Message,
  PushMessage,
  PushMessageRecipient,
} from '../types';
import { interpolateBody, interpolateSubject } from '../utils/emailTemplate';

type Tab = 'conversations' | 'push' | 'email';

// A person we can have a thread with — either an existing conversation or a
// customer picked to start a new one.
interface ActiveCustomer {
  customerId: string;
  name: string;
  email: string;
}

export default function CommunicationsPage() {
  const [tab, setTab] = useState<Tab>('conversations');

  return (
    <div>
      <h1>Communications</h1>
      <div className="tabs">
        <button className={tab === 'conversations' ? 'active' : ''} onClick={() => setTab('conversations')}>
          Conversations
        </button>
        <button className={tab === 'push' ? 'active' : ''} onClick={() => setTab('push')}>
          Push Messages
        </button>
        <button className={tab === 'email' ? 'active' : ''} onClick={() => setTab('email')}>
          Email
        </button>
      </div>
      {tab === 'conversations' && <ConversationsTab />}
      {tab === 'push' && <PushMessagesTab />}
      {tab === 'email' && <EmailTab />}
    </div>
  );
}

// Simple polling chat: the conversation list refreshes on an interval, and the
// open thread polls a little faster. No websockets — push handles the "you have
// a new message" alerting.
function ConversationsTab() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<ActiveCustomer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  async function loadConversations() {
    try {
      setConversations(await api.listConversations());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    }
  }

  useEffect(() => {
    loadConversations();
    const t = setInterval(loadConversations, 10000);
    return () => clearInterval(t);
  }, []);

  // Open straight into the most recent conversation instead of the empty
  // "select a conversation" placeholder -- only while nothing's selected yet,
  // so this doesn't fight a staff member's own pick on every 10s poll.
  useEffect(() => {
    if (!active && conversations.length > 0) {
      const first = conversations[0];
      setActive({ customerId: first.customerId, name: first.name, email: first.email });
    }
  }, [conversations, active]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={() => setPicking(true)}>
          New message
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', height: 600 }}>
        <div className="card" style={{ width: 320, flexShrink: 0, padding: 0, overflow: 'hidden' }}>
          <ConversationList
            conversations={conversations}
            selected={active?.customerId ?? null}
            onSelect={(c) => setActive({ customerId: c.customerId, name: c.name, email: c.email })}
          />
        </div>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0 }}>
          {active ? (
            <Thread key={active.customerId} customer={active} onSent={loadConversations} />
          ) : (
            <div style={{ margin: 'auto', color: 'var(--muted)' }}>
              Select a conversation, or start a new one.
            </div>
          )}
        </div>
      </div>
      {picking && (
        <CustomerPicker
          onClose={() => setPicking(false)}
          onPick={(c) => {
            setActive({ customerId: c._id, name: c.name, email: c.email });
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

function ConversationList({
  conversations,
  selected,
  onSelect,
}: {
  conversations: Conversation[];
  selected: string | null;
  onSelect: (c: Conversation) => void;
}) {
  if (conversations.length === 0) {
    return <div style={{ padding: 20, color: 'var(--muted)' }}>No conversations yet.</div>;
  }
  return (
    <div style={{ overflowY: 'auto' }}>
      {conversations.map((c) => {
        const isActive = c.customerId === selected;
        return (
          <button
            key={c.customerId}
            onClick={() => onSelect(c)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              background: isActive ? 'var(--brand-green-soft, #eaf5ee)' : 'transparent',
              padding: '12px 14px',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              {c.unread > 0 && (
                <span
                  style={{
                    background: 'var(--brand-green)',
                    color: 'white',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '1px 7px',
                  }}
                >
                  {c.unread}
                </span>
              )}
            </div>
            <div
              style={{
                color: 'var(--muted)',
                fontSize: 12,
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {c.lastSender === 'staff' ? 'You: ' : ''}
              {c.lastBody}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Thread({ customer, onSent }: { customer: ActiveCustomer; onSent: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      setMessages(await api.getMessageThread(customer.customerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.customerId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleSend() {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    try {
      await api.sendMessageToCustomer(customer.customerId, text);
      setBody('');
      await load();
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this message? This removes it for everyone.')) return;
    try {
      await api.deleteMessage(customer.customerId, id);
      await load();
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700 }}>{customer.name}</div>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{customer.email}</div>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 ? (
          <div style={{ margin: 'auto', color: 'var(--muted)', fontSize: 13 }}>
            No messages yet — say hello.
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m._id} message={m} onDelete={() => handleDelete(m._id)} />)
        )}
      </div>
      {error && <div className="error-banner" style={{ margin: '0 16px' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border)' }}>
        <textarea
          rows={2}
          value={body}
          placeholder="Type a message…"
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          style={{ flex: 1, resize: 'none' }}
        />
        <button className="btn btn-primary" onClick={handleSend} disabled={sending || !body.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </>
  );
}

function MessageBubble({ message, onDelete }: { message: Message; onDelete: () => void }) {
  const fromStaff = message.sender === 'staff';
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{ alignSelf: fromStaff ? 'flex-end' : 'flex-start', maxWidth: '75%' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        style={{
          background: fromStaff ? 'var(--brand-green)' : '#eef1f4',
          color: fromStaff ? 'white' : 'inherit',
          padding: '8px 12px',
          borderRadius: 14,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.body}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--muted)',
          marginTop: 2,
          textAlign: fromStaff ? 'right' : 'left',
        }}
      >
        {fromStaff ? message.senderName ?? 'Staff' : message.senderName ?? 'Customer'} ·{' '}
        {new Date(message.createdAt).toLocaleString('en-GB', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}
        {hover && (
          <button
            onClick={onDelete}
            title="Delete message"
            style={{
              marginLeft: 8,
              border: 'none',
              background: 'none',
              color: 'var(--danger, #c0392b)',
              cursor: 'pointer',
              fontSize: 11,
              padding: 0,
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

// A searchable modal to pick a customer and start a new conversation.
function CustomerPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (customer: Customer) => void;
}) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listCustomers()
      .then(setCustomers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load customers'));
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (customers ?? []).filter(
    (c) => c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q),
  );

  return (
    <Modal title="New message" onClose={onClose}>
      <div className="field">
        <input
          autoFocus
          type="text"
          placeholder="Search customers by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div style={{ maxHeight: 360, overflowY: 'auto', marginTop: 4 }}>
        {customers === null ? (
          <div style={{ padding: 16, color: 'var(--muted)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--muted)' }}>No matching customers.</div>
        ) : (
          filtered.map((c) => (
            <button
              key={c._id}
              onClick={() => onPick(c)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                background: 'transparent',
                padding: '10px 12px',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{c.email}</div>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}

// --- Push Messages: bulk/individual push notifications to customers, kept
// as a persisted history of "tasks" each showing per-customer delivery status.

function recipientId(r: PushMessageRecipient): string {
  return typeof r.customer === 'string' ? r.customer : r.customer._id;
}
function recipientName(r: PushMessageRecipient): string {
  return typeof r.customer === 'string' ? r.customer : r.customer.name;
}
function senderName(sentBy: PushMessage['sentBy']): string {
  if (!sentBy) return 'Unknown';
  return typeof sentBy === 'string' ? sentBy : sentBy.name;
}

function PushMessagesTab() {
  const [sends, setSends] = useState<PushMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSend, setShowSend] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<PushMessage | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function refresh() {
    api
      .listPushMessages()
      .then(setSends)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load push messages'));
  }
  useEffect(refresh, []);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deletePushMessage(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete this push message');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <p style={{ color: 'var(--muted)', fontSize: '0.88rem', maxWidth: 520, margin: 0 }}>
          Send a push notification to the Pawfect Pets customer app — one customer, a chosen group, or everyone.
          Each send is kept below as a task showing who received it.
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => setShowSend(true)} style={{ flexShrink: 0 }}>
          Send push
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!sends ? (
        <div className="empty-state">Loading…</div>
      ) : sends.length === 0 ? (
        <div className="empty-state">No push messages sent yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sends.map((s) => {
            const received = s.recipients.filter((r) => r.status === 'received').length;
            const notReceived = s.recipients.length - received;
            const isOpen = expanded.has(s._id);
            return (
              <div key={s._id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{s.title}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 2, whiteSpace: 'pre-wrap' }}>
                      {s.body}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 6 }}>
                      {new Date(s.createdAt).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · Sent by {senderName(s.sentBy)}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      <div style={{ fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--brand-green)', fontWeight: 700 }}>{received} received</span>
                        {notReceived > 0 && (
                          <>
                            {', '}
                            <span style={{ color: 'var(--error, #c85a4a)', fontWeight: 700 }}>{notReceived} not received</span>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        title="Delete"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(s);
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ marginTop: 4, fontSize: '0.8rem', width: 'auto', padding: '2px 8px' }}
                      onClick={() => toggleExpanded(s._id)}
                    >
                      {isOpen ? 'Hide details' : `Show ${s.recipients.length} recipient${s.recipients.length === 1 ? '' : 's'}`}
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <table style={{ marginTop: 10 }}>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Status</th>
                        {s.acknowledgementRequired && <th>Acknowledged</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {s.recipients.map((r) => (
                        <tr key={recipientId(r)}>
                          <td>{recipientName(r)}</td>
                          <td>
                            <span
                              style={{
                                fontWeight: 600,
                                color: r.status === 'received' ? 'var(--brand-green)' : 'var(--error, #c85a4a)',
                              }}
                              title={r.reason}
                            >
                              {r.status === 'received' ? 'Received' : 'Not received'}
                            </span>
                            {r.reason && (
                              <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}> — {r.reason}</span>
                            )}
                          </td>
                          {s.acknowledgementRequired && (
                            <td>
                              {r.acknowledgedAt ? (
                                <span
                                  style={{ color: 'var(--brand-green)', fontWeight: 700 }}
                                  title={`Acknowledged ${new Date(r.acknowledgedAt).toLocaleString('en-GB')}`}
                                >
                                  ✓
                                </span>
                              ) : (
                                <span style={{ color: 'var(--muted)' }}>—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
      {showSend && (
        <SendPushModal
          onClose={() => setShowSend(false)}
          onSent={() => {
            setShowSend(false);
            refresh();
          }}
        />
      )}
      {deleting && (
        <Modal title="Delete this push message?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently removes <strong>{deleting.title}</strong> from the history. It doesn't unsend the
            push that was already delivered.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// A small curated set for quick insertion — no extra dependency needed.
const PUSH_EMOJIS = [
  '🐶', '🐱', '🐾', '🦴', '🐕', '🐈', '🐰', '🎾',
  '☀️', '🌧️', '⛈️', '❄️', '🌬️', '🌡️', '📅', '🕐',
  '🎉', '✅', '⚠️', '❗', '📢', '💚', '👍', '🙏',
  '😊', '🚗', '🏠', '💊',
];

function SendPushModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [ackRequired, setAckRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<PushMessage | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  // Which field an inserted emoji goes into (the last one focused).
  const [activeField, setActiveField] = useState<'title' | 'body'>('title');
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function insertEmoji(emoji: string) {
    if (activeField === 'body') {
      const el = bodyRef.current;
      const start = el?.selectionStart ?? body.length;
      const end = el?.selectionEnd ?? body.length;
      const next = body.slice(0, start) + emoji + body.slice(end);
      setBody(next);
      requestAnimationFrame(() => {
        if (el) {
          el.focus();
          el.selectionStart = el.selectionEnd = start + emoji.length;
        }
      });
    } else {
      const el = titleRef.current;
      const start = el?.selectionStart ?? title.length;
      const end = el?.selectionEnd ?? title.length;
      const next = title.slice(0, start) + emoji + title.slice(end);
      setTitle(next);
      requestAnimationFrame(() => {
        if (el) {
          el.focus();
          el.selectionStart = el.selectionEnd = start + emoji.length;
        }
      });
    }
    setShowEmoji(false);
  }

  useEffect(() => {
    api
      .listCustomers()
      .then(setCustomers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load customers'));
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (customers ?? []).filter(
    (c) => c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q),
  );
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c._id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((c) => next.delete(c._id));
      else filtered.forEach((c) => next.add(c._id));
      return next;
    });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError('Enter a title and a message.');
      return;
    }
    if (selected.size === 0) {
      setError('Choose at least one customer.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const sent = await api.sendPushMessage({
        title: title.trim(),
        body: body.trim(),
        customerIds: Array.from(selected),
        acknowledgementRequired: ackRequired,
      });
      setResult(sent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send push message');
    } finally {
      setSending(false);
    }
  }

  if (result) {
    const received = result.recipients.filter((r) => r.status === 'received').length;
    const notReceived = result.recipients.length - received;
    return (
      <Modal title="Push sent" onClose={onSent}>
        <div
          className="error-banner"
          style={{ background: 'var(--sage-badge, #d9f2e3)', color: 'var(--brand-green)' }}
        >
          {received} received{notReceived > 0 ? `, ${notReceived} not received` : ''} out of{' '}
          {result.recipients.length}.
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onSent}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Send push" onClose={onClose}>
      <form onSubmit={handleSend}>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label>Title</label>
          <div style={{ position: 'relative', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onFocus={() => setActiveField('title')}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. We're closed Monday"
              required
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="icon-btn"
              title="Insert emoji"
              onClick={() => setShowEmoji((v) => !v)}
              style={{ width: 'auto', padding: '4px 8px', fontSize: '1.1rem', flexShrink: 0 }}
            >
              🙂
            </button>
            {showEmoji && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  zIndex: 10,
                  marginTop: 4,
                  background: '#fff',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  padding: 8,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(8, 1fr)',
                  gap: 2,
                  width: 296,
                }}
              >
                {PUSH_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => insertEmoji(e)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontSize: '1.25rem',
                      cursor: 'pointer',
                      padding: 4,
                      borderRadius: 6,
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 4 }}>
            Emoji insert into whichever field you last clicked (Title or Message).
          </div>
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, cursor: 'pointer' }}>
            <input type="checkbox" checked={ackRequired} onChange={(e) => setAckRequired(e.target.checked)} style={{ width: 'auto' }} />
            Acknowledgement required
          </label>
        </div>
        <div className="field">
          <label>Message</label>
          <textarea
            ref={bodyRef}
            rows={3}
            value={body}
            onFocus={() => setActiveField('body')}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>
            Recipients {selected.size > 0 && <span style={{ fontWeight: 400, color: 'var(--muted)' }}>({selected.size} selected)</span>}
          </label>
          <input
            type="text"
            placeholder="Search customers by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <button type="button" className="icon-btn" style={{ width: 'auto', fontSize: '0.8rem', padding: '2px 8px' }} onClick={toggleSelectAllFiltered}>
            {allFilteredSelected ? 'Clear all' : `Select all${query ? ' (matching)' : ''}`}
          </button>
        </div>
        <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16 }}>
          {customers === null ? (
            <div style={{ padding: 16, color: 'var(--muted)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--muted)' }}>No matching customers.</div>
          ) : (
            filtered.map((c) => (
              <label
                key={c._id}
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
                <input type="checkbox" checked={selected.has(c._id)} onChange={() => toggle(c._id)} />
                <span style={{ minWidth: 0 }}>
                  <div>{c.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{c.email}</div>
                </span>
              </label>
            ))
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={sending}>
            {sending ? 'Sending…' : `Send${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function emailSenderName(sentBy: EmailMessage['sentBy']): string {
  if (!sentBy) return 'Unknown';
  return typeof sentBy === 'string' ? sentBy : sentBy.name;
}
function emailRecipientId(r: EmailMessageRecipient): string {
  return typeof r.customer === 'string' ? r.customer : r.customer._id;
}

function EmailTab() {
  const [sends, setSends] = useState<EmailMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<EmailMessage | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function refresh() {
    api
      .listEmailMessages()
      .then(setSends)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load emails'));
  }
  useEffect(refresh, []);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteEmailMessage(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete this email');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <p style={{ color: 'var(--muted)', fontSize: '0.88rem', maxWidth: 520, margin: 0 }}>
          Send a one-off email to customers or a saved group -- each recipient gets their own individually-addressed
          copy (nobody sees anyone else's email address), and each send is kept below showing who's read it.
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCompose(true)} style={{ flexShrink: 0 }}>
          + New Email
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!sends ? (
        <div className="empty-state">Loading…</div>
      ) : sends.length === 0 ? (
        <div className="empty-state">No emails sent yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sends.map((s) => {
            const sent = s.recipients.filter((r) => r.status === 'sent').length;
            const failed = s.recipients.length - sent;
            const read = s.recipients.filter((r) => r.openedAt).length;
            const isOpen = expanded.has(s._id);
            return (
              <div key={s._id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{s.subject}</div>
                    <div
                      style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 2, maxHeight: 40, overflow: 'hidden' }}
                      dangerouslySetInnerHTML={{ __html: s.bodyHtml }}
                    />
                    <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 6 }}>
                      {new Date(s.createdAt).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · Sent by {emailSenderName(s.sentBy)}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      <div style={{ fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--brand-green)', fontWeight: 700 }}>{sent} sent</span>
                        {failed > 0 && (
                          <>
                            {', '}
                            <span style={{ color: 'var(--error, #c85a4a)', fontWeight: 700 }}>{failed} failed</span>
                          </>
                        )}
                        {', '}
                        <span style={{ color: 'var(--muted)' }}>{read} read</span>
                      </div>
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        title="Delete"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(s);
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ marginTop: 4, fontSize: '0.8rem', width: 'auto', padding: '2px 8px' }}
                      onClick={() => toggleExpanded(s._id)}
                    >
                      {isOpen ? 'Hide details' : `Show ${s.recipients.length} recipient${s.recipients.length === 1 ? '' : 's'}`}
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <table style={{ marginTop: 10 }}>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Status</th>
                        <th>Read</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.recipients.map((r) => (
                        <tr key={emailRecipientId(r)}>
                          <td>
                            {r.name}
                            <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.email}</div>
                          </td>
                          <td>
                            <span
                              style={{
                                fontWeight: 600,
                                color: r.status === 'sent' ? 'var(--brand-green)' : 'var(--error, #c85a4a)',
                              }}
                              title={r.reason}
                            >
                              {r.status === 'sent' ? 'Sent' : 'Failed'}
                            </span>
                            {r.reason && <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}> — {r.reason}</span>}
                          </td>
                          <td>
                            {r.openedAt ? (
                              <span style={{ color: 'var(--brand-green)', fontWeight: 700 }} title={new Date(r.openedAt).toLocaleString('en-GB')}>
                                Read
                              </span>
                            ) : (
                              <span style={{ color: 'var(--muted)' }}>Not read</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
      {showCompose && (
        <ComposeEmailModal
          onClose={() => setShowCompose(false)}
          onSent={() => {
            setShowCompose(false);
            refresh();
          }}
        />
      )}
      {deleting && (
        <Modal title="Delete this email?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently removes <strong>{deleting.subject}</strong> from the history. It doesn't unsend the
            emails that were already delivered.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ComposeEmailModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [recipientType, setRecipientType] = useState<'customers' | 'groups'>('customers');
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [groups, setGroups] = useState<EmailGroup[] | null>(null);
  const [query, setQuery] = useState('');
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<EmailMessage | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    api
      .listCustomers()
      .then(setCustomers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load customers'));
    api
      .listEmailGroups()
      .then(setGroups)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load email groups'));
  }, []);

  const q = query.trim().toLowerCase();
  const filteredCustomers = (customers ?? [])
    .filter((c) => c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const allFilteredSelected = filteredCustomers.length > 0 && filteredCustomers.every((c) => selectedCustomers.has(c._id));

  // Best-effort live count -- de-dupes a customer picked both individually and
  // via a group, same as the backend does when it actually resolves the send.
  const recipientCount = (() => {
    const ids = new Set(selectedCustomers);
    for (const groupId of selectedGroups) {
      const group = groups?.find((g) => g._id === groupId);
      group?.customers.forEach((c) => ids.add(c._id));
    }
    return ids.size;
  })();

  function toggleCustomer(id: string) {
    setSelectedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAllFiltered() {
    setSelectedCustomers((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredCustomers.forEach((c) => next.delete(c._id));
      else filteredCustomers.forEach((c) => next.add(c._id));
      return next;
    });
  }
  function toggleGroup(id: string) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openPreview(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !bodyHtml.replace(/<[^>]*>/g, '').trim()) {
      setError('Enter a subject and a message.');
      return;
    }
    if (recipientCount === 0) {
      setError('Choose at least one customer or group.');
      return;
    }
    setError(null);
    setShowPreview(true);
  }

  async function handleConfirmSend() {
    setSending(true);
    setError(null);
    try {
      const sent = await api.sendEmailMessage({
        subject: subject.trim(),
        bodyHtml,
        customerIds: Array.from(selectedCustomers),
        groupIds: Array.from(selectedGroups),
      });
      setResult(sent);
      setShowPreview(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSending(false);
    }
  }

  // A representative name for the preview -- the actual send personalizes
  // {{name}} per recipient, so this just shows what one of them will see.
  const sampleRecipientName = (() => {
    const firstCustomerId = Array.from(selectedCustomers)[0];
    const fromCustomer = customers?.find((c) => c._id === firstCustomerId)?.name;
    if (fromCustomer) return fromCustomer;
    for (const groupId of selectedGroups) {
      const name = groups?.find((g) => g._id === groupId)?.customers[0]?.name;
      if (name) return name;
    }
    return 'Customer';
  })();

  if (result) {
    const sent = result.recipients.filter((r) => r.status === 'sent').length;
    const failed = result.recipients.length - sent;
    return (
      <Modal title="Email sent" onClose={onSent}>
        <div className="error-banner" style={{ background: 'var(--sage-badge, #d9f2e3)', color: 'var(--brand-green)' }}>
          {sent} sent{failed > 0 ? `, ${failed} failed` : ''} out of {result.recipients.length}.
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onSent}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  if (showPreview) {
    return (
      <EmailPreviewModal
        subject={subject.trim()}
        bodyHtml={bodyHtml}
        recipientCount={recipientCount}
        sampleRecipientName={sampleRecipientName}
        sending={sending}
        error={error}
        onBack={() => setShowPreview(false)}
        onSend={handleConfirmSend}
      />
    );
  }

  return (
    <Modal title="New Email" onClose={onClose} wide>
      <form onSubmit={openPreview}>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label>Subject</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. What's new this month" required />
        </div>
        <div className="field">
          <label>Message</label>
          <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
        </div>
        <div className="field">
          <label>Send to</label>
          <div className="tabs" style={{ marginBottom: 10 }}>
            <button type="button" className={recipientType === 'customers' ? 'active' : ''} onClick={() => setRecipientType('customers')}>
              Customers
            </button>
            <button type="button" className={recipientType === 'groups' ? 'active' : ''} onClick={() => setRecipientType('groups')}>
              Groups
            </button>
          </div>
        </div>
        {recipientType === 'customers' ? (
          <>
            <div className="field" style={{ marginBottom: 0 }}>
              <input
                type="text"
                placeholder="Search customers by name or email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '6px 0' }}>
              <button type="button" className="icon-btn" style={{ width: 'auto', fontSize: '0.8rem', padding: '2px 8px' }} onClick={toggleSelectAllFiltered}>
                {allFilteredSelected ? 'Clear all' : `Select all${query ? ' (matching)' : ''}`}
              </button>
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16 }}>
              {customers === null ? (
                <div style={{ padding: 16, color: 'var(--muted)' }}>Loading…</div>
              ) : filteredCustomers.length === 0 ? (
                <div style={{ padding: 16, color: 'var(--muted)' }}>No matching customers.</div>
              ) : (
                filteredCustomers.map((c) => (
                  <label
                    key={c._id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 400, cursor: 'pointer' }}
                  >
                    <input type="checkbox" checked={selectedCustomers.has(c._id)} onChange={() => toggleCustomer(c._id)} />
                    <span style={{ minWidth: 0 }}>
                      <div>{c.name}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{c.email}</div>
                    </span>
                  </label>
                ))
              )}
            </div>
          </>
        ) : (
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16 }}>
            {groups === null ? (
              <div style={{ padding: 16, color: 'var(--muted)' }}>Loading…</div>
            ) : groups.length === 0 ? (
              <div style={{ padding: 16, color: 'var(--muted)' }}>
                No email groups yet -- create one in Settings &gt; Email.
              </div>
            ) : (
              groups.map((g) => (
                <label
                  key={g._id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 400, cursor: 'pointer' }}
                >
                  <input type="checkbox" checked={selectedGroups.has(g._id)} onChange={() => toggleGroup(g._id)} />
                  <span style={{ minWidth: 0 }}>
                    <div>{g.name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>{g.customers.length} customers</div>
                  </span>
                </label>
              ))
            )}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {`Preview${recipientCount > 0 ? ` (${recipientCount})` : ''}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Shows exactly what the GENERIC email template renders this composed
// message into (same "wrap the staff-authored body in the business's own
// template" step EmailMessagesService.send() applies at send time), for one
// representative recipient -- the real send personalizes {{name}} per
// customer, so wording just after "Hi" may vary slightly per recipient.
function EmailPreviewModal({
  subject,
  bodyHtml,
  recipientCount,
  sampleRecipientName,
  sending,
  error,
  onBack,
  onSend,
}: {
  subject: string;
  bodyHtml: string;
  recipientCount: number;
  sampleRecipientName: string;
  sending: boolean;
  error: string | null;
  onBack: () => void;
  onSend: () => void;
}) {
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [template, setTemplate] = useState<EmailTemplate | null | undefined>(undefined);

  useEffect(() => {
    api.getBusinessInfo().then(setBusinessInfo).catch(() => {});
    api
      .listEmailTemplates()
      .then((templates) => setTemplate(templates.find((t) => t.trigger === 'generic') ?? null))
      .catch(() => setTemplate(null));
  }, []);

  let renderedSubject = subject;
  let renderedBody = '';
  if (businessInfo && template) {
    const vars: Record<string, string | undefined> = {
      businessName: businessInfo.name,
      businessAddress: businessInfo.address,
      businessTown: businessInfo.town,
      businessPostcode: businessInfo.postcode,
      businessTelephone: businessInfo.telephone,
      businessEmail: businessInfo.email,
      businessWebsite: businessInfo.website,
      name: sampleRecipientName,
      campaignSubject: subject,
    };
    const logoTag = businessInfo.logoImage
      ? `<img src="${businessInfo.logoImage}" alt="" style="max-height:60px;max-width:220px;display:block;" />`
      : '';
    const rawVars = { logo: logoTag, emailBodyText: bodyHtml };
    renderedSubject = interpolateSubject(template.subject, vars);
    renderedBody = `<div style="max-width:600px;margin:0 auto;">${interpolateBody(template.body, vars, rawVars, true)}</div>`;
  }

  return (
    <Modal title="Preview Email" onClose={onBack} wide>
      {error && <div className="error-banner">{error}</div>}
      {template === undefined && <div className="empty-state">Loading…</div>}
      {template === null && (
        <div className="error-banner">
          No Generic Email Template is set up yet — add one in Settings &gt; Email Templates first.
        </div>
      )}
      {template && businessInfo && (
        <>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: -6 }}>
            This is what {recipientCount === 1 ? sampleRecipientName : `each of the ${recipientCount} recipients`}{' '}
            will see (personalized by name per recipient).
          </p>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ background: 'var(--sage)', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Subject</div>
              <div style={{ fontWeight: 600 }}>{renderedSubject}</div>
            </div>
            <div
              style={{ padding: '16px 20px', background: '#fff', lineHeight: 1.5, maxHeight: 420, overflowY: 'auto' }}
              dangerouslySetInnerHTML={{ __html: renderedBody }}
            />
          </div>
        </>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack} disabled={sending}>
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSend}
          disabled={sending || !template || !businessInfo}
        >
          {sending ? 'Sending…' : `Send (${recipientCount})`}
        </button>
      </div>
    </Modal>
  );
}
