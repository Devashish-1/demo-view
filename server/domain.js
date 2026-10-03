import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export const STATUSES = [
  'Pending',
  'Interested',
  'Callback Scheduled',
  'Not Interested',
  'Unanswered',
  'Closed Won',
];
export function normalizePhone(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits))
    throw Object.assign(
      new Error('Enter a valid 10-digit Indian mobile number, optionally prefixed with +91.'),
      { status: 400 },
    );
  return digits;
}
export const maskPhone = (phone) => phone.slice(0, 5) + '•••••';
export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password, hash) {
  try {
    const [salt, key] = hash.split(':');
    return timingSafeEqual(Buffer.from(key, 'hex'), scryptSync(password, salt, 64));
  } catch {
    return false;
  }
}
export function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = old;
    }
  }
  return row[b.length];
}
export const entityKey = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
export function businessMatches(a, b) {
  a = entityKey(a);
  b = entityKey(b);
  return a.length > 2 && b.length > 2 && distance(a, b) / Math.max(a.length, b.length) <= 0.18;
}
export function cleanLead(data) {
  const lead = {};
  for (const key of ['business', 'contact', 'email', 'city', 'category', 'source'])
    lead[key] = String(data[key] ?? '')
      .trim()
      .slice(0, key === 'business' ? 180 : 120);
  lead.phone = normalizePhone(data.phone);
  lead.email = lead.email.toLowerCase();
  if (!lead.business || !lead.city)
    throw Object.assign(new Error('Business name and city are required.'), { status: 400 });
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email))
    throw Object.assign(new Error('Email address is invalid.'), { status: 400 });
  lead.category ||= 'Other';
  lead.source ||= 'Manual';
  return lead;
}
export function validateDisposition(data) {
  if (!STATUSES.includes(data.disposition))
    throw Object.assign(new Error('Select a valid disposition.'), { status: 400 });
  if (String(data.notes ?? '').trim().length < 10)
    throw Object.assign(new Error('Call notes must contain at least 10 characters.'), {
      status: 400,
    });
  if (String(data.notes).length > 5000)
    throw Object.assign(new Error('Call notes are too long.'), { status: 400 });
  if (
    data.disposition === 'Callback Scheduled' &&
    (!data.callback_at ||
      !Number.isFinite(Date.parse(data.callback_at)) ||
      Date.parse(data.callback_at) <= Date.now())
  )
    throw Object.assign(new Error('Choose a future callback date and time.'), { status: 400 });
}
