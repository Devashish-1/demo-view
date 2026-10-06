import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Send,
  Paperclip,
  Smile,
  Plus,
  MessageSquare,
  Users,
  CheckCheck,
  ArrowLeft,
  Pin,
  Archive,
  RotateCcw,
} from 'lucide-react';
import { Dialog, Field, ActionForm } from './components.jsx';
import './demo.css';
const seeds = [
  {
    id: 'sales',
    name: 'Sales team',
    initials: 'ST',
    kind: 'team',
    channel: 'Team channel',
    color: '#3f7e68',
    unread: 3,
    company: 'Relay Logistics',
    owner: 'Aarav Mehta',
    status: 'Open',
    messages: [
      {
        who: 'Priya Sharma',
        text: 'Morning team! Northstar is ready to review the revised annual proposal.',
        time: '09:12',
      },
      {
        who: 'Arjun Patel',
        text: 'Great. I have updated the delivery coverage and pricing sheet.',
        time: '09:14',
      },
      {
        who: 'Priya Sharma',
        text: 'Can we confirm the onboarding timeline before the 11:30 meeting?',
        time: '09:18',
      },
    ],
  },
  {
    id: 'northstar',
    name: 'Rohan Malhotra',
    initials: 'RM',
    kind: 'customer',
    channel: 'WhatsApp demo',
    color: '#b48e54',
    unread: 2,
    company: 'Northstar Freight',
    owner: 'Priya Sharma',
    status: 'Open',
    messages: [
      {
        who: 'Rohan Malhotra',
        text: 'Hi Priya, thanks for sharing the proposal. We would like to include Pune in the delivery coverage.',
        time: '10:02',
      },
      {
        who: 'You',
        text: 'Absolutely. I will check the revised scope with our operations team.',
        time: '10:04',
      },
      {
        who: 'Rohan Malhotra',
        text: 'Perfect. Could you also confirm the expected start date?',
        time: '10:06',
      },
    ],
  },
  {
    id: 'priya',
    name: 'Priya Sharma',
    initials: 'PS',
    kind: 'team',
    channel: 'Direct message',
    color: '#8a7ca8',
    unread: 0,
    company: 'Sales · Account executive',
    owner: 'Priya Sharma',
    status: 'Open',
    messages: [
      {
        who: 'Priya Sharma',
        text: 'The Northstar follow-up is on the calendar. Can you review the pricing before I send it?',
        time: '09:45',
      },
      { who: 'You', text: 'Yes, please share the main changes here.', time: '09:47' },
    ],
  },
  {
    id: 'meridian',
    name: 'Aditi Shah',
    initials: 'AS',
    kind: 'customer',
    channel: 'Website chat demo',
    color: '#598bad',
    unread: 1,
    company: 'Meridian Retail',
    owner: 'Arjun Patel',
    status: 'Open',
    messages: [
      {
        who: 'Aditi Shah',
        text: 'Hello! We are looking for warehouse space for our new regional operation.',
        time: 'Yesterday',
      },
      { who: 'You', text: 'Happy to help. Which city are you considering?', time: 'Yesterday' },
      {
        who: 'Aditi Shah',
        text: 'Bengaluru, with capacity for around 500 pallets.',
        time: '10:10',
      },
    ],
  },
  {
    id: 'operations',
    name: 'Operations',
    initials: 'OP',
    kind: 'team',
    channel: 'Team channel',
    color: '#688c7c',
    unread: 0,
    company: 'Relay Logistics',
    owner: 'Neha Kapoor',
    status: 'Open',
    messages: [
      {
        who: 'Neha Kapoor',
        text: 'Apex onboarding checklist is ready. All documents have been reviewed.',
        time: 'Yesterday',
      },
    ],
  },
  {
    id: 'apex',
    name: 'Vivek Rao',
    initials: 'VR',
    kind: 'customer',
    channel: 'Email demo',
    color: '#aa7770',
    unread: 0,
    company: 'Apex Manufacturing',
    owner: 'Priya Sharma',
    status: 'Resolved',
    messages: [
      {
        who: 'Vivek Rao',
        text: 'Everything looks good. The signed agreement has been sent. Looking forward to working together!',
        time: 'Yesterday',
      },
      {
        who: 'You',
        text: 'Thank you, Vivek. Your onboarding meeting is confirmed.',
        time: 'Yesterday',
      },
    ],
  },
];
export default function DemoChat({ user }) {
  const key = 'relay-demo-chat-v1:' + user.id;
  const [threads, setThreads] = useState(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(key));
        return Array.isArray(saved) && saved.length ? saved : seeds;
      } catch {
        return seeds;
      }
    }),
    [active, setActive] = useState('sales'),
    [filter, setFilter] = useState('all'),
    [search, setSearch] = useState(''),
    [draft, setDraft] = useState(''),
    [note, setNote] = useState(false),
    [newChat, setNewChat] = useState(false),
    [showMobile, setShowMobile] = useState(false),
    [messageSearch, setMessageSearch] = useState(''),
    [file, setFile] = useState(null),
    [notice, setNotice] = useState('');
  const bottom = useRef(),
    upload = useRef();
  const current = threads.find((t) => t.id === active) || threads[0];
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(threads));
    } catch {
      setNotice('Browser storage is full. This chat is available for this visit only.');
    }
  }, [threads, key]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [active, current.messages.length]);
  const update = (id, patch) =>
    setThreads((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const visible = threads
    .filter(
      (t) =>
        (filter === 'archived' ? t.archived : !t.archived) &&
        (filter === 'team'
          ? t.kind === 'team'
          : filter === 'customer'
            ? t.kind === 'customer'
            : filter === 'unread'
              ? t.unread > 0
              : true) &&
        `${t.name} ${t.company} ${t.messages.at(-1)?.text}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  const select = (t) => {
    setActive(t.id);
    update(t.id, { unread: 0 });
    setDraft('');
    setFile(null);
    setMessageSearch('');
    setShowMobile(true);
  };
  const send = () => {
    if (!draft.trim() && !file) return;
    update(current.id, {
      messages: [
        ...current.messages,
        {
          id: crypto.randomUUID(),
          who: 'You',
          text: draft.trim(),
          note,
          file: file ? { name: file.name, size: file.size } : null,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
      status: note ? current.status : 'Open',
    });
    setDraft('');
    setFile(null);
  };
  return (
    <div className="relay-demo">
      <div className="demo-banner">
        <span>
          <i /> CHAT DEMO
        </span>
        <p>
          Sample conversations. Your replies stay in this browser; no external messages are sent.
        </p>
      </div>
      <header className="demo-heading">
        <div>
          <span className="demo-eyebrow">LESS SWITCHING. BETTER CONVERSATIONS.</span>
          <h1>
            Conversations{' '}
            <span className="demo-count">{threads.filter((t) => t.unread).length}</span>
          </h1>
          <p>Your customers and teammates, together in one workspace.</p>
        </div>
        <button className="demo-primary" onClick={() => setNewChat(true)}>
          <Plus size={16} /> New conversation
        </button>
      </header>
      {notice && <p role="status">{notice}</p>}
      <div className={`demo-chat-layout ${showMobile ? 'show-thread' : ''}`}>
        <aside className="demo-chat-list">
          <div className="demo-chat-search">
            <Search size={16} />
            <input
              aria-label="Search conversations"
              placeholder="Search conversations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="demo-chat-filters">
            {[
              ['all', 'All'],
              ['team', 'Team'],
              ['customer', 'Customers'],
              ['unread', 'Unread'],
              ['archived', 'Archived'],
            ].map(([k, l]) => (
              <button
                key={k}
                className={filter === k ? 'selected' : ''}
                onClick={() => setFilter(k)}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="demo-thread-list">
            {visible.map((t) => (
              <button
                key={t.id}
                className={`demo-thread ${current.id === t.id ? 'selected' : ''}`}
                onClick={() => select(t)}
              >
                <span className="demo-avatar" style={{ background: t.color }}>
                  {t.initials}
                </span>
                <span>
                  <strong>
                    {t.pinned ? '⌖ ' : ''}
                    {t.name}
                  </strong>
                  <small>{t.channel}</small>
                  <p>{t.messages.at(-1)?.text || 'Start a conversation'}</p>
                </span>
                {t.unread > 0 && <b className="demo-unread">{t.unread}</b>}
              </button>
            ))}
            {!visible.length && (
              <p className="demo-chat-empty">No conversations match this filter.</p>
            )}
          </div>
          <footer>
            <span className="demo-presence" /> Demo workspace · {threads.length} conversations
          </footer>
        </aside>
        <section className="demo-conversation">
          <header>
            <button
              className="demo-chat-back"
              aria-label="Back to conversations"
              onClick={() => setShowMobile(false)}
            >
              <ArrowLeft size={18} />
            </button>
            <span className="demo-avatar" style={{ background: current.color }}>
              {current.initials}
            </span>
            <div>
              <h2>{current.name}</h2>
              <p>
                {current.channel} · {current.company}
              </p>
            </div>
            <div className="demo-chat-header-actions">
              <button
                aria-label={current.pinned ? 'Unpin conversation' : 'Pin conversation'}
                onClick={() => update(current.id, { pinned: !current.pinned })}
              >
                <Pin size={16} />
              </button>
              <button
                aria-label={current.archived ? 'Restore conversation' : 'Archive conversation'}
                onClick={() => update(current.id, { archived: !current.archived })}
              >
                {current.archived ? <RotateCcw size={16} /> : <Archive size={16} />}
              </button>
              <button
                className="demo-chip"
                onClick={() =>
                  update(current.id, { status: current.status === 'Open' ? 'Resolved' : 'Open' })
                }
              >
                {current.status === 'Open' ? '✓ Resolve' : '↻ Reopen'}
              </button>
            </div>
          </header>
          <div className="demo-conversation-info">
            <span className="demo-chip">
              {current.kind === 'team' ? 'Internal collaboration' : 'Customer conversation'}
            </span>
            <label>
              Assigned to{' '}
              <select
                aria-label="Conversation assignee"
                value={current.owner}
                onChange={(e) => update(current.id, { owner: e.target.value })}
              >
                {[
                  ...new Set([
                    current.owner,
                    user.name,
                    'Priya Sharma',
                    'Arjun Patel',
                    'Neha Kapoor',
                  ]),
                ].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <span className="demo-status">{current.status}</span>
          </div>
          <input
            className="demo-message-search"
            aria-label="Search messages"
            placeholder="Find a message in this conversation…"
            value={messageSearch}
            onChange={(e) => setMessageSearch(e.target.value)}
          />
          <div
            className="demo-messages"
            role="log"
            aria-label="Conversation messages"
            aria-live="polite"
          >
            <div className="demo-chat-date">Sample conversation · Demo</div>
            {current.messages
              .filter((m) => m.text.toLowerCase().includes(messageSearch.toLowerCase()))
              .map((m, i) => (
                <article
                  key={m.id || i}
                  className={`demo-message ${m.who === 'You' ? 'mine' : ''} ${m.note ? 'internal-note' : ''}`}
                >
                  <small>
                    {m.note ? 'Internal note · ' : ''}
                    {m.who}
                  </small>
                  <div>
                    {m.text}
                    {m.file && (
                      <p className="demo-attachment">
                        <Paperclip size={14} />
                        {m.file.name} · {Math.ceil(m.file.size / 1024)} KB{' '}
                        <small>Local demo attachment</small>
                      </p>
                    )}
                  </div>
                  <footer>
                    {m.time}{' '}
                    {m.who === 'You' && <CheckCheck size={13} aria-label="Saved locally" />}
                  </footer>
                </article>
              ))}
            <div ref={bottom} />
          </div>
          <div className={`demo-composer ${note ? 'note-mode' : ''}`}>
            <div className="demo-compose-tabs">
              <button className={!note ? 'selected' : ''} onClick={() => setNote(false)}>
                Reply
              </button>
              <button className={note ? 'selected' : ''} onClick={() => setNote(true)}>
                Internal note
              </button>
              <select aria-label="Quick reply" value="" onChange={(e) => setDraft(e.target.value)}>
                <option value="">Quick replies</option>
                <option>Thanks for reaching out! I am checking this with our team.</option>
                <option>Could you share your preferred date and time for a meeting?</option>
                <option>
                  I have shared the updated proposal. Please let me know your feedback.
                </option>
              </select>
            </div>
            <textarea
              aria-label={note ? 'Write internal note' : 'Write a reply'}
              placeholder={note ? 'Add a note for your team…' : 'Write a reply…'}
              value={draft}
              maxLength={4000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            {file && (
              <p className="demo-file-preview">
                {file.name} <button onClick={() => setFile(null)}>Remove</button>
              </p>
            )}
            <footer>
              <div>
                <input
                  hidden
                  ref={upload}
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files[0];
                    if (f && f.size > 5 * 1024 * 1024) {
                      setNotice('Choose an attachment smaller than 5 MB.');
                      return;
                    }
                    setFile(f);
                    setNotice('');
                    e.target.value = '';
                  }}
                />
                <button aria-label="Attach demo file" onClick={() => upload.current.click()}>
                  <Paperclip size={18} />
                </button>
                <button aria-label="Add smile emoji" onClick={() => setDraft((d) => d + ' 🙂')}>
                  <Smile size={18} />
                </button>
                <small>Enter to send · Shift + Enter for a new line</small>
              </div>
              <button className="demo-primary" disabled={!draft.trim() && !file} onClick={send}>
                {note ? 'Save note' : 'Send demo reply'}
                <Send size={15} />
              </button>
            </footer>
          </div>
        </section>
      </div>
      {newChat && (
        <Dialog title="Start a demo conversation" onClose={() => setNewChat(false)}>
          <ActionForm
            label="Create conversation"
            onClose={() => setNewChat(false)}
            onSubmit={async (f) => {
              const name = f.get('name').trim();
              const t = {
                id: crypto.randomUUID(),
                name,
                initials: name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase(),
                kind: f.get('kind'),
                channel: f.get('kind') === 'team' ? 'Team channel' : 'Website chat demo',
                company: f.get('company') || 'Demo contact',
                owner: user.name,
                color: '#598574',
                unread: 0,
                status: 'Open',
                messages: [],
              };
              setThreads([...threads, t]);
              setActive(t.id);
              setFilter('all');
              setSearch('');
              setDraft('');
              setShowMobile(true);
            }}
          >
            <Field label="Name or channel">
              <input name="name" required maxLength={80} />
            </Field>
            <Field label="Conversation type">
              <select name="kind">
                <option value="team">Team / internal</option>
                <option value="customer">Customer</option>
              </select>
            </Field>
            <Field label="Company or department">
              <input name="company" maxLength={80} />
            </Field>
            <p>Demo only. No invitation or external message will be sent.</p>
          </ActionForm>
        </Dialog>
      )}
    </div>
  );
}
