export const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
export const json = (text, fallback = {}) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};
export const stamp = () => new Date().toISOString();
export const types = [
  'text',
  'longtext',
  'number',
  'currency',
  'percentage',
  'date',
  'datetime',
  'status',
  'dropdown',
  'multiselect',
  'checkbox',
  'email',
  'phone',
  'url',
  'rating',
  'formula',
  'timeline',
];
export function name(value, label = 'Name') {
  if (typeof value !== 'string' || !value.trim() || value.length > 180)
    fail(`${label} is required (maximum 180 characters).`);
  return value.trim();
}
export function validateValues(columns, values, old = {}) {
  if (!values || typeof values !== 'object' || Array.isArray(values))
    fail('Fields must be an object.');
  const output = { ...old };
  for (const [key, value] of Object.entries(values)) {
    const column = columns.find((c) => c.id === key);
    if (!column) fail('Unknown field.');
    if (column.type === 'formula') fail('Formula fields are calculated automatically.');
    const config = json(column.config);
    if (value === null || value === '') {
      output[key] = null;
      continue;
    }
    if (['number', 'currency', 'percentage', 'rating'].includes(column.type)) {
      const numeric = Number(value);
      if (typeof value === 'boolean' || !Number.isFinite(numeric) || Math.abs(numeric) > 1e12)
        fail(`${column.name}: enter a finite number.`);
      if (column.type === 'currency' && numeric < 0)
        fail(`${column.name}: amount cannot be negative.`);
      if (column.type === 'percentage' && (numeric < 0 || numeric > 100))
        fail('Percentage must be between 0 and 100.');
      if (column.type === 'rating' && (numeric < 0 || numeric > 5))
        fail('Rating must be between 0 and 5.');
      output[key] = numeric;
    } else if (column.type === 'checkbox') {
      if (typeof value !== 'boolean') fail('Checkbox must be true or false.');
      output[key] = value;
    } else if (column.type === 'multiselect') {
      if (
        !Array.isArray(value) ||
        value.length > 30 ||
        value.some((v) => !config.options?.includes(v))
      )
        fail('Choose valid options.');
      output[key] = [...new Set(value)];
    } else if (column.type === 'timeline') {
      if (
        !value.start ||
        !value.end ||
        !Number.isFinite(Date.parse(value.start)) ||
        !Number.isFinite(Date.parse(value.end)) ||
        value.start > value.end
      )
        fail('Timeline needs valid start and end dates.');
      output[key] = { start: value.start, end: value.end };
    } else {
      if (typeof value !== 'string' || value.length > 10000) fail(`${column.name}: invalid text.`);
      if (['status', 'dropdown'].includes(column.type) && !config.options?.includes(value))
        fail(`${column.name}: choose a listed option.`);
      if (['date', 'datetime'].includes(column.type) && !Number.isFinite(Date.parse(value)))
        fail(`${column.name}: invalid date.`);
      if (column.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        fail('Enter a valid email.');
      if (column.type === 'url' && !/^https?:\/\//i.test(value))
        fail('URLs must begin with http:// or https://.');
      output[key] = value.trim();
    }
  }
  for (const column of columns)
    if (
      json(column.config).required &&
      column.type !== 'formula' &&
      (output[column.id] === null || output[column.id] === undefined || output[column.id] === '')
    )
      fail(`${column.name} is required.`);
  return output;
}

// Bounded expression parser. No eval, Function constructor, member access or arbitrary code.
export function formula(expression, fields = {}) {
  if (typeof expression !== 'string' || expression.length > 1000) fail('Formula is too long.');
  const tokens = [];
  let offset = 0;
  const token =
    /\s*(\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*|>=|<=|==|!=|[+\-*/(),<>])/y;
  while (offset < expression.length) {
    if (!expression.slice(offset).trim()) break;
    token.lastIndex = offset;
    const match = token.exec(expression);
    if (!match) fail('Unsupported formula syntax.');
    tokens.push(match[1]);
    offset = token.lastIndex;
    if (tokens.length > 250) fail('Formula is too complex.');
  }
  let index = 0,
    depth = 0;
  const funcs = {
    SUM: (...a) => a.reduce((s, v) => s + Number(v), 0),
    AVG: (...a) => (a.length ? a.reduce((s, v) => s + Number(v), 0) / a.length : 0),
    MIN: Math.min,
    MAX: Math.max,
    COUNT: (...a) => a.filter((v) => v !== null && v !== '').length,
    IF: (v, a, b) => (v ? a : b),
    AND: (...a) => a.every(Boolean),
    OR: (...a) => a.some(Boolean),
    NOT: (v) => !v,
    ROUND: (v, n = 0) => {
      if (Math.abs(n) > 10) fail('Invalid rounding precision.');
      return Math.round(Number(v) * 10 ** n) / 10 ** n;
    },
    ABS: Math.abs,
    CONCAT: (...a) => a.join(''),
    TEXT: String,
    DATE: (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10),
    DAYS: (a, b) => (Date.parse(a) - Date.parse(b)) / 86400000,
  };
  function atom() {
    if (++depth > 24) fail('Formula nesting limit exceeded.');
    const t = tokens[index++];
    let value;
    if (t === '-') value = -Number(atom());
    else if (t === '(') {
      value = expr(0);
      if (tokens[index++] !== ')') fail('Missing closing parenthesis.');
    } else if (/^\d/.test(t ?? '')) value = Number(t);
    else if (t?.startsWith('"')) value = JSON.parse(t);
    else if (/^[A-Za-z_]/.test(t ?? '')) {
      if (tokens[index] === '(') {
        index++;
        const args = [];
        if (tokens[index] !== ')') {
          do {
            args.push(expr(0));
            if (tokens[index] !== ',') break;
            index++;
          } while (true);
        }
        if (tokens[index++] !== ')' || !Object.hasOwn(funcs, t.toUpperCase()))
          fail('Unknown function or invalid arguments.');
        value = funcs[t.toUpperCase()](...args);
      } else if (Object.hasOwn(fields, t)) value = fields[t] ?? 0;
      else if (t === 'TRUE' || t === 'FALSE') value = t === 'TRUE';
      else fail(`Unknown formula field: ${t}`);
    } else fail('Invalid formula.');
    depth--;
    return value;
  }
  const precedence = {
    '==': 1,
    '!=': 1,
    '>': 1,
    '<': 1,
    '>=': 1,
    '<=': 1,
    '+': 2,
    '-': 2,
    '*': 3,
    '/': 3,
  };
  function expr(min) {
    let value = atom();
    while (Object.hasOwn(precedence, tokens[index]) && precedence[tokens[index]] >= min) {
      const op = tokens[index++],
        right = expr(precedence[op] + 1);
      switch (op) {
        case '+':
          value = Number(value) + Number(right);
          break;
        case '-':
          value -= Number(right);
          break;
        case '*':
          value *= Number(right);
          break;
        case '/':
          if (Number(right) === 0) fail('Division by zero.');
          value /= Number(right);
          break;
        case '==':
          value = value === right;
          break;
        case '!=':
          value = value !== right;
          break;
        case '>':
          value = value > right;
          break;
        case '<':
          value = value < right;
          break;
        case '>=':
          value = value >= right;
          break;
        case '<=':
          value = value <= right;
      }
    }
    return value;
  }
  const result = expr(0);
  if (index !== tokens.length || (typeof result === 'number' && !Number.isFinite(result)))
    fail('Invalid formula result.');
  return result;
}
export function computed(columns, values) {
  const fields = Object.create(null),
    result = { ...values },
    errors = {};
  for (const col of columns)
    if (col.type !== 'formula')
      fields[col.name.replace(/[^A-Za-z0-9_]/g, '')] = values[col.id] ?? 0;
  for (const col of columns)
    if (col.type === 'formula') {
      try {
        result[col.id] = formula(json(col.config).expression, fields);
      } catch (error) {
        result[col.id] = null;
        errors[col.id] = error.message;
      }
    }
  return { values: result, formula_errors: errors };
}
export function matches(filter, values, depth = 0) {
  if (!filter || !Object.keys(filter).length) return true;
  if (depth > 8) fail('Filter nesting limit exceeded.');
  if (filter.conditions) {
    if (
      !['AND', 'OR'].includes(filter.op) ||
      !Array.isArray(filter.conditions) ||
      filter.conditions.length > 20
    )
      fail('Invalid condition group.');
    const results = filter.conditions.map((f) => matches(f, values, depth + 1));
    return filter.op === 'OR' ? results.some(Boolean) : results.every(Boolean);
  }
  const left = values[filter.field],
    right = filter.value;
  switch (filter.op) {
    case 'equals':
      return String(left ?? '') === String(right ?? '');
    case 'not_equals':
      return String(left ?? '') !== String(right ?? '');
    case 'contains':
      return String(left ?? '')
        .toLowerCase()
        .includes(String(right ?? '').toLowerCase());
    case 'greater':
      return Number(left) > Number(right);
    case 'less':
      return Number(left) < Number(right);
    case 'empty':
      return left == null || left === '';
    case 'not_empty':
      return left != null && left !== '';
    default:
      fail('Unsupported condition.');
  }
}
export function filterSQL(filter, columns, kind, args, depth = 0) {
  if (!filter || !Object.keys(filter).length) return '1=1';
  if (depth > 8) fail('Filter nesting limit exceeded.');
  if (filter.conditions) {
    if (
      !['AND', 'OR'].includes(filter.op) ||
      !Array.isArray(filter.conditions) ||
      filter.conditions.length > 20
    )
      fail('Invalid condition group.');
    return (
      '(' +
      (filter.conditions
        .map((f) => filterSQL(f, columns, kind, args, depth + 1))
        .join(` ${filter.op} `) || '1=1') +
      ')'
    );
  }
  let expr,
    numeric = false;
  if (['name', 'owner_id', 'group_id', 'created_at', 'updated_at'].includes(filter.field))
    expr = `i.${filter.field}`;
  else {
    const c = columns.find((c) => c.id === filter.field);
    if (!c || c.type === 'formula' || !/^[a-zA-Z0-9_-]+$/.test(c.id))
      fail('Unsupported filter field.');
    expr =
      kind === 'sqlite'
        ? `json_extract(i.values_json, '$."${c.id}"')`
        : `(i.values_json::jsonb ->> '${c.id}')`;
    if (['number', 'currency', 'percentage', 'rating'].includes(c.type)) {
      numeric = true;
      expr = `CAST(${expr} AS NUMERIC)`;
    }
  }
  if (filter.op === 'empty') return `(${expr} IS NULL OR CAST(${expr} AS TEXT)='')`;
  if (filter.op === 'not_empty') return `(${expr} IS NOT NULL AND CAST(${expr} AS TEXT)<>'')`;
  const ops = { equals: '=', not_equals: '<>', greater: '>', less: '<' };
  if (filter.op === 'contains') {
    args.push(
      '%' +
        String(filter.value ?? '')
          .toLowerCase()
          .replace(/[\\%_]/g, '\\$&') +
        '%',
    );
    return `LOWER(CAST(${expr} AS TEXT)) LIKE ? ESCAPE '\\'`;
  }
  if (!ops[filter.op]) fail('Unsupported filter operator.');
  if (
    numeric &&
    (filter.value === '' || filter.value == null || !Number.isFinite(Number(filter.value)))
  )
    fail('Enter a valid number for this filter.');
  args.push(numeric ? Number(filter.value) : (filter.value ?? ''));
  return `${expr} ${ops[filter.op]} ?`;
}
