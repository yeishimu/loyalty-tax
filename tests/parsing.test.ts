import { describe, expect, test } from 'vitest';
import { slugCandidates } from '@/lib/boards';
import { isUS, sameArea } from '@/lib/location';
import { findPay, stripHtml } from '@/lib/pay';
import { parseTitle } from '@/lib/titles';

describe('pay parsing', () => {
  test.each([
    ['The annual US base salary range for this role is $148,000 - $222,000.', 148000, 222000],
    ['Pay: $120k–$150k plus equity', 120000, 150000],
    ['Comp &#36;95,500 to &#36;130,000 USD', 95500, 130000],
    ['$189.6K - $290.4K', 189600, 290400],
    ['$ 145,000 - $ 205,000', 145000, 205000],
    ['$141,773.00 - $162,000.00', 141773, 162000],
  ])('%s', (text, min, max) => {
    expect(findPay(stripHtml(text))).toMatchObject({ min, max, period: 'year' });
  });

  test('ignores money that is not pay', () => {
    expect(findPay('We raised $50 million and manage $124 trillion.')).toBeNull();
    expect(findPay('401k match and a $1,500 stipend')).toBeNull();
    expect(findPay('No figures here')).toBeNull();
  });

  test('reads hourly pay and keeps it separate from annual', () => {
    expect(findPay('Hourly rate $28.50/hr')).toMatchObject({ min: 28.5, period: 'hour' });
    expect(findPay('$38.70 per hour - $100,000')).toMatchObject({ min: 100000, max: 100000, period: 'year' });
  });

  test('reports the full span and the number of tiers when a posting lists several ranges', () => {
    const p = findPay('SF: $180,000 - $220,000. Denver: $150,000 - $190,000.');
    expect(p).toMatchObject({ min: 150000, max: 220000, tiers: 2 });
  });
});

describe('location', () => {
  test.each([
    ['San Francisco, CA', true], ['Remote - US', true], ['United States - Remote', true],
    ['Chicago, IL; Menlo Park, CA; New York, NY', true], ['San Francisco HQ', true],
    ['Salt Lake City, Utah, United States', true],
    ['London, UK', false], ['Toronto, Canada', false], ['Dublin', false], ['Hybrid', false],
    ['Canada - Remote (ON, AB, BC, or NS Only)', false], ['', false],
  ])('%s -> %s', (loc, expected) => expect(isUS(loc)).toBe(expected));

  test('same area', () => {
    expect(sameArea('Seattle, WA', 'Seattle')).toBe(true);
    expect(sameArea('Denver, Colorado, USA', 'CO')).toBe(true);
    expect(sameArea('New York, NY', 'Austin, TX')).toBe(false);
  });
});

describe('titles', () => {
  test.each([
    ['Senior Staff Software Engineer - Blockchain Platform', 'senior-staff', 'ic'],
    ['Staff Software Engineer', 'staff', 'ic'],
    ['Software Engineer II, Backend', 'mid', 'ic'],
    ['Software Engineer - New Grad (2027 Start)', 'junior', 'ic'],
    ['Product Manager, AI Foundations', 'mid', 'ic'],
    ['Engineering Manager, Payments', 'manager', 'mgmt'],
    ['Manager, Customer Success', 'manager', 'mgmt'],
    ['Director, Enterprise Sales', 'director', 'mgmt'],
    ['Data Engineer Intern (Summer 2027)', 'intern', 'ic'],
  ])('%s -> %s', (title, level, track) => {
    expect(parseTitle(title)).toMatchObject({ level, track });
  });
});

describe('employer lookup', () => {
  test('tries the likely board ids', () => {
    expect(slugCandidates('Coinbase, Inc.')[0]).toBe('coinbase');
    expect(slugCandidates('Door Dash')).toEqual(expect.arrayContaining(['doordash', 'door-dash']));
    expect(slugCandidates('  ')).toEqual([]);
  });
});
