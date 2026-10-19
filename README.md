# Platinum Credit Tracker

A web app for Amex Platinum cardmembers to track every statement credit (Resy, lululemon, Oura, Uber, Digital Entertainment, hotel, airline, CLEAR+, Walmart+, Equinox, …) by period, and get reminded **before** each one expires.

## What it does

| Feature | How |
|---|---|
| Per-credit, per-period tracking | Monthly, quarterly, semi-annual and annual calendar periods. Checkbox = "used", or add partial amounts. The Year view shows every period at once and lets you backfill. |
| Reminders | Daily digest email at your chosen hour and time zone. Lead times per cadence (defaults: monthly 10/4/1 days, quarterly 30/14/7/2, semi-annual 60/30/14/7/2, annual 90/60/30/14/7/2). Never repeats a lead time, never skips one if a day is missed, and warns when enrollment is still required. |
| Phone push | Optional free [ntfy](https://ntfy.sh) topic in Settings; the same digest arrives as a push notification (`NTFY_SERVER` env to self-host). |
| Calendar alerts | Private `.ics` feed (Settings) for Google/Apple/Outlook with the same alerts. |
| Auto-detection | Amex activity **CSV import** (posted credit lines are checked off automatically; qualifying charges go to a confirm list) and optional **Gmail** scanning of Amex alerts and merchant receipts. |
| Guides | "How to use it" for every credit (on each card and in the Guides tab). |
| Catalog | `src/catalog.js`, current as of 2026-10-19. Edit it when Amex changes benefits. |

## Is automatic tracking possible? (honest answer)

* Amex has **no public consumer API** for transactions, and scraping logins violates their terms and breaks constantly, so the app does not do that.
* Posted credits show on your statement and CSV, so **CSV import is the reliable path** (it recognises "…CREDIT" lines and checks them off).
* **Gmail** works from emails you already get. Credit postings are not reliably emailed, so detection mostly comes from (a) Amex spending alerts (turn on alerts for every charge, $0.01 threshold) and (b) merchant receipts. Those say "you spent at a qualifying merchant", so you confirm them unless you opt into auto-counting.
* The email/CSV text patterns are written from known formats but **have not been tested against real Amex or Google data**. Treat the first scans as a trial and adjust the regexes in `src/catalog.js` (`matchers`) if something is missed.
* Google classifies `gmail.readonly` as a *restricted* scope: public launch requires Google verification and a security assessment. For you and family, keep the OAuth app in "Testing" and add each person as a test user (tokens then expire every 7 days, so reconnect weekly), or skip Gmail and use CSV import.

## Run locally

```bash
npm install
npm start              # http://localhost:3000   (Node >= 22.13)
npm test
```
Without `SMTP_HOST`, emails are written to `data/outbox.log` so you can see them.

## Deploy (needs your accounts)

1. Put this folder in a GitHub repo.
2. Host somewhere with a persistent disk (SQLite lives in `DATA_DIR`): Render (`render.yaml`), Fly.io, Railway or any Docker host. Set `BASE_URL` to the public HTTPS URL.
3. **Email**: create an account with an SMTP provider (Resend, Postmark or SendGrid have free tiers), verify a sending domain, and set `SMTP_*` and `MAIL_FROM`.
4. **Gmail (optional)**: Google Cloud Console → new project → enable Gmail API → OAuth consent screen (External, Testing; add test users) → Credentials → OAuth client (Web). Authorized redirect URI: `BASE_URL/api/gmail/callback`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Set `SECRET_KEY` (`openssl rand -hex 32`) and keep it; it encrypts Gmail tokens.

## Security notes
scrypt password hashes, httpOnly SameSite cookies, strict CSP, rate-limited auth, Gmail refresh tokens encrypted at rest (AES-256-GCM), email bodies never stored. Not built yet: SMS, 2FA, email verification at signup.

*Independent tool; not affiliated with or endorsed by American Express. Benefit terms change, so confirm in your Amex account.*
