# Loyalty Tax

**Is your employer advertising your job for more than it pays you?**

Pay-transparency laws make companies print salary ranges in their job ads. Loyalty Tax reads your own employer's live job postings, finds the one for your role and level, and shows its pay range next to your salary. If there is a gap, it sells you a kit for the raise conversation and can watch for new postings.

- **User:** a salaried US employee, 28 to 45, three or more years in the same role at a tech or startup employer.
- **Pain:** new hires are offered more for the same job, and the employee has no proof.
- **Why it's checkable:** the evidence is the employer's own public ad, linked in every result.

## What it does

| | What you get | Price |
|---|---|---|
| **Check** | The matching posting, its pay range, where your salary sits, and up to three other employers | Free |
| **Raise kit** | Evidence sheet, five-step conversation script, follow-up email, answers to the usual objections | $25 once |
| **Watch** | Daily re-check and an email when your employer posts your role with a pay range | $5 a month |

## How it works

1. **Find the board.** Employers publish open roles through hiring systems with public, key-free JSON feeds. `src/lib/boards.ts` turns the employer name into likely board ids and reads Greenhouse, Ashby and Lever live. Nothing is scraped from behind a login and no posting data is stored.
2. **Read the pay.** `src/lib/pay.ts` extracts stated pay from each posting: annual and hourly figures, `$120k` forms, several ranges in one ad. It ignores money that is not pay (funding, stipends).
3. **Keep US postings with pay.** `src/lib/location.ts`.
4. **Match the job and the level.** `src/lib/titles.ts` parses titles into a seniority level, a track (individual or people manager) and role words, then scores each posting. A posting one level away can never score as a strong match. If nothing clears the bar, the result is "no match", not a guess.
5. **Optional AI review.** With an `ANTHROPIC_API_KEY`, a model gets the shortlist and has the final say on level and near-miss titles (`src/lib/ai.ts`). It can only choose from the shortlist or say "none"; any failure falls back to the rules.
6. **Compute the gap** and render it (`src/lib/check.ts`, `src/app/components`).

The raise kit (`src/lib/kit.ts`) is built from the postings in the result. Every figure in it comes from the check; when AI wording is enabled, the rewrite is rejected unless every dollar figure and the posting link survive unchanged.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 57 tests on real captured postings
npm run smoke        # live end-to-end check against the running app
```

Requires Node 18.18 or newer. With no environment variables the free check works on live data, and the paid features show as unavailable instead of pretending to work.

## Configuration

Copy `.env.example` to `.env.local`. Every variable is optional.

| Variable | Enables |
|---|---|
| `STRIPE_SECRET_KEY` | Raise kit checkout and the watch subscription (test or live key) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | AI review of matches and tailored kit wording |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Storage for watches (Upstash Redis REST or Vercel KV) |
| `RESEND_API_KEY`, `ALERT_FROM_EMAIL` | Alert emails |
| `CRON_SECRET` | Protects the daily watch job |
| `KIT_PRICE_CENTS`, `WATCH_PRICE_CENTS` | Prices, default 2500 and 500 |

## Deploy

Import the repository into Vercel and add the variables above. `vercel.json` schedules the daily watch job at `/api/cron/watch`. Any Node host works; schedule a daily GET to that path with `Authorization: Bearer $CRON_SECRET`.

## Payments

Stripe Checkout over the REST API (`src/lib/stripe.ts`), no webhook needed for the kit:

- The server re-runs the check before creating a session, so a price is only charged for a result the server has seen.
- The session carries a fingerprint of the employer and title. The kit is released only when Stripe reports that session as paid and the fingerprint matches.

## Evidence the idea holds up

Measured on 14 November 2026 (`research/`):

- **Coverage:** of 30 tech and fintech employers, 27 had a readable public board, 25 of those published pay, and 2,320 of 2,765 US postings (84%) stated a range.
- **Matching:** on 20 sample employees, a first rules-only matcher gave 18 acceptable outcomes. The two failures (a Staff engineer matched to Senior Staff, a missed finance analyst) are now regression tests.
- **Demand:** in Paychex's 2026 survey, 21% of US employees had seen their own job advertised for more by their current employer, and 64% of those who saw a higher posting never asked for a raise.

## Limits

- Only employers on Greenhouse, Ashby or Lever can be read. That covers many tech companies and few others; the 84% figure is the best case, not the market.
- The employer is found by guessing its board id from its name. The result links the board so the user can confirm it is the right company.
- Postings without stated pay are ignored, so an empty result does not mean someone is paid fairly.
- A posted range is what a company advertises to candidates. It is evidence for a conversation, not proof of what anyone is owed.
- The in-memory rate limit and board cache are per server instance.
- Watch billing uses a Stripe subscription, but cancelling the subscription does not yet stop the watch automatically (that needs a webhook). The unsubscribe link stops the emails.
- There are no user accounts. A kit is tied to the checkout session and the browser that bought it.

## Layout

```
src/lib/        boards, pay, location, titles, check, ai, kit, stripe, watch
src/app/api/    check, checkout, kit, watch, cron/watch, config
src/app/        page and components
tests/          unit and pipeline tests on captured postings
research/       Phase 1 coverage script and results
scripts/        live smoke test
```

Not legal or career advice.
