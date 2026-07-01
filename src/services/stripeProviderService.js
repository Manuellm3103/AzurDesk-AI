// Stripe provider for billingV2Service.
// Activated when BILLING_PROVIDER=stripe AND STRIPE_SECRET_KEY env var is set.
// Falls back to mock if stripe SDK is not installed or the secret is missing.
//
// In production:
//   1. npm install stripe
//   2. export BILLING_PROVIDER=stripe STRIPE_SECRET_KEY=sk_live_xxx
//   3. set STRIPE_WEBHOOK_SECRET from the Stripe dashboard endpoint settings
//
// We lazy-import stripe so the dependency is optional for mock-only deployments.

import { createHmac, timingSafeEqual } from 'crypto';

let _stripe = null;
async function getStripe() {
  if (_stripe) return _stripe;
  try {
    const { default: Stripe } = await import('stripe');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-09-30.clover' });
    return _stripe;
  } catch (e) {
    throw new Error(`Stripe SDK not available: ${e.message}. Run: npm install stripe`);
  }
}

/**
 * Verify a Stripe webhook signature. Returns the parsed event or throws.
 * The header is "Stripe-Signature: t=...,v1=...". We implement HMAC-SHA256
 * verification here so we don't require the stripe SDK just for verification.
 */
export function verifyWebhookSignature(rawBody, signatureHeader, secret = process.env.STRIPE_WEBHOOK_SECRET) {
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  if (!signatureHeader) throw new Error('Missing Stripe-Signature header');
  const parts = signatureHeader.split(',').reduce((acc, p) => {
    const [k, v] = p.split('=');
    acc[k] = v;
    return acc;
  }, {});
  if (!parts.t || !parts.v1) throw new Error('Malformed Stripe-Signature');
  const signed = `${parts.t}.${rawBody}`;
  const expected = createHmac('sha256', secret).update(signed).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(parts.v1, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Invalid Stripe-Signature');
  return JSON.parse(rawBody);
}

/**
 * Create a Stripe Checkout Session for a plan upgrade.
 * Returns the session URL the user should be redirected to.
 */
export async function createCheckoutSession({ planId, customerEmail, successUrl, cancelUrl, tenantId }) {
  const stripe = await getStripe();
  const PRICE_IDS = {
    pro: process.env.STRIPE_PRICE_ID_PRO
  };
  if (!PRICE_IDS[planId]) throw new Error(`No Stripe price ID configured for plan ${planId}`);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: PRICE_IDS[planId], quantity: 1 }],
    customer_email: customerEmail,
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: tenantId,
    metadata: { plan_id: planId, tenant_id: tenantId }
  });
  return { id: session.id, url: session.url };
}

/**
 * Create a Stripe Customer Portal session so users can manage their
 * subscription, update payment method, view invoices, cancel.
 */
export async function createPortalSession({ customerId, returnUrl }) {
  const stripe = await getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  });
  return { url: session.url };
}

/**
 * Cancel a Stripe subscription at period end.
 */
export async function cancelStripeSubscription(subscriptionId) {
  const stripe = await getStripe();
  const sub = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  return { id: sub.id, status: sub.status, cancel_at_period_end: sub.cancel_at_period_end };
}

/**
 * Translate a Stripe event to our internal event shape so billingV2Service
 * can process it via handleWebhook().
 */
export function translateStripeEvent(stripeEvent) {
  switch (stripeEvent.type) {
    case 'invoice.paid': {
      const inv = stripeEvent.data.object;
      return { type: 'invoice.paid', data: { invoice_id: inv.id } };
    }
    case 'customer.subscription.deleted':
    case 'customer.subscription.cancelled': {
      const sub = stripeEvent.data.object;
      return { type: 'customer.subscription.cancelled', data: { subscription_id: sub.id } };
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.created': {
      const sub = stripeEvent.data.object;
      return {
        type: 'customer.subscription.updated',
        data: { subscription_id: sub.id, status: sub.status, plan_id: sub.metadata?.plan_id || null }
      };
    }
    case 'checkout.session.completed': {
      const session = stripeEvent.data.object;
      return {
        type: 'checkout.session.completed',
        data: { session_id: session.id, subscription_id: session.subscription, customer_id: session.customer, tenant_id: session.metadata?.tenant_id }
      };
    }
    default:
      return { type: stripeEvent.type, data: {} };
  }
}

export function isStripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}
