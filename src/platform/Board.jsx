import React, { useEffect, useState } from 'react';
import { ActionForm, Dialog, Field, parse, human } from './components.jsx';
import { RecordForm } from './Record.jsx';
import BoardImport from './Import.jsx';
export default function Board({ id, api, user, bootstrap, onOpen, refreshBootstrap }) {
  const [board, setBoard] = useState(null),
    [data, setData] = useState({ items: [], columns: [], total: 0 }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0),
    [search, setSearch] = useState(''),
    [group, setGroup] = useState(''),
    [owner, setOwner] = useState(''),
    [view, setView] = useState('table'),
    [sort, setSort] = useState('updated_at'),
    [page, setPage] = useState(1),
    [modal, setModal] = useState(''),
    [selected, setSelected] = useState([]),
    [fieldType, setFieldType] = useState('text'),
    [filter, setFilter] = useState(null),
    [hidden, setHidden] = useState([]),
    [dateField, setDateField] = useState('');
  const manager = user.role !== 'agent';
  const reload = () => setTick((v) => v + 1);
  useEffect(() => {
    setPage(1);
    setSelected([]);
    setFilter(null);
    setGroup('');
    setSearch('');
    setDateField('');
    setHidden([]);
  }, [id]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const b = await api(`/boards/${id}`);
        const query = new URLSearchParams({
          search,
          group,
          owner,
          sort,
          page: String(page),
          limit: '50',
          ...(filter ? { filter: JSON.stringify(filter) } : {}),
        });
        const d = await api(`/boards/${id}/items?${query}`);
        if (active) {
          setBoard(b);
          setData(d);
        }
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setBusy(false);
      }
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, search, group, owner, sort, page, tick, filter]);
  const columns = data.columns.filter((c) => !hidden.includes(c.id));
  async function action(fn) {
    try {
      setError('');
      await fn();
      reload();
    } catch (e) {
      setError(e.message);
    }
  }
  const dates =
    board?.columns.filter((c) => ['date', 'datetime', 'timeline'].includes(c.type)) ?? [];
  const activeDate = dateField || dates[0]?.id;
  const dateValue = (row) => {
    const v = row.values[activeDate];
    return typeof v === 'object' ? v?.start : v;
  };
  function applyView(saved) {
    const config = parse(saved.config);
    setView(config.type);
    setSearch(config.search ?? '');
    setGroup(config.group ?? '');
    setOwner(config.owner ?? '');
    setSort(config.sort ?? 'updated_at');
    setFilter(config.filter ?? null);
    setHidden(config.hidden ?? []);
    setDateField(config.dateField ?? '');
    setPage(1);
  }
  function exportView() {
    const query = new URLSearchParams({
      search,
      group,
      owner,
      sort,
      ...(filter ? { filter: JSON.stringify(filter) } : {}),
    });
    window.location.assign(`/api/platform/boards/${id}/export?${query}`);
  }
  if (!board)
    return (
      <section className="card p-panel">
        <p>{error || 'Loading board…'}</p>
      </section>
    );
  return (
    <section className="p-board">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {board.kind === 'custom' ? 'CUSTOM WORKSPACE' : board.kind.toUpperCase()}
          </div>
          <h1>{board.name}</h1>
          <p>{board.description || 'Records, relationships and follow-ups in one place.'}</p>
        </div>
        <button className="p-primary" onClick={() => setModal('record')}>
          + New record
        </button>
      </div>
      <div className="p-toolbar">
        <div className="p-tabs">
          {['table', 'kanban', 'calendar', 'timeline'].map((type) => (
            <button
              key={type}
              className={view === type ? 'active' : ''}
              onClick={() => setView(type)}
            >
              {type[0].toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
        <select
          aria-label="Saved views"
          value=""
          onChange={(e) => applyView(board.views.find((v) => v.id === e.target.value))}
        >
          <option value="">Saved views</option>
          {board.views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.shared ? ' · Shared' : ' · Personal'}
            </option>
          ))}
        </select>
        <button onClick={() => setModal('view')}>Save view</button>
      </div>
      <div className="p-toolbar">
        <input
          aria-label="Search board"
          placeholder="Search records…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Filter group"
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All groups</option>
          {board.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter owner"
          value={owner}
          onChange={(e) => {
            setOwner(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All owners</option>
          {bootstrap.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select aria-label="Sort records" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="updated_at">Recently updated</option>
          <option value="created_at">Recently created</option>
          <option value="name">Name (Z–A)</option>
        </select>
        <button onClick={() => setModal('filter')}>
          {filter ? 'Edit filter ●' : 'Advanced filter'}
        </button>
        {filter && <button onClick={() => setFilter(null)}>Clear filter</button>}
        <button onClick={() => setModal('columns')}>Columns</button>
        <button
          disabled={data.total > 200}
          onClick={exportView}
          title="Export up to 200 filtered records"
        >
          Export CSV
        </button>
        {manager && (
          <>
            <button onClick={() => setModal('field')}>+ Field</button>
            <button onClick={() => setModal('group')}>+ Group</button>
            <button onClick={() => setModal('import')}>Import records</button>
            <button onClick={() => setModal('settings')}>Board settings</button>
          </>
        )}
      </div>
      {error && (
        <p className="p-error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">Refreshing records…</p>}
      {manager && selected.length > 0 && (
        <div className="p-selection">
          <strong>{selected.length} selected</strong>
          <select
            aria-label="Bulk assignment"
            value=""
            onChange={(e) =>
              action(async () => {
                await api(`/boards/${id}/bulk`, {
                  method: 'POST',
                  body: { ids: selected, action: 'update', changes: { owner_id: e.target.value } },
                });
                setSelected([]);
              })
            }
          >
            <option value="">Assign to…</option>
            {bootstrap.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button onClick={() => setModal('archive')}>Archive selected</button>
          <button onClick={() => setSelected([])}>Clear selection</button>
        </div>
      )}
      {!data.items.length ? (
        <div className="p-empty">
          <h2>{search || group || filter ? 'No matching records' : 'Your board is ready'}</h2>
          <p>
            Create a record, import a CSV or JSON file, or convert an existing lead from its detail
            panel.
          </p>
          <button onClick={() => setModal('record')}>Create record</button>
        </div>
      ) : view === 'table' ? (
        <div className="p-table-wrap">
          <table className="p-table">
            <thead>
              <tr>
                {manager && (
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select page"
                      checked={selected.length === data.items.length}
                      onChange={(e) =>
                        setSelected(e.target.checked ? data.items.map((i) => i.id) : [])
                      }
                    />
                  </th>
                )}
                <th>Record</th>
                <th>Group</th>
                <th>Owner</th>
                {columns.map((c) => (
                  <th key={c.id}>{c.name}</th>
                ))}
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id}>
                  {manager && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.name}`}
                        checked={selected.includes(row.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, row.id]
                              : selected.filter((v) => v !== row.id),
                          )
                        }
                      />
                    </td>
                  )}
                  <td>
                    <button className="p-record-link" onClick={() => onOpen(row.id)}>
                      {row.parent_id ? '↳ ' : ''}
                      {row.name}
                    </button>
                  </td>
                  <td>
                    <select
                      aria-label={`Group for ${row.name}`}
                      value={row.group_id}
                      onChange={(e) =>
                        action(() =>
                          api(`/items/${row.id}`, {
                            method: 'PATCH',
                            body: { group_id: e.target.value, version: row.version },
                          }),
                        )
                      }
                    >
                      {board.groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{row.owner_name || 'Unassigned'}</td>
                  {columns.map((c) => (
                    <td key={c.id} title={row.formula_errors[c.id]}>
                      {row.formula_errors[c.id] ? 'Formula error' : human(row.values[c.id])}
                    </td>
                  ))}
                  <td>{new Date(row.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : view === 'kanban' ? (
        <div className="p-kanban">
          {board.groups.map((g) => (
            <section
              key={g.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const recordId = e.dataTransfer.getData('text/plain'),
                  row = data.items.find((i) => i.id === recordId);
                if (row)
                  action(() =>
                    api(`/items/${row.id}`, {
                      method: 'PATCH',
                      body: { group_id: g.id, version: row.version },
                    }),
                  );
              }}
            >
              <h3>
                <i style={{ background: g.color }} />
                {g.name}
                <span>{data.items.filter((i) => i.group_id === g.id).length}</span>
              </h3>
              {data.items
                .filter((i) => i.group_id === g.id)
                .map((row) => (
                  <article
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', row.id)}
                    key={row.id}
                  >
                    <button onClick={() => onOpen(row.id)}>{row.name}</button>
                    <small>{row.owner_name || 'Unassigned'}</small>
                    {columns.slice(0, 3).map((c) => (
                      <p key={c.id}>
                        <span>{c.name}</span>
                        {human(row.values[c.id])}
                      </p>
                    ))}
                    <select
                      aria-label={`Move ${row.name}`}
                      value={row.group_id}
                      onChange={(e) =>
                        action(() =>
                          api(`/items/${row.id}`, {
                            method: 'PATCH',
                            body: { group_id: e.target.value, version: row.version },
                          }),
                        )
                      }
                    >
                      {board.groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </article>
                ))}
            </section>
          ))}
        </div>
      ) : (
        <>
          <Field label="Date field">
            <select value={activeDate ?? ''} onChange={(e) => setDateField(e.target.value)}>
              {dates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          {!dates.length ? (
            <p>Add a date or timeline column to use this view.</p>
          ) : view === 'calendar' ? (
            <Calendar rows={data.items} dateValue={dateValue} onOpen={onOpen} />
          ) : (
            <div className="p-timeline">
              {data.items
                .slice()
                .sort((a, b) =>
                  String(dateValue(a) ?? '').localeCompare(String(dateValue(b) ?? '')),
                )
                .map((row) => (
                  <button key={row.id} onClick={() => onOpen(row.id)}>
                    <time>{human(row.values[activeDate])}</time>
                    <strong>{row.name}</strong>
                    <span>{row.owner_name || 'Unassigned'}</span>
                  </button>
                ))}
            </div>
          )}
        </>
      )}
      <div className="p-pagination">
        <span>
          {data.total} records · Page {page} of {Math.max(1, Math.ceil(data.total / 50))}
          {view !== 'table' ? ' · This view displays the current 50-record page' : ''}
        </span>
        <button disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>
          Previous
        </button>
        <button disabled={page * 50 >= data.total} onClick={() => setPage((v) => v + 1)}>
          Next
        </button>
      </div>
      {modal === 'record' && (
        <RecordForm
          board={board}
          user={user}
          users={bootstrap.users}
          api={api}
          onClose={() => setModal('')}
          onSaved={reload}
        />
      )}
      {modal === 'group' && (
        <Dialog title="Create group" onClose={() => setModal('')}>
          <ActionForm
            onClose={() => setModal('')}
            onSubmit={async (f) => {
              await api(`/boards/${id}/groups`, {
                method: 'POST',
                body: { name: f.get('name'), color: f.get('color') },
              });
              reload();
            }}
          >
            <Field label="Group name">
              <input name="name" required />
            </Field>
            <Field label="Color">
              <input type="color" name="color" defaultValue="#657b4c" />
            </Field>
          </ActionForm>
        </Dialog>
      )}
      {modal === 'field' && (
        <Dialog title="Add custom field" onClose={() => setModal('')}>
          <ActionForm
            onClose={() => setModal('')}
            onSubmit={async (f) => {
              const config = {
                required: f.get('required') === 'on',
                ...(['status', 'dropdown', 'multiselect'].includes(fieldType)
                  ? {
                      options: String(f.get('options'))
                        .split(',')
                        .map((v) => v.trim())
                        .filter(Boolean),
                    }
                  : {}),
                ...(fieldType === 'formula' ? { expression: f.get('expression') } : {}),
                ...(fieldType === 'currency' ? { currency: f.get('currency') } : {}),
              };
              await api(`/boards/${id}/columns`, {
                method: 'POST',
                body: { name: f.get('name'), type: fieldType, config },
              });
              reload();
            }}
          >
            <Field label="Field name">
              <input name="name" required />
            </Field>
            <Field label="Field type">
              <select value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
                {bootstrap.types.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            {['status', 'dropdown', 'multiselect'].includes(fieldType) && (
              <Field label="Options (comma separated)">
                <input name="options" placeholder="New, In progress, Done" required />
              </Field>
            )}
            {fieldType === 'formula' && (
              <Field
                label="Formula"
                hint="Use field names without spaces, e.g. Value * Probability / 100. Formulas cannot execute code."
              >
                <input name="expression" required />
              </Field>
            )}
            {fieldType === 'currency' && (
              <Field label="Currency code">
                <input name="currency" defaultValue="INR" pattern="[A-Z]{3}" />
              </Field>
            )}
            <label>
              <input type="checkbox" name="required" /> Required (empty boards only)
            </label>
          </ActionForm>
        </Dialog>
      )}
      {modal === 'view' && (
        <Dialog title="Save this view" onClose={() => setModal('')}>
          <ActionForm
            onClose={() => setModal('')}
            onSubmit={async (f) => {
              await api(`/boards/${id}/views`, {
                method: 'POST',
                body: {
                  name: f.get('name'),
                  shared: f.get('shared') === 'on',
                  config: { type: view, search, group, owner, sort, filter, hidden, dateField },
                },
              });
              reload();
            }}
          >
            <Field label="View name">
              <input name="name" required />
            </Field>
            {manager && (
              <label>
                <input type="checkbox" name="shared" /> Share with this organization
              </label>
            )}
          </ActionForm>
        </Dialog>
      )}
      {modal === 'columns' && (
        <Dialog title="Visible columns" onClose={() => setModal('')}>
          {board.columns.map((c) => (
            <label className="p-check-row" key={c.id}>
              <input
                type="checkbox"
                checked={!hidden.includes(c.id)}
                onChange={(e) =>
                  setHidden(
                    e.target.checked ? hidden.filter((id) => id !== c.id) : [...hidden, c.id],
                  )
                }
              />
              {c.name}
            </label>
          ))}
          <button onClick={() => setModal('')}>Done</button>
        </Dialog>
      )}
      {modal === 'filter' && (
        <Dialog title="Filter records" onClose={() => setModal('')}>
          <ActionForm
            onClose={() => setModal('')}
            onSubmit={(f) => {
              setFilter({ field: f.get('field'), op: f.get('op'), value: f.get('value') });
              setPage(1);
            }}
          >
            <Field label="Field">
              <select name="field">
                {[
                  { id: 'name', name: 'Name' },
                  ...board.columns.filter((c) => c.type !== 'formula'),
                ].map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Condition">
              <select name="op">
                {['equals', 'not_equals', 'contains', 'greater', 'less', 'empty', 'not_empty'].map(
                  (op) => (
                    <option key={op}>{op}</option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Value">
              <input name="value" />
            </Field>
          </ActionForm>
          <details>
            <summary>Nested AND / OR filters</summary>
            <ActionForm
              label="Apply JSON filter"
              onClose={() => setModal('')}
              onSubmit={(f) => {
                setFilter(JSON.parse(f.get('json')));
                setPage(1);
              }}
            >
              <Field
                label="Filter JSON"
                hint='Example: {"op":"AND","conditions":[{"field":"name","op":"contains","value":"Acme"}]}'
              >
                <textarea
                  name="json"
                  rows={5}
                  defaultValue={JSON.stringify(filter ?? { op: 'AND', conditions: [] }, null, 2)}
                />
              </Field>
            </ActionForm>
          </details>
        </Dialog>
      )}
      {modal === 'archive' && (
        <Dialog title="Archive selected records?" onClose={() => setModal('')}>
          <p>
            {selected.length} records and their subitems will be removed from active views. Their
            history is retained.
          </p>
          <ActionForm
            label="Archive records"
            onClose={() => setModal('')}
            onSubmit={async () => {
              await api(`/boards/${id}/bulk`, {
                method: 'POST',
                body: { ids: selected, action: 'archive', confirm: true },
              });
              setSelected([]);
              reload();
            }}
          />
        </Dialog>
      )}
      {modal === 'settings' && (
        <Dialog title="Board settings" onClose={() => setModal('')}>
          <ActionForm
            onClose={() => setModal('')}
            onSubmit={async (f) => {
              await api(`/boards/${id}`, { method: 'PATCH', body: { name: f.get('name') } });
              reload();
              refreshBootstrap();
            }}
          >
            <Field label="Board name">
              <input name="name" required defaultValue={board.name} />
            </Field>
          </ActionForm>
          <h3>Groups</h3>
          {board.groups.map((g) => (
            <ActionForm
              key={g.id}
              label="Update group"
              onSubmit={async (f) => {
                await api(`/groups/${g.id}`, {
                  method: 'PATCH',
                  body: { name: f.get('name'), position: Number(f.get('position')) },
                });
                reload();
              }}
            >
              <div className="p-row">
                <Field label="Group">
                  <input name="name" defaultValue={g.name} required />
                </Field>
                <Field label="Position">
                  <input name="position" type="number" defaultValue={g.position} />
                </Field>
              </div>
            </ActionForm>
          ))}
        </Dialog>
      )}
      {modal === 'import' && (
        <BoardImport board={board} api={api} onClose={() => setModal('')} onSaved={reload} />
      )}
    </section>
  );
}
function Calendar({ rows, dateValue, onOpen }) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const first = new Date(month.getFullYear(), month.getMonth(), 1),
    offset = (first.getDay() + 6) % 7,
    total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return (
    <>
      <div className="p-toolbar">
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          Previous month
        </button>
        <strong>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</strong>
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          Next month
        </button>
      </div>
      <div className="p-calendar">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <strong key={d}>{d}</strong>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <div key={'blank' + i} />
        ))}
        {Array.from({ length: total }, (_, i) => {
          const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
          return (
            <div key={key}>
              <time>{i + 1}</time>
              {rows
                .filter((row) => String(dateValue(row) ?? '').slice(0, 10) === key)
                .map((row) => (
                  <button key={row.id} onClick={() => onOpen(row.id)}>
                    {row.name}
                  </button>
                ))}
            </div>
          );
        })}
      </div>
      <p>{rows.filter((r) => !dateValue(r)).length} records on this page have no date.</p>
    </>
  );
}
