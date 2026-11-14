import type { Pay } from './types';

/** Turn job-board HTML (sometimes entity-encoded twice) into plain text. */
export function stripHtml(input: string | null | undefined): string {
  let s = String(input ?? '');
  for (let i = 0; i < 2; i++) {
    s = s
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&#36;|&dollar;/g, '$').replace(/&ndash;|&#8211;/g, '–').replace(/&mdash;|&#8212;/g, '—')
      .replace(/&amp;/g, '&');
  }
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

interface Token { value: number; hourly: boolean; start: number; end: number }

// $120,000  $120,000.00  $ 145,000  $120k  $189.6K  $55.50
const MONEY = /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(\s?[kK]\b)?/g;
const NOT_PAY_AFTER = /^\s?(?:million|billion|trillion|mm\b|m\b|bn\b|b\b|\+?\s?(?:in|of)\s(?:funding|revenue|arr))/i;
const HOURLY_AFTER = /^\s?(?:\/\s?(?:hr|hour)|per\s(?:hr|hour)|an\shour|hourly|(?:usd\s)?(?:\/\s?hr|per\shour))/i;
const RANGE_JOIN = /^\s*(?:usd\s*)?(?:-|–|—|to|and|through|up to)\s*(?:usd\s*)?$/i;

function tokens(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(MONEY)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const after = text.slice(end, end + 24);
    if (NOT_PAY_AFTER.test(after)) continue;
    let value = parseFloat(m[1].replace(/,/g, ''));
    if (m[2]) value *= 1000;
    const hourly = HOURLY_AFTER.test(after);
    out.push({ value, hourly, start, end });
  }
  return out;
}

const isAnnual = (v: number) => v >= 20000 && v <= 1500000;
const isHourly = (v: number) => v >= 7 && v <= 500;

/**
 * Read the pay a posting states. Returns the overall span when a posting lists
 * several ranges (for example one per location) and says how many it found.
 * Figures that are plainly not salaries (funding, stipends, bonuses under
 * $20,000) are ignored.
 */
export function findPay(text: string | null | undefined): Pay | null {
  const src = String(text ?? '');
  const toks = tokens(src);
  if (!toks.length) return null;

  const ranges: Array<{ min: number; max: number; hourly: boolean; start: number; end: number }> = [];
  for (let i = 0; i < toks.length; i++) {
    const a = toks[i];
    const b = toks[i + 1];
    const joined = b && RANGE_JOIN.test(src.slice(a.end, b.start));
    if (joined) {
      // "$38.70 per hour - $100,000" style mixes are two separate figures, not a range.
      const bothAnnual = isAnnual(a.value) && isAnnual(b.value);
      const bothHourly = (a.hourly || b.hourly) && isHourly(a.value) && isHourly(b.value);
      if (bothAnnual || bothHourly) {
        ranges.push({ min: Math.min(a.value, b.value), max: Math.max(a.value, b.value), hourly: bothHourly && !bothAnnual, start: a.start, end: b.end });
        i++;
        continue;
      }
    }
    if (isAnnual(a.value) && !a.hourly) ranges.push({ min: a.value, max: a.value, hourly: false, start: a.start, end: a.end });
    else if (a.hourly && isHourly(a.value)) ranges.push({ min: a.value, max: a.value, hourly: true, start: a.start, end: a.end });
  }
  if (!ranges.length) return null;

  // Annual figures win when a posting states both.
  const annual = ranges.filter((r) => !r.hourly);
  const use = annual.length ? annual : ranges;
  const distinct = new Set(use.map((r) => `${r.min}-${r.max}`));
  const first = use[0];
  return {
    min: Math.min(...use.map((r) => r.min)),
    max: Math.max(...use.map((r) => r.max)),
    period: annual.length ? 'year' : 'hour',
    tiers: distinct.size,
    text: src.slice(Math.max(0, first.start - 90), Math.min(src.length, first.end + 60)).trim(),
  };
}

/** Annualise for comparison with a salary. 2,080 hours is the usual full-time year. */
export function annualRange(pay: Pay): { min: number; max: number } {
  return pay.period === 'hour'
    ? { min: Math.round(pay.min * 2080), max: Math.round(pay.max * 2080) }
    : { min: pay.min, max: pay.max };
}

export function formatUSD(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function formatPay(pay: Pay): string {
  const f = (n: number) => (pay.period === 'hour' ? '$' + n.toFixed(2) : formatUSD(n));
  const body = pay.min === pay.max ? f(pay.min) : `${f(pay.min)} to ${f(pay.max)}`;
  return pay.period === 'hour' ? `${body} an hour` : body;
}
