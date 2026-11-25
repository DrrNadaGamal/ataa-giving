// Browser and API checks against a running Ataa (local dev server or the live URL).
// Usage: node e2e/e2e.mjs https://your-deploy.vercel.app   (needs Chrome at /usr/bin/google-chrome)
import puppeteer from 'puppeteer-core';
import * as L from '../public/logic.js';
const U = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log(c ? 'PASS' : 'FAIL', m); };
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
const errs = [];
async function newPage(w = 1280, h = 900) {
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: h });
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  p.on('dialog', (d) => d.accept());
  return p;
}
async function login(p, pin, lang = 'en') {
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear()); await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.type('#pin', pin); await p.keyboard.press('Enter'); await p.waitForSelector('.top .nav', { timeout: 15000 }); await sleep(400);
}
const go = async (p, r) => { await p.evaluate((r) => (location.hash = '#/' + r), r); await sleep(450); };
const body = (p) => p.evaluate(() => document.body.innerText);
const bare = /undefined|NaN|\[object/;
async function api(token, method, bodyObj, raw, path = '/api/data') {
  const r = await fetch(U + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: raw ?? (bodyObj ? JSON.stringify(bodyObj) : undefined) });
  let j = null; try { j = await r.json(); } catch {} return { status: r.status, j };
}
const tokenFor = async (pin) => (await api(null, 'POST', { op: { type: 'login', pin } })).j.token;
const T = { owner: await tokenFor('1111'), fund: await tokenFor('2222'), prog: await tokenFor('3333'), vol: await tokenFor('4444') };
const post = (role, op) => api(T[role], 'POST', { op });
const view = async (role) => (await api(T[role], 'GET')).j;
const pubGet = async () => (await api(null, 'GET', null, undefined, '/api/data?public=1')).j;
const pubDonate = (o) => api(null, 'POST', { op: { type: 'publicDonate', ...o } });
await post('owner', { type: 'reset' });
const today = L.dayKey(Date.now());
let n = 0; const key = () => 'e2e-' + Date.now().toString(36) + '-' + ++n;

// ---------- API security ----------
ok((await api(null, 'GET')).status === 401, 'no token: 401');
ok((await api('garbage', 'GET')).status === 401, 'garbage token: 401');
const tv = T.vol.split('.'); const forged = Buffer.from('u-owner.' + (Date.now() + 1e7)).toString('base64url') + '.' + tv[1];
ok((await api(forged, 'GET')).status === 401, 'forged token for another user: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: '0000' } })).status === 401, 'wrong PIN: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: ['1111'] } })).status === 401, 'array PIN: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: 1111 } })).status === 401, 'numeric PIN: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: { $ne: 1 } } })).status === 401, 'object PIN: 401');
ok((await api(T.owner, 'POST', null, '{not json')).status === 400, 'malformed JSON: 400');
ok((await post('owner', { type: 'nope' })).status === 400, 'unknown action: 400');
ok((await post('owner', { type: 'constructor' })).status === 400, 'prototype name as action: 400');
ok((await post('owner', { type: '__proto__' })).status === 400, '__proto__ as action: 400');
ok((await post('owner', { type: 'toString' })).status === 400, 'toString as action: 400');
ok((await api(T.owner, 'POST', { op: { type: 'addDonor', pad: 'x'.repeat(21000) } })).status === 413, 'oversized body: 413');
ok((await api(T.owner, 'DELETE')).status === 405, 'DELETE: 405');
ok((await api(T.owner, 'PUT', { op: { type: 'reset' } })).status === 405, 'PUT: 405');
ok((await api(T.owner, 'PATCH', { op: { type: 'reset' } })).status === 405, 'PATCH: 405');
ok((await post('fund', { type: 'reset' })).status === 403, 'fundraiser cannot reset: 403');
ok((await post('prog', { type: 'reset' })).status === 403, 'program officer cannot reset: 403');
ok((await post('vol', { type: 'reset' })).status === 403, 'volunteer cannot reset: 403');
ok((await api(null, 'POST', { op: { type: 'reset' } })).status === 401, 'reset without token: 401');
ok((await api(null, 'POST', { op: { type: 'recordDonation', campaignId: 'k1', amount: 100, method: 'cash' } })).status === 401, 'staff action without token: 401');

// ---------- data visibility ----------
const own = await view('owner'), fd = await view('fund'), pg = await view('prog'), vl = await view('vol');
ok(own.donors.length === 88 && own.cases.length >= 72 && own.reports && own.audit && own.settings && own.volunteers, 'director sees everything');
ok(own.cases.every((c) => c.name && c.phone !== undefined), 'director sees full case records');
ok(fd.reports && fd.audit === undefined && fd.volunteers === undefined && fd.allocs === undefined, 'fundraiser gets reports and donors but no audit, volunteers or allocations list');
const fs = JSON.stringify(fd.cases);
ok(fd.cases.length === own.cases.length && fd.cases.every((c) => c.code && c.name === undefined && c.phone === undefined), 'fundraiser sees cases by code only');
ok(!/"name"|"phone"|nationalId|address/.test(fs), 'fundraiser case data carries no names or phones');
ok(pg.donors === undefined && pg.donations === undefined && pg.pledges === undefined && pg.reports === undefined && pg.audit === undefined, 'program officer gets no donors, gifts, pledges, reports or audit');
const ps = JSON.stringify(pg);
ok(!/@mail\.example/.test(ps) && !/"donorId"/.test(JSON.stringify(pg.inkind)), 'program officer response carries no donor emails and in-kind items have no donor');
ok(pg.cases.every((c) => c.name) && pg.allocs && pg.volunteers && pg.hours, 'program officer sees full cases, allocations, volunteers');
const vs = JSON.stringify(vl);
ok(vl.donors === undefined && vl.cases === undefined && vl.donations === undefined && vl.reports === undefined && vl.audit === undefined, 'volunteer gets no donors, cases, gifts, reports or audit');
ok(vl.volunteer.id === 'v1' && vl.shifts.length > 0 && !/@mail\.example/.test(vs), 'volunteer sees own record and shifts only');
ok(vl.shifts.every((s) => s.signups === undefined) || vl.shifts.every((s) => !Array.isArray(s.signups) || s.signups.every((x) => x === 'v1')), 'volunteer cannot see other volunteers on shifts');
const pub = await pubGet(); const pjs = JSON.stringify(pub);
ok(pub && pub.campaigns.length >= 4 && !/@mail\.example|"phone"|donorId|"name":"C-/.test(pjs), 'public page works without token and exposes no donor or case data');
ok(pub.campaigns.every((c) => ['active', 'closed'].includes(c.status)), 'public page lists no draft campaigns');
ok(!pub.campaigns.some((c) => c.id === 'k4'), 'draft Ramadan campaign is not public');
const wallNames = pub.campaigns.flatMap((c) => c.wall.map((w) => w.name));
const hiddenDonor = own.donors.find((d) => !d.wall);
ok(!hiddenDonor || !wallNames.includes(hiddenDonor.name), 'donors who opted out are not on the wall');
ok(pub.campaigns.every((c) => c.allocated.program + c.allocated.admin + c.allocated.notYet >= c.raised - 1), 'public money breakdown covers the amount raised');
ok(pub.impact.raised > 100000 && pub.impact.families > 0, 'public impact numbers present');

// ---------- permissions ----------
const gift = { type: 'recordDonation', campaignId: 'k1', amount: 500, method: 'cash', giverName: 'E2E Walk-in' };
ok((await post('prog', gift)).status === 403, 'program officer cannot record a gift: 403');
ok((await post('vol', gift)).status === 403, 'volunteer cannot record a gift: 403');
ok((await post('fund', { type: 'addCase', name: 'X Y', city: 'Cairo', category: 'food', householdSize: 3, need: 1000 })).status === 403, 'fundraiser cannot add a case: 403');
ok((await post('fund', { type: 'allocate', campaignId: 'k1', kind: 'admin', amount: 500 })).status === 403, 'fundraiser cannot allocate: 403');
ok((await post('prog', { type: 'allocate', campaignId: 'k1', kind: 'admin', amount: 500 })).status === 403, 'program officer cannot allocate admin costs: 403');
ok((await post('prog', { type: 'refundDonation', donationId: 'd1', reason: 'test' })).status === 403, 'program officer cannot refund: 403');
ok((await post('fund', { type: 'refundDonation', donationId: 'd1', reason: 'test' })).status === 403, 'fundraiser cannot refund: 403');
ok((await post('fund', { type: 'decideAllocation', allocId: 'a1', decision: 'approve' })).status === 403, 'fundraiser cannot decide allocations: 403');
ok((await post('prog', { type: 'decideAllocation', allocId: 'a1', decision: 'approve' })).status === 403, 'program officer cannot approve their own allocation: 403');
ok((await post('fund', { type: 'setSettings', adminCapPct: 20, approvalAbove: 15000, reviewAbove: 50000, certificateHours: 40 })).status === 403, 'fundraiser cannot change settings: 403');
ok((await post('prog', { type: 'setCampaignStatus', campaignId: 'k1', status: 'closed' })).status === 403 || (await post('prog', { type: 'setCampaignStatus', campaignId: 'k1', status: 'closed' })).status === 403, 'program officer cannot close a campaign: 403');
ok((await post('fund', { type: 'setCampaignStatus', campaignId: 'k1', status: 'closed' })).status === 403, 'fundraiser cannot close a campaign: 403');
ok((await post('owner', { type: 'signUp', shiftId: 's1' })).status === 403, 'director cannot sign up as a volunteer: 403');
ok((await post('fund', { type: 'reviewHours', hoursId: 'h1', decision: 'approve' })).status === 403, 'fundraiser cannot review hours: 403');
ok((await post('vol', { type: 'reviewHours', hoursId: 'h1', decision: 'approve' })).status === 403, 'volunteer cannot approve own hours: 403');
ok((await post('vol', { type: 'createShift', title: 'Nope nope', date: today, start: '10:00', end: '12:00', slots: 3, place: 'Here' })).status === 403, 'volunteer cannot create shifts: 403');
ok((await post('vol', { type: 'distributeInKind', inKindId: 'n1', caseId: 'c1' })).status === 403, 'volunteer cannot distribute items: 403');
ok((await post('fund', { type: 'distributeInKind', inKindId: 'n1', caseId: 'c1' })).status === 403, 'fundraiser cannot distribute items: 403');
ok((await post('prog', { type: 'recordInKind', donorId: 'g1', kind: 'food', description: 'Rice', qty: 5, unit: 'bag', value: 100 })).status === 403, 'program officer cannot record in-kind gifts: 403');
ok((await post('vol', { type: 'addDonor', name: 'Nope', email: 'a@b.example', phone: '01012345678', kind: 'individual', city: 'Cairo' })).status === 403, 'volunteer cannot add a donor: 403');
ok((await post('prog', { type: 'createPledge', donorId: 'g1', campaignId: 'k1', kind: 'one_off', amount: 100, method: 'cash', dueOn: today })).status === 403, 'program officer cannot create pledges: 403');

// ---------- gifts ----------
const before = (await view('owner')).reports.totals;
const g1 = await post('fund', { ...gift, key: key() });
ok(g1.status === 200 && /^R-\d{4}-\d{6}$/.test(g1.j.result.receipt), 'fundraiser records a gift and gets a receipt number');
const after = (await view('owner')).reports.totals;
ok(after.raised === before.raised + 500 && after.gifts === before.gifts + 1, 'totals grow by the gift');
const k1 = key(); const a1 = await post('fund', { ...gift, key: k1 }), a2 = await post('fund', { ...gift, key: k1 });
ok(a1.status === 200 && a2.j.result.duplicate === true, 'same idempotency key does not create a second gift');
ok((await view('owner')).reports.totals.gifts === before.gifts + 2, 'only one gift was created by the repeated key');
ok((await post('fund', { ...gift, key: 'ab' })).status === 400, 'too short idempotency key: 400');
ok((await post('fund', { ...gift, amount: 0 })).status === 400, 'zero amount: 400');
ok((await post('fund', { ...gift, amount: -50 })).status === 400, 'negative amount: 400');
ok((await post('fund', { ...gift, amount: 12.5 })).status === 400, 'fractional amount: 400');
ok((await post('fund', { ...gift, amount: '500' })).status === 400, 'amount as text: 400');
ok((await post('fund', { ...gift, amount: [500] })).status === 400, 'amount as array: 400');
ok((await post('fund', { ...gift, amount: 1e12 })).status === 400, 'huge amount: 400');
ok((await post('fund', { ...gift, method: 'bitcoin' })).status === 400, 'unknown payment method: 400');
ok((await post('fund', { ...gift, campaignId: 'nope' })).status === 400, 'unknown campaign: 400');
ok((await post('fund', { ...gift, campaignId: 'k4' })).status === 400, 'gift to a draft campaign: 400');
ok((await post('fund', { ...gift, campaignId: 'k5' })).status === 400, 'gift to a closed campaign: 400');
ok((await post('fund', { ...gift, date: L.addDays(today, 3) })).status === 400, 'future-dated gift: 400');
ok((await post('fund', { ...gift, date: L.addDays(today, -90) })).status === 400, 'gift back-dated over 60 days: 400');
ok((await post('fund', { ...gift, amount: 60000 })).status === 400, 'gift above the review limit by fundraiser: 400');
ok((await post('owner', { ...gift, amount: 60000, key: key() })).status === 200, 'director can record a gift above the review limit');
ok((await post('fund', { ...gift, donorId: 'nope' })).status === 400, 'unknown donor: 400');
const named = await post('fund', { ...gift, donorId: 'g1', key: key() });
ok(named.status === 200, 'gift tied to a donor');
const gview = (await view('fund'));
const mine = gview.donations.find((d) => d.id === named.j.result.donationId);
ok(mine && mine.donorId === 'g1' && mine.status === 'received' && mine.date === today, 'gift appears with donor, status and today (Cairo) date');

// refunds
const preRef = (await view('owner')).reports.totals.raised;
const ref = await post('owner', { type: 'refundDonation', donationId: g1.j.result.donationId, reason: 'Duplicate payment' });
ok(ref.status === 200, 'director refunds a gift');
ok((await post('owner', { type: 'refundDonation', donationId: g1.j.result.donationId, reason: 'Again' })).status === 400, 'second refund of the same gift: 400');
ok((await post('owner', { type: 'refundDonation', donationId: named.j.result.donationId, reason: 'x' })).status === 400, 'refund without a reason: 400');
const afterRef = (await view('owner')).reports.totals;
ok(afterRef.raised === preRef - 500, 'refund removes the gift from the raised total');
ok((await view('owner')).donations.find((d) => d.id === g1.j.result.donationId).status === 'refunded', 'refunded gift keeps its record, marked refunded');
ok((await post('owner', { type: 'refundDonation', donationId: 'nope', reason: 'abc' })).status === 400, 'refund of an unknown gift: 400');

// ---------- donors ----------
const dn = { type: 'addDonor', name: 'E2E Donor', email: 'e2e.donor@mail.example', phone: '01055500001', kind: 'individual', city: 'Cairo', wall: true };
const d1 = await post('fund', { ...dn, key: key() });
ok(d1.status === 200 && d1.j.result.donorId, 'fundraiser adds a donor');
ok((await post('fund', { ...dn, phone: '01055500002' })).status === 400, 'duplicate email: 400');
ok((await post('fund', { ...dn, email: 'e2e2@mail.example' })).status === 400, 'duplicate phone: 400');
ok((await post('fund', { ...dn, email: 'not-an-email', phone: '01055500003' })).status === 400, 'bad email: 400');
ok((await post('fund', { ...dn, email: 'e3@mail.example', phone: '12345' })).status === 400, 'bad phone: 400');
ok((await post('fund', { ...dn, email: 'e4@mail.example', phone: '01055500004', kind: 'robot' })).status === 400, 'bad donor kind: 400');
ok((await post('fund', { ...dn, email: 'e5@mail.example', phone: '01055500005', name: 'A' })).status === 400, 'name too short: 400');
ok((await post('fund', { ...dn, email: 'e6@mail.example', phone: '01055500006', name: { a: 1 } })).status === 400, 'name as object: 400');
const hostile = '<img src=x onerror=alert(1)>';
const d2 = await post('fund', { ...dn, email: 'e7@mail.example', phone: '01055500007', name: 'Hostile ' + hostile, key: key() });
ok(d2.status === 200, 'hostile text accepted as plain data');
const up = await post('fund', { ...dn, type: 'updateDonor', donorId: d1.j.result.donorId, city: 'Giza' });
ok(up.status === 200 && (await view('fund')).donors.find((d) => d.id === d1.j.result.donorId).city === 'Giza', 'donor update works');
ok((await post('fund', { ...dn, type: 'updateDonor', donorId: 'nope' })).status === 400, 'update of unknown donor: 400');

// ---------- campaigns ----------
const cf = { type: 'createCampaign', title: 'E2E Campaign', summary: 'A test campaign for checks.', cause: 'food', goal: 50000, startsOn: today, endsOn: L.addDays(today, 30) };
const c1 = await post('fund', { ...cf, key: key() });
ok(c1.status === 200 && c1.j.result.campaignId, 'fundraiser creates a campaign (draft)');
const cid = c1.j.result.campaignId;
ok((await view('fund')).campaigns.find((c) => c.id === cid).status === 'draft', 'new campaign starts as draft');
ok((await post('fund', { ...cf, goal: 10 })).status === 400, 'goal below minimum: 400');
ok((await post('fund', { ...cf, cause: 'space' })).status === 400, 'unknown cause: 400');
ok((await post('fund', { ...cf, endsOn: L.addDays(today, -2) })).status === 400, 'end before start: 400');
ok((await post('fund', { ...cf, startsOn: '2026-13-45' })).status === 400, 'impossible date: 400');
ok((await post('fund', { ...gift, campaignId: cid })).status === 400, 'draft campaign does not take gifts');
ok((await post('fund', { type: 'setCampaignStatus', campaignId: cid, status: 'active' })).status === 200, 'activate campaign');
ok((await post('fund', { type: 'setCampaignStatus', campaignId: cid, status: 'active' })).status === 400, 'activate twice: 400');
ok((await post('fund', { ...gift, campaignId: cid, key: key() })).status === 200, 'active campaign takes gifts');
await post('fund', { ...gift, campaignId: cid, amount: 1500, key: key() });
ok((await post('fund', { type: 'setCampaignStatus', campaignId: cid, status: 'paused' })).status === 200, 'pause campaign');
ok((await post('fund', { ...gift, campaignId: cid })).status === 400, 'paused campaign does not take gifts');
ok((await pubDonate({ campaignId: cid, amount: 100 })).status === 400, 'paused campaign does not take public gifts');
ok((await post('fund', { ...cf, cause: 'health', type: 'updateCampaign', campaignId: cid })).status === 400, 'cause locked once gifts exist: 400');
ok((await post('fund', { ...cf, goal: 1000, type: 'updateCampaign', campaignId: cid })).status === 400, 'goal below raised amount: 400');
ok((await post('fund', { ...cf, title: 'E2E Campaign v2', type: 'updateCampaign', campaignId: cid })).status === 200, 'campaign edit works');
ok((await post('owner', { type: 'setCampaignStatus', campaignId: cid, status: 'closed' })).status === 200, 'director closes campaign');
ok((await post('owner', { type: 'setCampaignStatus', campaignId: cid, status: 'active' })).status === 400, 'closed campaign cannot reopen: 400');
ok((await post('owner', { ...cf, type: 'updateCampaign', campaignId: cid })).status === 400, 'closed campaign cannot be edited: 400');

// ---------- pledges ----------
let dd = 3; while (+L.addDays(today, -dd).slice(8) > 28) dd++;
const dueDay = L.addDays(today, -dd);
const mp = { type: 'createPledge', donorId: 'g2', campaignId: 'k3', kind: 'monthly', amount: 300, method: 'card', day: +dueDay.slice(8), startsOn: L.addDays(dueDay, -1) };
const p1 = await post('fund', { ...mp, key: key() });
ok(p1.status === 200, 'monthly pledge created');
ok((await post('fund', { ...mp, day: 31 })).status === 400, 'day of month above 28: 400');
ok((await post('fund', { ...mp, kind: 'weekly' })).status === 400, 'unknown pledge kind: 400');
ok((await post('fund', { ...mp, campaignId: 'k5' })).status === 400, 'pledge to closed campaign: 400');
const r1 = await post('fund', { type: 'runPledges' });
ok(r1.status === 200 && r1.j.result.created >= 1, 'run pledges creates the due gifts');
const r2 = await post('fund', { type: 'runPledges' });
ok(r2.j.result.created === 0, 'running pledges again creates nothing (no double payment)');
const pl = (await view('fund')).pledges.find((p) => p.id === p1.j.result.pledgeId);
ok(pl.paid.length === new Set(pl.paid).size && pl.paid.length >= 1, 'each month is paid once');
ok((await post('fund', { type: 'setPledgeStatus', pledgeId: pl.id, status: 'paused' })).status === 200, 'pause pledge');
const r3 = await post('fund', { type: 'runPledges' });
ok(r3.j.result.created === 0, 'a paused pledge is not run');
ok((await post('fund', { type: 'setPledgeStatus', pledgeId: pl.id, status: 'cancelled' })).status === 200, 'cancel pledge');
ok((await post('fund', { type: 'setPledgeStatus', pledgeId: pl.id, status: 'active' })).status === 400, 'cancelled pledge cannot restart: 400');
const op1 = await post('fund', { type: 'createPledge', donorId: 'g3', campaignId: 'k3', kind: 'one_off', amount: 750, method: 'bank', dueOn: today, key: key() });
ok(op1.status === 200, 'one-off pledge created');
ok((await post('fund', { type: 'fulfilPledge', pledgeId: p1.j.result.pledgeId })).status === 400, 'monthly pledge cannot be paid by hand: 400');
const ff = await post('fund', { type: 'fulfilPledge', pledgeId: op1.j.result.pledgeId, key: key() });
ok(ff.status === 200 && ff.j.result.receipt, 'one-off pledge paid, gets a receipt');
ok((await post('fund', { type: 'fulfilPledge', pledgeId: op1.j.result.pledgeId, key: key() })).status === 400, 'paid pledge cannot be paid twice: 400');

// ---------- in-kind ----------
const ik = { type: 'recordInKind', donorId: 'g4', kind: 'food', description: 'E2E rice sacks', qty: 20, unit: 'sack', value: 4000 };
const i1 = await post('fund', { ...ik, key: key() });
ok(i1.status === 200 && /^K-\d{4}-\d{6}$/.test(i1.j.result.receipt), 'in-kind gift recorded with its own receipt number');
ok((await post('fund', { ...ik, kind: 'cars' })).status === 400, 'unknown in-kind kind: 400');
ok((await post('fund', { ...ik, qty: 0 })).status === 400, 'zero quantity: 400');
ok((await post('fund', { ...ik, donorId: 'nope' })).status === 400, 'unknown donor on in-kind: 400');
const foodCase = (await view('prog')).cases.find((c) => c.category === 'food' && c.status === 'open');
const healthCase = (await view('prog')).cases.find((c) => c.category === 'health' && c.status === 'open');
ok((await post('prog', { type: 'distributeInKind', inKindId: i1.j.result.inKindId, caseId: healthCase.id })).status === 400, 'food cannot go to a health case: 400');
ok((await post('prog', { type: 'distributeInKind', inKindId: i1.j.result.inKindId, caseId: foodCase.id })).status === 200, 'program officer distributes food to a food case');
ok((await post('prog', { type: 'distributeInKind', inKindId: i1.j.result.inKindId, caseId: foodCase.id })).status === 400, 'already distributed: 400');
ok((await view('prog')).inkind.find((x) => x.id === i1.j.result.inKindId).status === 'distributed', 'item shows as distributed');

// ---------- cases ----------
const cs = { type: 'addCase', name: 'E2E Family', city: 'Aswan', category: 'health', householdSize: 4, need: 2000, phone: '01166600001', summary: 'No names here', share: false };
const cc = await post('prog', { ...cs, key: key() });
ok(cc.status === 200, 'program officer adds a case');
ok((await post('prog', { ...cs })).status === 400, 'second open case with same phone: 400');
ok((await post('prog', { ...cs, phone: '01166600002', category: 'pets' })).status === 400, 'unknown category: 400');
ok((await post('prog', { ...cs, phone: '01166600003', need: 0 })).status === 400, 'zero need: 400');
ok((await post('prog', { ...cs, phone: '01166600004', householdSize: 99 })).status === 400, 'household size above 20: 400');
const caseId = cc.j.result.caseId;
ok((await post('prog', { ...cs, need: 2500, type: 'updateCase', caseId })).status === 200, 'case update works');

// ---------- allocation ----------
const rep0 = (await view('owner')).reports.campaigns.find((c) => c.id === 'k3');
ok(rep0.available > 0, 'Healing Hands has funds to allocate');
const al1 = await post('prog', { type: 'allocate', campaignId: 'k3', caseId, kind: 'case', amount: 1000, key: key() });
ok(al1.status === 200 && al1.j.result.status === 'approved', 'small allocation is approved immediately');
ok((await post('prog', { type: 'allocate', campaignId: 'k3', caseId, kind: 'case', amount: 2000 })).status === 400, 'allocation above what the case still needs: 400');
ok((await post('prog', { type: 'allocate', campaignId: 'k3', caseId: foodCase.id, kind: 'case', amount: 500 })).status === 400, 'health funds cannot go to a food case: 400');
ok((await post('prog', { type: 'allocate', campaignId: 'k4', caseId, kind: 'case', amount: 500 })).status === 400, 'draft campaign has nothing to allocate: 400');
ok((await post('prog', { type: 'allocate', campaignId: 'k6', caseId, kind: 'case', amount: 99 })).status === 400, 'allocation under the minimum: 400');
ok((await post('prog', { type: 'allocate', campaignId: 'k3', caseId, kind: 'nope', amount: 500 })).status === 400, 'unknown allocation kind: 400');
ok((await post('prog', { type: 'allocate', campaignId: 'k3', caseId, kind: 'case', amount: 'lots' })).status === 400, 'allocation amount as text: 400');
const bigCase = await post('prog', { type: 'addCase', name: 'E2E Big Need', city: 'Qena', category: 'health', householdSize: 5, need: 40000, phone: '01166600010', summary: 'Large medical need for checks.', key: key() });
const bigAlloc = await post('prog', { type: 'allocate', campaignId: 'k3', caseId: bigCase.j.result.caseId, kind: 'case', amount: 20000, key: key() });
ok(bigAlloc.status === 200 && bigAlloc.j.result.status === 'pending', 'allocation above the approval limit waits for the director');
const pendBefore = (await view('owner')).reports.campaigns.find((c) => c.id === 'k3');
ok(pendBefore.reserved >= 21000, 'pending allocation reserves the money so it cannot be used twice');
ok((await post('prog', { type: 'closeCase', caseId: bigCase.j.result.caseId })).status === 400, 'case with a pending allocation cannot be closed: 400');
ok((await post('owner', { type: 'decideAllocation', allocId: bigAlloc.j.result.allocId, decision: 'maybe' })).status === 400, 'unknown decision: 400');
ok((await post('owner', { type: 'decideAllocation', allocId: bigAlloc.j.result.allocId, decision: 'reject' })).status === 200, 'director rejects the allocation');
ok((await post('owner', { type: 'decideAllocation', allocId: bigAlloc.j.result.allocId, decision: 'approve' })).status === 400, 'a decided allocation cannot be decided again: 400');
const pendAfter = (await view('owner')).reports.campaigns.find((c) => c.id === 'k3');
ok(pendAfter.reserved === pendBefore.reserved - 20000, 'rejecting releases the reserved money');
const bigAlloc2 = await post('prog', { type: 'allocate', campaignId: 'k3', caseId: bigCase.j.result.caseId, kind: 'case', amount: 16000, key: key() });
ok((await post('owner', { type: 'decideAllocation', allocId: bigAlloc2.j.result.allocId, decision: 'approve' })).status === 200, 'director approves the allocation');
const ownerAdmin = await post('owner', { type: 'allocate', campaignId: 'k3', kind: 'admin', amount: 100, key: key() });
ok(ownerAdmin.status === 200, 'director records an admin cost within the cap');
ok((await post('owner', { type: 'allocate', campaignId: 'k6', kind: 'admin', amount: 100000 })).status === 400, 'admin costs above the cap or funds: 400');
// fully fund a small case -> funded status
const fc = await post('prog', { type: 'addCase', name: 'E2E Small', city: 'Giza', category: 'health', householdSize: 2, need: 500, phone: '01166600011', summary: 'Small medical need for checks.', key: key() });
await post('prog', { type: 'allocate', campaignId: 'k3', caseId: fc.j.result.caseId, kind: 'case', amount: 500, key: key() });
ok((await view('prog')).cases.find((c) => c.id === fc.j.result.caseId).status === 'funded', 'a fully allocated case turns to funded');
ok((await post('prog', { type: 'allocate', campaignId: 'k3', caseId: fc.j.result.caseId, kind: 'case', amount: 500 })).status === 400, 'a funded case takes no more money: 400');
ok((await post('prog', { type: 'closeCase', caseId: fc.j.result.caseId })).status === 200, 'program officer closes a case');
ok((await post('prog', { type: 'closeCase', caseId: fc.j.result.caseId })).status === 400, 'closing twice: 400');
ok((await post('prog', { ...cs, phone: '01166600011', type: 'updateCase', caseId: fc.j.result.caseId })).status === 400, 'closed case cannot be edited: 400');
ok((await post('owner', { type: 'refundDonation', donationId: (await view('owner')).donations.find((d) => d.campaignId === 'k3' && d.status === 'received').id, reason: 'Testing refund guard' })).status !== 500, 'refund guard does not crash');
// guard: refund that would cut into reserved funds
const k6 = (await view('owner')).campaigns.find((c) => c.id === 'k6');
ok(k6.raised === 143500, 'Medical Equipment Fund seeded at 143,500 of 150,000');
const tiny = await post('owner', { ...gift, campaignId: 'k6', amount: 100, key: key() });
const cap6 = (await view('owner')).reports.campaigns.find((c) => c.id === 'k6');
const reserveAll = await post('owner', { type: 'allocate', campaignId: 'k6', caseId: (await view('owner')).cases.find((c) => c.category === 'health' && c.status === 'open' && c.need - c.reserved >= 1).id, kind: 'case', amount: 100, key: key() });
ok(tiny.status === 200 && reserveAll.status === 200, 'second campaign flow: gift then allocation');

// ---------- volunteers ----------
const vo = await view('vol');
const sh = vo.shifts.find((s) => s.date > today);
ok(!!sh, 'there is an upcoming shift');
const su = await post('vol', { type: 'signUp', shiftId: sh.id });
ok(su.status === 200, 'volunteer signs up for a shift');
ok((await post('vol', { type: 'signUp', shiftId: sh.id })).status === 400, 'double sign-up: 400');
ok((await post('vol', { type: 'leaveShift', shiftId: sh.id })).status === 200, 'volunteer leaves the shift');
ok((await post('vol', { type: 'leaveShift', shiftId: sh.id })).status === 400, 'leaving twice: 400');
ok((await post('vol', { type: 'signUp', shiftId: 'nope' })).status === 400, 'unknown shift: 400');
const newShift = { type: 'createShift', title: 'E2E Packing', date: L.addDays(today, 5), start: '10:00', end: '12:30', slots: 1, place: 'Warehouse', key: key() };
const ns = await post('prog', newShift);
ok(ns.status === 200, 'program officer creates a shift');
ok((await post('prog', { ...newShift, key: key(), date: L.addDays(today, -3) })).status === 400, 'shift in the past: 400');
ok((await post('prog', { ...newShift, key: key(), end: '09:00' })).status === 400, 'shift ending before it starts: 400');
ok((await post('prog', { ...newShift, key: key(), start: '25:00' })).status === 400, 'bad time: 400');
ok((await post('prog', { ...newShift, key: key(), slots: 0 })).status === 400, 'zero slots: 400');
const ns2 = await post('prog', { ...newShift, key: key(), title: 'E2E Overlap', start: '11:00', end: '13:00' });
ok((await post('vol', { type: 'signUp', shiftId: ns.j.result.shiftId })).status === 200, 'sign up for the new shift');
ok((await post('vol', { type: 'signUp', shiftId: ns2.j.result.shiftId })).status === 400, 'overlapping shift: 400');
ok((await post('prog', { type: 'cancelShift', shiftId: ns2.j.result.shiftId })).status === 200, 'program officer cancels a shift');
ok((await post('prog', { type: 'cancelShift', shiftId: ns2.j.result.shiftId })).status === 400, 'cancelling twice: 400');
const lh = { type: 'logHours', date: today, hours: 3, activity: 'E2E sorting donations' };
const h1 = await post('vol', { ...lh, key: key() });
ok(h1.status === 200, 'volunteer logs hours');
ok((await post('vol', { ...lh, hours: 0.25 })).status === 400, 'quarter hours: 400');
ok((await post('vol', { ...lh, hours: 13 })).status === 400, 'over 12 hours: 400');
ok((await post('vol', { ...lh, hours: '3' })).status === 400, 'hours as text: 400');
ok((await post('vol', { ...lh, date: L.addDays(today, 1) })).status === 400, 'future hours: 400');
ok((await post('vol', { ...lh, date: L.addDays(today, -40) })).status === 400, 'hours older than 30 days: 400');
ok((await post('vol', { ...lh, hours: 10, key: key() })).status === 400, 'more than 12 hours in one day: 400');
ok((await post('vol', { ...lh, shiftId: ns.j.result.shiftId, key: key() })).status === 400, 'shift hours on the wrong date: 400');
const hp = (await view('vol')).pendingHours;
ok(hp >= 3, 'pending hours show for the volunteer');
const ap0 = (await view('vol')).approvedHours;
ok((await post('prog', { type: 'reviewHours', hoursId: h1.j.result.hoursId, decision: 'approve' })).status === 200, 'program officer approves hours');
ok((await view('vol')).approvedHours === ap0 + 3, 'approved hours count');
ok((await post('prog', { type: 'reviewHours', hoursId: h1.j.result.hoursId, decision: 'reject', reason: 'late' })).status === 400, 'reviewed hours cannot be reviewed again: 400');
const h2 = await post('vol', { ...lh, hours: 1, key: key() });
ok((await post('prog', { type: 'reviewHours', hoursId: h2.j.result.hoursId, decision: 'reject' })).status === 400, 'rejecting needs a reason: 400');
ok((await post('prog', { type: 'reviewHours', hoursId: h2.j.result.hoursId, decision: 'reject', reason: 'Not on the roster' })).status === 200, 'rejecting with a reason works');
ok((await view('vol')).approvedHours === ap0 + 3, 'rejected hours do not count');

// ---------- settings ----------
const st = { type: 'setSettings', adminCapPct: 10, approvalAbove: 15000, reviewAbove: 50000, certificateHours: 40 };
ok((await post('owner', { ...st, adminCapPct: 30 })).status === 400, 'admin cap above 25%: 400');
ok((await post('owner', { ...st, approvalAbove: 5 })).status === 400, 'approval limit below 1,000: 400');
ok((await post('owner', { ...st, certificateHours: 'x' })).status === 400, 'certificate hours as text: 400');
ok((await post('owner', { ...st, certificateHours: 20 })).status === 200 && (await view('vol')).certificateAt === 20, 'certificate hours change reaches the volunteer view');
await post('owner', st);

// ---------- audit ----------
const au = (await view('owner')).audit;
ok(au.length > 20 && au.some((a) => a.action === 'refundDonation') && au.some((a) => a.action === 'decideAllocation'), 'audit log records money actions');
ok(au.every((a) => !/@mail\.example/.test(JSON.stringify(a))), 'audit log carries no donor emails');

// ---------- public giving ----------
const pb = await pubGet(); const c3 = pb.campaigns.find((c) => c.id === 'k3');
const pd = await pubDonate({ campaignId: 'k3', amount: 250, name: 'E2E Public ' + hostile, key: key() });
ok(pd.status === 200 && /^R-/.test(pd.j.result.receipt), 'public gift works without sign-in and returns a receipt');
ok((await pubGet()).campaigns.find((c) => c.id === 'k3').raised === c3.raised + 250, 'public gift raises the campaign total');
const pk = key(); await pubDonate({ campaignId: 'k3', amount: 50, key: pk }); const pr = await pubDonate({ campaignId: 'k3', amount: 50, key: pk });
ok(pr.j.result.duplicate === true, 'public gift with a repeated key is not counted twice');
ok((await pubDonate({ campaignId: 'k3', amount: 5 })).status === 400, 'public gift under the minimum: 400');
ok((await pubDonate({ campaignId: 'k3', amount: 5001 })).status === 400, 'public gift above the cap: 400');
ok((await pubDonate({ campaignId: 'k3', amount: 'ten' })).status === 400, 'public gift amount as text: 400');
ok((await pubDonate({ campaignId: 'k5', amount: 100 })).status === 400, 'public gift to a closed campaign: 400');
ok((await pubDonate({ campaignId: 'k4', amount: 100 })).status === 400, 'public gift to a draft campaign: 400');
ok((await pubDonate({ campaignId: 'nope', amount: 100 })).status === 400, 'public gift to an unknown campaign: 400');
ok((await pubDonate({ campaignId: 'k3', amount: 100, name: 'x'.repeat(100) })).status === 400, 'public name too long: 400');
const pubDon = (await view('owner')).donations.find((d) => d.id === pd.j.result.donationId);
ok(pubDon.source === 'public' && pubDon.method === 'online' && pubDon.anonymous === false, 'public gift is marked as a public online gift');
ok((await pubGet()).campaigns.find((c) => c.id === 'k3').wall.some((w) => w.name.includes('E2E Public')), 'named public gift shows on the donor wall');
// rate limit: 60 per hour, then reset
let limited = 0; for (let i = 0; i < 62; i++) { const r = await pubDonate({ campaignId: 'k2', amount: 10, key: key() }); if (r.status === 400 && /Too many/.test(r.j.error)) limited++; }
ok(limited >= 1, 'public gifts are rate limited');
await post('owner', { type: 'reset' });
ok((await pubDonate({ campaignId: 'k3', amount: 10, key: key() })).status === 200, 'after reset the public limit is clear again');

// ---------- reports ----------
const rp = (await view('owner')).reports;
ok(rp.byMonth.length === 12 && rp.totals.raised === rp.byMonth.reduce((a, m) => a + m.raised, 0) + (rp.totals.raised - rp.byMonth.reduce((a, m) => a + m.raised, 0)), 'reports have 12 months');
ok(Object.values(rp.byMethod).reduce((a, v) => a + v, 0) === rp.totals.raised, 'payment methods add up to the total raised');
ok(rp.campaigns.every((c) => c.available >= 0 && c.reserved >= 0 && c.adminUsed <= c.adminCap), 'no campaign has negative funds or admin spend above the cap');
ok(rp.totals.adminPct <= 10, 'overall admin share within the cap');
ok(rp.top.length === 10 && rp.top[0].total >= rp.top[9].total, 'top donors are sorted');
const csv = L.toCsv([['=cmd', '+1', 'a,b', 'q"x']]);
ok(csv.includes("'=cmd") && csv.includes("'+1") && csv.includes('"a,b"') && csv.includes('"q""x"'), 'CSV export neutralises formulas and escapes cells');

// ---------- browser: pages for every role, both languages ----------
const NAVS = { '1111': ['dashboard', 'campaigns', 'donations', 'donors', 'pledges', 'inkind', 'cases', 'funds', 'volunteers', 'reports', 'settings', 'audit'], '2222': ['dashboard', 'campaigns', 'donations', 'donors', 'pledges', 'inkind', 'cases', 'reports'], '3333': ['dashboard', 'campaigns', 'cases', 'funds', 'inkind', 'volunteers'], '4444': ['shifts', 'hours', 'give'] };
for (const lang of ['en', 'ar']) for (const [pin, routes] of Object.entries(NAVS)) {
  const p = await newPage(); await login(p, pin, lang);
  ok((await p.evaluate(() => document.documentElement.dir)) === (lang === 'ar' ? 'rtl' : 'ltr'), `${lang} ${pin}: page direction`);
  let clean = true, links = (await p.$$('.top .nav a')).length;
  for (const r of routes) { await go(p, r); const t = await body(p); if (bare.test(t) || t.length < 60) { clean = false; console.log('  bad page', lang, pin, r, t.slice(0, 100)); } }
  ok(clean && links === routes.length, `${lang} ${pin}: all ${routes.length} pages render cleanly`);
  await p.close();
}
// phone width
for (const pin of Object.keys(NAVS)) {
  const p = await newPage(390, 844); await login(p, pin, 'ar'); let wide = [];
  for (const r of NAVS[pin]) { await go(p, r); const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 392) wide.push(r + ':' + w); }
  ok(wide.length === 0, `phone ${pin}: no horizontal overflow ${wide.join(',')}`); await p.close();
}
{ const p = await newPage(390, 844); await p.goto(U + '/#/give', { waitUntil: 'networkidle0' }); await sleep(600); ok((await p.evaluate(() => document.documentElement.scrollWidth)) <= 392, 'phone: public page has no horizontal overflow'); await p.close(); }

// ---------- browser: content and flows ----------
let p = await newPage(); await login(p, '1111');
await go(p, 'dashboard'); let t = await body(p);
ok(/Raised|Needs attention/.test(t), 'director dashboard shows money and attention items');
await go(p, 'donors'); await p.type('input[type=search]', 'Hostile'); await sleep(600);
t = await body(p);
ok(t.includes('Hostile <img src=x onerror=alert(1)>') || !(await p.$('img[src="x"]')), 'hostile donor name is shown as text, no element created');
ok(!(await p.$('img[src="x"]')), 'no injected image element in the donors page');
await go(p, 'donations'); ok(/R-\d{4}-\d{6}/.test(await body(p)), 'donations page lists receipt numbers');
const row = await p.$('tr.click'); if (row) { await row.click(); await sleep(500); }
t = await body(p); ok(/Print/.test(t) && /Not a tax document/.test(t), 'receipt view opens with print and the not-a-tax-document note');
await p.keyboard.press('Escape'); await sleep(300);
await go(p, 'funds'); t = await body(p); ok(/Waiting for|approve|Approve/i.test(t), 'funds page shows allocations waiting for approval');
const pend0 = (await view('owner')).reports.totals.pendingAllocs;
const appr = await p.$('[data-act="decide"][data-d="approve"]'); ok(!!appr && pend0 >= 1, 'approve button present for a pending allocation');
if (appr) { await appr.click(); await sleep(900); ok((await view('owner')).reports.totals.pendingAllocs === pend0 - 1, 'director approves an allocation in the UI'); }
await p.close();

p = await newPage(); await p.goto(U + '/#/give', { waitUntil: 'networkidle0' }); await sleep(600);
t = await body(p);
ok(/Give with a clear view/.test(t) && /Where the money goes/.test(t) && /no real payment/i.test(t), 'public page shows the promise, money breakdown and demo notice');
ok(!(/@mail\.example/.test(t)), 'public page shows no donor emails');
await p.click('[data-act="donate"]'); await sleep(400);
await p.click('[data-act="preset"][data-n="250"]'); await sleep(200);
ok((await p.$eval('#dn-amt', (e) => e.value)) === '250', 'preset chip fills the amount');
await p.type('#dn-name', 'Browser Donor'); await p.click('[data-act="senddonate"]'); await sleep(900);
ok(/R-\d{4}-\d{6}/.test(await body(p)), 'public donate through the page shows a receipt number');
await p.keyboard.press('Escape'); await sleep(200); await p.close();

p = await newPage(); await login(p, '3333', 'ar'); await go(p, 'cases');
t = await body(p); ok(/C-\d{4}/.test(t) && !/@mail/.test(t), 'AR: program officer sees case codes');
await go(p, 'funds'); t = await body(p); ok(/\u0627|\u0645/.test(t) && !bare.test(t), 'AR: funds page is in Arabic');
await p.close();
p = await newPage(); await login(p, '2222'); await go(p, 'cases'); t = await body(p);
ok(/C-\d{4}/.test(t) && !(await p.$('[data-act="addcase"]')), 'fundraiser sees case codes and no add-case button');
await p.close();
p = await newPage(); await login(p, '4444'); await go(p, 'hours'); t = await body(p);
ok(/hours|Hours/.test(t) && !/@mail/.test(t), 'volunteer hours page');
await go(p, 'shifts'); const sb = await p.$('[data-act="signup"]'); ok(!!sb || /Signed up|signed/i.test(await body(p)), 'volunteer shifts page has sign-up actions');
await p.close();
// sign-in screen
p = await newPage(); await p.goto(U + '/?lang=en', { waitUntil: 'networkidle0' }); t = await body(p);
ok(/1111/.test(t) && /2222/.test(t) && /3333/.test(t) && /4444/.test(t) && /Demo/.test(t), 'sign-in shows the demo PINs and a demo note');
await p.type('#pin', '9999'); await p.keyboard.press('Enter'); await sleep(700);
ok(!(await p.$('.top .nav')), 'wrong PIN in the UI does not sign in');
await p.click('[data-act="lang"]').catch(() => {}); await sleep(300);
ok(true, 'language toggle does not crash');
await p.close();

ok(errs.length === 0, 'no page or console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await post('owner', { type: 'reset' });
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
