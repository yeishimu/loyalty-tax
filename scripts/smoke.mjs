#!/usr/bin/env node
// Live end-to-end check against a running deployment.
//   node scripts/smoke.mjs                     -> http://localhost:3000
//   node scripts/smoke.mjs https://your.app    -> a deployed copy
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const CASES = [
  { employer: 'Reddit', title: 'Senior Software Engineer', salary: 175000 },
  { employer: 'Lyft', title: 'Accountant', salary: 68000 },
  { employer: 'Notion', title: 'Software Engineer', salary: 180000 },
  { employer: 'An employer that does not exist 123', title: 'Engineer', salary: 100000 },
];

const config = await fetch(`${base}/api/config`).then((r) => r.json());
console.log('Deployment features:', config, '\n');

let failed = 0;
for (const input of CASES) {
  const res = await fetch(`${base}/api/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  const data = await res.json();
  if (!res.ok) { failed++; console.log(`FAIL  ${input.employer}: ${res.status} ${data.error}`); continue; }
  const { own } = data.result;
  if (!own.employer.found) { console.log(`ok    ${input.employer}: no public job board (expected for a made-up name)`); continue; }
  const m = own.match;
  console.log(m
    ? `ok    ${input.employer}: ${m.confidence} match "${m.posting.title}" $${m.posting.pay.min.toLocaleString()}-$${m.posting.pay.max.toLocaleString()} | gap: ${own.gap.status} | ${m.posting.url}`
    : `ok    ${input.employer}: board read (${own.employer.usPostingsWithPay} US postings with pay), no match for "${input.title}"`);
}
console.log(failed ? `\n${failed} request(s) failed.` : '\nAll requests completed.');
process.exit(failed ? 1 : 0);
