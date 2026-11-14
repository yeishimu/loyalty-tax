import { createHash } from 'node:crypto';
import { loadBoard, liveFetcher, type Fetcher } from './boards';
import { isRemote, isUS, sameArea } from './location';
import { annualRange } from './pay';
import { LEVEL_RANK, parseTitle, scoreTitles, type ParsedTitle } from './titles';
import type {
  Board, CheckInput, CheckResult, EmployerResult, Gap, Level, Match, MatchFlag, Posting,
} from './types';

export const STRONG = 0.85;
export const PARTIAL = 0.65;
/** A range whose top is more than 60% above its bottom says little about one person's pay. */
export const WIDE_RANGE = 0.6;

export interface Candidate { posting: Posting; score: number; role: number; levelGap: number; parsed: ParsedTitle; local: boolean }

/** Rank an employer's US postings that state pay against the user's job. */
export function rankPostings(board: Board, title: string, level: Level, location: string): Candidate[] {
  const user = parseTitle(title);
  const out: Candidate[] = [];
  for (const posting of board.postings) {
    if (!posting.pay || !isUS(posting.location)) continue;
    const parsed = parseTitle(posting.title);
    const s = scoreTitles(user, level, parsed);
    if (s.score < 0.4) continue;
    const local = location ? sameArea(posting.location, location) : false;
    out.push({ posting, score: s.score, role: s.role, levelGap: s.levelGap, parsed, local });
  }
  // Best title fit first; among equals prefer the user's own area, then the newest ad.
  return out.sort((a, b) =>
    b.score - a.score
    || Number(b.local) - Number(a.local)
    || String(b.posting.postedAt ?? '').localeCompare(String(a.posting.postedAt ?? '')));
}

function flagsFor(c: Candidate, location: string): MatchFlag[] {
  const pay = c.posting.pay!;
  const flags: MatchFlag[] = [];
  if (pay.min === pay.max) flags.push('single-figure');
  else if ((pay.max - pay.min) / pay.min > WIDE_RANGE) flags.push('wide-range');
  if (pay.tiers > 1) flags.push('multi-tier');
  if (pay.period === 'hour') flags.push('hourly');
  if (c.levelGap > 0) flags.push('level-differs');
  if (location && !c.local && !isRemote(c.posting.location)) flags.push('other-location');
  return flags;
}

function reasonsFor(c: Candidate, level: Level): string[] {
  const r: string[] = [];
  r.push(c.role >= 0.9 ? 'The posting is for the same job title.' : 'The posting is for a closely related title.');
  if (c.levelGap === 0) r.push(c.parsed.levelStated ? 'It is advertised at your level.' : 'It states no level, which usually means mid-level, like yours.');
  else r.push(`It is advertised at a different level from yours (${LEVEL_RANK[c.parsed.level] > LEVEL_RANK[level] ? 'higher' : 'lower'}).`);
  return r;
}

export function toMatch(c: Candidate, level: Level, location: string): Match | null {
  if (c.score < PARTIAL) return null;
  return {
    posting: c.posting,
    confidence: c.score >= STRONG ? 'strong' : 'partial',
    score: Math.round(c.score * 100) / 100,
    reasons: reasonsFor(c, level),
    flags: flagsFor(c, location),
  };
}

export function computeGap(salary: number, match: Match): Gap {
  const { min, max } = annualRange(match.posting.pay!);
  if (salary < min) return { status: 'below', min, max, toMin: min - salary, toMax: max - salary, position: null };
  if (salary > max) return { status: 'above', min, max, toMin: min - salary, toMax: max - salary, position: null };
  return {
    status: 'within', min, max, toMin: 0, toMax: max - salary,
    position: max === min ? 100 : Math.round(((salary - min) / (max - min)) * 100),
  };
}

/** Optional second opinion on which candidate is really the same job at the same level. */
export type Adjudicator = (args: {
  title: string; level: Level; location: string; candidates: Candidate[];
}) => Promise<{ id: string | null; confidence: 'strong' | 'partial' | 'none' } | null>;

async function checkEmployer(
  query: string, input: { title: string; level: Level; location: string; salary: number },
  fetcher: Fetcher, adjudicate?: Adjudicator,
): Promise<{ result: EmployerResult; usedAI: boolean }> {
  const board = await loadBoard(query, fetcher);
  if (!board) return { result: { employer: { query, found: false }, match: null, gap: null, alsoMatched: [] }, usedAI: false };

  const employer = {
    query, found: true, slug: board.slug, source: board.source, name: board.name, boardUrl: board.boardUrl,
    totalPostings: board.postings.length,
    usPostingsWithPay: board.postings.filter((p) => p.pay && isUS(p.location)).length,
  };
  const ranked = rankPostings(board, input.title, input.level, input.location);
  let matches = ranked.map((c) => toMatch(c, input.level, input.location)).filter((m): m is Match => m !== null);
  let usedAI = false;

  // The rules are a filter; where a model is configured it has the final say on
  // seniority and near-miss titles. Any failure leaves the rules' answer in place.
  if (adjudicate && ranked.length) {
    const verdict = await adjudicate({ title: input.title, level: input.level, location: input.location, candidates: ranked.slice(0, 8) }).catch(() => null);
    if (verdict) {
      usedAI = true;
      if (verdict.confidence === 'none' || !verdict.id) matches = [];
      else {
        const picked = ranked.find((c) => c.posting.id === verdict.id);
        if (picked) {
          const m: Match = {
            posting: picked.posting, confidence: verdict.confidence, score: Math.round(picked.score * 100) / 100,
            reasons: reasonsFor(picked, input.level), flags: flagsFor(picked, input.location),
          };
          matches = [m, ...matches.filter((x) => x.posting.id !== m.posting.id)];
        }
      }
    }
  }

  const match = matches[0] ?? null;
  // Only show further postings when they are confident matches for a distinct ad.
  const seen = new Set(match ? [`${match.posting.title}|${match.posting.pay!.min}|${match.posting.pay!.max}`] : []);
  const alsoMatched: Match[] = [];
  for (const m of matches.slice(1)) {
    const k = `${m.posting.title}|${m.posting.pay!.min}|${m.posting.pay!.max}`;
    if (m.confidence !== 'strong' || seen.has(k)) continue;
    seen.add(k);
    alsoMatched.push(m);
    if (alsoMatched.length === 4) break;
  }
  return { result: { employer, match, gap: match ? computeGap(input.salary, match) : null, alsoMatched }, usedAI };
}

export function normaliseInput(raw: CheckInput): { employer: string; title: string; salary: number; level: Level; location: string; peers: string[] } {
  const employer = String(raw.employer ?? '').trim().slice(0, 80);
  const title = String(raw.title ?? '').trim().slice(0, 120);
  const salary = Math.round(Number(raw.salary));
  if (!employer) throw new InputError('Enter your employer.');
  if (!title) throw new InputError('Enter your job title.');
  if (!Number.isFinite(salary) || salary < 15000 || salary > 2000000) throw new InputError('Enter your yearly base salary in dollars, for example 95000.');
  const level = raw.level && raw.level !== 'auto' && raw.level in LEVEL_RANK ? raw.level : parseTitle(title).level;
  const peers = [...new Set((raw.peers ?? []).map((p) => String(p).trim().slice(0, 80)).filter(Boolean))]
    .filter((p) => p.toLowerCase() !== employer.toLowerCase()).slice(0, 3);
  return { employer, title, salary, level, location: String(raw.location ?? '').trim().slice(0, 80), peers };
}

export class InputError extends Error {}

/** Identifies "this job at this employer", so a payment unlocks the kit for that and nothing else. */
export function fingerprintOf(employerSlug: string, title: string): string {
  return createHash('sha256').update(`${employerSlug.toLowerCase()}|${title.toLowerCase()}`).digest('hex').slice(0, 24);
}

export async function runCheck(raw: CheckInput, opts: { fetcher?: Fetcher; adjudicate?: Adjudicator } = {}): Promise<CheckResult> {
  const input = normaliseInput(raw);
  const fetcher = opts.fetcher ?? liveFetcher;
  const unreachable = (query: string) => ({ result: { employer: { query, found: false }, match: null, gap: null, alsoMatched: [] } as EmployerResult, usedAI: false });
  const [own, ...peers] = await Promise.all([
    checkEmployer(input.employer, input, fetcher, opts.adjudicate),
    // A peer that cannot be reached should not sink the user's own result.
    ...input.peers.map((e) => checkEmployer(e, input, fetcher, opts.adjudicate).catch(() => unreachable(e))),
  ]);
  return {
    input: { employer: input.employer, title: input.title, salary: input.salary, level: input.level, location: input.location },
    own: own.result,
    peers: peers.map((p) => p.result),
    matcher: own.usedAI || peers.some((p) => p.usedAI) ? 'rules+ai' : 'rules',
    checkedAt: new Date().toISOString(),
    fingerprint: fingerprintOf(own.result.employer.slug ?? input.employer, input.title),
  };
}
