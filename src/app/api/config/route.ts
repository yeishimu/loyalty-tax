import { aiEnabled } from '@/lib/ai';
import { json } from '@/lib/http';
import { kitPriceCents, paymentsEnabled, watchPriceCents } from '@/lib/stripe';
import { watchEnabled } from '@/lib/watch';

export const dynamic = 'force-dynamic';

/** Tells the page which paid features this deployment can really deliver. */
export async function GET() {
  return json({
    payments: paymentsEnabled(),
    watch: paymentsEnabled() && watchEnabled(),
    ai: aiEnabled(),
    kitPriceCents: kitPriceCents(),
    watchPriceCents: watchPriceCents(),
  });
}
