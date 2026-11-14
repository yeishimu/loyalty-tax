import { findPay, stripHtml } from './pay';
import type { Board, BoardSource, Posting } from './types';

/**
 * Employers publish their open roles through a handful of hiring systems that
 * expose a public, key-free JSON feed per company. We read the employer's own
 * feed directly, so every figure shown links back to the employer's own ad.
 */

/** Resolves to the parsed JSON, or null when the board does not exist. Throws when the board could not be reached. */
export type Fetcher = (url: string) => Promise<unknown | null>;

/** The job boards could not be reached, as opposed to the employer not having one. */
export class UpstreamError extends Error {}

const TIMEOUT_MS = 12000;

export const liveFetcher: Fetcher = async (url) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
    if (res.status === 404 || res.status === 400 || res.status === 410) return null;
    if (!res.ok) throw new UpstreamError(`${new URL(url).host} returned ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError(`${new URL(url).host} could not be reached`);
  } finally {
    clearTimeout(timer);
  }
};

type Json = Record<string, any>;

function fromGreenhouse(slug: string, data: unknown): Board | null {
  const jobs = (data as Json | null)?.jobs;
  if (!Array.isArray(jobs) || !jobs.length) return null;
  const postings: Posting[] = jobs.map((j: Json) => ({
    id: `gh-${j.id}`,
    title: String(j.title ?? '').trim(),
    location: String(j.location?.name ?? '').trim(),
    department: (j.departments ?? []).map((d: Json) => d.name).filter(Boolean).join(', '),
    url: String(j.absolute_url ?? ''),
    postedAt: j.first_published ?? j.updated_at ?? null,
    pay: findPay(stripHtml(j.content)),
  }));
  return {
    slug, source: 'greenhouse', postings,
    name: typeof jobs[0]?.company_name === 'string' ? jobs[0].company_name : null,
    boardUrl: `https://boards.greenhouse.io/${slug}`,
  };
}

function fromAshby(slug: string, data: unknown): Board | null {
  const jobs = (data as Json | null)?.jobs;
  if (!Array.isArray(jobs) || !jobs.length) return null;
  const postings: Posting[] = jobs.map((j: Json) => {
    const c = j.compensation ?? {};
    const summary = c.scrapeableCompensationSalarySummary || c.compensationTierSummary || '';
    return {
      id: `ab-${j.id}`,
      title: String(j.title ?? '').trim(),
      location: String(j.location ?? '').trim(),
      department: String(j.department ?? ''),
      url: String(j.jobUrl ?? ''),
      postedAt: j.publishedAt ?? null,
      pay: findPay(summary) ?? findPay(j.descriptionPlain),
    };
  });
  return { slug, source: 'ashby', postings, name: null, boardUrl: `https://jobs.ashbyhq.com/${slug}` };
}

function fromLever(slug: string, data: unknown): Board | null {
  if (!Array.isArray(data) || !data.length) return null;
  const postings: Posting[] = data.map((j: Json) => {
    const sr = j.salaryRange;
    const structured = sr?.min && sr?.max && (!sr.currency || sr.currency === 'USD')
      ? { min: Number(sr.min), max: Number(sr.max), period: sr.interval?.includes('hour') ? 'hour' as const : 'year' as const, tiers: 1, text: String(j.salaryDescriptionPlain ?? '').slice(0, 200) }
      : null;
    return {
      id: `lv-${j.id}`,
      title: String(j.text ?? '').trim(),
      location: String(j.categories?.location ?? '').trim(),
      department: String(j.categories?.team ?? ''),
      url: String(j.hostedUrl ?? ''),
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      pay: structured ?? findPay([j.salaryDescriptionPlain, j.descriptionPlain, j.additionalPlain].filter(Boolean).join(' ')),
    };
  });
  return { slug, source: 'lever', postings, name: null, boardUrl: `https://jobs.lever.co/${slug}` };
}

const SOURCES: Array<{ source: BoardSource; url: (slug: string) => string; parse: (slug: string, data: unknown) => Board | null }> = [
  { source: 'greenhouse', url: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`, parse: fromGreenhouse },
  { source: 'ashby', url: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}?includeCompensation=true`, parse: fromAshby },
  { source: 'lever', url: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`, parse: fromLever },
];

const SUFFIXES = /\b(inc|incorporated|llc|ltd|corp|corporation|co|company|technologies|technology|labs|hq|group|holdings)\b\.?/g;

/** Board ids are usually the company name squashed together; try the likely spellings. */
export function slugCandidates(employer: string): string[] {
  const base = employer.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!base) return [];
  const trimmed = base.replace(SUFFIXES, ' ').replace(/\s+/g, ' ').trim() || base;
  const out = new Set<string>();
  for (const v of [trimmed, base]) {
    out.add(v.replace(/[\s-]/g, ''));
    out.add(v.replace(/\s/g, '-'));
  }
  out.add(trimmed.split(' ')[0]);
  return [...out].filter((s) => s.length >= 2 && s.length <= 60).slice(0, 4);
}

const cache = new Map<string, { at: number; board: Board | null }>();
const CACHE_MS = 30 * 60 * 1000;

/** Find the employer's public job board and read every open role from it. */
export async function loadBoard(employer: string, fetcher: Fetcher = liveFetcher): Promise<Board | null> {
  const candidates = slugCandidates(employer);
  if (!candidates.length) return null;
  const key = candidates[0];
  const hit = cache.get(key);
  if (fetcher === liveFetcher && hit && Date.now() - hit.at < CACHE_MS) return hit.board;

  let best: Board | null = null;
  let unreachable = 0;
  // The most likely spelling first; only fall back to the others when it finds nothing.
  for (const slug of candidates) {
    const boards = await Promise.all(SOURCES.map(async (s) => {
      try { return s.parse(slug, await fetcher(s.url(slug))); } catch { unreachable++; return null; }
    }));
    for (const b of boards) if (b && (!best || b.postings.length > best.postings.length)) best = b;
    if (best) break;
  }
  // "Not found" is only an honest answer if we actually got through to the boards.
  if (!best && unreachable > 0) throw new UpstreamError('The job boards could not be reached.');
  if (fetcher === liveFetcher) {
    if (cache.size > 200) cache.clear();
    cache.set(key, { at: Date.now(), board: best });
  }
  return best;
}
