import { aiAdjudicator, aiEnabled } from '@/lib/ai';
import { InputError, normaliseInput, runCheck } from '@/lib/check';
import { body, fail, json, limited, originOf } from '@/lib/http';
import { kitAvailable } from '@/lib/kit';
import { createKitCheckout, createWatchCheckout, paymentsEnabled } from '@/lib/stripe';
import { watchEnabled } from '@/lib/watch';
import type { CheckInput } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  if (limited(req, 10)) return json({ error: 'Too many requests. Wait a minute and try again.' }, 429);
  try {
    if (!paymentsEnabled()) return json({ error: 'Payments are not set up on this deployment.' }, 503);
    const { kind, input, email } = await body<{ kind: 'kit' | 'watch'; input: CheckInput; email?: string }>(req);
    const origin = originOf(req);

    if (kind === 'watch') {
      if (!watchEnabled()) return json({ error: 'Watch alerts are not set up on this deployment.' }, 503);
      if (!email || !EMAIL.test(email) || email.length > 200) throw new InputError('Enter a valid email address for the alerts.');
      const n = normaliseInput(input);
      const url = await createWatchCheckout({
        origin, email,
        watch: { email, employer: n.employer, title: n.title, level: n.level, location: n.location, salary: String(n.salary) },
      });
      return json({ url });
    }

    // The server re-runs the check itself, so the price is only ever charged for a result it has seen.
    const result = await runCheck(input, { adjudicate: aiEnabled() ? aiAdjudicator : undefined });
    if (!kitAvailable(result)) throw new InputError('There is no pay gap in this result to build a raise kit from.');
    const url = await createKitCheckout({
      origin, fingerprint: result.fingerprint,
      description: `${result.input.title} at ${result.own.employer.name || result.input.employer}`,
    });
    return json({ url });
  } catch (err) {
    return fail(err);
  }
}
