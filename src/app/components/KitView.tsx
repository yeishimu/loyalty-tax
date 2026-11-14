'use client';

import { useState } from 'react';
import { formatUSD } from '@/lib/pay';
import type { Kit } from '@/lib/kit';
import type { CheckResult } from '@/lib/types';

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button" className="btn quiet no-print"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { setDone(false); }
      }}
    >{done ? 'Copied' : label}</button>
  );
}

export function KitView({ kit, result }: { kit: Kit; result: CheckResult }) {
  const scriptText = kit.script.map((s) => `${s.step}: ${s.say}`).join('\n\n');
  return (
    <article className="kit stub rise">
      <div className="stub-head"><span>Raise kit</span><span>{result.input.title}</span></div>
      <div className="stub-body">
        <h2>{kit.headline}</h2>
        <p className="no-print" style={{ marginTop: '0.75rem' }}><button type="button" className="btn quiet" onClick={() => window.print()}>Print or save as PDF</button></p>

        <section>
          <h3>Before you use this</h3>
          <ul className="cautions">{kit.cautions.map((c) => <li key={c}>{c}</li>)}</ul>
        </section>

        <section>
          <h3>1. Evidence sheet</h3>
          <div className="scroll"><table>
            <thead><tr><th>Employer</th><th>Posting</th><th>Location</th><th>Advertised pay</th><th>Note</th></tr></thead>
            <tbody>{kit.evidence.map((e) => (
              <tr key={e.url}><td>{e.employer}{e.own && <span className="muted"> (yours)</span>}</td><td><a href={e.url} target="_blank" rel="noreferrer">{e.title}</a></td><td>{e.location}</td><td className="num">{e.pay}</td><td className="small muted">{e.note}</td></tr>
            ))}</tbody>
          </table></div>
          <p className="small muted" style={{ marginTop: '0.5rem' }}>Your salary: <span className="num">{formatUSD(result.input.salary)}</span>. Postings read on {new Date(result.checkedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Save the posting pages; ads are taken down when roles are filled.</p>
        </section>

        <section>
          <h3>2. What to ask for</h3>
          <p><span className="mark num">{formatUSD(kit.ask.low)} to {formatUSD(kit.ask.high)}</span> &nbsp;{kit.ask.rationale}</p>
        </section>

        <section>
          <h3>3. The conversation</h3>
          <dl style={{ margin: 0 }}>{kit.script.map((s) => (<div className="say" key={s.step}><dt>{s.step}</dt><dd>{s.say}</dd></div>))}</dl>
          <p style={{ marginTop: '0.75rem' }}><Copy text={scriptText} label="Copy the script" /></p>
        </section>

        <section>
          <h3>4. Follow-up email</h3>
          <p className="small muted" style={{ marginBottom: '0.5rem' }}>Subject: {kit.email.subject}</p>
          <pre className="email">{kit.email.body}</pre>
          <p style={{ marginTop: '0.75rem' }}><Copy text={`Subject: ${kit.email.subject}\n\n${kit.email.body}`} label="Copy the email" /></p>
        </section>

        <section>
          <h3>5. If they say&hellip;</h3>
          <dl style={{ margin: 0 }}>{kit.objections.map((o) => (<div className="say" key={o.theySay}><dt>&ldquo;{o.theySay}&rdquo;</dt><dd>{o.youSay}</dd></div>))}</dl>
        </section>

        <p className="small muted" style={{ marginTop: '1.5rem' }}>
          {kit.writtenBy === 'template+ai' ? 'Figures come from the postings above; the wording was tailored by an AI model and checked to keep every figure unchanged.' : 'Figures come from the postings above; the wording is our standard script.'}
          {' '}This is not legal or career advice.
        </p>
      </div>
    </article>
  );
}
