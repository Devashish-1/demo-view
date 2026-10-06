import React, { useState } from 'react';
import Papa from 'papaparse';
import { Dialog, ActionForm, Field } from './components.jsx';

export default function BoardImport({ board, api, onClose, onSaved }) {
  const [rows, setRows] = useState([]),
    [headers, setHeaders] = useState([]),
    [mapping, setMapping] = useState({}),
    [error, setError] = useState(''),
    [mapped, setMapped] = useState(false);
  const fields = [
    { id: 'name', name: 'Record name', type: 'text' },
    ...board.columns.filter((c) => c.type !== 'formula'),
  ];
  function mappedRows() {
    if (mapped) return rows;
    if (!mapping.name) throw new Error('Map the record name column.');
    return rows.map((row, index) => {
      const values = {};
      for (const field of fields.slice(1)) {
        if (!mapping[field.id]) continue;
        let value = row[mapping[field.id]];
        if (value === '' || value == null) continue;
        if (field.type === 'checkbox') {
          if (!['true', 'false', 'yes', 'no', '1', '0'].includes(String(value).toLowerCase()))
            throw new Error(`Row ${index + 1}: ${field.name} must be true/false or yes/no.`);
          value = ['true', 'yes', '1'].includes(String(value).toLowerCase());
        }
        if (field.type === 'multiselect')
          value = String(value)
            .split('|')
            .map((v) => v.trim())
            .filter(Boolean);
        if (field.type === 'timeline') {
          try {
            value = JSON.parse(value);
          } catch {
            throw new Error(`Row ${index + 1}: use a JSON start/end object for ${field.name}.`);
          }
        }
        values[field.id] = value;
      }
      return { name: String(row[mapping.name] ?? '').trim(), values };
    });
  }
  let preview = [],
    previewError = '';
  if (rows.length) {
    try {
      preview = mappedRows();
    } catch (e) {
      previewError = e.message;
    }
  }
  return (
    <Dialog title="Import board records" onClose={onClose}>
      <p>
        Choose CSV or JSON, map columns, then review the first ten rows. Up to 200 records and 800
        KB per batch. All rows must pass validation before anything is saved.
      </p>
      <Field label="Import file">
        <input
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={async (e) => {
            setRows([]);
            setError('');
            try {
              const file = e.target.files[0];
              if (!file) return;
              if (file.size > 800000) throw new Error('Maximum file size is 800 KB.');
              const text = await file.text();
              let next;
              if (file.name.toLowerCase().endsWith('.json')) next = JSON.parse(text);
              else {
                const result = Papa.parse(text, {
                  header: true,
                  skipEmptyLines: 'greedy',
                  transformHeader: (h) => h.trim(),
                });
                if (result.errors.length) throw new Error(result.errors[0].message);
                next = result.data;
              }
              if (
                !Array.isArray(next) ||
                !next.length ||
                next.length > 200 ||
                next.some((r) => !r || typeof r !== 'object' || Array.isArray(r))
              )
                throw new Error('Choose 1–200 object rows.');
              const isMapped = next.every(
                (r) => typeof r.name === 'string' && r.values && typeof r.values === 'object',
              );
              const keys = [...new Set(next.flatMap(Object.keys))];
              setHeaders(keys);
              setMapped(isMapped);
              setRows(next);
              setMapping(
                Object.fromEntries(
                  fields.map((f) => [
                    f.id,
                    keys.find(
                      (k) =>
                        k.toLowerCase() === f.name.toLowerCase() ||
                        (f.id === 'name' && k.toLowerCase() === 'name'),
                    ) || '',
                  ]),
                ),
              );
            } catch (e) {
              setError(e.message);
            }
          }}
        />
      </Field>
      {!!rows.length && !mapped && (
        <div className="p-fields">
          {fields.map((f) => (
            <Field key={f.id} label={f.name}>
              <select
                value={mapping[f.id] || ''}
                onChange={(e) => setMapping({ ...mapping, [f.id]: e.target.value })}
              >
                <option value="">{f.id === 'name' ? 'Choose a column' : 'Skip column'}</option>
                {headers.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      )}
      {(error || previewError) && (
        <p role="alert" className="p-error">
          {error || previewError}
        </p>
      )}
      {!!preview.length && (
        <>
          <p>
            {preview.length} records ready for server validation. New records enter the first group,
            unassigned.
          </p>
          <div className="p-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Mapped values</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td>{r.name || '(Missing name)'}</td>
                    <td>
                      {fields
                        .slice(1)
                        .filter((f) => r.values?.[f.id] != null)
                        .map((f) => `${f.name}: ${JSON.stringify(r.values[f.id])}`)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <ActionForm
        label="Validate and import"
        onClose={onClose}
        onSubmit={async () => {
          if (!rows.length) throw new Error('Choose an import file first.');
          await api(`/boards/${board.id}/import`, { method: 'POST', body: { rows: mappedRows() } });
          onSaved();
        }}
      />
    </Dialog>
  );
}
