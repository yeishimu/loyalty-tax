import { readFileSync } from 'node:fs';
import type { Fetcher } from '@/lib/boards';

// Real postings captured from employers' public job boards on 14 Nov 2026,
// reshaped into the JSON each board's API returns.
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/boards.json', import.meta.url), 'utf8'));

export const fixtureFetcher: Fetcher = async (url) => {
  const gh = url.match(/boards-api\.greenhouse\.io\/v1\/boards\/([^/]+)\/jobs/);
  if (gh) return fixtures.greenhouse[gh[1]] ?? null;
  const ab = url.match(/api\.ashbyhq\.com\/posting-api\/job-board\/([^?]+)/);
  if (ab) return fixtures.ashby[ab[1]] ?? null;
  return null;
};
