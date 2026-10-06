import React, { useEffect, useRef, useState } from 'react';
export const parse = (v, f = {}) => {
  try {
    return JSON.parse(v);
  } catch {
    return f;
  }
};
export const money = (cents, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(
    Number(cents || 0) / 100,
  );
export const human = (v) =>
  v == null
    ? '—'
    : typeof v === 'boolean'
      ? v
        ? 'Yes'
        : 'No'
      : Array.isArray(v)
        ? v.join(', ')
        : typeof v === 'object'
          ? `${v.start ?? ''} → ${v.end ?? ''}`
          : String(v);
export function Field({ label, children, hint }) {
  return (
    <label className="p-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Dialog({ title, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="p-dialog" onCancel={onClose} aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close dialog">
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function ActionForm({ onSubmit, children, label = 'Save', onClose }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
          await onSubmit(new FormData(e.currentTarget));
          onClose?.();
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && (
        <p className="p-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <button className="p-primary" disabled={busy}>
          {busy ? 'Saving…' : label}
        </button>
        {onClose && (
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        )}
      </footer>
    </form>
  );
}
export function ValueInput({ column, value, onChange, disabled = false }) {
  const c = parse(column.config),
    type = column.type,
    id = `p-${column.id}`;
  if (type === 'formula') return null;
  let input;
  if (type === 'checkbox')
    input = (
      <input
        id={id}
        type="checkbox"
        checked={!!value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  else if (['status', 'dropdown'].includes(type))
    input = (
      <select
        id={id}
        value={value ?? ''}
        disabled={disabled}
        required={!!c.required}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose…</option>
        {(c.options ?? []).map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    );
  else if (type === 'multiselect')
    input = (
      <select
        id={id}
        multiple
        value={value ?? []}
        disabled={disabled}
        onChange={(e) => onChange([...e.target.selectedOptions].map((v) => v.value))}
      >
        {(c.options ?? []).map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    );
  else if (type === 'longtext')
    input = (
      <textarea
        id={id}
        value={value ?? ''}
        disabled={disabled}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  else if (type === 'timeline')
    input = (
      <div className="p-row">
        <input
          aria-label={`${column.name} start`}
          type="date"
          value={value?.start ?? ''}
          onChange={(e) => onChange({ ...value, start: e.target.value })}
        />
        <input
          aria-label={`${column.name} end`}
          type="date"
          value={value?.end ?? ''}
          onChange={(e) => onChange({ ...value, end: e.target.value })}
        />
      </div>
    );
  else
    input = (
      <input
        id={id}
        type={
          ['number', 'currency', 'percentage', 'rating'].includes(type)
            ? 'number'
            : type === 'datetime'
              ? 'datetime-local'
              : ['date', 'email', 'url'].includes(type)
                ? type
                : 'text'
        }
        step={type === 'currency' ? '0.01' : 'any'}
        value={value ?? ''}
        disabled={disabled}
        required={!!c.required}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  return (
    <div className="p-field">
      <label htmlFor={id}>
        {column.name}
        {c.required ? ' *' : ''}
      </label>
      {input}
    </div>
  );
}
