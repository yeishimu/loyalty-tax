import { aiAdjudicator, aiEnabled } from '@/lib/ai';
import { json, originOf } from '@/lib/http';
import { runWatches, watchEnabled } from '@/lib/watch';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Daily job (see vercel.json). Vercel sends CRON_SECRET as a bearer token. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'Not authorised.' }, 401);
  if (!watchEnabled()) return json({ skipped: 'Watch alerts are not configured.' });
  try {
    return json(await runWatches(originOf(req), { adjudicate: aiEnabled() ? aiAdjudicator : undefined }));
  } catch (err) {
    console.error(err);
    return json({ error: 'The watch run failed.' }, 500);
  }
}
