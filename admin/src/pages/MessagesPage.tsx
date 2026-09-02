import { useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api/client';
import type { Conversation, Message } from '../types';

// Simple polling chat: the conversation list refreshes on an interval, and the
// open thread polls a little faster. No websockets — push handles the "you have
// a new message" alerting.
export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.customerId === selected) ?? null,
    [conversations, selected],
  );

  return (
    <div>
      <h1>Messages</h1>
      {error && <div className="error-banner">{error}</div>}
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', minHeight: 480 }}>
        <div className="card" style={{ width: 320, flexShrink: 0, padding: 0, overflow: 'hidden' }}>
          <ConversationList
            conversations={conversations}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0 }}>
          {selectedConversation ? (
            <Thread
              key={selectedConversation.customerId}
              conversation={selectedConversation}
              onSent={loadConversations}
            />
          ) : (
            <div style={{ margin: 'auto', color: 'var(--muted)' }}>
              Select a conversation to view messages.
            </div>
          )}
        </div>
      </div>
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
  onSelect: (id: string) => void;
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
            onClick={() => onSelect(c.customerId)}
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

function Thread({ conversation, onSent }: { conversation: Conversation; onSent: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const thread = await api.getMessageThread(conversation.customerId);
      setMessages(thread);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.customerId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleSend() {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    try {
      await api.sendMessageToCustomer(conversation.customerId, text);
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
        <div style={{ fontWeight: 700 }}>{conversation.name}</div>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{conversation.email}</div>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.map((m) => (
          <MessageBubble key={m._id} message={m} />
        ))}
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
