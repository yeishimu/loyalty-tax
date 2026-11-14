/**
 * Minimal Stripe Checkout over the REST API: create a one-time payment session
 * for the raise kit, then confirm it was paid before the kit is released.
 */
const API = 'https://api.stripe.com/v1';

export const paymentsEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);
export const kitPriceCents = () => {
  const n = Number(process.env.KIT_PRICE_CENTS);
  return Number.isInteger(n) && n >= 50 ? n : 2500;
};

async function stripe(path: string, params?: Record<string, string>): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method: params ? 'POST' : 'GET',
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(params ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? new URLSearchParams(params).toString() : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `Stripe returned ${res.status}`);
  return data;
}

export const watchPriceCents = () => {
  const n = Number(process.env.WATCH_PRICE_CENTS);
  return Number.isInteger(n) && n >= 50 ? n : 500;
};

/** One-time payment for the raise kit, bound to one job at one employer. */
export async function createKitCheckout(args: { origin: string; fingerprint: string; description: string }): Promise<string> {
  const session = await stripe('/checkout/sessions', {
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(kitPriceCents()),
    'line_items[0][price_data][product_data][name]': 'Loyalty Tax raise kit',
    'line_items[0][price_data][product_data][description]': args.description.slice(0, 240),
    'metadata[kind]': 'kit',
    'metadata[fingerprint]': args.fingerprint,
    success_url: `${args.origin}/?paid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${args.origin}/?cancelled=1`,
  });
  return session.url as string;
}

/** Monthly subscription for watch alerts. The watch itself travels in the session metadata. */
export async function createWatchCheckout(args: { origin: string; email: string; watch: Record<string, string> }): Promise<string> {
  const params: Record<string, string> = {
    mode: 'subscription',
    customer_email: args.email,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(watchPriceCents()),
    'line_items[0][price_data][recurring][interval]': 'month',
    'line_items[0][price_data][product_data][name]': 'Loyalty Tax watch',
    'line_items[0][price_data][product_data][description]': 'An email when your employer posts your role with a pay range.',
    'metadata[kind]': 'watch',
    success_url: `${args.origin}/?watching={CHECKOUT_SESSION_ID}`,
    cancel_url: `${args.origin}/?cancelled=1`,
  };
  for (const [k, v] of Object.entries(args.watch)) params[`metadata[${k}]`] = v.slice(0, 450);
  const session = await stripe('/checkout/sessions', params);
  return session.url as string;
}

const SESSION_ID = /^cs_[A-Za-z0-9_]+$/;

/** True only when the session is paid and was bought for this exact job. */
export async function isKitPaid(sessionId: string, fingerprint: string): Promise<boolean> {
  if (!SESSION_ID.test(sessionId)) return false;
  const session = await stripe(`/checkout/sessions/${sessionId}`);
  return session?.metadata?.kind === 'kit' && session?.payment_status === 'paid' && session?.metadata?.fingerprint === fingerprint;
}

/** Returns the watch details from a paid subscription session, or null. */
export async function paidWatch(sessionId: string): Promise<Record<string, string> | null> {
  if (!SESSION_ID.test(sessionId)) return null;
  const session = await stripe(`/checkout/sessions/${sessionId}`);
  if (session?.metadata?.kind !== 'watch' || session?.status !== 'complete' || session?.payment_status !== 'paid') return null;
  return session.metadata as Record<string, string>;
}
