'use client';

import { useState } from 'react';
import { annualRange, formatPay, formatUSD } from '@/lib/pay';
import { LEVEL_LABEL } from '@/lib/titles';
import type { CheckResult, EmployerResult, Gap, Match, MatchFlag } from '@/lib/types';
import type { Config } from './App';

const FLAG_TEXT: Record<MatchFlag, string> = {
  'wide-range': 'This range is very broad (the top is over 60% above the bottom), so it says less about any one person’s pay.',
  'single-figure': 'The posting states one figure, not a range.',
  'multi-tier': 'The posting lists different ranges, usually by location. We show the full span; check which one applies to you.',
  'hourly': 'The posting states hourly pay. We converted it to a year at 2,080 hours.',
  'level-differs': 'The posting is at a different level from yours, so the range is not a like-for-like comparison.',
  'other-location': 'The posting is for a different location from the one you entered. Pay often varies by location.',
};

const nameOf = (e: EmployerResult) => e.employer.name || e.employer.query;
const posted = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

function Verdict({ gap, match, employer }: { gap: Gap; match: Match; employer: string }) {
  const role = match.confidence === 'strong' ? 'your job' : 'a role close to yours';
  if (gap.status === 'below') {
    return (
      <h2 className="verdict">
        {employer} is advertising {role} for{' '}
        <span className="mark num">{formatUSD(gap.toMin)}{gap.toMax !== gap.toMin && <> to {formatUSD(gap.toMax)}</>}</span> more than you earn.
      </h2>
    );
  }
  if (gap.status === 'within') {
    return (
      <h2 className="verdict">
        You are inside the range {employer} advertises for {role}, with{' '}
        <span className="mark num">{formatUSD(gap.toMax)}</span> of headroom to the top.
      </h2>
    );
  }
  return <h2 className="verdict">You earn more than the top of the range {employer} advertises for {role}.</h2>;
}

function Scale({ gap, salary }: { gap: Gap; salary: number }) {
  const lo = Math.min(gap.min, salary);
  const hi = Math.max(gap.max, salary);
  const pad = (hi - lo) * 0.08 || hi * 0.05;
  const from = lo - pad;
  const span = hi + pad - from;
  const pct = (v: number) => ((v - from) / span) * 100;
  const you = pct(salary);
  return (
    <div className="scale" role="img" aria-label={`Your salary of ${formatUSD(salary)} against the advertised range of ${formatUSD(gap.min)} to ${formatUSD(gap.max)}.`}>
      <div className="scale-track">
        <div className="scale-band" style={{ left: `${pct(gap.min)}%`, width: `${Math.max(pct(gap.max) - pct(gap.min), 0.6)}%` }} />
        <div className={`scale-you${gap.status === 'below' ? '' : ' ok'}${you > 70 ? ' flip' : ''}`} style={{ left: `${you}%` }}><b>You {formatUSD(salary)}</b></div>
      </div>
      <div className="scale-ends"><span>Advertised range {formatUSD(gap.min)} to {formatUSD(gap.max)}</span></div>
    </div>
  );
}

function Posting({ match, employer }: { match: Match; employer: string }) {
  const p = match.posting;
  const date = posted(p.postedAt);
  return (
    <div className="posting stack">
      <div>
        <span className={`pill ${match.confidence}`}>{match.confidence === 'strong' ? 'Same job, same level' : 'Related, not identical'}</span>
      </div>
      <h3>{p.title}</h3>
      <p className="meta">{employer} &middot; {p.location}{p.department && <> &middot; {p.department}</>}{date && <> &middot; posted or updated {date}</>}</p>
      <p><a href={p.url} target="_blank" rel="noreferrer">Open the original posting</a></p>
      <ul className="cautions">
        {match.reasons.map((r) => <li key={r}>{r}</li>)}
        {match.flags.map((f) => <li key={f}>{FLAG_TEXT[f]}</li>)}
      </ul>
    </div>
  );
}

function Offers({ result, kitAvailable, config, paying, onBuyKit, onWatch }: Props) {
  const [email, setEmail] = useState('');
  const kitPrice = formatUSD((config?.kitPriceCents ?? 2500) / 100);
  const watchPrice = formatUSD((config?.watchPriceCents ?? 500) / 100);
  return (
    <div className="stack no-print">
      {kitAvailable && (
        <div className="stub"><div className="stub-head"><span>Raise kit</span><span>{kitPrice} once</span></div>
          <div className="stub-body offer">
            <h3>Turn this into a raise conversation</h3>
            <ul>
              <li>One-page evidence sheet with these postings</li>
              <li>A five-step script using your figures</li>
              <li>Follow-up email, ready to edit</li>
              <li>Answers to the five usual objections</li>
            </ul>
            {config?.payments
              ? <button className="btn" type="button" disabled={paying} onClick={onBuyKit}>{paying ? <><span className="spinner" aria-hidden="true" />Opening checkout</> : `Get the raise kit for ${kitPrice}`}</button>
              : <p className="small muted">Payments are not configured on this deployment, so the kit cannot be bought here.</p>}
          </div></div>
      )}
      {result.own.employer.found && (
        <div className="stub"><div className="stub-head"><span>Watch</span><span>{watchPrice} a month</span></div>
          <div className="stub-body offer">
            <h3>Know the day a new range is posted</h3>
            <p className="small">We re-run this check daily and email you when {nameOf(result.own)} posts a matching role with pay.</p>
            {config?.watch
              ? <form className="inline" onSubmit={(e) => { e.preventDefault(); onWatch(email); }}>
                  <label htmlFor="watch-email" className="small" style={{ flexBasis: '100%' }}>Email for alerts</label>
                  <input id="watch-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
                  <button className="btn quiet" type="submit" disabled={paying}>Start watching</button>
                </form>
              : <p className="small muted">Alerts are not configured on this deployment.</p>}
          </div></div>
      )}
    </div>
  );
}

function PeerRows({ peers, salary }: { peers: EmployerResult[]; salary: number }) {
  if (!peers.length) return null;
  return (
    <div className="stub" style={{ marginTop: '1.25rem' }}><div className="stub-head"><span>Other employers</span><span>Same title and level</span></div>
      <div className="stub-body scroll">
        <table>
          <thead><tr><th>Employer</th><th>Posting</th><th>Advertised pay</th><th>Against your salary</th></tr></thead>
          <tbody>
            {peers.map((p) => {
              if (!p.employer.found) return <tr key={p.employer.query}><td>{p.employer.query}</td><td colSpan={3} className="muted">No public job board we can read.</td></tr>;
              if (!p.match || !p.gap) return <tr key={p.employer.query}><td>{nameOf(p)}</td><td colSpan={3} className="muted">No matching US posting with a pay range right now.</td></tr>;
              const r = annualRange(p.match.posting.pay!);
              return (
                <tr key={p.employer.query}>
                  <td>{nameOf(p)}</td>
                  <td><a href={p.match.posting.url} target="_blank" rel="noreferrer">{p.match.posting.title}</a>{p.match.confidence === 'partial' && <span className="muted"> (related role)</span>}<br /><span className="small muted">{p.match.posting.location}</span></td>
                  <td className="num">{formatPay(p.match.posting.pay!)}</td>
                  <td className="num">{p.gap.status === 'below' ? `${formatUSD(r.min - salary)} below the bottom` : p.gap.status === 'within' ? 'inside the range' : 'above the range'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div></div>
  );
}

interface Props {
  result: CheckResult; kitAvailable: boolean; config: Config | null; paying: boolean;
  onBuyKit: () => void; onWatch: (email: string) => void;
}

export function ResultView(props: Props) {
  const { result } = props;
  const { own, input } = result;
  const employer = nameOf(own);

  if (!own.employer.found) {
    return (
      <div className="stack rise">
        <h2 className="verdict">We couldn&rsquo;t find a public job board for &ldquo;{input.employer}&rdquo;.</h2>
        <p style={{ maxWidth: '44rem' }}>
          We read boards hosted on Greenhouse, Ashby and Lever, using the company name as it appears in the board&rsquo;s address.
          Try the short name from your careers page link (for example <span className="num">boards.greenhouse.io/<b>reddit</b></span>). If your employer uses a different hiring system, we can&rsquo;t check it yet.
        </p>
        <PeerRows peers={result.peers} salary={input.salary} />
      </div>
    );
  }

  if (!own.match || !own.gap) {
    return (
      <div className="rise">
        <h2 className="verdict">No posting at {employer} matches your job closely enough to show.</h2>
        <div className="cols">
          <div className="stack">
            <p style={{ maxWidth: '40rem' }}>
              {employer} has <span className="num">{own.employer.totalPostings}</span> open roles on its{' '}
              <a href={own.employer.boardUrl} target="_blank" rel="noreferrer">public job board</a>, and{' '}
              <span className="num">{own.employer.usPostingsWithPay}</span> US postings that state pay. None is for a {LEVEL_LABEL[input.level].toLowerCase()} &ldquo;{input.title}&rdquo;.
              We would sooner show nothing than a wrong comparison.
            </p>
            <p className="muted" style={{ maxWidth: '40rem' }}>This does not mean you are paid fairly. It means your employer is not advertising your role with a pay range today. Try the title your company uses internally, or set the level by hand.</p>
          </div>
          <Offers {...props} />
        </div>
        <PeerRows peers={result.peers} salary={input.salary} />
      </div>
    );
  }

  const range = annualRange(own.match.posting.pay!);
  return (
    <div className="rise">
      <Verdict gap={own.gap} match={own.match} employer={employer} />
      <div className="pair">
        <div className="stub"><div className="stub-head"><span>What you are paid</span><span>You told us</span></div>
          <div className="stub-body">
            <div className="big">{formatUSD(input.salary)}</div>
            <ul className="lines"><li><span>Title</span><span>{input.title}</span></li><li><span>Level</span><span>{LEVEL_LABEL[input.level]}</span></li><li><span>Employer</span><span>{employer}</span></li></ul>
          </div></div>
        <div className="stub"><div className="stub-head"><span>What the ad says</span><span>Live posting</span></div>
          <div className="stub-body">
            <div className="big"><span className="mark">{formatPay(own.match.posting.pay!)}</span></div>
            <ul className="lines">
              <li><span>Posting</span><span>{own.match.posting.title}</span></li>
              <li><span>Location</span><span>{own.match.posting.location}</span></li>
              <li><span>{own.gap.status === 'below' ? 'Bottom of range vs you' : own.gap.status === 'within' ? 'Your position in range' : 'Top of range vs you'}</span>
                <span>{own.gap.status === 'below' ? `+${formatUSD(own.gap.toMin)}` : own.gap.status === 'within' ? `${own.gap.position}% of the way up` : `-${formatUSD(input.salary - range.max)}`}</span></li>
            </ul>
          </div></div>
      </div>
      <Scale gap={own.gap} salary={input.salary} />

      <div className="cols">
        <div className="stub"><div className="stub-head"><span>The evidence</span><span>{own.employer.source}</span></div>
          <div className="stub-body stack">
            <Posting match={own.match} employer={employer} />
            {own.alsoMatched.length > 0 && (<>
              <hr className="perf" />
              <p className="small"><b>Also advertised at your level</b></p>
              <div className="scroll"><table><tbody>
                {own.alsoMatched.map((m) => (
                  <tr key={m.posting.id}><td><a href={m.posting.url} target="_blank" rel="noreferrer">{m.posting.title}</a><br /><span className="small muted">{m.posting.location}</span></td><td className="num">{formatPay(m.posting.pay!)}</td></tr>
                ))}
              </tbody></table></div>
            </>)}
            <p className="small muted">
              Read from {employer}&rsquo;s <a href={own.employer.boardUrl} target="_blank" rel="noreferrer">public job board</a> at {new Date(result.checkedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}:
              {' '}{own.employer.usPostingsWithPay} of {own.employer.totalPostings} open roles are US postings with stated pay.
              {' '}Matched by {result.matcher === 'rules+ai' ? 'title rules, confirmed by an AI review of level and role' : 'title and level rules'}.
            </p>
          </div></div>
        <Offers {...props} />
      </div>
      <PeerRows peers={result.peers} salary={input.salary} />
    </div>
  );
}
