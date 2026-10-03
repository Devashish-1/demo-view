import test from 'node:test';
import assert from 'node:assert/strict';
import { callbackPreset } from '../src/time.js';
import {
  normalizePhone,
  businessMatches,
  cleanLead,
  passwordHash,
  passwordMatches,
  validateDisposition,
  maskPhone,
} from '../server/domain.js';

test('phone normalization handles Indian prefixes and formatting without truncating foreign numbers', () => {
  for (const input of ['9876543210', '+91 (98765) 43210', '09876543210', '91-98765-43210'])
    assert.equal(normalizePhone(input), '9876543210');
  for (const input of ['12345', '+1 9876543210', '+44 9876543210', '9876543210123', '1234567890'])
    assert.throws(() => normalizePhone(input));
  assert.equal(maskPhone('9876543210'), '98765•••••');
});
test('entity matching tolerates small spelling differences while rejecting unrelated businesses', () => {
  assert.ok(businessMatches('Apollo Health Care', 'apollo healthcare'));
  assert.ok(businessMatches('Horizon Trading', 'Horizons Trading'));
  assert.equal(businessMatches('Metro Hospital', 'Bright Electricals'), false);
  assert.equal(businessMatches('AB', 'AC'), false);
});
test('lead validation canonicalizes contact identity', () => {
  const lead = cleanLead({
    business: ' Acme ',
    phone: '+91 9876543210',
    city: ' Mumbai ',
    email: 'HELLO@EXAMPLE.COM',
  });
  assert.equal(lead.business, 'Acme');
  assert.equal(lead.email, 'hello@example.com');
  assert.equal(lead.city, 'Mumbai');
  assert.throws(() => cleanLead({ business: '', phone: '9876543210', city: 'Mumbai' }));
});
test('password hashes have unique salts and verify without storing plaintext', () => {
  const a = passwordHash('a-long-test-password'),
    b = passwordHash('a-long-test-password');
  assert.notEqual(a, b);
  assert.ok(passwordMatches('a-long-test-password', a));
  assert.equal(passwordMatches('wrong', a), false);
});
test('mandatory activity validation rejects short notes, unknown outcomes and past callbacks', () => {
  assert.throws(() => validateDisposition({ disposition: 'Interested', notes: 'hello' }));
  assert.throws(() =>
    validateDisposition({ disposition: 'Unknown', notes: 'Meaningful notes here.' }),
  );
  assert.throws(() =>
    validateDisposition({
      disposition: 'Callback Scheduled',
      notes: 'Call again tomorrow.',
      callback_at: '2020-01-01',
    }),
  );
  assert.doesNotThrow(() =>
    validateDisposition({ disposition: 'Interested', notes: 'Prospect wants a proposal.' }),
  );
});

test('quick callback presets preserve local time across month and year boundaries', () => {
  assert.equal(callbackPreset(true, new Date(2026, 9, 31, 23, 30)), '2026-11-01T10:00');
  assert.equal(callbackPreset(true, new Date(2026, 11, 31, 23, 30)), '2027-01-01T10:00');
  assert.equal(callbackPreset(false, new Date(2026, 9, 3, 23, 30)), '2026-10-04T00:30');
});
