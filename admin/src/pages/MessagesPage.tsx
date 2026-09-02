import { useEffect, useRef, useState } from 'react';
import * as api from '../api/client';
import type { Conversation, Customer, Message } from '../types';

// A person we can have a thread with — either an existing conversation or a
// customer picked to start a new one.
interface ActiveCustomer {
  customerId: string;
  name: string;
  email: string;
}

// Simple polling chat: the conversation list refreshes on an interval, and the
// open thread polls a little faster. No websockets — push handles the "you have
// a new message" alerting.
export default function MessagesPage() {
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

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>Messages</h1>
        <button className="btn btn-primary" onClick={() => setPicking(true)}>
          New message
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', minHeight: 480 }}>
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
          messages.map((m) => <MessageBubble key={m._id} message={m} />)
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

function MessageBubble({ message }: { message: Message }) {
  const fromStaff = message.sender === 'staff';
  return (
    <div style={{ alignSelf: fromStaff ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h2>New message</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
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
      </div>
    </div>
  );
}
