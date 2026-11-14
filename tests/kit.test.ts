import { describe, expect, test } from 'vitest';
import { runCheck } from '@/lib/check';
import { buildKit, kitAvailable } from '@/lib/kit';
import { fixtureFetcher } from './helpers';

const check = (employer: string, title: string, salary: number) => runCheck({ employer, title, salary }, { fetcher: fixtureFetcher });

describe('raise kit', () => {
  test('is built from the matched posting and the user\'s own figures', async () => {
    const r = await check('lyft', 'Accountant', 65000);
    expect(kitAvailable(r)).toBe(true);
    const kit = buildKit(r);
    expect(kit.headline).toContain('advertising your role at $72,000 to $90,000');
    expect(kit.headline).toContain('$7,000 below');
    expect(kit.evidence[0]).toMatchObject({ own: true, pay: '$72,000 to $90,000' });
    expect(kit.email.body).toContain(r.own.match!.posting.url);
    expect(kit.ask.low).toBe(72000);
    expect(kit.ask.high).toBeLessThanOrEqual(90000);
    expect(kit.script).toHaveLength(5);
  });

  test('is not offered when there is no gap to discuss', async () => {
    expect(kitAvailable(await check('lyft', 'Accountant', 95000))).toBe(false);   // above the range
    expect(kitAvailable(await check('lyft', 'Accountant', 88000))).toBe(false);   // top half of the range
    expect(kitAvailable(await check('asana', 'Office Manager', 60000))).toBe(false); // no match
  });

  test('warns when the match is a related role', async () => {
    const r = await check('robinhood', 'Financial Analyst', 80000);
    const kit = buildKit(r);
    expect(kit.cautions[0]).toMatch(/related role/);
    expect(kit.evidence[0].note).toMatch(/different level/);
  });
});
