import { NextResponse } from 'next/server';
import { UpstreamError } from './boards';
import { InputError } from './check';

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

export function fail(err: unknown) {
  if (err instanceof InputError) return json({ error: err.message }, 400);
  if (err instanceof UpstreamError) return json({ error: 'We could not reach the job boards just now, so we have no result to show. Try again in a minute.' }, 502);
  console.error(err);
  return json({ error: 'Something went wrong on our side. Please try again.' }, 500);
}

export async function body<T>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { throw new InputError('The request was not valid JSON.'); }
}

/** The public address of this deployment, for links in emails and payment redirects. */
export function originOf(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? url.host;
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

// Best-effort limit per server instance: enough to stop a runaway client hammering employers' job boards.
const hits = new Map<string, { count: number; reset: number }>();
export function limited(req: Request, max = 20, windowMs = 60_000): boolean {
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now > h.reset) { if (hits.size > 5000) hits.clear(); hits.set(ip, { count: 1, reset: now + windowMs }); return false; }
  return ++h.count > max;
}
