#!/usr/bin/env node
// Loyalty Tax - Phase 1 data coverage test.
// Checks how many employers publish pay ranges in their own public job boards.
// No API key needed. Requires Node 18+.  Run:  node coverage-test.mjs
//
// For each company slug it tries the three free per-company job-board APIs
// (Greenhouse, Lever, Ashby), keeps whichever answers, and counts US postings
// that state a pay range.

const COMPANIES = [
  'stripe', 'airbnb', 'ramp', 'notion', 'figma', 'databricks', 'discord',
  'reddit', 'pinterest', 'lyft', 'instacart', 'doordash', 'robinhood',
  'coinbase', 'plaid', 'brex', 'gusto', 'asana', 'dropbox', 'twilio',
  'cloudflare', 'datadog', 'duolingo', 'peloton', 'chime', 'affirm',
  'sofi', 'squarespace', 'etsy', 'zillow',
];

const TIMEOUT_MS = 20000;

// "$120,000", "$120k", "$120,000 - $150,000", "$55.50/hr"
const MONEY = /\$\s?\d{2,3}(?:,\d{3})+(?:\.\d+)?|\$\s?\d{2,3}(?:\.\d+)?\s?[kK]\b|\$\s?\d{2,3}(?:\.\d{2})?\s?(?:\/|per\s)\s?(?:hr|hour)/g;

export function stripHtml(s) {
  return String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ').replace(/&#36;/g, '$')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function toNumber(m) {
  let t = m.replace(/[$,\s]/g, '').toLowerCase();
  if (/hr|hour/.test(t)) return null;            // hourly: keep as text only
  if (t.endsWith('k')) return parseFloat(t) * 1000;
  return parseFloat(t);
}

// Returns {min,max,text} or null. Ignores figures that are clearly not salaries.
export function findPay(text) {
  const hits = String(text || '').match(MONEY);
  if (!hits) return null;
  const nums = hits.map(toNumber).filter((n) => n && n >= 20000 && n <= 1500000);
  if (!nums.length) {
    const hourly = hits.find((h) => /hr|hour/i.test(h));
    return hourly ? { min: null, max: null, text: hourly.trim() } : null;
  }
  return { min: Math.min(...nums), max: Math.max(...nums), text: hits.slice(0, 2).join(' - ') };
}

const US_HINT = /\b(united states|usa|u\.s\.|remote\s*-?\s*us|new york|san francisco|seattle|austin|chicago|boston|denver|los angeles|atlanta|washington|california|texas|colorado|,\s?(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC))\b/i;
export const looksUS = (loc) => !loc || US_HINT.test(loc);

async function getJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function greenhouse(slug) {
  const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
  if (!d || !Array.isArray(d.jobs) || !d.jobs.length) return null;
  return d.jobs.map((j) => ({
    title: j.title, location: j.location && j.location.name, url: j.absolute_url,
    pay: findPay(stripHtml(j.content)),
  }));
}

async function lever(slug) {
  const d = await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!Array.isArray(d) || !d.length) return null;
  return d.map((j) => {
    const sr = j.salaryRange;
    const structured = sr && sr.min && sr.max ? { min: sr.min, max: sr.max, text: `${sr.min}-${sr.max} ${sr.currency || ''}` } : null;
    const body = [j.descriptionPlain, j.additionalPlain, j.salaryDescriptionPlain].join(' ');
    return {
      title: j.text, location: j.categories && j.categories.location, url: j.hostedUrl,
      pay: structured || findPay(body),
    };
  });
}

async function ashby(slug) {
  const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
  if (!d || !Array.isArray(d.jobs) || !d.jobs.length) return null;
  return d.jobs.map((j) => {
    const c = j.compensation || {};
    const summary = c.scrapeableCompensationSalarySummary || c.compensationTierSummary || '';
    return {
      title: j.title, location: j.location, url: j.jobUrl,
      pay: findPay(summary) || findPay(j.descriptionPlain),
    };
  });
}

async function checkCompany(slug) {
  for (const [name, fn] of [['greenhouse', greenhouse], ['ashby', ashby], ['lever', lever]]) {
    const jobs = await fn(slug);
    if (jobs) {
      const us = jobs.filter((j) => looksUS(j.location));
      const withPay = us.filter((j) => j.pay);
      return { slug, source: name, total: jobs.length, us: us.length, withPay: withPay.length, sample: withPay.slice(0, 2) };
    }
  }
  return { slug, source: null, total: 0, us: 0, withPay: 0, sample: [] };
}

async function main() {
  console.log(`Checking ${COMPANIES.length} employers...\n`);
  const rows = [];
  for (const slug of COMPANIES) {
    const r = await checkCompany(slug);
    rows.push(r);
    const pct = r.us ? Math.round((100 * r.withPay) / r.us) : 0;
    console.log(
      `${slug.padEnd(14)} ${(r.source || 'not found').padEnd(11)} US postings: ${String(r.us).padStart(4)}  with pay: ${String(r.withPay).padStart(4)} (${pct}%)`
    );
    for (const s of r.sample) console.log(`    e.g. ${s.title} | ${s.location || ''} | ${s.pay.text}`);
  }

  const found = rows.filter((r) => r.source);
  const usable = found.filter((r) => r.withPay > 0);
  const us = found.reduce((a, r) => a + r.us, 0);
  const pay = found.reduce((a, r) => a + r.withPay, 0);

  console.log('\n===== SUMMARY =====');
  console.log(`Employers with a reachable public job board: ${found.length} of ${rows.length}`);
  console.log(`Employers with at least one US posting stating pay: ${usable.length} of ${found.length}`);
  console.log(`US postings stating pay: ${pay} of ${us} (${us ? Math.round((100 * pay) / us) : 0}%)`);
  const share = found.length ? usable.length / found.length : 0;
  console.log(`\nPass mark is 40% of employers usable. Result: ${share >= 0.4 ? 'PASS' : 'FAIL'} (${Math.round(share * 100)}%)`);
  console.log('\nPaste this whole output back into the chat.');
}

if (process.argv[1] && process.argv[1].endsWith('coverage-test.mjs')) main();
