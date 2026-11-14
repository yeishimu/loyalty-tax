import { randomUUID } from 'node:crypto';
import { runCheck, type Adjudicator } from './check';
import type { Fetcher } from './boards';
import { formatPay } from './pay';
import type { Level, Match } from './types';

/**
 * Watches: a saved check that is re-run daily. Stored in a Redis-compatible
 * REST store (Upstash / Vercel KV) and alerted by email (Resend). Both are
 * optional; without them the feature reports itself as unavailable.
 */
export interface Watch {
  id: string;
  email: string;
  employer: string;
  title: string;
  level: Level;
  location: string;
  salary: number;
  /** Posting ids already reported, so each ad is announced once. */
  seen: string[];
  createdAt: string;
}

export const watchEnabled = () =>
  Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN && process.env.RESEND_API_KEY);

async function kv<T = unknown>(command: Array<string | number>): Promise<T> {
  const res = await fetch(process.env.KV_REST_API_URL!, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) throw new Error(data?.error || `Store returned ${res.status}`);
  return data.result as T;
}

const key = (id: string) => `watch:${id}`;

export async function saveWatch(w: Omit<Watch, 'id' | 'createdAt'>): Promise<Watch> {
  const watch: Watch = { ...w, id: randomUUID(), createdAt: new Date().toISOString() };
  await kv(['SET', key(watch.id), JSON.stringify(watch)]);
  await kv(['SADD', 'watches', watch.id]);
  return watch;
}

export async function deleteWatch(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await kv(['DEL', key(id)]);
  await kv(['SREM', 'watches', id]);
}

export async function listWatches(): Promise<Watch[]> {
  const ids = await kv<string[]>(['SMEMBERS', 'watches']);
  const out: Watch[] = [];
  for (const id of ids ?? []) {
    const raw = await kv<string | null>(['GET', key(id)]);
    if (raw) out.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
  }
  return out;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.ALERT_FROM_EMAIL || 'Loyalty Tax <onboarding@resend.dev>', to, subject, html }),
  });
  if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function alertHtml(watch: Watch, fresh: Match[], origin: string): string {
  const rows = fresh.map((m) =>
    `<li><a href="${esc(m.posting.url)}">${esc(m.posting.title)}</a> (${esc(m.posting.location)}): <strong>${esc(formatPay(m.posting.pay!))}</strong>${m.confidence === 'partial' ? ' (related role)' : ''}</li>`).join('');
  return `<p>${esc(watch.employer)} has posted ${fresh.length === 1 ? 'a role' : 'roles'} matching <strong>${esc(watch.title)}</strong> with a pay range:</p>
<ul>${rows}</ul>
<p>Your saved salary is $${watch.salary.toLocaleString('en-US')}. <a href="${origin}">Run the full check</a>.</p>
<p style="color:#666;font-size:12px">A posted range is what the company advertises to candidates, not a promise of what it would pay you.
<a href="${origin}/api/watch?unsubscribe=${watch.id}">Stop these alerts</a>.</p>`;
}

/** Re-run every watch and email about postings not reported before. */
export async function runWatches(origin: string, opts: { fetcher?: Fetcher; adjudicate?: Adjudicator } = {}) {
  const watches = await listWatches();
  let alerted = 0;
  let failed = 0;
  for (const w of watches) {
    try {
      const r = await runCheck({ employer: w.employer, title: w.title, salary: w.salary, level: w.level, location: w.location }, opts);
      const all = [r.own.match, ...r.own.alsoMatched].filter((m): m is Match => Boolean(m));
      const fresh = all.filter((m) => !w.seen.includes(m.posting.id));
      if (!fresh.length) continue;
      await sendEmail(w.email, `${w.employer} posted your role with a pay range`, alertHtml(w, fresh, origin));
      w.seen = [...w.seen, ...fresh.map((m) => m.posting.id)].slice(-200);
      await kv(['SET', key(w.id), JSON.stringify(w)]);
      alerted++;
    } catch {
      failed++;
    }
  }
  return { watches: watches.length, alerted, failed };
}
