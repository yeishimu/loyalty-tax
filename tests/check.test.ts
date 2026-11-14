import { describe, expect, test } from 'vitest';
import { computeGap, runCheck } from '@/lib/check';
import { fixtureFetcher } from './helpers';

const check = (employer: string, title: string, salary = 100000, extra = {}) =>
  runCheck({ employer, title, salary, ...extra }, { fetcher: fixtureFetcher });

describe('matching on real postings', () => {
  test.each([
    ['reddit', 'Senior Software Engineer', /^Senior Software Engineer/],
    ['lyft', 'Data Scientist', /^Data Scientist/],
    ['lyft', 'Accountant', /^Accountant/],
    ['brex', 'Software Engineer', /^Software Engineer II/],
    ['brex', 'SDR', /Sales Development Representative/],
    ['brex', 'Engineering Manager', /^Engineering Manager/],
    ['reddit', 'Frontend Engineer', /^Front ?end/i],
    ['Coinbase, Inc.', 'software developer', /^Software Engineer/],
  ])('%s: %s is a strong match', async (employer, title, expected) => {
    const r = await check(employer, title);
    expect(r.own.match?.confidence).toBe('strong');
    expect(r.own.match?.posting.title).toMatch(expected);
  });

  test('a posting one level up is never presented as the same job', async () => {
    // Coinbase advertises both Staff and Senior Staff engineers; Senior Staff pays about $36,000 more.
    const r = await check('coinbase', 'Staff Software Engineer', 200000);
    expect(r.own.match?.posting.title).toMatch(/^Staff Software Engineer/);
    expect(r.own.match?.posting.pay).toMatchObject({ min: 218025, max: 256500 });
    for (const m of r.own.alsoMatched) expect(m.posting.title).not.toMatch(/Senior Staff/);
  });

  test('different kinds of job do not match on shared words', async () => {
    expect((await check('lyft', 'Data Engineer')).own.match).toBeNull();        // only Data Scientist roles pay-listed in the US
    expect((await check('asana', 'Office Manager')).own.match).toBeNull();      // "Manager, Customer Success" is not it
    expect((await check('twilio', 'Solutions Engineer')).own.match).toBeNull(); // only a Principal-level opening
    expect((await check('brex', 'Accountant')).own.match).toBeNull();           // "Accountant Partnerships Manager" is a manager role
  });

  test('a near miss is shown as partial, with the reason flagged', async () => {
    const r = await check('robinhood', 'Financial Analyst');
    expect(r.own.match?.confidence).toBe('partial');
    expect(r.own.match?.flags).toContain('level-differs');
  });

  test('very broad ranges are flagged', async () => {
    const r = await check('pinterest', 'Marketing Manager', 120000);
    expect(r.own.match?.flags).toContain('wide-range');
  });

  test('only US postings with stated pay are used', async () => {
    const r = await check('lyft', 'Data Scientist');
    expect(r.own.match?.posting.location).not.toMatch(/Canada|Toronto/);
    expect(r.own.employer.usPostingsWithPay).toBeGreaterThan(0);
  });

  test('an employer without a public board is reported, not guessed', async () => {
    const r = await check('nonexistentco', 'Engineer');
    expect(r.own.employer.found).toBe(false);
    expect(r.own.match).toBeNull();
  });

  test('peers are checked alongside the employer', async () => {
    const r = await check('reddit', 'Senior Software Engineer', 170000, { peers: ['coinbase', 'reddit'] });
    expect(r.peers).toHaveLength(1);
    expect(r.peers[0].match?.posting.title).toMatch(/^Senior Software Engineer/);
  });

  test('the stated level overrides the one read from the title', async () => {
    const r = await check('reddit', 'Software Engineer', 150000, { level: 'senior' });
    expect(r.own.match?.posting.title).toMatch(/^Senior Software Engineer/);
  });
});

describe('gap maths', () => {
  const match = (min: number, max: number) => ({
    posting: { id: 'x', title: 't', location: 'Remote - US', department: '', url: '', postedAt: null, pay: { min, max, period: 'year' as const, tiers: 1, text: '' } },
    confidence: 'strong' as const, score: 1, reasons: [], flags: [],
  });
  test('below the range', () => {
    expect(computeGap(90000, match(100000, 130000))).toMatchObject({ status: 'below', toMin: 10000, toMax: 40000 });
  });
  test('within the range', () => {
    expect(computeGap(110000, match(100000, 140000))).toMatchObject({ status: 'within', position: 25, toMax: 30000 });
  });
  test('above the range', () => {
    expect(computeGap(150000, match(100000, 140000)).status).toBe('above');
  });
});

describe('input validation', () => {
  test('rejects a missing employer and an implausible salary', async () => {
    await expect(check('', 'Engineer')).rejects.toThrow(/employer/);
    await expect(check('reddit', 'Engineer', 12)).rejects.toThrow(/salary/);
  });
});

describe('when job boards cannot be reached', () => {
  test('the check fails loudly instead of reporting "not found"', async () => {
    const down = async () => { throw new Error('network down'); };
    await expect(runCheck({ employer: 'reddit', title: 'Engineer', salary: 100000 }, { fetcher: down })).rejects.toThrow(/could not be reached/);
  });

  test('an unreachable peer does not sink the main result', async () => {
    const flaky: typeof fixtureFetcher = async (url) => {
      if (url.includes('coinbase')) throw new Error('timeout');
      return fixtureFetcher(url);
    };
    const r = await runCheck({ employer: 'reddit', title: 'Senior Software Engineer', salary: 170000, peers: ['coinbase'] }, { fetcher: flaky });
    expect(r.own.match).not.toBeNull();
    expect(r.peers[0].employer.found).toBe(false);
  });
});
