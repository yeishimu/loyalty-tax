import { runCheck } from '@/lib/check';
import { body, fail, json, limited } from '@/lib/http';
import { paidWatch, paymentsEnabled } from '@/lib/stripe';
import { deleteWatch, saveWatch, watchEnabled } from '@/lib/watch';
import type { Level, Match } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Remembers which checkout sessions already created a watch, so a page reload cannot add a second one.
const created = new Map<string, string>();

/** Called when the browser returns from a paid subscription checkout. */
export async function POST(req: Request) {
  if (limited(req, 10)) return json({ error: 'Too many requests. Wait a minute and try again.' }, 429);
  try {
    if (!paymentsEnabled() || !watchEnabled()) return json({ error: 'Watch alerts are not set up on this deployment.' }, 503);
    const { session } = await body<{ session: string }>(req);
    const id = String(session ?? '');
    if (created.has(id)) return json({ ok: true, id: created.get(id) });
    const meta = await paidWatch(id);
    if (!meta) return json({ error: 'We could not find a completed subscription for this watch.' }, 402);

    const input = { employer: meta.employer, title: meta.title, level: meta.level as Level, location: meta.location, salary: Number(meta.salary) };
    // Postings that exist today were already shown in the check, so alerts start with the next new one.
    const now = await runCheck(input);
    const seen = [now.own.match, ...now.own.alsoMatched].filter((m): m is Match => Boolean(m)).map((m) => m.posting.id);
    const watch = await saveWatch({ ...input, email: meta.email, seen });
    created.set(id, watch.id);
    return json({ ok: true, id: watch.id, email: watch.email });
  } catch (err) {
    return fail(err);
  }
}

/** One-click stop link from the alert email. Billing is cancelled from the Stripe receipt. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('unsubscribe') ?? '';
  try {
    if (watchEnabled()) await deleteWatch(id);
  } catch (err) {
    console.error(err);
  }
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Alerts stopped</title><body style="font:16px/1.5 system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1>Alerts stopped</h1><p>You will not get further emails for this watch. To end the subscription charge, use the link in your payment receipt.</p><p><a href="/">Back to Loyalty Tax</a></p></body>',
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
