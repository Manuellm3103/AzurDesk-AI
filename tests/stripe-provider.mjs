import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import {
  verifyWebhookSignature,
  translateStripeEvent,
  isStripeConfigured
} from '../src/services/stripeProviderService.js';

test('verifyWebhookSignature: rejects missing signature', () => {
  assert.throws(() => verifyWebhookSignature('body', null, 'whsec_xxx'), /Missing/);
});

test('verifyWebhookSignature: rejects malformed signature', () => {
  assert.throws(() => verifyWebhookSignature('body', 'not-a-signature', 'whsec_xxx'), /Malformed/);
});

test('verifyWebhookSignature: rejects missing secret', () => {
  assert.throws(() => verifyWebhookSignature('body', 't=1,v1=abc', ''), /STRIPE_WEBHOOK_SECRET/);
});

test('verifyWebhookSignature: rejects bad signature (wrong secret)', () => {
  const body = '{"id":"evt_1","type":"invoice.paid"}';
  const ts = Math.floor(Date.now() / 1000);
  const bad = createHmac('sha256', 'wrong_secret').update(`${ts}.${body}`).digest('hex');
  const header = `t=${ts},v1=${bad}`;
  assert.throws(() => verifyWebhookSignature(body, header, 'good_secret'), /Invalid/);
});

test('verifyWebhookSignature: accepts valid signature and returns event', () => {
  const body = '{"id":"evt_1","type":"invoice.paid","data":{"object":{"id":"in_1"}}}';
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', 'whsec_test').update(`${ts}.${body}`).digest('hex');
  const header = `t=${ts},v1=${sig}`;
  const event = verifyWebhookSignature(body, header, 'whsec_test');
  assert.equal(event.id, 'evt_1');
  assert.equal(event.type, 'invoice.paid');
});

test('verifyWebhookSignature: protects against timing attacks (constant time compare)', () => {
  // Both signatures are valid length hex; one matches, one doesn't. We can't
  // directly measure timing, but we can verify the function still rejects
  // a same-length but wrong signature.
  const body = 'x';
  const ts = 1234567890;
  const good = createHmac('sha256', 'secret').update(`${ts}.${body}`).digest('hex');
  const wrong = '0'.repeat(good.length);
  const header = `t=${ts},v1=${wrong}`;
  assert.throws(() => verifyWebhookSignature(body, header, 'secret'), /Invalid/);
});

test('translateStripeEvent: invoice.paid -> internal event', () => {
  const out = translateStripeEvent({
    type: 'invoice.paid',
    data: { object: { id: 'in_xyz', amount_paid: 9900 } }
  });
  assert.equal(out.type, 'invoice.paid');
  assert.equal(out.data.invoice_id, 'in_xyz');
});

test('translateStripeEvent: subscription.deleted -> cancelled', () => {
  const out = translateStripeEvent({
    type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_123' } }
  });
  assert.equal(out.type, 'customer.subscription.cancelled');
  assert.equal(out.data.subscription_id, 'sub_123');
});

test('translateStripeEvent: subscription.updated -> updated with metadata', () => {
  const out = translateStripeEvent({
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_1', status: 'active', metadata: { plan_id: 'pro', tenant_id: 't1' } } }
  });
  assert.equal(out.type, 'customer.subscription.updated');
  assert.equal(out.data.subscription_id, 'sub_1');
  assert.equal(out.data.plan_id, 'pro');
});

test('translateStripeEvent: checkout.session.completed -> internal with tenant_id', () => {
  const out = translateStripeEvent({
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', subscription: 'sub_1', customer: 'cus_1', metadata: { tenant_id: 't1' } } }
  });
  assert.equal(out.data.subscription_id, 'sub_1');
  assert.equal(out.data.customer_id, 'cus_1');
  assert.equal(out.data.tenant_id, 't1');
});

test('translateStripeEvent: unknown event type passes through', () => {
  const out = translateStripeEvent({ type: 'something.weird', data: { object: {} } });
  assert.equal(out.type, 'something.weird');
});

test('isStripeConfigured: returns false when no key', () => {
  const prev = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  assert.equal(isStripeConfigured(), false);
  if (prev) process.env.STRIPE_SECRET_KEY = prev;
});
