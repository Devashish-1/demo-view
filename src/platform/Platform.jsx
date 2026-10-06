import React, { useCallback, useEffect, useState } from 'react';
import Board from './Board.jsx';
import DemoDashboard from './DemoDashboard.jsx';
import DemoChat from './DemoChat.jsx';
import { RecordDetail } from './Record.jsx';
import { ActionForm, Dialog, Field, parse, money } from './components.jsx';
import './platform.css';

export default function Platform({ api: baseApi, user, notify, initial = 'dashboard' }) {
  const api = useCallback((path, options) => baseApi('/platform' + path, options), [baseApi]);
  const [boot, setBoot] = useState(null),
    [error, setError] = useState(''),
    [tick, setTick] = useState(0),
    [boardId, setBoardId] = useState(''),
    [workspace, setWorkspace] = useState(''),
    [area, setArea] = useState(initial),
    [recordId, setRecordId] = useState(''),
    [modal, setModal] = useState(''),
    [command, setCommand] = useState(false),
    [query, setQuery] = useState(''),
    [results, setResults] = useState([]),
    [boardTick, setBoardTick] = useState(0);
  const manager = user.role !== 'agent',
    reload = () => setTick((v) => v + 1);
  useEffect(() => {
    let active = true;
    api('/bootstrap')
      .then((b) => {
        if (active) {
          setBoot(b);
          setBoardId((id) => id || b.boards[0]?.id || '');
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, [api, tick]);
  useEffect(() => {
    const handle = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommand((v) => !v);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
  useEffect(() => {
    if (!command) return;
    let active = true;
    const timer = setTimeout(
      () =>
        api('/search?q=' + encodeURIComponent(query))
          .then((r) => {
            if (active) setResults(r.items);
          })
          .catch((e) => setError(e.message)),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, command, api]);
  if (!boot) return <div className="p-panel card">{error || 'Opening your CRM workspace…'}</div>;
  const boards = boot.boards.filter((b) => !workspace || b.workspace_id === workspace);
  return (
    <div className="platform">
      <div className="p-platform-nav">
        <div>
          <strong>Relay workspace</strong>
          <small>
            {boot.organization.name} · {boot.organization.slug}
          </small>
        </div>
        <div className="p-tabs">
          {[
            ['dashboard', 'Dashboard'],
            ['boards', 'CRM boards'],
            ['chat', 'Conversations'],
            ['insights', 'Insights'],
            ['notifications', 'Notifications'],
            ...(manager ? [['automations', 'Automations']] : []),
            ['settings', 'Workspace settings'],
          ].map(([key, label]) => (
            <button key={key} className={area === key ? 'active' : ''} onClick={() => setArea(key)}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setCommand(true)}>Search ⌘/Ctrl K</button>
      </div>
      {error && (
        <p role="alert" className="p-error">
          {error}
        </p>
      )}
      {area === 'dashboard' && (
        <DemoDashboard
          user={user}
          onBoards={() => setArea('boards')}
          onChat={() => setArea('chat')}
          onReports={() => {
            window.location.hash = 'reports';
          }}
        />
      )}
      {area === 'chat' && <DemoChat key={user.id} user={user} />}
      {area === 'boards' && (
        <>
          <div className="p-board-nav">
            <select
              aria-label="Workspace"
              value={workspace}
              onChange={(e) => {
                setWorkspace(e.target.value);
                setBoardId(
                  boot.boards.find((b) => !e.target.value || b.workspace_id === e.target.value)
                    ?.id ?? '',
                );
              }}
            >
              <option value="">All workspaces</option>
              {boot.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <div className="p-board-chips">
              {boards.map((b) => (
                <button
                  key={b.id}
                  className={boardId === b.id ? 'active' : ''}
                  onClick={() => setBoardId(b.id)}
                >
                  {b.name}
                </button>
              ))}
            </div>
            {manager && <button onClick={() => setModal('board')}>+ Board</button>}
          </div>
          {boardId ? (
            <Board
              key={`${boardId}-${boardTick}`}
              id={boardId}
              api={api}
              user={user}
              bootstrap={boot}
              onOpen={setRecordId}
              refreshBootstrap={reload}
            />
          ) : (
            <div className="p-empty">Create a board to get started.</div>
          )}
        </>
      )}
      {area === 'insights' && (
        <Insights
          api={api}
          onBoard={(id) => {
            setBoardId(id);
            setArea('boards');
          }}
        />
      )}
      {area === 'notifications' && <Inbox api={api} onOpen={setRecordId} />}
      {area === 'automations' && manager && <Automations api={api} boot={boot} />}
      {area === 'settings' && (
        <WorkspaceSettings api={api} user={user} boot={boot} reload={reload} />
      )}
      {recordId && (
        <RecordDetail
          id={recordId}
          api={api}
          user={user}
          users={boot.users}
          onOpen={setRecordId}
          onClose={() => setRecordId('')}
          onChange={() => setBoardTick((v) => v + 1)}
        />
      )}
      {modal === 'board' && (
        <Dialog title="Create a board" onClose={() => setModal('')}>
          <ActionForm
            label="Create board"
            onClose={() => setModal('')}
            onSubmit={async (f) => {
              const result = await api('/boards', {
                method: 'POST',
                body: {
                  name: f.get('name'),
                  workspace_id: f.get('workspace'),
                  kind: f.get('kind'),
                  description: f.get('description'),
                },
              });
              setBoardId(result.id);
              setWorkspace('');
              reload();
            }}
          >
            <Field label="Name">
              <input name="name" required autoFocus />
            </Field>
            <Field label="Workspace">
              <select name="workspace">
                {boot.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start with">
              <select name="kind">
                {boot.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description">
              <textarea name="description" maxLength={1000} />
            </Field>
          </ActionForm>
        </Dialog>
      )}
      {command && (
        <Dialog title="Find a record" onClose={() => setCommand(false)}>
          <input
            autoFocus
            aria-label="Search all boards"
            placeholder="Search companies, contacts, deals, cases and tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <p>Results respect your assigned-record permissions.</p>
          {results.map((r) => (
            <button
              key={r.id}
              className="p-list-button"
              onClick={() => {
                setRecordId(r.id);
                setCommand(false);
              }}
            >
              {r.name}
              <small>{r.board_name}</small>
            </button>
          ))}
          {!results.length && <p>No matching records.</p>}
        </Dialog>
      )}
    </div>
  );
}
function Insights({ api, onBoard }) {
  const [data, setData] = useState(null),
    [error, setError] = useState('');
  useEffect(() => {
    api('/summary')
      .then(setData)
      .catch((e) => setError(e.message));
  }, [api]);
  if (!data) return <p>{error || 'Loading insights…'}</p>;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CONNECTED CRM</div>
          <h1>Workspace insights</h1>
          <p>Live totals from records you can access. Currencies are reported separately.</p>
        </div>
      </div>
      <div className="p-board-grid">
        {data.counts.map((b) => (
          <button className="p-stat" key={b.id} onClick={() => onBoard(b.id)}>
            <span>{b.name}</span>
            <strong>{b.count}</strong>
            <small>Open board →</small>
          </button>
        ))}
      </div>
      <section className="card p-panel">
        <h2>Recovery performance</h2>
        {!Object.keys(data.totals).length ? (
          <p>Add a recovery case and record received payments to see metrics here.</p>
        ) : (
          Object.entries(data.totals).map(([currency, total]) => (
            <div key={currency}>
              <h3>{currency}</h3>
              <div className="p-metrics">
                <div>
                  <small>Total outstanding</small>
                  <strong>{money(total.original, currency)}</strong>
                </div>
                <div>
                  <small>Recovered</small>
                  <strong>{money(total.recovered, currency)}</strong>
                </div>
                <div>
                  <small>Pending</small>
                  <strong>{money(total.original - total.recovered, currency)}</strong>
                </div>
              </div>
              <progress
                max={Math.max(total.original, 1)}
                value={total.recovered}
                aria-label={`${currency} recovery progress`}
              />
            </div>
          ))
        )}
        {data.limited && (
          <p className="p-error">
            Case totals are limited to 2,000 records; narrow scope before financial reconciliation.
          </p>
        )}
        <h3>Case aging</h3>
        <div className="p-aging">
          {Object.entries(data.aging).map(([label, n]) => (
            <div key={label}>
              <strong>{n}</strong>
              <span>{label} days</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
function Inbox({ api, onOpen }) {
  const [data, setData] = useState([]),
    [error, setError] = useState('');
  const load = () =>
    api('/notifications')
      .then((r) => setData(r.notifications))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [api]);
  return (
    <section className="card p-panel">
      <div className="p-toolbar">
        <h1>Your inbox</h1>
        <button
          onClick={async () => {
            try {
              await api('/notifications/read', { method: 'POST' });
              load();
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Mark all read
        </button>
      </div>
      {error && <p className="p-error">{error}</p>}
      {!data.length ? (
        <p>No notifications yet. Assignments and mentions will appear here.</p>
      ) : (
        data.map((n) => (
          <button
            key={n.id}
            className={`p-list-button ${n.read_at ? '' : 'unread'}`}
            onClick={() => n.item_id && onOpen(n.item_id)}
          >
            {n.message}
            <small>{new Date(n.created_at).toLocaleString()}</small>
          </button>
        ))
      )}
    </section>
  );
}
function Automations({ api, boot }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [modal, setModal] = useState(false),
    [boardId, setBoardId] = useState(boot.boards[0]?.id),
    [detail, setDetail] = useState(null),
    [actionType, setActionType] = useState('notify'),
    [busy, setBusy] = useState(false);
  const load = () =>
    api('/rules')
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [api]);
  useEffect(() => {
    if (boardId)
      api(`/boards/${boardId}`)
        .then(setDetail)
        .catch((e) => setError(e.message));
  }, [boardId, api]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WHEN → IF → THEN</div>
          <h1>Automations</h1>
          <p>
            Actions run automatically after changes. Jobs are stored durably with bounded retries.
            Schedule the worker for unattended retries when the hosted app is idle.
          </p>
        </div>
        <button className="p-primary" onClick={() => setModal(true)}>
          + Automation
        </button>
      </div>
      {error && (
        <p className="p-error" role="alert">
          {error}
        </p>
      )}
      <section className="card p-panel">
        <div className="p-toolbar">
          <strong>{data?.pending ?? 0} pending jobs</strong>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api('/jobs/run', { method: 'POST' });
                load();
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Processing…' : 'Process queued jobs'}
          </button>
          <button onClick={load}>Refresh</button>
        </div>
        {!data?.rules.length ? (
          <p>No automation rules yet.</p>
        ) : (
          data.rules.map((rule) => (
            <div className="p-rule" key={rule.id}>
              <div>
                <strong>{rule.name}</strong>
                <small>
                  {rule.board_name} · {rule.event} → {parse(rule.action_json).type}
                </small>
              </div>
              <button
                onClick={async () => {
                  try {
                    await api(`/rules/${rule.id}`, {
                      method: 'PATCH',
                      body: { enabled: !rule.enabled },
                    });
                    load();
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                {rule.enabled ? 'Pause' : 'Enable'}
              </button>
            </div>
          ))
        )}
        <h2>Execution history</h2>
        {!data?.runs.length ? (
          <p>Execution results and retry failures will appear here.</p>
        ) : (
          data.runs.map((run) => (
            <div className="p-rule" key={run.id}>
              <div>
                <strong>{run.status}</strong>
                <small>{run.result}</small>
              </div>
              <time>{new Date(run.created_at).toLocaleString()}</time>
            </div>
          ))
        )}
      </section>
      {modal && (
        <Dialog title="Create automation" onClose={() => setModal(false)}>
          <ActionForm
            onClose={() => setModal(false)}
            onSubmit={async (f) => {
              const field = f.get('field'),
                condition = field ? { field, op: f.get('op'), value: f.get('value') } : {};
              const action =
                actionType === 'update'
                  ? { type: 'update', changes: { group_id: f.get('group') } }
                  : {
                      type: actionType,
                      message: f.get('message'),
                      user_id: f.get('user') || undefined,
                    };
              await api('/rules', {
                method: 'POST',
                body: {
                  name: f.get('name'),
                  board_id: boardId,
                  event: f.get('event'),
                  condition,
                  action,
                },
              });
              load();
            }}
          >
            <Field label="Rule name">
              <input name="name" required />
            </Field>
            <Field label="Board">
              <select value={boardId} onChange={(e) => setBoardId(e.target.value)}>
                {boot.boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="When">
              <select name="event">
                {['item.created', 'item.updated', 'status.changed', 'payment.created'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="If field (optional)">
              <select name="field">
                <option value="">Always</option>
                <option value="name">Record name</option>
                {detail?.columns
                  .filter((c) => c.type !== 'formula')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="p-row">
              <Field label="Condition">
                <select name="op">
                  {[
                    'equals',
                    'not_equals',
                    'contains',
                    'greater',
                    'less',
                    'empty',
                    'not_empty',
                  ].map((op) => (
                    <option key={op}>{op}</option>
                  ))}
                </select>
              </Field>
              <Field label="Value">
                <input name="value" />
              </Field>
            </div>
            <Field label="Then">
              <select value={actionType} onChange={(e) => setActionType(e.target.value)}>
                <option value="notify">Notify teammate</option>
                <option value="comment">Add comment</option>
                <option value="update">Move to group</option>
              </select>
            </Field>
            {actionType === 'update' ? (
              <Field label="Destination group">
                <select name="group">
                  {detail?.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Message">
                <textarea name="message" required maxLength={600} />
              </Field>
            )}
            {actionType === 'notify' && (
              <Field label="Recipient">
                <select name="user">
                  <option value="">Record owner</option>
                  {boot.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </ActionForm>
        </Dialog>
      )}
    </>
  );
}
function WorkspaceSettings({ api, user, boot, reload }) {
  const [modal, setModal] = useState(''),
    [notice, setNotice] = useState(''),
    [sessions, setSessions] = useState([]),
    [archived, setArchived] = useState([]),
    [error, setError] = useState('');
  useEffect(() => {
    api('/sessions')
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError(e.message));
  }, [api]);
  useEffect(() => {
    if (user.role !== 'agent')
      api('/archive')
        .then((r) => setArchived(r.items))
        .catch((e) => setError(e.message));
  }, [api, user.role]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ORGANIZATION</div>
          <h1>Workspace settings</h1>
          <p>
            {boot.organization.name} · Sign-in code: <strong>{boot.organization.slug}</strong>
          </p>
        </div>
      </div>
      {notice && <p className="p-notice">{notice}</p>}
      {error && (
        <p role="alert" className="p-error">
          {error}
        </p>
      )}
      <section className="card p-panel">
        <h2>Workspaces</h2>
        {boot.workspaces.map((w) => (
          <div key={w.id} className="p-rule">
            <strong>{w.name}</strong>
          </div>
        ))}
        {user.role !== 'agent' && (
          <button onClick={() => setModal('workspace')}>+ Workspace</button>
        )}
      </section>
      <section className="card p-panel">
        <h2>Active sessions</h2>
        <p>Revoke another session to sign that browser out.</p>
        {sessions.map((s) => (
          <div key={s.id} className="p-rule">
            <div>
              <strong>{s.current ? 'This browser' : 'Another session'}</strong>
              <small>Expires {new Date(s.expires_at).toLocaleString()}</small>
            </div>
            {!s.current && (
              <button
                onClick={async () => {
                  try {
                    await api(`/sessions/${s.id}`, { method: 'DELETE' });
                    setSessions(sessions.filter((v) => v.id !== s.id));
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </section>
      {user.role !== 'agent' && (
        <section className="card p-panel">
          <h2>Archive</h2>
          <p>
            Restore archived records, boards and workspaces. Restore a parent before its children.
          </p>
          {!archived.length && <p>No archived records.</p>}
          {archived.map((entry) => (
            <div className="p-rule" key={entry.kind + entry.id}>
              <div>
                <strong>{entry.name}</strong>
                <small>{entry.kind}</small>
              </div>
              <button
                onClick={async () => {
                  try {
                    await api(`/archive/${entry.kind}/${entry.id}/restore`, { method: 'POST' });
                    setArchived(archived.filter((v) => v.id !== entry.id));
                    reload();
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                Restore
              </button>
            </div>
          ))}
        </section>
      )}
      <section className="card p-panel">
        <h2>Integrations</h2>
        <div className="p-board-grid">
          {[
            'Relay AI',
            'Calling & SMS',
            'Email & calendar sync',
            'Secure object storage',
            'Outgoing webhooks',
            'OAuth & MFA',
          ].map((v) => (
            <div className="p-integration" key={v}>
              <strong>{v}</strong>
              <span className="p-badge">Coming soon</span>
              <p>Not connected. No external data is sent.</p>
            </div>
          ))}
        </div>
      </section>
      {user.role === 'admin' && (
        <section className="card p-panel">
          <h2>Create an isolated organization</h2>
          <p>
            A separate workspace with its own administrator, users and data. Existing records stay
            in this organization.
          </p>
          <button onClick={() => setModal('organization')}>New organization</button>
        </section>
      )}
      {modal === 'workspace' && (
        <Dialog title="Create workspace" onClose={() => setModal('')}>
          <ActionForm
            onClose={() => setModal('')}
            onSubmit={async (f) => {
              await api('/workspaces', { method: 'POST', body: { name: f.get('name') } });
              reload();
            }}
          >
            <Field label="Workspace name">
              <input name="name" required />
            </Field>
          </ActionForm>
        </Dialog>
      )}
      {modal === 'organization' && (
        <Dialog title="Provision organization" onClose={() => setModal('')}>
          <ActionForm
            label="Create organization"
            onClose={() => setModal('')}
            onSubmit={async (f) => {
              const result = await api('/organizations', {
                method: 'POST',
                body: Object.fromEntries(f),
              });
              setNotice(
                `Organization created. Sign out, enter organization code “${result.slug}”, and use its new administrator credentials.`,
              );
            }}
          >
            <Field label="Organization name">
              <input name="name" required />
            </Field>
            <Field
              label="Organization code"
              hint="Lowercase letters, numbers and hyphens; at least 3 characters."
            >
              <input name="slug" pattern="[a-z][a-z0-9-]{2,40}" required />
            </Field>
            <Field label="Administrator name">
              <input name="admin_name" required />
            </Field>
            <Field label="Administrator email">
              <input name="email" type="email" required autoComplete="off" />
            </Field>
            <Field label="Administrator password">
              <input
                name="password"
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
              />
            </Field>
          </ActionForm>
        </Dialog>
      )}
    </>
  );
}
