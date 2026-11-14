import { aiAdjudicator, aiEnabled } from '@/lib/ai';
import { runCheck } from '@/lib/check';
import { body, fail, json, limited } from '@/lib/http';
import { buildKit, kitAvailable, refineKit } from '@/lib/kit';
import { isKitPaid, paymentsEnabled } from '@/lib/stripe';
import type { CheckInput } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  if (limited(req, 10)) return json({ error: 'Too many requests. Wait a minute and try again.' }, 429);
  try {
    if (!paymentsEnabled()) return json({ error: 'Payments are not set up on this deployment.' }, 503);
    const { session, input } = await body<{ session: string; input: CheckInput }>(req);
    const result = await runCheck(input, { adjudicate: aiEnabled() ? aiAdjudicator : undefined });
    if (!(await isKitPaid(String(session ?? ''), result.fingerprint))) {
      return json({ error: 'We could not find a completed payment for this job. If you were charged, reply to your receipt and we will sort it out.' }, 402);
    }
    if (!kitAvailable(result)) {
      return json({ error: 'The posting your kit was based on is no longer listed, so the evidence has changed. Run the check again to see the current postings.' }, 409);
    }
    const kit = buildKit(result);
    return json({ result, kit: aiEnabled() ? await refineKit(kit, result) : kit });
  } catch (err) {
    return fail(err);
  }
}
