import React, { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { callbackPreset } from './time.js';
import Platform from './platform/Platform.jsx';
import DemoDashboard from './platform/DemoDashboard.jsx';
import DemoChat from './platform/DemoChat.jsx';
import {
  ArrowUpRight,
  ArrowDownToLine,
  ArrowRight,
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CloudUpload,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  Headphones,
  LayoutDashboard,
  Layers3,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Users,
  Workflow,
  X,
  AlertCircle,
  CheckCheck,
  RefreshCw,
  UserPlus,
  Pencil,
  SlidersHorizontal,
  ChevronUp,
  PhoneOff,
  MessageSquare,
  Radio,
  BriefcaseBusiness,
  Activity,
} from 'lucide-react';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import './styles.css';
import './accessibility.css';

let csrf = '';
async function api(path, options = {}) {
  const headers = { ...options.headers };
  if (options.body && !(options.body instanceof FormData))
    headers['Content-Type'] = 'application/json';
  if (options.method && options.method !== 'GET') headers['X-CSRF-Token'] = csrf;
  const response = await fetch('/api' + path, {
    ...options,
    headers,
    body:
      options.body instanceof FormData
        ? options.body
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
  });
  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {
      data = { error: 'Could not reach the server.' };
    }
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/me')
      window.dispatchEvent(new Event('session-expired'));
    throw new Error(data.error);
  }
  return response.json();
}
const AppContext = createContext(null);
const useApp = () => useContext(AppContext);
const date = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';
const datetime = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
const duration = (value) => `${Math.floor(value / 60)}m ${value % 60}s`;
const initials = (name) =>
  String(name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((v) => v[0])
    .join('');
const statuses = [
  'Pending',
  'In Progress',
  'Interested',
  'Callback Scheduled',
  'Not Interested',
  'Unanswered',
  'Closed Won',
];
const statusClass = (status) =>
  ({
    Pending: 'gray',
    'In Progress': 'blue',
    Interested: 'green',
    'Callback Scheduled': 'amber',
    'Not Interested': 'red',
    Unanswered: 'gray',
    'Closed Won': 'purple',
  })[status] ?? 'gray';
function Status({ value }) {
  return (
    <span className={`status ${statusClass(value)}`}>
      <i />
      {value}
    </span>
  );
}
function Avatar({ name, index = 0, small = false }) {
  return (
    <span className={`avatar avatar-${index % 5} ${small ? 'small' : ''}`}>{initials(name)}</span>
  );
}
function Button({
  children,
  icon: Icon,
  variant = 'primary',
  className = '',
  loading = false,
  ...props
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`button ${variant} ${className}`}
    >
      {loading ? <Loader2 className="spin" size={16} /> : Icon && <Icon size={16} />}
      <span>{children}</span>
    </button>
  );
}
function Field({ label, children, hint, className = '' }) {
  const id = React.useId();
  return (
    <label className={`field ${className}`}>
      <span id={id}>{label}</span>
      {React.Children.map(children, (child) =>
        React.isValidElement(child) && ['input', 'select', 'textarea'].includes(child.type)
          ? React.cloneElement(child, {
              'aria-labelledby': id,
              'aria-describedby': hint ? id + '-hint' : undefined,
            })
          : child,
      )}
      {hint && <small id={id + '-hint'}>{hint}</small>}
    </label>
  );
}
function Empty({
  icon: Icon = Layers3,
  title = 'Nothing here yet',
  text = 'Your records will appear here.',
  action,
}) {
  return (
    <div className="empty">
      <span>
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function ErrorBox({ error }) {
  return error ? (
    <div className="error-box" role="alert">
      <AlertCircle size={17} />
      <span>{error}</span>
    </div>
  ) : null;
}
function Loading() {
  return (
    <div className="loading">
      <Loader2 className="spin" size={24} />
      <span>Loading your workspace…</span>
    </div>
  );
}
function Modal({ title, subtitle, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.focus();
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const items = dialog.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]',
        );
        if (!items.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        className={`modal ${wide ? 'wide' : ''}`}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={21} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function useLoad(path, deps = []) {
  const { tick } = useApp() ?? { tick: 0 };
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setError('');
    api(path)
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, tick, ...deps]);
  return { data, error, loading };
}
function ExportButtons({ type = 'leads', query = '' }) {
  return (
    <div className="export-buttons">
      <a className="button secondary" href={`/api/export?type=${type}&format=csv&${query}`}>
        <Download size={15} />
        CSV
      </a>
      <a className="button secondary" href={`/api/export?type=${type}&format=xlsx&${query}`}>
        <FileSpreadsheet size={15} />
        Excel
      </a>
    </div>
  );
}
function PageHeading({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}

function Login({ onLogin }) {
  const [organization, setOrganization] = useState('');
  const [email, setEmail] = useState('admin@gmail.com'),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api('/auth/login', {
        method: 'POST',
        body: { email, password, organization },
      });
      csrf = result.csrf;
      onLogin(result.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <div className="login-story">
        <a className="brand">
          <span className="brand-mark">
            <Workflow size={24} />
          </span>
          relay<span className="brand-dot">.</span>
        </a>
        <div className="story-copy">
          <span className="story-label">
            <i /> YOUR TEAM. ONE WORKSPACE.
          </span>
          <h1>
            Better connections.
            <br />
            <em>Stronger growth.</em>
          </h1>
          <p>
            Bring every lead, every conversation, and every follow-up together. Give your team the
            clarity to move business forward.
          </p>
          <div className="story-mini-card">
            <div className="mini-icon">
              <ShieldCheck size={25} />
            </div>
            <div>
              <strong>One lead. One owner.</strong>
              <span>Less overlap. More meaningful conversations.</span>
            </div>
            <CheckCircle2 size={21} />
          </div>
        </div>
        <div className="story-footer">
          LEAD MANAGEMENT, SIMPLIFIED <span>© {new Date().getFullYear()} Relay</span>
        </div>
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
      </div>
      <div className="login-form-wrap">
        <div className="login-form">
          <div className="eyebrow">WELCOME TO RELAY</div>
          <h2>
            Your next opportunity
            <br />
            starts here.
          </h2>
          <p>Sign in to your workspace to get started.</p>
          <form onSubmit={submit}>
            <Field label="Organization code" hint="Leave blank for the existing Relay workspace.">
              <input
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="default"
                autoComplete="organization"
              />
            </Field>
            <Field label="Email address">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                placeholder="you@company.com"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="Enter your password"
              />
            </Field>
            <ErrorBox error={error} />
            <Button loading={busy} className="full" icon={ArrowRight}>
              Sign in to workspace
            </Button>
          </form>
          <div className="login-security">
            <LockKeyhole size={14} /> Secure access for your team
          </div>
          <p className="login-help">Need access? Contact your workspace administrator.</p>
        </div>
      </div>
    </div>
  );
}

const navigation = [
  {
    group: 'WORKSPACE',
    items: [
      ['dashboard', 'Dashboard', LayoutDashboard],
      ['chat', 'Conversations', MessageSquare],
      ['boards', 'CRM & boards', BriefcaseBusiness],
      ['leads', 'All leads', Layers3],
      ['workspace', 'My workspace', Headphones],
      ['callbacks', 'Callbacks', CalendarDays],
    ],
  },
  {
    group: 'MANAGEMENT',
    items: [
      ['imports', 'Import leads', CloudUpload],
      ['team', 'Team members', Users],
      ['reports', 'Reports & analytics', BarChart3],
      ['audit', 'Audit trail', ShieldCheck],
    ],
  },
  {
    group: 'SETTINGS',
    items: [
      ['calling', 'Calling integration', Phone],
      ['settings', 'Settings', Settings2],
    ],
  },
];
function App() {
  const [user, setUser] = useState(null),
    [boot, setBoot] = useState(true),
    [page, setPage] = useState(location.hash.slice(1) || 'dashboard'),
    [tick, setTick] = useState(0),
    [meta, setMeta] = useState(null),
    [toast, setToast] = useState(null),
    [addLead, setAddLead] = useState(false),
    [leadId, setLeadId] = useState(null),
    [editLead, setEditLead] = useState(null),
    [search, setSearch] = useState(''),
    [leadPreset, setLeadPreset] = useState(''),
    [connected, setConnected] = useState(false),
    [mobile, setMobile] = useState(false),
    [notifications, setNotifications] = useState(false);
  const toastTimer = useRef();
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);
  const clearSession = useCallback(() => {
    setUser(null);
    setMeta(null);
    setLeadId(null);
    setEditLead(null);
    setAddLead(false);
    setSearch('');
    setToast(null);
    setNotifications(false);
  }, []);
  function navigate(next, status = '') {
    if (next === 'leads') setLeadPreset(status);
    location.hash = next;
    setPage(next);
    setMobile(false);
    setNotifications(false);
  }
  useEffect(() => {
    api('/auth/me')
      .then((result) => {
        csrf = result.csrf;
        setUser(result.user);
      })
      .catch(() => {})
      .finally(() => setBoot(false));
    const handler = clearSession;
    window.addEventListener('session-expired', handler);
    const hash = () => setPage(location.hash.slice(1) || 'dashboard');
    window.addEventListener('hashchange', hash);
    return () => {
      window.removeEventListener('session-expired', handler);
      window.removeEventListener('hashchange', hash);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    if (user)
      api('/meta')
        .then((value) => {
          if (alive) setMeta(value);
        })
        .catch((e) => {
          if (alive) notify(e.message, 'error');
        });
    return () => {
      alive = false;
    };
  }, [user, tick]);
  useEffect(() => {
    if (!user) return;
    const events = new EventSource('/api/events');
    events.addEventListener('polling', () => {
      events.close();
      setConnected(true);
    });
    events.addEventListener('refresh', refresh);
    events.addEventListener('ready', () => setConnected(true));
    events.addEventListener('error', () => setConnected(false));
    const reminded = new Set();
    const checkReminders = async () => {
      try {
        const { leads } = await api('/callbacks');
        for (const lead of leads) {
          const delay = Date.now() - Date.parse(lead.callback_at);
          const key = lead.id + lead.callback_at;
          if (delay >= 0 && delay < 120000 && !reminded.has(key)) {
            reminded.add(key);
            notify(`Callback due: ${lead.business}. Open Callbacks to follow up.`);
          }
        }
      } catch {
        /* Normal reconnect/session handling is shared with the API client. */
      }
    };
    const timer = setInterval(() => {
      api('/presence', { method: 'POST' })
        .then(() => setConnected(true))
        .catch(() => setConnected(false));
      refresh();
      checkReminders();
    }, 60000);
    api('/presence', { method: 'POST' }).catch(() => {});
    checkReminders();
    return () => {
      events.close();
      clearInterval(timer);
    };
  }, [user, refresh, notify]);
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      clearSession();
    } catch (e) {
      notify(e.message, 'error');
    }
  }
  if (boot) return <Loading />;
  if (!user)
    return (
      <Login
        onLogin={(u) => {
          setUser(u);
          setTick((t) => t + 1);
        }}
      />
    );
  const manager = user.role !== 'agent';
  const ctx = {
    user,
    manager,
    meta,
    tick,
    refresh,
    notify,
    navigate,
    openLead: setLeadId,
    newLead: () => setAddLead(true),
    editLead: (lead) => {
      setLeadId(null);
      setEditLead(lead);
    },
    search,
    setSearch,
    leadPreset,
  };
  const title = navigation.flatMap((g) => g.items).find((i) => i[0] === page)?.[1] ?? 'Overview';
  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        <div
          className={`sidebar-overlay ${mobile ? 'visible' : ''}`}
          onClick={() => setMobile(false)}
        />
        <aside className={`sidebar ${mobile ? 'open' : ''}`}>
          <a className="brand" href="#dashboard">
            <span className="brand-mark">
              <Workflow size={23} />
            </span>
            relay<span className="brand-dot">.</span>
          </a>
          <div className="workspace-switch">
            <span className="workspace-icon">R</span>
            <div>
              <strong>{meta?.settings.company_name ?? 'Relay Logistics'}</strong>
              <small>Team workspace</small>
            </div>
            <ChevronDown size={14} />
          </div>
          <nav>
            {navigation.map((group) => (
              <div className="nav-group" key={group.group}>
                <span>{group.group}</span>
                {group.items
                  .filter(([id]) => manager || !['imports', 'team', 'audit'].includes(id))
                  .map(([id, label, Icon]) => (
                    <button
                      key={id}
                      className={`nav-link ${page === id ? 'active' : ''}`}
                      onClick={() => navigate(id)}
                    >
                      <Icon size={18} />
                      <span>{label}</span>
                      {id === 'calling' && <small>SOON</small>}
                      {id === 'leads' && meta?.active && <i className="active-dot" />}
                    </button>
                  ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="help-card">
              <span>
                <Sparkles size={16} /> Built for better follow-ups
              </span>
              <p>Every conversation is a new opportunity.</p>
            </div>
            <button className="profile" onClick={() => navigate('settings')}>
              <Avatar name={user.name} />
              <div>
                <strong>{user.name}</strong>
                <small>
                  {user.role === 'agent'
                    ? 'Telecaller'
                    : user.role === 'admin'
                      ? 'Administrator'
                      : 'Manager'}
                </small>
              </div>
              <Settings2 size={16} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-toggle"
                aria-label="Open navigation"
                onClick={() => setMobile(true)}
              >
                <Menu size={20} />
              </button>
              <span>Workspace</span>
              <ChevronRight size={14} />
              <strong>{title}</strong>
            </div>
            <div className="topbar-actions">
              <form
                className="global-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  navigate('leads');
                }}
              >
                <Search size={16} />
                <input
                  aria-label="Search leads"
                  placeholder="Search leads…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <kbd>↵</kbd>
              </form>
              <span className="topbar-divider" />
              <button
                className={`icon-button ${notifications ? 'selected' : ''}`}
                aria-label="Callback reminders"
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={19} />
              </button>
              <Avatar name={user.name} small />
              <button className="icon-button" aria-label="Sign out" onClick={logout}>
                <LogOut size={17} />
              </button>
            </div>
          </header>
          {notifications && <Notifications onClose={() => setNotifications(false)} />}
          <main>
            {meta?.active && (
              <div className="active-banner">
                <LockKeyhole size={16} />
                <span>
                  Activity in progress: <strong>{meta.active.business}</strong>. Save your notes to
                  unlock the next lead.
                </span>
                <button onClick={() => setLeadId(meta.active.lead_id)}>
                  Resume activity <ArrowRight size={14} />
                </button>
              </div>
            )}
            {page === 'platform' || page === 'boards' ? (
              <Platform
                key={page}
                initial={page === 'boards' ? 'boards' : 'dashboard'}
                api={api}
                user={user}
                notify={notify}
              />
            ) : page === 'chat' ? (
              <DemoChat key={user.id} user={user} />
            ) : page === 'dashboard' ? (
              <DemoDashboard
                user={user}
                onBoards={() => navigate('boards')}
                onChat={() => navigate('chat')}
                onReports={() => navigate('reports')}
              />
            ) : page === 'leads' ? (
              <Leads />
            ) : page === 'workspace' ? (
              <Workspace />
            ) : page === 'callbacks' ? (
              <Callbacks />
            ) : page === 'imports' && manager ? (
              <Imports />
            ) : page === 'team' && manager ? (
              <Team />
            ) : page === 'reports' ? (
              <Reports />
            ) : page === 'audit' && manager ? (
              <Audit />
            ) : page === 'calling' ? (
              <ComingSoon />
            ) : page === 'settings' ? (
              <Settings />
            ) : (
              <Dashboard />
            )}
            <footer className="page-footer">
              <span>
                Relay CRM <i /> A little more organized. A lot more connected.
              </span>
              <span>
                <i className={connected ? 'live-dot' : ''} />{' '}
                {connected ? 'Workspace connected' : 'Reconnecting…'}
              </span>
            </footer>
          </main>
        </div>
        {toast && (
          <div className={`toast ${toast.type}`} role="status">
            {toast.type === 'error' ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
            <span>{toast.message}</span>
            <button aria-label="Dismiss notification" onClick={() => setToast(null)}>
              <X size={15} />
            </button>
          </div>
        )}
        {addLead && <LeadForm onClose={() => setAddLead(false)} />}{' '}
        {editLead && <LeadForm existing={editLead} onClose={() => setEditLead(null)} />}{' '}
        {leadId && <LeadDetail id={leadId} onClose={() => setLeadId(null)} />}
      </div>
    </AppContext.Provider>
  );
}

function Metric({ label, value, note, icon: Icon, color = 'green' }) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${color}`}>
          <Icon size={18} />
        </span>
      </div>
      <strong>{value}</strong>
      <div className="metric-note">{note}</div>
    </div>
  );
}
function ActivityChart({ days }) {
  const maximum = Math.max(4, ...days.map((d) => d.attempts));
  return (
    <div className="activity-chart">
      <div className="chart-y">
        {[1, 0.75, 0.5, 0.25, 0].map((v, i) => (
          <span key={i}>{Math.round(maximum * v)}</span>
        ))}
      </div>
      <div className="chart-plot">
        <div className="chart-grid">
          {Array.from({ length: 5 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        <div className="chart-bars">
          {days.map((day, i) => (
            <div className="chart-column" key={day.date}>
              <div
                className="bar-pair"
                title={`${date(day.date)}: ${day.attempts} activities, ${day.connected} connected`}
              >
                <span
                  className="bar-total"
                  style={{ height: `${(day.attempts / maximum) * 100}%` }}
                />
                <span
                  className="bar-connected"
                  style={{ height: `${(day.connected / maximum) * 100}%` }}
                />
              </div>
              <small>
                {i % 2 === 0
                  ? new Date(day.date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })
                  : ''}
              </small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function Dashboard() {
  const { user, manager, navigate, newLead, openLead } = useApp();
  const { data, error, loading } = useLoad('/analytics');
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const greeting =
    new Date().getHours() < 12
      ? 'Good morning'
      : new Date().getHours() < 17
        ? 'Good afternoon'
        : 'Good evening';
  return (
    <>
      <PageHeading
        eyebrow="YOUR WORKSPACE AT A GLANCE"
        title={`${greeting}, ${user.name.split(' ')[0]} 👋`}
        description="A clear view of your leads, your team, and what comes next."
      >
        <Button variant="secondary" icon={CalendarDays} onClick={() => navigate('reports')}>
          View reports
        </Button>
        <Button icon={Plus} onClick={newLead}>
          Add new lead
        </Button>
      </PageHeading>
      <div className="overview-banner">
        <div className="overview-banner-icon">
          <Sparkles size={22} />
        </div>
        <div>
          <strong>Small follow-ups. Big possibilities.</strong>
          <p>
            You have <b>{data.callbackCount} callbacks</b> on the calendar
            {data.overdue
              ? `, including ${data.overdue} that need attention`
              : '. Keep the momentum going.'}
          </p>
        </div>
        <button onClick={() => navigate('callbacks')}>
          View callbacks <ArrowUpRight size={18} />
        </button>
      </div>
      <div className="metrics-grid">
        <Metric
          label={manager ? 'Total leads' : 'My leads'}
          value={data.total.toLocaleString()}
          icon={Users}
          note={
            <>
              <span className="metric-pill">{data.unassigned} unassigned</span>
              <span>in your lead pool</span>
            </>
          }
        />
        <Metric
          label="Activities logged"
          value={data.attempts.toLocaleString()}
          icon={Phone}
          color="blue"
          note={
            <>
              <span className="metric-pill blue">{data.connected} connected</span>
              <span>across all time</span>
            </>
          }
        />
        <Metric
          label="Connect rate"
          value={`${data.connectRate}%`}
          icon={TrendingUp}
          color="amber"
          note={
            <>
              <span className="metric-pill amber">{duration(data.duration)}</span>
              <span>logged talk time</span>
            </>
          }
        />
        <Metric
          label="Converted leads"
          value={data.won}
          icon={Target}
          color="purple"
          note={
            <>
              <span className="metric-pill purple">{data.conversion}% conversion</span>
              <span>of contacted leads</span>
            </>
          }
        />
      </div>
      <div className="dashboard-grid">
        <section className="card activity-card">
          <div className="card-heading">
            <div>
              <h2>Activity overview</h2>
              <p>Every conversation moves your pipeline forward.</p>
            </div>
            <span className="subtle-tag">Last 14 days</span>
          </div>
          <div className="chart-legend">
            <span>
              <i />
              Activities logged
            </span>
            <span>
              <i className="light" />
              Connected
            </span>
          </div>
          <ActivityChart days={data.days} />
        </section>
        <section className="card pipeline-card">
          <div className="card-heading">
            <div>
              <h2>Lead pipeline</h2>
              <p>From first hello to closed won.</p>
            </div>
            <Workflow size={18} className="muted" />
          </div>
          <div className="pipeline-total">
            <strong>{data.total}</strong>
            <span>leads in your pipeline</span>
          </div>
          <div className="pipeline-stack">
            {data.pipeline
              .filter((p) => p.count)
              .map((p) => (
                <span
                  key={p.status}
                  className={statusClass(p.status)}
                  style={{ flex: p.count }}
                  title={`${p.status}: ${p.count}`}
                />
              ))}
          </div>
          <div className="pipeline-list">
            {data.pipeline.map((p) => (
              <button key={p.status} onClick={() => navigate('leads', p.status)}>
                <span>
                  <i className={statusClass(p.status)} />
                  {p.status}
                </span>
                <strong>
                  {p.count}
                  <small>{data.total ? Math.round((p.count / data.total) * 100) : 0}%</small>
                </strong>
              </button>
            ))}
          </div>
        </section>
        <section className="card leaderboard-card">
          <div className="card-heading">
            <div>
              <h2>{manager ? 'Team leaderboard' : 'Your performance'}</h2>
              <p>Great work deserves a little recognition.</p>
            </div>
            <button className="text-button" onClick={() => navigate('reports')}>
              View report <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Activities</th>
                  <th>Connect rate</th>
                  <th>Won</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboard.slice(0, 5).map((agent, i) => (
                  <tr key={agent.id}>
                    <td>
                      <div className="person-cell">
                        <span className="rank">{String(i + 1).padStart(2, '0')}</span>
                        <Avatar name={agent.name} index={i} small />
                        <strong>{agent.name}</strong>
                        {i === 0 && agent.won > 0 && <span className="top-performer">✦</span>}
                      </div>
                    </td>
                    <td>{agent.calls}</td>
                    <td>
                      <div className="rate-cell">
                        <span>{agent.rate}%</span>
                        <i>
                          <b style={{ width: agent.rate + '%' }} />
                        </i>
                      </div>
                    </td>
                    <td>
                      <span className="won-count">{agent.won}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card callback-card">
          <div className="card-heading">
            <div>
              <h2>Up next</h2>
              <p>A timely follow-up makes a difference.</p>
            </div>
            <button
              className="icon-button"
              aria-label="View all callbacks"
              onClick={() => navigate('callbacks')}
            >
              <ArrowUpRight size={19} />
            </button>
          </div>
          <div className="callback-list">
            {data.callbacks.length ? (
              data.callbacks.slice(0, 4).map((lead, i) => (
                <button key={lead.id} onClick={() => openLead(lead.id)}>
                  <span className={`callback-icon ${i % 2 ? 'peach' : ''}`}>
                    <Building2 size={18} />
                  </span>
                  <div>
                    <strong>{lead.business}</strong>
                    <span>
                      <Clock3 size={12} />
                      {datetime(lead.callback_at)}
                    </span>
                  </div>
                  <ChevronRight size={16} />
                </button>
              ))
            ) : (
              <Empty
                icon={CalendarDays}
                title="All caught up"
                text="Scheduled callbacks will appear here."
              />
            )}
          </div>
          <button className="card-footer-link" onClick={() => navigate('callbacks')}>
            View all callbacks <ArrowRight size={15} />
          </button>
        </section>
      </div>
      <section className="card categories-strip">
        <div>
          <span className="eyebrow">WHERE OPPORTUNITIES GROW</span>
          <h2>Leads by category</h2>
        </div>
        {data.categories.slice(0, 4).map((c, i) => (
          <div className="category-stat" key={c.name}>
            <span className={`category-symbol category-${i}`}>
              <Building2 size={18} />
            </span>
            <div>
              <span>{c.name}</span>
              <strong>
                {c.total} <small>leads · {c.won} won</small>
              </strong>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function Filters({ filters, setFilters, dates = false, owner = true }) {
  const { meta, manager } = useApp();
  const change = (key, value) => setFilters({ ...filters, [key]: value });
  return (
    <div className="filters">
      <span className="filter-label">
        <SlidersHorizontal size={16} />
        Filters
      </span>
      <select
        aria-label="Filter category"
        value={filters.category ?? ''}
        onChange={(e) => change('category', e.target.value)}
      >
        <option value="">All categories</option>
        {meta?.categories.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <select
        aria-label="Filter disposition"
        value={filters.status ?? ''}
        onChange={(e) => change('status', e.target.value)}
      >
        <option value="">All dispositions</option>
        {statuses.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      {manager && owner && (
        <select
          aria-label="Filter owner"
          value={filters.owner ?? ''}
          onChange={(e) => change('owner', e.target.value)}
        >
          <option value="">All owners</option>
          <option value="unassigned">Unassigned</option>
          {meta?.users
            .filter((u) => u.role === 'agent')
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>
      )}
      <select
        aria-label="Filter city"
        value={filters.city ?? ''}
        onChange={(e) => change('city', e.target.value)}
      >
        <option value="">All cities</option>
        {meta?.cities.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      {dates && (
        <>
          <input
            aria-label="Start date"
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => change('from', e.target.value)}
          />
          <span>to</span>
          <input
            aria-label="End date"
            type="date"
            min={filters.from}
            value={filters.to ?? ''}
            onChange={(e) => change('to', e.target.value)}
          />
        </>
      )}
      {Object.values(filters).some(Boolean) && (
        <button className="text-button" onClick={() => setFilters({})}>
          Clear <X size={13} />
        </button>
      )}
    </div>
  );
}
function LeadTable({ leads, selected = [], setSelected, openLead }) {
  const { manager } = useApp();
  return (
    <div className="table-scroll">
      <table className="lead-table">
        <thead>
          <tr>
            {setSelected && (
              <th className="check-column">
                <input
                  type="checkbox"
                  aria-label="Select all visible leads"
                  checked={leads.length > 0 && leads.every((l) => selected.includes(l.id))}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...new Set([...selected, ...leads.map((l) => l.id)])]
                        : selected.filter((id) => !leads.some((l) => l.id === id)),
                    )
                  }
                />
              </th>
            )}
            <th>Business / Contact</th>
            <th>Category</th>
            <th>Location</th>
            <th>Phone number</th>
            <th>Status</th>
            {manager && <th>Assigned to</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, i) => (
            <tr key={lead.id} className={selected.includes(lead.id) ? 'row-selected' : ''}>
              {setSelected && (
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${lead.business}`}
                    checked={selected.includes(lead.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, lead.id]
                          : selected.filter((id) => id !== lead.id),
                      )
                    }
                  />
                </td>
              )}
              <td>
                <button className="business-cell" onClick={() => openLead(lead.id)}>
                  <span className={`business-icon business-${i % 4}`}>
                    <Building2 size={18} />
                  </span>
                  <span>
                    <strong>{lead.business}</strong>
                    <small>{lead.contact || lead.source}</small>
                  </span>
                </button>
              </td>
              <td>
                <span className="category-tag">{lead.category}</span>
              </td>
              <td>
                <span className="location-cell">
                  <MapPin size={13} />
                  {lead.city}
                </span>
              </td>
              <td className="phone-cell">{lead.phone}</td>
              <td>
                <Status value={lead.status} />
              </td>
              {manager && (
                <td>
                  {lead.owner_name ? (
                    <span className="owner-cell">
                      <Avatar name={lead.owner_name} index={i} small />
                      {lead.owner_name.split(' ')[0]}
                    </span>
                  ) : (
                    <span className="unassigned">Unassigned</span>
                  )}
                </td>
              )}
              <td>
                <button
                  className="icon-button"
                  aria-label={`Open ${lead.business}`}
                  onClick={() => openLead(lead.id)}
                >
                  <ArrowUpRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Pagination({ page, total, size, onChange }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="pagination">
      <span>
        {total ? `${(page - 1) * size + 1}–${Math.min(page * size, total)}` : '0'} of {total}{' '}
        records
      </span>
      <div>
        <button
          className="icon-button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button
          className="icon-button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
function Leads() {
  const { manager, newLead, navigate, openLead, search, setSearch, leadPreset } = useApp();
  const [filters, setFilters] = useState(leadPreset ? { status: leadPreset } : {}),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState([]),
    [allocate, setAllocate] = useState(false);
  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [JSON.stringify(filters), search]);
  const query = new URLSearchParams({ ...filters, search, page, size: 12 }).toString();
  const { data, error, loading } = useLoad('/leads?' + query);
  return (
    <>
      <PageHeading
        eyebrow="YOUR OPPORTUNITY DIRECTORY"
        title="All leads"
        description="Organized contacts. Clear ownership. No missed opportunities."
      >
        {manager && (
          <Button variant="secondary" icon={Upload} onClick={() => navigate('imports')}>
            Import leads
          </Button>
        )}
        <Button icon={Plus} onClick={newLead}>
          Add new lead
        </Button>
      </PageHeading>
      <section className="card">
        <div className="list-toolbar">
          <div className="list-tabs">
            <button
              className={!filters.owner ? 'active' : ''}
              onClick={() => setFilters({ ...filters, owner: '' })}
            >
              All leads <span>{data?.total ?? '—'}</span>
            </button>
            {manager && (
              <button
                className={filters.owner === 'unassigned' ? 'active' : ''}
                onClick={() => setFilters({ ...filters, owner: 'unassigned' })}
              >
                Unassigned
              </button>
            )}
          </div>
          <div className="toolbar-right">
            <div className="input-search">
              <Search size={16} />
              <input
                aria-label="Search lead directory"
                placeholder="Search business, contact, city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ExportButtons query={new URLSearchParams({ ...filters, search }).toString()} />
          </div>
        </div>
        <Filters filters={filters} setFilters={setFilters} />
        {manager && (
          <div className="selection-bar">
            <span>
              {selected.length
                ? `${selected.length} leads selected`
                : 'Give every lead a clear owner.'}
            </span>
            <Button variant="secondary" icon={Users} onClick={() => setAllocate(true)}>
              {selected.length ? 'Assign selected' : 'Auto-assign unassigned'}
            </Button>
          </div>
        )}
        <ErrorBox error={error} />
        {loading ? (
          <Loading />
        ) : data?.leads.length ? (
          <>
            <LeadTable
              leads={data.leads}
              selected={selected}
              setSelected={manager ? setSelected : null}
              openLead={openLead}
            />
            <Pagination page={page} total={data.total} size={12} onChange={setPage} />
          </>
        ) : (
          <Empty
            icon={Search}
            title="No leads found"
            text="Try adjusting your filters, or add your first lead."
            action={
              <Button variant="secondary" icon={Plus} onClick={newLead}>
                Add a lead
              </Button>
            }
          />
        )}
      </section>
      {allocate && (
        <AllocateModal
          ids={selected}
          filters={filters}
          onClose={() => setAllocate(false)}
          onDone={() => setSelected([])}
        />
      )}
    </>
  );
}
function AllocateModal({ ids, filters, onClose, onDone }) {
  const { meta, notify, refresh } = useApp();
  const [agent, setAgent] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api('/allocate', {
        method: 'POST',
        body: { ids, agent_id: agent, category: filters.category, city: filters.city },
      });
      notify(`${result.assigned} leads assigned successfully.`);
      refresh();
      onDone();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Assign leads"
      subtitle={
        ids.length
          ? `Set ownership for ${ids.length} selected leads.`
          : 'Distribute unassigned leads matching the category and city filters.'
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="modal-body">
        <Field label="Allocation strategy">
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="">Round-robin · all available agents</option>
            {meta?.users
              .filter((u) => u.role === 'agent' && u.active)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </Field>
        <div className="info-box">
          <ShieldCheck size={19} />
          <p>
            Each lead has exactly one owner. Leads with an unfinished activity cannot be reassigned.
          </p>
        </div>
        <ErrorBox error={error} />
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Users} loading={busy}>
            Assign leads
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function LeadForm({ onClose, existing }) {
  const { meta, refresh, notify } = useApp();
  const [form, setForm] = useState(
      existing ?? {
        business: '',
        contact: '',
        phone: '',
        email: '',
        city: '',
        category: 'B2B Contractors',
        source: 'Manual',
      },
    ),
    [matches, setMatches] = useState([]),
    [allow, setAllow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  useEffect(() => {
    if (existing) return;
    let alive = true;
    const timer = setTimeout(() => {
      if (form.phone.replace(/\D/g, '').length >= 10)
        api('/leads/check', { method: 'POST', body: form })
          .then((result) => {
            if (alive) setMatches(result.matches);
          })
          .catch(() => {});
      else setMatches([]);
    }, 450);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [form.phone, form.email, form.business, form.city]);
  const hard = matches.some((m) => m.tier !== 'business');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(existing ? `/leads/${existing.id}` : '/leads', {
        method: existing ? 'PATCH' : 'POST',
        body: { ...form, allow_similar: allow },
      });
      refresh();
      notify(existing ? 'Lead updated.' : 'New lead added to your workspace.');
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={existing ? 'Edit lead' : 'Add a new lead'}
      subtitle="A great relationship starts with the right details."
      onClose={onClose}
    >
      <form onSubmit={submit} className="modal-body">
        <div className="form-grid">
          <Field label="Business name *" className="span-two">
            <input
              required
              maxLength={180}
              autoFocus
              value={form.business}
              onChange={(e) => set('business', e.target.value)}
              placeholder="e.g. Horizon Trading Co."
            />
          </Field>
          <Field label="Contact person">
            <input
              value={form.contact}
              onChange={(e) => set('contact', e.target.value)}
              placeholder="Full name"
            />
          </Field>
          <Field label="Mobile number *" hint="Indian mobile · +91 is optional">
            <input
              required
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="98765 43210"
            />
          </Field>
          <Field label="Email address">
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="contact@company.com"
            />
          </Field>
          <Field label="City *">
            <input
              required
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              list="city-list"
              placeholder="e.g. Mumbai"
            />
            <datalist id="city-list">
              {meta?.cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </datalist>
          </Field>
          <Field label="Category">
            <input
              list="category-list"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              required
            />
            <datalist id="category-list">
              {meta?.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </datalist>
          </Field>
          <Field label="Lead source">
            <input
              value={form.source}
              onChange={(e) => set('source', e.target.value)}
              placeholder="Website, referral, directory…"
            />
          </Field>
        </div>
        {matches.length > 0 && (
          <div className="duplicate-warning">
            <strong>
              <AlertCircle size={17} />
              {hard ? 'This contact already exists' : 'Similar business found'}
            </strong>
            {matches.map((m) => (
              <p key={m.id}>
                {m.business} · {m.owner_name ?? 'Unassigned'}
                <br />
                <small>
                  {m.status} · Last contact: {datetime(m.last_contact_at)}
                </small>
              </p>
            ))}
            {!hard && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={allow}
                  onChange={(e) => setAllow(e.target.checked)}
                />
                I reviewed the match. This is a different business.
              </label>
            )}
          </div>
        )}
        <ErrorBox error={error} />
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={hard} icon={existing ? Check : Plus}>
            {existing ? 'Save changes' : 'Create lead'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function LeadDetail({ id, onClose }) {
  const { meta, manager, notify, refresh, editLead, navigate } = useApp();
  const { data, error, loading } = useLoad('/leads/' + id);
  const [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(''),
    [form, setForm] = useState({
      disposition: 'Interested',
      notes: '',
      duration: 0,
      callback_at: '',
    });
  async function reveal() {
    setBusy(true);
    setActionError('');
    try {
      await api(`/leads/${id}/reveal`, { method: 'POST' });
      refresh();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function log(e) {
    e.preventDefault();
    setBusy(true);
    setActionError('');
    try {
      await api(`/leads/${id}/log`, {
        method: 'POST',
        body: {
          ...form,
          duration: Number(form.duration),
          callback_at: form.callback_at ? new Date(form.callback_at).toISOString() : null,
        },
      });
      refresh();
      notify('Activity saved. Your next lead is ready.');
      onClose();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function quickCallback(tomorrow = false) {
    setForm({ ...form, callback_at: callbackPreset(tomorrow) });
  }
  const minimum = Number(meta?.settings.note_minimum ?? 10),
    lead = data?.lead;
  return (
    <Modal
      title={lead?.business ?? 'Lead profile'}
      subtitle={lead ? `${lead.category} · ${lead.city}` : 'Loading lead details'}
      onClose={onClose}
      wide
    >
      {loading ? (
        <Loading />
      ) : error ? (
        <div className="modal-body">
          <ErrorBox error={error} />
        </div>
      ) : (
        <div className="detail-layout">
          <div className="detail-main">
            <div className="detail-status">
              <Status value={lead.status} />
              {manager && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(`/platform/leads/${id}/convert`, { method: 'POST' });
                      notify('Company, contact and deal are linked in CRM & boards.');
                      onClose();
                      navigate('platform');
                    } catch (e) {
                      setActionError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Convert to CRM
                </button>
              )}
              {manager && !data.active && (
                <button className="text-button" onClick={() => editLead(lead)}>
                  <Pencil size={14} />
                  Edit details
                </button>
              )}
            </div>
            <div className="contact-panel">
              <Avatar name={lead.contact || lead.business} />
              <div>
                <h3>{lead.contact || 'Business contact'}</h3>
                <p>{lead.email || 'No email added'}</p>
              </div>
            </div>
            <div className="phone-reveal">
              <div>
                <span>CONTACT NUMBER</span>
                <strong>{lead.phone}</strong>
              </div>
              {!data.active ? (
                <Button variant="secondary" icon={Eye} loading={busy} onClick={reveal}>
                  Reveal & start
                </Button>
              ) : (
                <span className="status green">
                  <LockKeyhole size={13} />
                  Activity active
                </span>
              )}
            </div>
            <div className="detail-facts">
              <span>
                <Users size={15} />
                <small>Owner</small>
                <strong>{lead.owner_name ?? 'Unassigned'}</strong>
              </span>
              <span>
                <BriefcaseBusiness size={15} />
                <small>Source</small>
                <strong>{lead.source}</strong>
              </span>
              <span>
                <CalendarDays size={15} />
                <small>Added</small>
                <strong>{date(lead.created_at)}</strong>
              </span>
              {lead.callback_at && (
                <span>
                  <Clock3 size={15} />
                  <small>Callback</small>
                  <strong>{datetime(lead.callback_at)}</strong>
                </span>
              )}
            </div>
            <h3 className="section-title">
              Conversation history <span>{data.history.length}</span>
            </h3>
            <div className="timeline">
              {data.history.length ? (
                data.history.map((call) => (
                  <div className="timeline-item" key={call.id}>
                    <i />
                    <div>
                      <div className="timeline-heading">
                        <Status value={call.disposition} />
                        <time>{datetime(call.created_at)}</time>
                      </div>
                      <p>{call.notes}</p>
                      <small>
                        {call.agent_name} · {duration(call.duration)}
                        {call.callback_at ? ` · Callback ${datetime(call.callback_at)}` : ''}
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <Empty
                  icon={MessageSquare}
                  title="A fresh start"
                  text="Activity notes will appear here after the first conversation."
                />
              )}
            </div>
          </div>
          <aside className="log-panel">
            <h3>
              <Pencil size={17} /> Log an activity
            </h3>
            <p>Record your conversation and keep the next step clear.</p>
            {!data.active ? (
              <div className="locked-form">
                <LockKeyhole size={28} />
                <h4>Start with a contact reveal</h4>
                <p>
                  Revealing the number opens a tracked activity. Add a disposition and notes to
                  finish it.
                </p>
                <Button icon={Eye} onClick={reveal} loading={busy}>
                  Reveal contact
                </Button>
              </div>
            ) : (
              <form onSubmit={log}>
                <Field label="Disposition *">
                  <select
                    value={form.disposition}
                    onChange={(e) => setForm({ ...form, disposition: e.target.value })}
                  >
                    {statuses
                      .filter((s) => s !== 'In Progress')
                      .map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                  </select>
                </Field>
                {form.disposition === 'Callback Scheduled' && (
                  <>
                    <Field label="Callback date & time *">
                      <input
                        type="datetime-local"
                        required
                        value={form.callback_at}
                        onChange={(e) => setForm({ ...form, callback_at: e.target.value })}
                      />
                    </Field>
                    <div className="quick-times">
                      <button type="button" onClick={() => quickCallback()}>
                        In 1 hour
                      </button>
                      <button type="button" onClick={() => quickCallback(true)}>
                        Tomorrow, 10 AM
                      </button>
                    </div>
                  </>
                )}
                <Field
                  label="Conversation notes *"
                  hint={`${form.notes.trim().length} / ${minimum} characters minimum`}
                >
                  <textarea
                    rows={5}
                    required
                    minLength={minimum}
                    maxLength={5000}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="What did you discuss? What happens next?"
                  />
                </Field>
                <Field label="Talk time (seconds)" hint="Enter the duration of your external call.">
                  <input
                    type="number"
                    min={0}
                    max={86400}
                    required
                    value={form.duration}
                    onChange={(e) => setForm({ ...form, duration: e.target.value })}
                  />
                </Field>
                <Button icon={Check} className="full" loading={busy}>
                  Save & complete activity
                </Button>
                <div className="secure-note">
                  <ShieldCheck size={14} /> Saved notes remain in the lead history.
                </div>
              </form>
            )}
            <ErrorBox error={actionError} />
            <div className="coming-mini">
              <Phone size={17} />
              <div>
                <strong>Browser calling</strong>
                <span>Coming soon</span>
              </div>
              <LockKeyhole size={14} />
            </div>
          </aside>
        </div>
      )}
    </Modal>
  );
}

function Workspace() {
  const { user, openLead, newLead, meta } = useApp();
  const [tab, setTab] = useState('open'),
    [page, setPage] = useState(1);
  const { data, error, loading } = useLoad(
    '/leads?' +
      new URLSearchParams({
        owner: user.id,
        size: 12,
        page,
        ...(tab === 'open' ? { open: 'true' } : {}),
      }),
  );
  useEffect(() => setPage(1), [tab]);
  const leads = data?.leads ?? [];
  return (
    <>
      <PageHeading
        eyebrow="ONE CONVERSATION AT A TIME"
        title="My workspace"
        description="Your personal queue, ready for a productive day."
      >
        <Button variant="secondary" icon={Plus} onClick={newLead}>
          Add a lead
        </Button>
      </PageHeading>
      <div className="workspace-intro">
        <div>
          <span className="eyebrow">YOUR NEXT OPPORTUNITY</span>
          <h2>
            {meta?.active ? 'Pick up where you left off.' : 'A focused queue. A fresh start.'}
          </h2>
          <p>
            {meta?.active
              ? 'Finish the current conversation notes to continue with your next lead.'
              : 'Reveal a contact, make your call externally, and capture the outcome here.'}
          </p>
          <Button
            icon={ArrowRight}
            disabled={!meta?.active && !leads.length}
            onClick={() => openLead(meta?.active?.lead_id ?? leads[0]?.id)}
          >
            {meta?.active ? 'Resume current activity' : 'Start next lead'}
          </Button>
        </div>
        <div className="queue-illustration">
          <div>
            <Users size={28} />
            <strong>{data?.total ?? 0}</strong>
            <span>{tab === 'open' ? 'open opportunities' : 'assigned leads'}</span>
          </div>
          <div>
            <ShieldCheck size={23} />
            <span>
              Protected contacts
              <br />
              <b>Clear ownership</b>
            </span>
          </div>
        </div>
      </div>
      <section className="card">
        <div className="list-toolbar">
          <div className="list-tabs">
            <button className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>
              Open opportunities
            </button>
            <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
              All assigned
            </button>
          </div>
          <span className="subtle-tag">
            <LockKeyhole size={13} /> Contact access is audited
          </span>
        </div>
        <ErrorBox error={error} />
        {loading ? (
          <Loading />
        ) : leads.length ? (
          <>
            <LeadTable leads={leads} openLead={openLead} />
            <Pagination page={page} total={data.total} size={12} onChange={setPage} />
          </>
        ) : (
          <Empty
            icon={CheckCheck}
            title="Your queue is clear"
            text="New assignments will appear here. You can also add a lead manually."
          />
        )}
      </section>
    </>
  );
}
function Notifications({ onClose }) {
  const { data } = useLoad('/analytics');
  const { openLead, navigate } = useApp();
  return (
    <div className="notifications">
      <div className="card-heading">
        <h2>Callback reminders</h2>
        <button className="icon-button" aria-label="Close reminders" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      {data?.callbacks.length ? (
        data.callbacks.slice(0, 5).map((l) => (
          <button
            className="notification-item"
            key={l.id}
            onClick={() => {
              openLead(l.id);
              onClose();
            }}
          >
            <CalendarDays size={18} />
            <span>
              <strong>{l.business}</strong>
              <small>
                {datetime(l.callback_at)}
                {new Date(l.callback_at) < new Date() ? ' · Overdue' : ''}
              </small>
            </span>
          </button>
        ))
      ) : (
        <Empty icon={CheckCheck} title="You’re all caught up" text="No callbacks scheduled." />
      )}
      <button className="card-footer-link" onClick={() => navigate('callbacks')}>
        Open callback calendar <ArrowRight size={15} />
      </button>
    </div>
  );
}
function Callbacks() {
  const { openLead } = useApp();
  const [month, setMonth] = useState(
      () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    [selected, setSelected] = useState('');
  const { data, error, loading } = useLoad('/callbacks');
  const leads = data?.leads ?? [];
  const key = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const days = Array.from(
    { length: 42 },
    (_, i) => new Date(month.getFullYear(), month.getMonth(), i - month.getDay() + 1),
  );
  const filtered = leads
    .filter((l) => !selected || key(new Date(l.callback_at)) === selected)
    .sort((a, b) => a.callback_at.localeCompare(b.callback_at));
  return (
    <>
      <PageHeading
        eyebrow="KEEP THE CONVERSATION GOING"
        title="Callbacks"
        description="The right conversation, at the right time."
      >
        <Button
          variant="secondary"
          icon={CalendarDays}
          onClick={() => {
            setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
            setSelected(key(new Date()));
          }}
        >
          Today
        </Button>
      </PageHeading>
      <ErrorBox error={error} />
      <div className="calendar-layout">
        <section className="card calendar">
          <div className="card-heading">
            <h2>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h2>
            <div>
              <button
                className="icon-button"
                aria-label="Previous month"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                className="icon-button"
                aria-label="Next month"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
          <div className="calendar-week">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="calendar-days">
            {days.map((day) => {
              const matches = leads.filter((l) => key(new Date(l.callback_at)) === key(day));
              return (
                <button
                  key={key(day)}
                  className={`${day.getMonth() !== month.getMonth() ? 'outside' : ''} ${key(day) === key(new Date()) ? 'today' : ''} ${key(day) === selected ? 'chosen' : ''}`}
                  onClick={() => setSelected(key(day))}
                >
                  <span>{day.getDate()}</span>
                  {matches.length > 0 && (
                    <small>
                      {matches.length} callback{matches.length > 1 ? 's' : ''}
                    </small>
                  )}
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <i /> Scheduled callbacks <span>Times shown in your local timezone</span>
          </div>
        </section>
        <section className="card callback-agenda">
          <div className="card-heading">
            <div>
              <h2>{selected ? date(selected + 'T00:00:00') : 'Upcoming & overdue'}</h2>
              <p>{filtered.length} scheduled follow-ups</p>
            </div>
            {selected && (
              <button className="text-button" onClick={() => setSelected('')}>
                View all
              </button>
            )}
          </div>
          {loading ? (
            <Loading />
          ) : filtered.length ? (
            <div className="agenda-list">
              {filtered.map((l) => (
                <button key={l.id} onClick={() => openLead(l.id)}>
                  <span className="agenda-time">
                    {new Date(l.callback_at).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <strong>{l.business}</strong>
                  <span>
                    {l.contact} · {l.city}
                  </span>
                  <div>
                    <small>{date(l.callback_at)}</small>
                    {new Date(l.callback_at) < new Date() && <b>Overdue</b>}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              icon={CalendarDays}
              title="A little breathing room"
              text="No callbacks for this selection. Schedule one from a lead’s activity form."
            />
          )}
        </section>
      </div>
    </>
  );
}

function Imports() {
  const { notify, refresh, navigate } = useApp();
  const [preview, setPreview] = useState(null),
    [mapping, setMapping] = useState({}),
    [policy, setPolicy] = useState('skip'),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [drag, setDrag] = useState(false);
  const fileRef = useRef();
  const { data: history } = useLoad('/imports');
  async function uploadFile(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const data = await api('/imports/preview', { method: 'POST', body: form });
      setPreview({ ...data, filename: file.name });
      setMapping(data.mapping);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  async function commit() {
    setBusy(true);
    setError('');
    try {
      const data = await api(`/imports/${preview.id}/commit`, {
        method: 'POST',
        body: { mapping, policy },
      });
      setResult(data);
      notify('Import completed. Your lead pool is up to date.');
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function downloadIssues() {
    const rows = [
      ['Row', 'Business', 'Reason'],
      ...result.issues.map((r) => [r.row, r.business, r.reason]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((v) => {
            let text = String(v);
            if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(','),
      )
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'relay-import-review.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageHeading
        eyebrow="CLEAN DATA. CONFIDENT OUTREACH."
        title="Import leads"
        description="Bring your spreadsheets together, without bringing the duplicates."
      >
        <a
          className="button secondary"
          download="relay-import-template.csv"
          href={
            'data:text/csv;charset=utf-8,' +
            encodeURIComponent(
              'Business,Contact Person,Mobile,Email,City,Category,Source\nExample Business,Anil,9876543210,anil@example.com,Mumbai,B2B Contractors,Website\n',
            )
          }
        >
          <Download size={16} />
          Download template
        </a>
      </PageHeading>
      <div className="import-steps">
        {['Upload your file', 'Match the columns', 'Review & import'].map((label, i) => (
          <div
            key={label}
            className={
              i === (result ? 2 : preview ? 1 : 0)
                ? 'current'
                : i < (result ? 2 : preview ? 1 : 0)
                  ? 'complete'
                  : ''
            }
          >
            <span>{i < (result ? 2 : preview ? 1 : 0) ? <Check size={15} /> : i + 1}</span>
            <strong>{label}</strong>
            {i < 2 && <ChevronRight size={17} />}
          </div>
        ))}
      </div>
      <ErrorBox error={error} />
      {!preview ? (
        <section className="card import-card">
          <div
            className={`dropzone ${drag ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (!busy) uploadFile(e.dataTransfer.files[0]);
            }}
          >
            <div className="upload-art">
              <FileSpreadsheet size={39} />
              <span>
                <Plus size={15} />
              </span>
            </div>
            <h2>Goodbye spreadsheets. Hello clarity.</h2>
            <p>Drop your lead file here, or choose one from your computer.</p>
            <Button icon={Upload} loading={busy} onClick={() => fileRef.current.click()}>
              Choose file
            </Button>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept=".csv,.xlsx,.xls"
              aria-label="Upload lead file"
              onChange={(e) => uploadFile(e.target.files[0])}
            />
            <small>CSV, XLSX, or XLS · Up to 5 MB · 10,000 leads per import</small>
          </div>
          <div className="import-benefits">
            <div>
              <Layers3 size={20} />
              <strong>Smart column mapping</strong>
              <p>Common headers are matched automatically.</p>
            </div>
            <div>
              <ShieldCheck size={20} />
              <strong>Three layers of deduplication</strong>
              <p>Phone, email, and business name + city.</p>
            </div>
            <div>
              <CheckCheck size={20} />
              <strong>Your history stays safe</strong>
              <p>Existing notes and ownership stay intact.</p>
            </div>
          </div>
        </section>
      ) : result ? (
        <section className="card import-result">
          <span className="success-large">
            <CheckCheck size={35} />
          </span>
          <h2>Your import is complete</h2>
          <p>
            {preview.filename} · {preview.total} rows processed
          </p>
          <div className="result-stats">
            {[
              ['Added', result.inserted, 'green'],
              ['Updated', result.updated, 'blue'],
              ['Skipped', result.skipped, 'amber'],
              ['Invalid', result.invalid, 'red'],
            ].map(([label, count, color]) => (
              <div key={label} className={color}>
                <strong>{count}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          {result.issues.length > 0 && (
            <>
              <div className="info-box">
                <AlertCircle size={18} />
                <p>
                  {result.issues.length} rows need a review. Download the report to see each reason.
                </p>
                <button className="text-button" onClick={downloadIssues}>
                  Download report
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Business</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.issues.slice(0, 8).map((r) => (
                      <tr key={r.row}>
                        <td>{r.row}</td>
                        <td>{r.business}</td>
                        <td>{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="center-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setPreview(null);
                setResult(null);
              }}
            >
              Import another file
            </Button>
            <Button icon={ArrowRight} onClick={() => navigate('leads')}>
              Go to leads
            </Button>
          </div>
        </section>
      ) : (
        <section className="card mapping-card">
          <div className="card-heading">
            <div>
              <h2>Make the right connections</h2>
              <p>
                {preview.filename} · {preview.total} rows · Previewing the first{' '}
                {preview.preview.length}
              </p>
            </div>
            <Button variant="secondary" onClick={() => setPreview(null)} disabled={busy}>
              Choose another file
            </Button>
          </div>
          <div className="mapping-grid">
            {Object.entries({
              business: 'Business name *',
              phone: 'Phone number *',
              city: 'City *',
              contact: 'Contact person',
              email: 'Email address',
              category: 'Category',
              source: 'Lead source',
            }).map(([key, label]) => (
              <Field key={key} label={label}>
                <select
                  value={mapping[key] ?? ''}
                  onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                >
                  <option value="">Skip column</option>
                  {preview.headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <div className="table-scroll preview-table">
            <table>
              <thead>
                <tr>
                  {preview.headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row, i) => (
                  <tr key={i}>
                    {preview.headers.map((h) => (
                      <td key={h}>{row[h]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="policy-section">
            <h3>When a duplicate is found</h3>
            <div className="policy-options">
              <label className={policy === 'skip' ? 'selected' : ''}>
                <input
                  type="radio"
                  name="policy"
                  checked={policy === 'skip'}
                  onChange={() => setPolicy('skip')}
                />
                <span>
                  <strong>Skip duplicates</strong>
                  <small>Keep the existing record and report the duplicate.</small>
                </span>
              </label>
              <label className={policy === 'update' ? 'selected' : ''}>
                <input
                  type="radio"
                  name="policy"
                  checked={policy === 'update'}
                  onChange={() => setPolicy('update')}
                />
                <span>
                  <strong>Update existing contacts</strong>
                  <small>Merge phone/email matches. Keep call history and ownership.</small>
                </span>
              </label>
            </div>
            <p className="form-note">
              Similar business names are always held for manual review. Blank values never erase
              existing information.
            </p>
          </div>
          <div className="modal-actions">
            <span className="secure-note">
              <ShieldCheck size={15} /> Duplicate checks run before each row is saved.
            </span>
            <Button
              icon={Upload}
              loading={busy}
              onClick={commit}
              disabled={!mapping.business || !mapping.phone || !mapping.city}
            >
              Import {preview.total} leads
            </Button>
          </div>
        </section>
      )}
      <section className="card import-history">
        <div className="card-heading">
          <div>
            <h2>Recent imports</h2>
            <p>A record of the data coming into your workspace.</p>
          </div>
        </div>
        {history?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>File name</th>
                  <th>Uploaded</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th>Updated</th>
                  <th>Needs review</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <span className="file-cell">
                        <FileSpreadsheet size={17} />
                        {h.filename}
                      </span>
                    </td>
                    <td>{datetime(h.created_at)}</td>
                    <td>
                      <span className={`status ${h.state === 'completed' ? 'green' : 'gray'}`}>
                        <i />
                        {h.state === 'completed' ? 'Completed' : 'Awaiting mapping'}
                      </span>
                    </td>
                    <td>{h.result?.inserted ?? '—'}</td>
                    <td>{h.result?.updated ?? '—'}</td>
                    <td>{h.result ? h.result.skipped + h.result.invalid : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={FileSpreadsheet}
            title="Your first import starts here"
            text="Import history will appear after you upload a file."
          />
        )}
      </section>
    </>
  );
}

function Team() {
  const { notify, refresh, user } = useApp();
  const { data, error, loading } = useLoad('/users');
  const [add, setAdd] = useState(false),
    [release, setRelease] = useState(null),
    [reason, setReason] = useState(''),
    [reset, setReset] = useState(null),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState('');
  async function update(member, body) {
    try {
      await api('/users/' + member.id, { method: 'PATCH', body });
      refresh();
      notify('Team member updated.');
    } catch (e) {
      notify(e.message, 'error');
    }
  }
  async function releaseWork(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/work/' + release.id + '/release', { method: 'POST', body: { reason } });
      refresh();
      notify('Active work released and recorded in the audit trail.');
      setRelease(null);
      setReason('');
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function resetPassword(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/users/' + reset.id, { method: 'PATCH', body: { password } });
      notify('Password reset. Existing sessions have been signed out.');
      setReset(null);
      setPassword('');
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="GOOD WORK HAPPENS TOGETHER"
        title="Team members"
        description="A shared workspace, with clear roles and balanced workloads."
      >
        <Button icon={UserPlus} onClick={() => setAdd(true)}>
          Add team member
        </Button>
      </PageHeading>
      <div className="team-summary">
        <div>
          <Users size={21} />
          <strong>{data?.filter((u) => u.role === 'agent').length ?? 0}</strong>
          <span>Telecallers</span>
        </div>
        <div>
          <CheckCircle2 size={21} />
          <strong>
            {data?.filter((u) => u.role === 'agent' && u.active && u.available).length ?? 0}
          </strong>
          <span>Available for allocation</span>
        </div>
        <div>
          <Activity size={21} />
          <strong>{data?.filter((u) => u.active_lead).length ?? 0}</strong>
          <span>Activities in progress</span>
        </div>
      </div>
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Your people</h2>
            <p>Availability controls automatic lead distribution.</p>
          </div>
          <span className="subtle-tag">
            <ShieldCheck size={14} /> Role-based access
          </span>
        </div>
        <ErrorBox error={error} />
        {loading ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Role</th>
                  <th>Assigned leads</th>
                  <th>Availability</th>
                  <th>Account</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((member, i) => (
                  <tr key={member.id}>
                    <td>
                      <div className="person-cell">
                        <Avatar name={member.name} index={i} />
                        <span>
                          <strong>
                            {member.name}
                            {member.id === user.id && <small className="you-tag">You</small>}
                          </strong>
                          <small>{member.email}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="role-tag">{member.role}</span>
                    </td>
                    <td>{member.lead_count}</td>
                    <td>
                      {member.role === 'agent' ? (
                        <button
                          aria-label={`Toggle availability for ${member.name}`}
                          className={`toggle ${member.available ? 'on' : ''}`}
                          onClick={() => update(member, { available: !member.available })}
                          disabled={!member.active}
                        >
                          <i />
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`status ${member.active ? 'green' : 'gray'}`}>
                        <i />
                        {member.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {member.active_lead && (
                          <button
                            className="text-button"
                            onClick={() => {
                              setRelease(member);
                              setActionError('');
                            }}
                          >
                            Release work
                          </button>
                        )}
                        {(user.role === 'admin' || member.role === 'agent') && (
                          <>
                            <button
                              className="text-button"
                              onClick={() => {
                                setReset(member);
                                setActionError('');
                              }}
                            >
                              Reset password
                            </button>
                            {member.id !== user.id && (
                              <button
                                className="text-button muted"
                                onClick={() => update(member, { active: !member.active })}
                              >
                                {member.active ? 'Deactivate' : 'Activate'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {add && <UserForm onClose={() => setAdd(false)} />}{' '}
      {release && (
        <Modal
          title={`Release ${release.name.split(' ')[0]}’s activity`}
          subtitle="Use this when an agent cannot finish an activity. The reason is permanently audited."
          onClose={() => setRelease(null)}
        >
          <form className="modal-body" onSubmit={releaseWork}>
            <Field label="Reason *">
              <textarea
                required
                minLength={10}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
              />
            </Field>
            <ErrorBox error={actionError} />
            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={() => setRelease(null)}>
                Cancel
              </Button>
              <Button loading={busy}>Release activity</Button>
            </div>
          </form>
        </Modal>
      )}
      {reset && (
        <Modal
          title="Reset team member password"
          subtitle={reset.email}
          onClose={() => setReset(null)}
        >
          <form className="modal-body" onSubmit={resetPassword}>
            <Field
              label="New password"
              hint="At least 12 characters. All their existing sessions will end."
            >
              <input
                required
                minLength={12}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <ErrorBox error={actionError} />
            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={() => setReset(null)}>
                Cancel
              </Button>
              <Button loading={busy}>Reset password</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function UserForm({ onClose }) {
  const { user, notify, refresh } = useApp();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'agent' }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/users', { method: 'POST', body: form });
      refresh();
      notify('Team member created. Share their sign-in details securely.');
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Welcome someone new"
      subtitle="Create a workspace account for your team member."
      onClose={onClose}
    >
      <form className="modal-body" onSubmit={submit}>
        <Field label="Full name">
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Email address">
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Role">
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="agent">Telecaller / Agent</option>
            {user.role === 'admin' && (
              <>
                <option value="manager">Manager</option>
                <option value="admin">Administrator</option>
              </>
            )}
          </select>
        </Field>
        <Field
          label="Temporary password"
          hint="At least 12 characters. The member can change it in Settings."
        >
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <ErrorBox error={error} />
        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} icon={UserPlus}>
            Create account
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Reports() {
  const [filters, setFilters] = useState({}),
    [tab, setTab] = useState('performance');
  const query = new URLSearchParams(filters).toString();
  const { data, error, loading } = useLoad('/analytics?' + query);
  const { data: report } = useLoad('/reports?' + query);
  return (
    <>
      <PageHeading
        eyebrow="TURN ACTIVITY INTO INSIGHT"
        title="Reports & analytics"
        description="Understand what’s working, and where your next opportunity lies."
      >
        <ExportButtons type="calls" query={query} />
      </PageHeading>
      <section className="card report-filters">
        <Filters filters={filters} setFilters={setFilters} dates />
        <p className="form-note">
          Date filters apply to activity dates and lead creation dates respectively. Connect rate
          includes Interested, Callback Scheduled, and Closed Won.
        </p>
      </section>
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="metrics-grid">
              <Metric
                label="Activities logged"
                value={data.attempts}
                icon={Phone}
                note="Within the selected period"
              />
              <Metric
                label="Connect rate"
                value={data.connectRate + '%'}
                icon={TrendingUp}
                color="blue"
                note={`${data.connected} connected activities`}
              />
              <Metric
                label="Unique conversions"
                value={data.won}
                icon={Target}
                color="purple"
                note={`${data.conversion}% of contacted leads`}
              />
              <Metric
                label="Talk time"
                value={duration(data.duration)}
                icon={Clock3}
                color="amber"
                note="Manually recorded by the team"
              />
            </div>
            <div className="report-breakdowns">
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>Category performance</h2>
                    <p>Current conversion by business category.</p>
                  </div>
                </div>
                <div className="breakdown-list">
                  {data.categories.length ? (
                    data.categories.map((c) => (
                      <div key={c.name}>
                        <div>
                          <strong>{c.name}</strong>
                          <span>
                            {c.won} won / {c.total} leads
                          </span>
                        </div>
                        <div className="progress-track">
                          <i style={{ width: (c.total ? (c.won / c.total) * 100 : 0) + '%' }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty title="No category data" />
                  )}
                </div>
              </section>
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>Lead source performance</h2>
                    <p>See where your opportunities come from.</p>
                  </div>
                </div>
                <div className="breakdown-list">
                  {data.sources.length ? (
                    data.sources.map((c) => (
                      <div key={c.name}>
                        <div>
                          <strong>{c.name}</strong>
                          <span>
                            {c.won} won / {c.total} leads
                          </span>
                        </div>
                        <div className="progress-track purple">
                          <i style={{ width: (c.total ? (c.won / c.total) * 100 : 0) + '%' }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty title="No source data" />
                  )}
                </div>
              </section>
            </div>
            <section className="card">
              <div className="list-toolbar">
                <div className="list-tabs">
                  <button
                    className={tab === 'performance' ? 'active' : ''}
                    onClick={() => setTab('performance')}
                  >
                    Agent productivity
                  </button>
                  <button
                    className={tab === 'activity' ? 'active' : ''}
                    onClick={() => setTab('activity')}
                  >
                    Activity log
                  </button>
                </div>
              </div>
              <div className="table-scroll">
                {tab === 'performance' ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Activities</th>
                        <th>Connected</th>
                        <th>Connect rate</th>
                        <th>Talk time</th>
                        <th>Conversions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.leaderboard.map((agent, i) => (
                        <tr key={agent.id}>
                          <td>
                            <div className="person-cell">
                              <Avatar name={agent.name} index={i} small />
                              <strong>{agent.name}</strong>
                            </div>
                          </td>
                          <td>{agent.calls}</td>
                          <td>{agent.connected}</td>
                          <td>{agent.rate}%</td>
                          <td>{duration(agent.duration)}</td>
                          <td>
                            <span className="won-count">{agent.won}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : report?.calls.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Date & time</th>
                        <th>Business</th>
                        <th>Agent</th>
                        <th>Disposition</th>
                        <th>Duration</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.calls.map((call) => (
                        <tr key={call.id}>
                          <td className="nowrap">{datetime(call.created_at)}</td>
                          <td>{call.business}</td>
                          <td>{call.agent_name}</td>
                          <td>
                            <Status value={call.disposition} />
                          </td>
                          <td>{duration(call.duration)}</td>
                          <td className="notes-cell">{call.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Empty
                    icon={Activity}
                    title="No activities in this period"
                    text="Try a different date range or log your first activity."
                  />
                )}
              </div>
              {tab === 'activity' && report?.total > 1000 && (
                <div className="form-note">
                  Showing 1,000 activities. Export to download the full filtered report.
                </div>
              )}
            </section>
          </>
        )
      )}
    </>
  );
}
function Audit() {
  const { meta } = useApp();
  const [filters, setFilters] = useState({}),
    [page, setPage] = useState(1);
  const { data, error, loading } = useLoad('/audit?' + new URLSearchParams({ ...filters, page }));
  useEffect(() => setPage(1), [JSON.stringify(filters)]);
  const actions = [
    'contact_revealed',
    'activity_logged',
    'lead_created',
    'lead_updated',
    'lead_assigned',
    'work_released',
    'import_completed',
    'data_exported',
    'user_created',
    'user_updated',
    'settings_updated',
    'password_changed',
  ];
  return (
    <>
      <PageHeading
        eyebrow="VISIBILITY BUILDS TRUST"
        title="Audit trail"
        description="A permanent record of contact access and workspace changes."
      >
        <ExportButtons type="audit" />
      </PageHeading>
      <div className="audit-banner">
        <ShieldCheck size={23} />
        <div>
          <strong>Accountable by design</strong>
          <p>
            Contact reveals capture the team member, lead, timestamp, and IP address. Audit records
            cannot be edited or deleted through the application.
          </p>
        </div>
      </div>
      <section className="card">
        <div className="filters">
          <span className="filter-label">
            <Filter size={16} />
            Filter activity
          </span>
          <select
            aria-label="Audit team member"
            value={filters.user_id ?? ''}
            onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
          >
            <option value="">All team members</option>
            {meta?.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Audit action"
            value={filters.action ?? ''}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <ErrorBox error={error} />
        {loading ? (
          <Loading />
        ) : data?.rows.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Team member</th>
                    <th>Action</th>
                    <th>Lead / details</th>
                    <th>IP address</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="nowrap">
                        {datetime(row.created_at)}
                        <small className="cell-sub">{new Date(row.created_at).toISOString()}</small>
                      </td>
                      <td>{row.user_name}</td>
                      <td>
                        <span className="audit-action">{row.action.replaceAll('_', ' ')}</span>
                      </td>
                      <td>
                        {row.business ?? 'Workspace'}
                        <small className="cell-sub">{row.detail}</small>
                      </td>
                      <td>
                        <code>{row.ip}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={data.total} size={30} onChange={setPage} />
          </>
        ) : (
          <Empty
            icon={ShieldCheck}
            title="Your audit trail starts here"
            text="Contact reveals and workspace changes will appear automatically."
          />
        )}
      </section>
    </>
  );
}
function ComingSoon() {
  return (
    <>
      <PageHeading
        eyebrow="THE NEXT CHAPTER"
        title="Calling integration"
        description="A more connected calling experience is on the way."
      />
      <section className="coming-soon">
        <div className="coming-orbits">
          <i />
          <i />
          <i />
          <span>
            <Headphones size={45} />
          </span>
          <b className="floating-phone">
            <Phone size={23} />
          </b>
          <b className="floating-message">
            <MessageSquare size={23} />
          </b>
        </div>
        <span className="coming-label">
          <Sparkles size={14} />
          COMING SOON
        </span>
        <h1>
          One workspace.
          <br />
          <em>Every conversation.</em>
        </h1>
        <p>
          Make and manage calls right from Relay. We’re saving a place for an integrated experience
          that keeps your team in the flow.
        </p>
        <div className="coming-features">
          <div>
            <Phone size={23} />
            <h3>Browser calling</h3>
            <p>Connect with prospects directly from their lead profile.</p>
            <span>Planned</span>
          </div>
          <div>
            <MessageSquare size={23} />
            <h3>Automatic SMS</h3>
            <p>Follow up on unanswered calls with a helpful message.</p>
            <span>Planned</span>
          </div>
          <div>
            <Radio size={23} />
            <h3>Inbound screen pop-ups</h3>
            <p>See the right customer context when a call comes in.</p>
            <span>Planned</span>
          </div>
        </div>
        <div className="coming-footnote">
          <CheckCircle2 size={16} />
          Manual activity logging and callback scheduling are available now.
        </div>
      </section>
    </>
  );
}
function Settings() {
  const { meta, manager, user, notify, refresh } = useApp();
  const [company, setCompany] = useState(''),
    [minimum, setMinimum] = useState(10),
    [passwords, setPasswords] = useState({ current: '', password: '', confirm: '' }),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    if (meta) {
      setCompany(meta.settings.company_name ?? '');
      setMinimum(Number(meta.settings.note_minimum ?? 10));
    }
  }, [meta?.settings.company_name, meta?.settings.note_minimum]);
  async function save(e) {
    e.preventDefault();
    setBusy('workspace');
    setError('');
    try {
      await api('/settings', {
        method: 'PATCH',
        body: { company_name: company, note_minimum: Number(minimum) },
      });
      refresh();
      notify('Workspace settings saved.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }
  async function changePassword(e) {
    e.preventDefault();
    if (passwords.password !== passwords.confirm) {
      setError('New passwords do not match.');
      return;
    }
    setBusy('password');
    setError('');
    try {
      await api('/auth/password', { method: 'POST', body: passwords });
      setPasswords({ current: '', password: '', confirm: '' });
      notify('Password updated.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="MAKE YOURSELF AT HOME"
        title="Settings"
        description="Manage your workspace preferences and account security."
      />
      <ErrorBox error={error} />
      <div className="settings-layout">
        <section className="card profile-card">
          <Avatar name={user.name} />
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <span className="role-tag">{user.role}</span>
          <div className="profile-fact">
            <ShieldCheck size={18} />
            <p>Your access is managed by your workspace administrator.</p>
          </div>
        </section>
        <div className="settings-forms">
          {manager && (
            <section className="card">
              <div className="card-heading">
                <div>
                  <h2>Workspace preferences</h2>
                  <p>A few details that keep everyone on the same page.</p>
                </div>
                <Settings2 size={20} className="muted" />
              </div>
              <form className="settings-body" onSubmit={save}>
                <Field label="Company / workspace name">
                  <input
                    required
                    maxLength={120}
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </Field>
                <Field
                  label="Minimum activity note length"
                  hint="Between 10 and 500 characters. Enforced for every activity."
                >
                  <input
                    type="number"
                    min={10}
                    max={500}
                    required
                    value={minimum}
                    onChange={(e) => setMinimum(e.target.value)}
                  />
                </Field>
                <Button loading={busy === 'workspace'} icon={Check}>
                  Save preferences
                </Button>
              </form>
            </section>
          )}
          <section className="card">
            <div className="card-heading">
              <div>
                <h2>Password & security</h2>
                <p>Keep your account access in your hands.</p>
              </div>
              <LockKeyhole size={20} className="muted" />
            </div>
            <form className="settings-body" onSubmit={changePassword}>
              <Field label="Current password">
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={passwords.current}
                  onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                />
              </Field>
              <div className="form-grid">
                <Field label="New password" hint="Use at least 12 characters.">
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    value={passwords.password}
                    onChange={(e) => setPasswords({ ...passwords, password: e.target.value })}
                  />
                </Field>
                <Field label="Confirm new password">
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    value={passwords.confirm}
                    onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                  />
                </Field>
              </div>
              <Button variant="secondary" icon={LockKeyhole} loading={busy === 'password'}>
                Update password
              </Button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
