import { aiAdjudicator, aiEnabled } from '@/lib/ai';
import { runCheck } from '@/lib/check';
import { body, fail, json, limited } from '@/lib/http';
import { kitAvailable } from '@/lib/kit';
import type { CheckInput } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  if (limited(req)) return json({ error: 'Too many checks from this address. Wait a minute and try again.' }, 429);
  try {
    const input = await body<CheckInput>(req);
    const result = await runCheck(input, { adjudicate: aiEnabled() ? aiAdjudicator : undefined });
    return json({ result, kitAvailable: kitAvailable(result) });
  } catch (err) {
    return fail(err);
  }
}
