import React, { useEffect, useState } from 'react';
import { ActionForm, Dialog, Field, ValueInput, human, money } from './components.jsx';
export function RecordForm({ board, users, user, api, onClose, onSaved, existing, parent }) {
  const [values, setValues] = useState(existing?.values ?? {});
  return (
    <Dialog
      title={existing ? 'Edit record' : parent ? 'Add subitem' : 'Create record'}
      onClose={onClose}
    >
      <ActionForm
        onClose={onClose}
        onSubmit={async (form) => {
          const fields = Object.fromEntries(
            Object.entries(values).filter(
              ([id]) =>
                board.columns.find((c) => c.id === id)?.type !== 'formula' &&
                !(
                  user.role === 'agent' && board.columns.find((c) => c.id === id)?.type === 'phone'
                ),
            ),
          );
          const body = {
            name: form.get('name'),
            group_id: form.get('group'),
            owner_id: user.role === 'agent' ? undefined : form.get('owner'),
            values: fields,
            parent_id: parent?.id,
            version: existing?.version,
          };
          const result = await api(
            existing ? `/items/${existing.id}` : `/boards/${board.id}/items`,
            { method: existing ? 'PATCH' : 'POST', body },
          );
          onSaved(result.id ?? existing?.id);
        }}
      >
        <Field label="Record name">
          <input
            name="name"
            defaultValue={existing?.name ?? ''}
            required
            maxLength={180}
            autoFocus
          />
        </Field>
        <div className="p-row">
          <Field label="Group">
            <select name="group" defaultValue={existing?.group_id ?? board.groups[0]?.id}>
              {board.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Owner">
            <select
              name="owner"
              defaultValue={existing?.owner_id ?? (user.role === 'agent' ? user.id : '')}
              disabled={user.role === 'agent'}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="p-fields">
          {board.columns.map((c) => (
            <ValueInput
              key={c.id}
              column={c}
              value={values[c.id]}
              disabled={user.role === 'agent' && c.type === 'phone'}
              onChange={(v) => setValues({ ...values, [c.id]: v })}
            />
          ))}
        </div>
      </ActionForm>
    </Dialog>
  );
}
export function RecordDetail({ id, api, user, users, onClose, onChange, onOpen }) {
  const [record, setRecord] = useState(null),
    [board, setBoard] = useState(null),
    [error, setError] = useState(''),
    [modal, setModal] = useState(''),
    [tick, setTick] = useState(0),
    [results, setResults] = useState([]),
    [query, setQuery] = useState('');
  const reload = () => {
    setTick((v) => v + 1);
    onChange();
  };
  useEffect(() => {
    let alive = true;
    setError('');
    api(`/items/${id}`)
      .then(async (row) => {
        const b = await api(`/boards/${row.board_id}`);
        if (alive) {
          setRecord(row);
          setBoard(b);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [id, tick]);
  useEffect(() => {
    if (modal !== 'link') return;
    let alive = true;
    const timer = setTimeout(
      () =>
        api('/search?q=' + encodeURIComponent(query))
          .then((r) => {
            if (alive) setResults(r.items.filter((r) => r.id !== id));
          })
          .catch((e) => setError(e.message)),
      250,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, modal, id]);
  async function action(fn) {
    try {
      setError('');
      await fn();
      reload();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <Dialog title={record?.name ?? 'Record details'} onClose={onClose}>
        {error && (
          <p role="alert" className="p-error">
            {error}
          </p>
        )}
        {!record ? (
          <p>Loading…</p>
        ) : (
          <>
            <div className="p-row p-toolbar">
              <span className="p-badge">{board?.name}</span>
              <button onClick={() => setModal('edit')}>Edit record</button>
              {!record.parent_id && <button onClick={() => setModal('child')}>Add subitem</button>}
              <button onClick={() => setModal('link')}>Link record</button>
            </div>
            <dl className="p-record-fields">
              {record.columns.map((c) => (
                <div key={c.id}>
                  <dt>{c.name}</dt>
                  <dd>
                    {human(record.values[c.id])}
                    {record.formula_errors[c.id] && (
                      <small role="alert">{record.formula_errors[c.id]}</small>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {board?.kind === 'recovery' && (
              <section className="p-section">
                <h3>Recovery balance</h3>
                <div className="p-metrics">
                  <div>
                    <small>Original</small>
                    <strong>{money(record.balance.original, record.balance.currency)}</strong>
                  </div>
                  <div>
                    <small>Recovered</small>
                    <strong>{money(record.balance.recovered, record.balance.currency)}</strong>
                  </div>
                  <div>
                    <small>Pending</small>
                    <strong>{money(record.balance.pending, record.balance.currency)}</strong>
                  </div>
                </div>
                <p>
                  {record.balance.percentage.toFixed(1)}% recovered · Case age{' '}
                  {record.balance.age_days} days
                </p>
                {user.role !== 'agent' && (
                  <button onClick={() => setModal('payment')}>Record payment</button>
                )}
                <ul>
                  {record.payments.map((p) => (
                    <li key={p.id}>
                      {money(p.amount_cents, p.currency)} ·{' '}
                      {new Date(p.paid_at).toLocaleDateString()} · {p.reference || 'No reference'} ·{' '}
                      {p.author}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="p-section">
              <h3>Connected records</h3>
              {!record.linked.length && (
                <p>No relationships yet. Link a company, contact, opportunity or case.</p>
              )}
              {record.linked.map((row) => (
                <div className="p-linked" key={row.relation_id}>
                  <button onClick={() => onOpen(row.id)}>
                    {row.name}
                    <small>
                      {row.board_name} · {row.label}
                    </small>
                  </button>
                  <button
                    aria-label={`Unlink ${row.name}`}
                    onClick={() =>
                      action(() => api(`/relations/${row.relation_id}`, { method: 'DELETE' }))
                    }
                  >
                    Unlink
                  </button>
                </div>
              ))}
            </section>
            <section className="p-section">
              <h3>Subitems</h3>
              {!record.children.length ? (
                <p>No subitems.</p>
              ) : (
                record.children.map((row) => (
                  <button className="p-list-button" key={row.id} onClick={() => onOpen(row.id)}>
                    {row.name}
                  </button>
                ))
              )}
            </section>
            <section className="p-section">
              <h3>Updates & notes</h3>
              <ActionForm
                label="Post update"
                onSubmit={async (form) => {
                  await api(`/items/${id}/comments`, {
                    method: 'POST',
                    body: {
                      body: form.get('body'),
                      mentions: form.get('mention') ? [form.get('mention')] : [],
                    },
                  });
                  reload();
                }}
              >
                <textarea
                  name="body"
                  aria-label="Write an update"
                  placeholder="Add an update or note…"
                  required
                  maxLength={10000}
                />
                <Field label="Mention a teammate">
                  <select name="mention">
                    <option value="">No mention</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <small>Only teammates with access to this record can be mentioned.</small>
              </ActionForm>
              {record.comments.map((comment) => (
                <article className="p-comment" key={comment.id}>
                  <strong>{comment.author}</strong>
                  <time>{new Date(comment.created_at).toLocaleString()}</time>
                  <p>{comment.body}</p>
                  {comment.user_id === user.id && comment.body !== '[Comment removed]' && (
                    <button
                      onClick={() =>
                        action(() => api(`/comments/${comment.id}`, { method: 'DELETE' }))
                      }
                    >
                      Remove my comment
                    </button>
                  )}
                </article>
              ))}
            </section>
          </>
        )}
      </Dialog>
      {(modal === 'edit' || modal === 'child') && board && (
        <RecordForm
          board={board}
          users={users}
          user={user}
          api={api}
          existing={modal === 'edit' ? record : null}
          parent={modal === 'child' ? record : null}
          onClose={() => setModal('')}
          onSaved={reload}
        />
      )}
      {modal === 'link' && (
        <Dialog title="Link another record" onClose={() => setModal('')}>
          <input
            aria-label="Find records to link"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search record names…"
            autoFocus
          />
          {results.map((row) => (
            <button
              className="p-list-button"
              key={row.id}
              onClick={() =>
                action(async () => {
                  await api(`/items/${id}/relations`, {
                    method: 'POST',
                    body: { target_id: row.id },
                  });
                  setModal('');
                })
              }
            >
              {row.name}
              <small>{row.board_name}</small>
            </button>
          ))}
        </Dialog>
      )}
      {modal === 'payment' && (
        <Dialog title="Record received payment" onClose={() => setModal('')}>
          <p>This logs a payment already received. It does not charge a card or transfer money.</p>
          <ActionForm
            label="Record payment"
            onClose={() => setModal('')}
            onSubmit={async (form) => {
              await api(`/items/${id}/payments`, {
                method: 'POST',
                body: {
                  amount: form.get('amount'),
                  reference: form.get('reference'),
                  paid_at: form.get('paid_at'),
                  idempotency_key: crypto.randomUUID(),
                },
              });
              reload();
            }}
          >
            <Field label={`Amount (${record.balance.currency})`}>
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={record.balance.pending / 100}
                name="amount"
                required
              />
            </Field>
            <Field label="Payment reference">
              <input name="reference" maxLength={200} />
            </Field>
            <Field label="Payment date">
              <input
                name="paid_at"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                max={new Date().toISOString().slice(0, 10)}
              />
            </Field>
          </ActionForm>
        </Dialog>
      )}
    </>
  );
}
