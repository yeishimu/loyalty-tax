'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUSD } from '@/lib/pay';
import { LEVEL_LABEL } from '@/lib/titles';
import type { CheckInput, CheckResult, Level } from '@/lib/types';
import type { Kit } from '@/lib/kit';
import { KitView } from './KitView';
import { ResultView } from './ResultView';

export interface Config { payments: boolean; watch: boolean; ai: boolean; kitPriceCents: number; watchPriceCents: number }

const EXAMPLES: Array<{ label: string; input: FormState }> = [
  { label: 'Senior Software Engineer at Reddit', input: { employer: 'Reddit', title: 'Senior Software Engineer', salary: '175000', level: 'auto', location: '', peers: 'Coinbase, Pinterest' } },
  { label: 'Accountant at Lyft', input: { employer: 'Lyft', title: 'Accountant', salary: '68000', level: 'auto', location: 'San Francisco, CA', peers: '' } },
  { label: 'Product Designer at Figma', input: { employer: 'Figma', title: 'Product Designer', salary: '160000', level: 'auto', location: '', peers: 'Notion' } },
];

interface FormState { employer: string; title: string; salary: string; level: Level | 'auto'; location: string; peers: string }
const EMPTY: FormState = { employer: '', title: '', salary: '', level: 'auto', location: '', peers: '' };
const STORE = 'loyalty-tax:last-check';

const toInput = (f: FormState): CheckInput => ({
  employer: f.employer, title: f.title, salary: Number(f.salary.replace(/[^0-9.]/g, '')),
  level: f.level, location: f.location, peers: f.peers.split(',').map((p) => p.trim()).filter(Boolean),
});

async function post<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'The request failed. Check your connection and try again.');
  return data as T;
}

const remember = (f: FormState) => { try { sessionStorage.setItem(STORE, JSON.stringify(f)); } catch { /* storage may be blocked; the check still works */ } };
const recall = (): FormState | null => { try { const s = sessionStorage.getItem(STORE); return s ? { ...EMPTY, ...JSON.parse(s) } : null; } catch { return null; } };

export function App() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState<'check' | 'kit' | 'pay' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [kitOk, setKitOk] = useState(false);
  const [kit, setKit] = useState<Kit | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const runCheck = useCallback(async (f: FormState) => {
    setBusy('check'); setError(''); setKit(null);
    try {
      const data = await post<{ result: CheckResult; kitAvailable: boolean }>('/api/check', toInput(f));
      setResult(data.result); setKitOk(data.kitAvailable); remember(f);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (e) {
      setResult(null); setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  // Load what this deployment can deliver, and pick up where a payment redirect left off.
  useEffect(() => {
    fetch('/api/config').then((r) => r.json()).then(setConfig).catch(() => setConfig(null));
    const params = new URLSearchParams(window.location.search);
    const paid = params.get('paid');
    const watching = params.get('watching');
    const cancelled = params.get('cancelled');
    if (!paid && !watching && !cancelled) return;
    window.history.replaceState(null, '', window.location.pathname);
    const saved = recall();
    if (saved) setForm(saved);

    (async () => {
      if (paid && saved) {
        setBusy('kit');
        try {
          const data = await post<{ result: CheckResult; kit: Kit }>('/api/kit', { session: paid, input: toInput(saved) });
          setResult(data.result); setKitOk(true); setKit(data.kit);
        } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
        return;
      }
      if (paid && !saved) { setError('Payment received, but this browser no longer has your check details. Enter them again with the same employer and title and your kit will unlock.'); return; }
      if (watching) {
        try {
          const data = await post<{ email?: string }>('/api/watch', { session: watching });
          setNotice(`Watch started. We will email ${data.email ?? 'you'} when a new matching posting appears.`);
        } catch (e) { setError((e as Error).message); }
      }
      if (cancelled) setNotice('Checkout was cancelled. Nothing was charged.');
      if (saved) await runCheck(saved);
    })();
  }, [runCheck]);

  const pay = async (kind: 'kit' | 'watch', email?: string) => {
    setBusy('pay'); setError('');
    try {
      remember(form);
      const { url } = await post<{ url: string }>('/api/checkout', { kind, input: toInput(form), email });
      window.location.assign(url);
    } catch (e) { setError((e as Error).message); setBusy(null); }
  };

  const set = <K extends keyof FormState>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value as FormState[K] }));

  return (
    <>
      <div className="wrap">
        <header className="top">
          <div className="wordmark">Loyalty<span>Tax</span></div>
          <nav aria-label="Sections"><a href="#how">How it works</a><a href="#cost">What it costs</a><a href="#limits">Limits</a></nav>
        </header>

        <div className="hero">
          <div>
            <h1>Is your employer advertising <span className="mark">your job</span> for more than it pays you?</h1>
            <p className="lede">
              Pay-transparency laws make companies print salary ranges in their job ads. Loyalty Tax reads your own
              employer&rsquo;s live postings and shows you the range for your role, next to what you earn.
            </p>
            <ul className="facts">
              <li><span className="num">21%</span><span>of US employees have seen their own job advertised for more by their current employer. <a href="https://www.paychex.com/articles/human-resources/employees-comparing-pay-to-job-postings">Paychex, 2026</a></span></li>
              <li><span className="num">64%</span><span>of people who saw a higher-paying posting never asked for a raise. Same survey.</span></li>
              <li><span className="num">84%</span><span>of US postings stated a pay range at the 27 tech employers we tested in November 2026. <a href="https://github.com/yeishimu/loyalty-tax/tree/main/research">Our test</a></span></li>
            </ul>
          </div>

          <form className="stub" onSubmit={(e) => { e.preventDefault(); void runCheck(form); }} aria-label="Check your pay">
            <div className="stub-head"><span>Pay check</span><span>Free</span></div>
            <div className="stub-body stack">
              <div className="field">
                <label htmlFor="employer">Employer</label>
                <input id="employer" name="employer" value={form.employer} onChange={set('employer')} placeholder="Reddit" autoComplete="organization" required maxLength={80} />
              </div>
              <div className="field">
                <label htmlFor="title">Your job title</label>
                <input id="title" name="title" value={form.title} onChange={set('title')} placeholder="Senior Software Engineer" autoComplete="organization-title" required maxLength={120} />
              </div>
              <div className="row">
                <div className="field">
                  <label htmlFor="salary">Base salary, per year</label>
                  <div className="money"><input id="salary" name="salary" inputMode="numeric" value={form.salary} onChange={set('salary')} placeholder="175000" required /></div>
                </div>
                <div className="field">
                  <label htmlFor="level">Level</label>
                  <select id="level" name="level" value={form.level} onChange={set('level')}>
                    <option value="auto">From my title</option>
                    {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
                  </select>
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label htmlFor="location">City or state <span className="opt">(optional)</span></label>
                  <input id="location" name="location" value={form.location} onChange={set('location')} placeholder="Seattle, WA" maxLength={80} />
                </div>
                <div className="field">
                  <label htmlFor="peers">Also compare <span className="opt">(up to 3)</span></label>
                  <input id="peers" name="peers" value={form.peers} onChange={set('peers')} placeholder="Coinbase, Pinterest" maxLength={200} />
                </div>
              </div>
              <button className="btn" type="submit" disabled={busy !== null}>
                {busy === 'check' ? <><span className="spinner" aria-hidden="true" />Reading live job postings</> : 'Check my pay'}
              </button>
              <p className="small muted">Your salary is used for this comparison and is not stored. We read the employer&rsquo;s public job board; nobody there is notified.</p>
              <hr className="perf" />
              <div className="examples">
                <span className="small muted">Try a real one:</span>
                {EXAMPLES.map((ex) => (
                  <button key={ex.label} type="button" className="chip" disabled={busy !== null} onClick={() => { setForm(ex.input); void runCheck(ex.input); }}>{ex.label}</button>
                ))}
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="wrap result" ref={resultRef} aria-live="polite">
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        {busy === 'kit' && <p className="notice"><span className="spinner" aria-hidden="true" />Payment confirmed. Building your raise kit from the live postings.</p>}
        {result && !kit && (
          <ResultView result={result} kitAvailable={kitOk} config={config} paying={busy === 'pay'} onBuyKit={() => pay('kit')} onWatch={(email) => pay('watch', email)} />
        )}
        {result && kit && <KitView kit={kit} result={result} />}
      </div>

      <div className="wrap">
        <section className="band" id="how">
          <h2>How it works</h2>
          <ol className="steps">
            <li><h3>You name your job</h3><p>Employer, title, level and salary. No account, and no access to anything at your company.</p></li>
            <li><h3>We read the ads</h3><p>We fetch your employer&rsquo;s public job board live and keep US postings that state pay. Every figure links to the original ad.</p></li>
            <li><h3>We match carefully</h3><p>Same job, same level. If the closest posting is a level away or a related role, we say so. If nothing fits, we show nothing.</p></li>
          </ol>
        </section>

        <section className="band" id="cost">
          <h2>What it costs</h2>
          <div className="plans">
            <div className="stub"><div className="stub-head"><span>The check</span><span>Free</span></div><div className="stub-body stack">
              <p>The matching posting, its pay range, where your salary sits, and up to three other employers.</p></div></div>
            <div className="stub"><div className="stub-head"><span>Raise kit</span><span>{formatUSD((config?.kitPriceCents ?? 2500) / 100)} once</span></div><div className="stub-body stack">
              <p>An evidence sheet, a five-step script for the conversation, a follow-up email and answers to the usual objections, built from your postings.</p>
              {config && !config.payments && <p className="small muted">Not available on this deployment: payments are not configured.</p>}</div></div>
            <div className="stub"><div className="stub-head"><span>Watch</span><span>{formatUSD((config?.watchPriceCents ?? 500) / 100)} a month</span></div><div className="stub-body stack">
              <p>A daily re-check, and an email the day your employer posts your role with a pay range.</p>
              {config && !config.watch && <p className="small muted">Not available on this deployment: alerts are not configured.</p>}</div></div>
          </div>
        </section>

        <section className="band" id="limits">
          <h2>What this can&rsquo;t tell you</h2>
          <ul className="limits">
            <li>A posted range is what a company advertises to candidates. It is evidence for a conversation, not proof of what you are owed.</li>
            <li>We can only read employers whose job boards run on Greenhouse, Ashby or Lever. That covers many tech companies and few others.</li>
            <li>Postings without a stated pay range are ignored, so an empty result does not mean you are paid fairly.</li>
            <li>Ranges can differ by location and include levels above yours. Read the posting before you quote it.</li>
          </ul>
        </section>

        <footer>Loyalty Tax is not legal or career advice. Job data comes from employers&rsquo; own public postings at the moment you run the check.</footer>
      </div>
    </>
  );
}
