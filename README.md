# Ataa (عطاء)

A bilingual (Arabic RTL / English) donations and fundraising platform for a small NGO: campaigns with goals, donors, one-off and monthly pledges, receipts, in-kind gifts, beneficiary cases, fund allocation with director approval, transparency reports, volunteer shifts and hours, and a public campaign page where the money breakdown is visible.

Product direction, scope and delivery: Nada Gamal

This is a portfolio demo. Everything runs on invented people and an invented foundation (all emails end in `.example`).

## Try it

Live demo: see the repository description. Sign in with a PIN (the PINs are public on purpose, this is a demo):

| PIN | Role | What it can do |
| --- | --- | --- |
| 1111 | Executive director (Laila) | Everything: refunds, approving allocations, admin costs, settings, audit log, reset |
| 2222 | Fundraising officer (Hossam) | Campaigns, donors, gifts, pledges, in-kind gifts, reports. Sees cases by code only, no names or phones |
| 3333 | Program officer (Mariam) | Beneficiary cases, allocating funds (above the limit it waits for the director), in-kind distribution, shifts, hour approval. No donor data |
| 4444 | Volunteer (Yara) | Sign up for shifts, log hours, certificate progress |

The public giving page (`#/give`) needs no sign-in.

## Rules the system enforces

- A campaign is draft, active, paused or closed. Only an active campaign inside its dates takes gifts. A closed campaign cannot reopen.
- Gifts are whole EGP amounts. Staff can back-date a gift by at most 60 days, never into the future. A gift above the review limit (50,000 EGP) must be recorded by the director.
- Every gift gets a receipt number (`R-year-number`), in-kind gifts get `K-year-number`. A refund is the director's action, needs a reason, and is blocked if the money is already allocated.
- Money is allocated to a case or to admin costs. Funds must match the case category (emergency funds can go anywhere). An allocation cannot exceed what the case still needs or what the campaign has unallocated.
- A program officer's allocation above 15,000 EGP waits for the director. While it waits it reserves the money so it cannot be spent twice.
- Admin costs are capped at 10% of money raised per campaign, recorded by the director only.
- Monthly pledges create their gifts when you run them. Running twice never pays a month twice. A paused or cancelled pledge is skipped.
- In-kind items can only go to a case of a matching category and are never counted as cash.
- Volunteers log 0.5 to 12 hours in half-hour steps, at most 12 per day, for the last 30 days. Hours count after the program officer approves them. Shifts cannot overlap.
- The public page takes gifts from 10 to 5,000 EGP, at most 60 per hour in total. The demo takes no money and sends no email.
- Case data is split by role: the fundraiser sees codes, the program officer and director see names. The public page shows no donor or case personal data. Donors who opted out are not on the wall.
- Email and phone are normalized and unique. CSV export escapes cells that start with `=`, `+`, `-` or `@`.
- Repeating a request with the same `key` does not create a second record.

## Architecture

- `public/logic.js`: all rules, the seed data, reports and per-role views. Used by the server, the front end and the tests.
- `api/data.js`: one serverless endpoint. Sign in, run an operation, read the view for your role. `?public=1` returns the public page data and `publicDonate` takes a public gift.
- `api/_auth.js`: signed tokens (set `ATAA_SECRET` in production).
- `public/app.js`, `i18n.js`, `style.css`: plain JavaScript front end, no framework, no build step.
- `dev-server.mjs`: local server with the same API.

State lives in the memory of the running server and is rebuilt from the seed about every 6 hours and on every restart.

## Run and test

```
npm ci
PORT=3100 node dev-server.mjs         # http://localhost:3100
npm test                              # unit tests (node:test)
./run-local.sh node e2e/e2e.mjs http://localhost:3100   # browser and API checks, needs Chrome
node e2e/e2e.mjs https://your-deploy.vercel.app          # same checks against a deployment
node e2e/shots.mjs http://localhost:3100                 # screenshots into docs/
```

The e2e run resets the demo data at the start and at the end, and it deliberately fills the public rate limit once.

## Honest limits

- The PINs are public and there is no real authentication, password reset or account creation.
- No payments. The public give page records a demo gift only, no card, wallet or bank is contacted.
- No email, SMS or WhatsApp receipts. A receipt is a printable page, not a tax document.
- Data is in memory and resets about every 6 hours. Do not enter real personal data.
- No file upload. Case notes are text.
- In-kind values are estimates typed by staff.
- Some server error messages (for example field validation) appear in English even when the screen is in Arabic. The common ones are translated.
- The e2e suite drives the shared demo, so run it only on a demo deployment.
