import { ask, parseJson } from './ai';
import { formatPay, formatUSD } from './pay';
import { LEVEL_LABEL } from './titles';
import type { CheckResult, EmployerResult, Match } from './types';

export interface KitEvidence { employer: string; title: string; location: string; pay: string; url: string; own: boolean; note: string }

export interface Kit {
  headline: string;
  evidence: KitEvidence[];
  ask: { low: number; high: number; rationale: string };
  script: Array<{ step: string; say: string }>;
  email: { subject: string; body: string };
  objections: Array<{ theySay: string; youSay: string }>;
  cautions: string[];
  writtenBy: 'template' | 'template+ai';
}

function noteFor(m: Match): string {
  const notes: string[] = [];
  if (m.confidence === 'partial') notes.push('related role, not identical');
  if (m.flags.includes('level-differs')) notes.push('different level');
  if (m.flags.includes('wide-range')) notes.push('very broad range');
  if (m.flags.includes('multi-tier')) notes.push('range varies by location');
  if (m.flags.includes('other-location')) notes.push('different location');
  if (m.flags.includes('hourly')) notes.push('hourly pay');
  return notes.join('; ');
}

const displayName = (e: EmployerResult) => e.employer.name || e.employer.query;

function evidenceOf(result: CheckResult): KitEvidence[] {
  const rows: KitEvidence[] = [];
  const add = (e: EmployerResult, m: Match, own: boolean) => rows.push({
    employer: displayName(e), title: m.posting.title, location: m.posting.location,
    pay: formatPay(m.posting.pay!), url: m.posting.url, own, note: noteFor(m),
  });
  if (result.own.match) add(result.own, result.own.match, true);
  for (const m of result.own.alsoMatched) add(result.own, m, true);
  for (const p of result.peers) if (p.match) add(p, p.match, false);
  return rows;
}

/** A kit is only worth selling when there is a real, checkable gap to talk about. */
export function kitAvailable(result: CheckResult): boolean {
  const g = result.own.gap;
  return Boolean(result.own.match && g && (g.status === 'below' || (g.status === 'within' && (g.position ?? 100) < 50)));
}

/**
 * Builds the raise kit from the postings actually found. Every figure comes
 * from the check result; the wording is fixed text, optionally tightened by a
 * model that is told to keep the figures and facts unchanged.
 */
export function buildKit(result: CheckResult): Kit {
  const { input, own } = result;
  const match = own.match!;
  const gap = own.gap!;
  const employer = displayName(own);
  const posted = formatPay(match.posting.pay!);
  const exact = match.confidence === 'strong';
  const roleRef = exact ? 'your role' : 'a role very close to yours';

  // Ask for the middle of the posted range when below it; the next quarter up when inside it.
  const span = gap.max - gap.min;
  const low = gap.status === 'below' ? gap.min : Math.min(gap.max, Math.round((input.salary + span * 0.15) / 500) * 500);
  const high = gap.status === 'below' ? Math.round((gap.min + span * 0.5) / 500) * 500 : Math.min(gap.max, Math.round((input.salary + span * 0.3) / 500) * 500);

  const headline = gap.status === 'below'
    ? `${employer} is advertising ${roleRef} at ${posted}. Your salary of ${formatUSD(input.salary)} is ${formatUSD(gap.toMin)} below the bottom of that range.`
    : `${employer} is advertising ${roleRef} at ${posted}. At ${formatUSD(input.salary)} you are in the lower half of that range, ${formatUSD(gap.toMax)} below the top.`;

  const script = [
    { step: 'Open', say: `Thanks for making time. I want to talk about my compensation, and I've come with something specific.` },
    { step: 'Show the evidence', say: `I noticed we're currently hiring for ${exact ? `"${match.posting.title}"` : `"${match.posting.title}", which is very close to what I do`}. The posting lists the pay range as ${posted}. I'm at ${formatUSD(input.salary)}.` },
    { step: 'Make the case', say: `I've been doing this job here and I know our systems, customers and team. I'd like my pay to reflect what we're offering someone new to do the same work.` },
    { step: 'Ask', say: `I'm asking for an adjustment to between ${formatUSD(low)} and ${formatUSD(high)}. What would it take to get there?` },
    { step: 'Close', say: `I understand you may need to take this to HR or finance. Can we agree a date for an answer? I'll send a short note summarising this today.` },
  ];

  const email = {
    subject: 'Compensation review request',
    body: [
      `Hi [manager's name],`,
      ``,
      `Thank you for talking with me today. To summarise:`,
      ``,
      `- ${employer} is currently advertising "${match.posting.title}" with a posted pay range of ${posted}: ${match.posting.url}`,
      `- My current base salary is ${formatUSD(input.salary)}${gap.status === 'below' ? `, which is ${formatUSD(gap.toMin)} below the bottom of that range` : `, in the lower half of that range`}.`,
      `- I'm asking for an adjustment to between ${formatUSD(low)} and ${formatUSD(high)}.`,
      ``,
      `I enjoy the work and want to keep building here. Could we agree a date to follow up?`,
      ``,
      `Thanks,`,
      `[your name]`,
    ].join('\n'),
  };

  const objections = [
    { theySay: `There's no budget right now.`, youSay: `I understand budgets are set in cycles. The posting shows there is budget for this role at ${posted}. Can we agree the adjustment now, with a date it takes effect?` },
    { theySay: `That posting is for a different role or level.`, youSay: `Help me understand the difference. What does that role do that I'm not doing today? If there's a gap, I'd like a written plan and a timeline to close it.` },
    { theySay: `That range is for a higher-cost location.`, youSay: `That's fair to check. What is the range for my location and level? I'd like to see where I sit in it.` },
    { theySay: `Posted ranges are wide; most people start near the bottom.`, youSay: `Understood. ${gap.status === 'below' ? `Even the bottom of the range is ${formatUSD(gap.toMin)} above my pay.` : `I'm asking to move toward the middle, in line with my experience in the role.`}` },
    { theySay: `We'll look at it at the next review.`, youSay: `I'd appreciate that. Can you confirm in writing that this will be reviewed then, and what you'll need from me beforehand?` },
  ];

  const cautions = [
    `A posted range is what the company advertises to candidates. It is evidence for a conversation, not proof of what you are owed.`,
    `Open the posting and read it in full before the meeting, so you know how it differs from your job.`,
    `Keep the tone factual. This kit supports a pay discussion; it is not a threat to leave and should not be used as one.`,
  ];
  if (!exact) cautions.unshift(`The best match is a related role, not an identical one. Expect that to be the first objection.`);
  if (match.flags.includes('wide-range')) cautions.unshift(`This posted range is very broad, which weakens it as evidence. Lean on the bottom of the range.`);
  if (match.flags.includes('multi-tier')) cautions.unshift(`The posting lists different ranges by location. Check which one applies to you before quoting it.`);

  return {
    headline,
    evidence: evidenceOf(result),
    ask: { low, high, rationale: gap.status === 'below' ? 'From the bottom to the middle of the posted range.' : 'A step up within the posted range.' },
    script, email, objections, cautions, writtenBy: 'template',
  };
}

/** Lets a model tighten the wording for this person's situation without changing any fact. */
export async function refineKit(kit: Kit, result: CheckResult): Promise<Kit> {
  const prompt = [
    'Rewrite the conversation script and the email below so they sound natural for this employee. Rules:',
    '- Keep every dollar figure, job title, company name and URL exactly as given. Add no new facts or figures.',
    '- Stay factual, polite and firm. Never imply a threat to quit.',
    '- Keep the same five script steps and the bracketed placeholders in the email.',
    `Employee: ${LEVEL_LABEL[result.input.level]} "${result.input.title}" at ${displayName(result.own)}.`,
    `Script: ${JSON.stringify(kit.script)}`,
    `Email: ${JSON.stringify(kit.email)}`,
    'Reply with only JSON: {"script":[{"step":"...","say":"..."}],"email":{"subject":"...","body":"..."}}',
  ].join('\n');
  const out = parseJson<{ script: Kit['script']; email: Kit['email'] }>(await ask(prompt, 1400));
  if (!out?.script?.length || out.script.length !== kit.script.length || !out.email?.body) return kit;

  // Reject the rewrite if it dropped or invented a figure.
  const figures = (s: string) => (s.match(/\$[\d,]+/g) ?? []).sort().join('|');
  const before = figures(JSON.stringify(kit.script) + kit.email.body);
  const after = figures(JSON.stringify(out.script) + out.email.body);
  if (before !== after || !out.email.body.includes(result.own.match!.posting.url)) return kit;
  return { ...kit, script: out.script, email: out.email, writtenBy: 'template+ai' };
}
