import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/logic.js';

const NOW = Date.UTC(2026, 10, 25, 9, 0); // Wed 25 Nov 2026, 11:00 Cairo
const TODAY = '2026-11-25';
const S = () => L.seed(NOW);
const U = (s, id) => s.users.find((u) => u.id === id);
const own = (s) => U(s, 'u-owner'), fun = (s) => U(s, 'u-fund'), prg = (s) => U(s, 'u-program'), vol = (s) => U(s, 'u-vol');
const op = (s, u, o, now = NOW) => L.applyOp(s, o, { user: u, now });
const bad = (fn, cls, re) => assert.throws(fn, (e) => e instanceof cls && (!re || re.test(e.message)), re ? String(re) : 'throws');
const WINTER = 'k1', SCHOOL = 'k2', HEAL = 'k3', DRAFT = 'k4', CLOSED = 'k5', MED = 'k6';
let seq = 0;
const donorOf = (s) => { seq++; return op(s, fun(s), { type: 'addDonor', name: 'Test Donor ' + seq, email: `t${seq}@mail.example`, phone: '0109' + String(1000000 + seq), kind: 'individual', city: 'Cairo', wall: true }).donorId; };
const give = (s, camp, amount, extra = {}) => op(s, own(s), { type: 'recordDonation', campaignId: camp, donorId: donorOf(s), amount, method: 'cash', ...extra });
const freshCase = (s, o = {}) => { seq++; return op(s, prg(s), { type: 'addCase', name: 'Case ' + seq, city: 'Cairo', category: 'shelter', householdSize: 4, need: 5000, summary: 'A family that needs help.', share: false, ...o }).caseId; };
const newCamp = (s, o = {}) => { const r = op(s, fun(s), { type: 'createCampaign', title: 'Test campaign', summary: 'A test campaign for rules.', cause: 'shelter', goal: 50000, startsOn: TODAY, endsOn: '2027-03-01', ...o }); op(s, fun(s), { type: 'setCampaignStatus', campaignId: r.campaignId, status: 'active' }); return r.campaignId; };

test('dates: Cairo day key, month math, time parsing', () => {
  assert.equal(L.dayKey(Date.UTC(2026, 10, 25, 22, 30)), '2026-11-26');
  assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(L.addMonths('2026-12', 1), '2027-01');
  assert.equal(L.addMonths('2026-01', -2), '2025-11');
  assert.equal(L.localTs(TODAY, 660), NOW);
  bad(() => L.toMin('25:00'), L.UserError);
});

test('phone and email normalization', () => {
  assert.equal(L.normPhone('+20 101 234 5678'), L.normPhone('01012345678'));
  bad(() => L.normPhone('123'), L.UserError);
  assert.equal(L.normEmail(' A@Mail.Example '), 'a@mail.example');
  bad(() => L.normEmail('nope'), L.UserError);
});

test('seed is deterministic, unique and balanced', () => {
  const a = S(), b = S();
  assert.deepEqual(a.donations, b.donations);
  assert.equal(new Set(a.donors.map((d) => d.email)).size, a.donors.length);
  assert.equal(new Set(a.donations.map((d) => d.receipt)).size, a.donations.length);
  assert.equal(new Set(a.cases.map((c) => c.code)).size, a.cases.length);
  for (const c of a.campaigns) { assert.ok(L.availableOf(a, c.id) >= 0, 'never over-allocated'); assert.ok(L.adminUsedOf(a, c.id) <= L.adminCapOf(a, c.id)); }
  for (const c of a.cases) assert.ok(L.caseReserved(a, c.id) <= c.need);
  assert.ok(a.allocs.some((x) => x.status === 'pending') && a.pledges.length > 15);
});

test('a gift needs an open campaign, a valid amount and a method', () => {
  const s = S(), d = donorOf(s);
  const base = { type: 'recordDonation', campaignId: WINTER, donorId: d, amount: 100, method: 'cash' };
  assert.ok(op(s, fun(s), base).receipt.startsWith('R-2026-'));
  bad(() => op(s, fun(s), { ...base, campaignId: DRAFT }), L.UserError, /not accepting/);
  bad(() => op(s, fun(s), { ...base, campaignId: CLOSED }), L.UserError, /not accepting/);
  bad(() => op(s, fun(s), { ...base, amount: 5 }), L.UserError);
  bad(() => op(s, fun(s), { ...base, amount: 100.5 }), L.UserError);
  bad(() => op(s, fun(s), { ...base, amount: '100' }), L.UserError);
  bad(() => op(s, fun(s), { ...base, amount: -50 }), L.UserError);
  bad(() => op(s, fun(s), { ...base, method: 'bitcoin' }), L.UserError);
  bad(() => op(s, fun(s), { ...base, donorId: 'g999' }), L.UserError, /Donor not found/);
});

test('receipt numbers are sequential and unique', () => {
  const s = S(), a = give(s, WINTER, 100), b = give(s, WINTER, 100);
  const n = (r) => Number(r.split('-')[2]);
  assert.equal(n(b.receipt), n(a.receipt) + 1);
});

test('gift dates: no future, 60 days back at most, not before the campaign', () => {
  const s = S();
  bad(() => give(s, WINTER, 100, { date: '2026-11-26' }), L.UserError, /future/);
  bad(() => give(s, HEAL, 100, { date: '2026-09-01' }), L.UserError, /60 days/);
  bad(() => give(s, WINTER, 100, { date: '2026-10-01' }), L.UserError);
  assert.ok(give(s, WINTER, 100, { date: '2026-11-20' }).donationId);
});

test('large gifts must be recorded by the director', () => {
  const s = S(), d = donorOf(s);
  const o = { type: 'recordDonation', campaignId: HEAL, donorId: d, amount: 60000, method: 'bank' };
  bad(() => op(s, fun(s), o), L.UserError, /director/);
  assert.ok(op(s, own(s), o).donationId);
  bad(() => op(s, own(s), { ...o, amount: 1000001 }), L.UserError);
});

test('repeating a request with the same key creates one gift', () => {
  const s = S(), d = donorOf(s), n = s.donations.length;
  const o = { type: 'recordDonation', campaignId: WINTER, donorId: d, amount: 100, method: 'cash', key: 'dupe-key-1' };
  op(s, fun(s), o); const r2 = op(s, fun(s), o);
  assert.equal(r2.duplicate, true); assert.equal(s.donations.length, n + 1);
  bad(() => op(s, fun(s), { ...o, key: 'x' }), L.UserError);
});

test('donor email and phone are unique and normalized', () => {
  const s = S(); const mk = (x) => ({ type: 'addDonor', name: 'Salma Test', email: 'new@mail.example', phone: '01011112222', kind: 'individual', city: 'Giza', wall: false, ...x });
  const id = op(s, fun(s), mk({ email: ' New@Mail.Example ', phone: '+20 101 111 2222' })).donorId;
  assert.equal(s.donors.find((d) => d.id === id).email, 'new@mail.example');
  assert.equal(s.donors.find((d) => d.id === id).phone, '01011112222');
  bad(() => op(s, fun(s), mk({ phone: '01099998888' })), L.UserError, /email already/);
  bad(() => op(s, fun(s), mk({ email: 'other@mail.example' })), L.UserError, /phone already/);
  bad(() => op(s, fun(s), mk({ kind: 'robot', email: 'o2@mail.example', phone: '01055556666' })), L.UserError);
  bad(() => op(s, prg(s), mk({ email: 'o3@mail.example', phone: '01055556667' })), L.PermError);
});

test('refund: owner only, reason needed, blocked once funds are allocated', () => {
  const s = S(), camp = newCamp(s), g = give(s, camp, 1000);
  bad(() => op(s, fun(s), { type: 'refundDonation', donationId: g.donationId, reason: 'mistake' }), L.PermError);
  bad(() => op(s, own(s), { type: 'refundDonation', donationId: g.donationId, reason: '' }), L.UserError);
  const g2 = give(s, camp, 1000);
  const cs = freshCase(s);
  op(s, own(s), { type: 'allocate', campaignId: camp, caseId: cs, kind: 'case', amount: 1500 });
  bad(() => op(s, own(s), { type: 'refundDonation', donationId: g.donationId, reason: 'duplicate' }), L.UserError, /already allocated/);
  op(s, own(s), { type: 'allocate', campaignId: camp, caseId: freshCase(s), kind: 'case', amount: 100 });
  const camp2 = newCamp(s); const g3 = give(s, camp2, 700);
  op(s, own(s), { type: 'refundDonation', donationId: g3.donationId, reason: 'duplicate' });
  assert.equal(L.raisedOf(s, camp2), 0); assert.equal(L.refundedOf(s, camp2), 700);
  bad(() => op(s, own(s), { type: 'refundDonation', donationId: g3.donationId, reason: 'again' }), L.UserError, /already refunded/);
  void g2;
});

test('allocation: cannot exceed funds, the case need, or mix causes', () => {
  const s = S(), camp = newCamp(s); give(s, camp, 3000);
  const c1 = freshCase(s, { need: 2000 }), edu = freshCase(s, { category: 'education' });
  bad(() => op(s, prg(s), { type: 'allocate', campaignId: camp, caseId: c1, kind: 'case', amount: 2500 }), L.UserError, /more than the case/);
  bad(() => op(s, prg(s), { type: 'allocate', campaignId: camp, caseId: edu, kind: 'case', amount: 500 }), L.UserError, /only go to shelter/);
  const c2 = freshCase(s, { need: 9000 });
  bad(() => op(s, prg(s), { type: 'allocate', campaignId: camp, caseId: c2, kind: 'case', amount: 4000 }), L.UserError, /Not enough/);
  assert.equal(op(s, prg(s), { type: 'allocate', campaignId: camp, caseId: c1, kind: 'case', amount: 2000 }).status, 'approved');
  assert.equal(s.cases.find((c) => c.id === c1).status, 'funded');
  bad(() => op(s, prg(s), { type: 'allocate', campaignId: camp, caseId: c1, kind: 'case', amount: 100 }), L.UserError, /not open/);
  assert.equal(L.availableOf(s, camp), 1000);
  bad(() => op(s, prg(s), { type: 'allocate', campaignId: DRAFT, caseId: c2, kind: 'case', amount: 500 }), L.UserError);
});

test('an emergency campaign can fund any category', () => {
  const s = S(), camp = newCamp(s, { cause: 'emergency' }); give(s, camp, 4000);
  assert.ok(op(s, prg(s), { type: 'allocate', campaignId: camp, caseId: freshCase(s, { category: 'health', need: 2000 }), kind: 'case', amount: 2000 }).allocId);
});

test('admin costs are capped at 10% of money raised and need the director', () => {
  const s = S(), camp = newCamp(s); give(s, camp, 10000);
  bad(() => op(s, prg(s), { type: 'allocate', campaignId: camp, kind: 'admin', amount: 500 }), L.PermError);
  assert.ok(op(s, own(s), { type: 'allocate', campaignId: camp, kind: 'admin', amount: 1000 }).allocId);
  bad(() => op(s, own(s), { type: 'allocate', campaignId: camp, kind: 'admin', amount: 100 }), L.UserError, /capped at 10%/);
  bad(() => op(s, own(s), { type: 'setSettings', adminCapPct: 5, approvalAbove: 15000, reviewAbove: 50000, certificateHours: 40 }), L.UserError, /already spent/);
});

test('program officer allocations above 15,000 wait for the director', () => {
  const s = S(), camp = newCamp(s, { cause: 'health' }); give(s, camp, 40000);
  const big = freshCase(s, { category: 'health', need: 20000 });
  const r = op(s, prg(s), { type: 'allocate', campaignId: camp, caseId: big, kind: 'case', amount: 20000 });
  assert.equal(r.status, 'pending');
  assert.equal(L.availableOf(s, camp), 20000, 'pending funds are reserved');
  assert.equal(s.cases.find((c) => c.id === big).status, 'open');
  bad(() => op(s, prg(s), { type: 'decideAllocation', allocId: r.allocId, decision: 'approve' }), L.PermError);
  bad(() => op(s, prg(s), { type: 'closeCase', caseId: big }), L.UserError, /pending/);
  op(s, own(s), { type: 'decideAllocation', allocId: r.allocId, decision: 'approve' });
  assert.equal(s.cases.find((c) => c.id === big).status, 'funded');
  bad(() => op(s, own(s), { type: 'decideAllocation', allocId: r.allocId, decision: 'reject' }), L.UserError, /already decided/);
  const big2 = freshCase(s, { category: 'health', need: 16000 });
  const r2 = op(s, prg(s), { type: 'allocate', campaignId: camp, caseId: big2, kind: 'case', amount: 16000 });
  op(s, own(s), { type: 'decideAllocation', allocId: r2.allocId, decision: 'reject' });
  assert.equal(L.availableOf(s, camp), 20000, 'rejected funds are released');
  assert.equal(op(s, own(s), { type: 'allocate', campaignId: camp, caseId: big2, kind: 'case', amount: 16000 }).status, 'approved');
});

test('the director allocates above the limit without approval', () => {
  const s = S(), camp = newCamp(s, { cause: 'health' }); give(s, camp, 30000);
  assert.equal(op(s, own(s), { type: 'allocate', campaignId: camp, caseId: freshCase(s, { category: 'health', need: 20000 }), kind: 'case', amount: 20000 }).status, 'approved');
});

test('refunds, allocations and balances always add up (invariant over many operations)', () => {
  const s = S(), camp = newCamp(s);
  for (let i = 0; i < 12; i++) give(s, camp, 500 + i * 37);
  for (let i = 0; i < 6; i++) { try { op(s, prg(s), { type: 'allocate', campaignId: camp, caseId: freshCase(s, { need: 1500 }), kind: 'case', amount: 700 + i * 90 }); } catch {} }
  const raised = L.raisedOf(s, camp), reserved = L.reservedOf(s, camp);
  assert.equal(L.availableOf(s, camp), raised - reserved);
  assert.ok(reserved <= raised);
  const rep = L.reports(s, NOW).campaigns.find((c) => c.id === camp);
  assert.equal(rep.available, raised - reserved);
});

test('case rules: unique open phone, edit limits, closing', () => {
  const s = S(); const c = freshCase(s, { phone: '01188887777', need: 3000 });
  bad(() => freshCase(s, { phone: '+20 1188887777' }), L.UserError, /already uses/);
  bad(() => op(s, fun(s), { type: 'addCase', name: 'x', city: 'Cairo' }), L.PermError);
  const camp = newCamp(s); give(s, camp, 2000);
  op(s, prg(s), { type: 'allocate', campaignId: camp, caseId: c, kind: 'case', amount: 1000 });
  const upd = (x) => ({ type: 'updateCase', caseId: c, name: 'Case X', city: 'Cairo', category: 'shelter', householdSize: 3, need: 3000, summary: 'A family that needs help.', share: true, ...x });
  bad(() => op(s, prg(s), upd({ need: 800 })), L.UserError, /lower than/);
  bad(() => op(s, prg(s), upd({ category: 'food' })), L.UserError, /category/);
  assert.ok(op(s, prg(s), upd({ need: 1000 })) && s.cases.find((x) => x.id === c).status === 'funded');
  op(s, prg(s), { type: 'closeCase', caseId: c });
  bad(() => op(s, prg(s), { type: 'closeCase', caseId: c }), L.UserError, /already closed/);
  bad(() => op(s, prg(s), upd({})), L.UserError, /closed/);
});

test('campaign lifecycle: activate, pause, close, edit rules', () => {
  const s = S(); const r = op(s, fun(s), { type: 'createCampaign', title: 'New fund', summary: 'Helps people in need.', cause: 'food', goal: 20000, startsOn: TODAY, endsOn: '2027-01-31' });
  assert.equal(s.campaigns.find((c) => c.id === r.campaignId).status, 'draft');
  bad(() => give(s, r.campaignId, 100), L.UserError, /not accepting/);
  op(s, fun(s), { type: 'setCampaignStatus', campaignId: r.campaignId, status: 'active' });
  assert.ok(give(s, r.campaignId, 100).donationId);
  op(s, fun(s), { type: 'setCampaignStatus', campaignId: r.campaignId, status: 'paused' });
  bad(() => give(s, r.campaignId, 100), L.UserError, /not accepting/);
  bad(() => op(s, fun(s), { type: 'setCampaignStatus', campaignId: r.campaignId, status: 'closed' }), L.PermError);
  op(s, own(s), { type: 'setCampaignStatus', campaignId: r.campaignId, status: 'closed' });
  bad(() => op(s, own(s), { type: 'setCampaignStatus', campaignId: r.campaignId, status: 'active' }), L.UserError, /cannot be reopened/);
  bad(() => op(s, fun(s), { type: 'createCampaign', title: 'Bad', summary: 'Ends before it starts.', cause: 'food', goal: 5000, startsOn: '2027-02-01', endsOn: '2027-01-01' }), L.UserError, /end date/);
  const cid = newCamp(s); give(s, cid, 5000);
  const upd = (x) => ({ type: 'updateCampaign', campaignId: cid, title: 'Test campaign', summary: 'A test campaign for rules.', cause: 'shelter', goal: 50000, startsOn: TODAY, endsOn: '2027-03-01', ...x });
  bad(() => op(s, fun(s), upd({ goal: 4000 })), L.UserError, /lower than/);
  bad(() => op(s, fun(s), upd({ cause: 'food' })), L.UserError, /cause/);
});

test('campaigns close by themselves after their end date', () => {
  const s = S(); L.normalize(s, NOW); assert.equal(s.campaigns.find((c) => c.id === MED).status, 'active');
  L.normalize(s, NOW + 25 * 864e5); assert.equal(s.campaigns.find((c) => c.id === MED).status, 'closed');
});

test('monthly pledges: run creates due gifts once, skips closed campaigns', () => {
  const s = S(), d = donorOf(s), camp = newCamp(s, { startsOn: '2026-10-01' });
  const p = op(s, fun(s), { type: 'createPledge', donorId: d, campaignId: camp, kind: 'monthly', amount: 250, method: 'card', day: 1, startsOn: '2026-11-01' }).pledgeId;
  const n = s.donations.length;
  const r1 = op(s, fun(s), { type: 'runPledges' }); assert.ok(r1.created >= 1);
  assert.ok(s.donations.some((x) => x.pledgeId === p && x.date === '2026-11-01'));
  const after = s.donations.length; const r2 = op(s, fun(s), { type: 'runPledges' });
  assert.equal(r2.created, 0); assert.equal(s.donations.length, after); assert.ok(after > n);
  op(s, fun(s), { type: 'setPledgeStatus', pledgeId: p, status: 'paused' });
  const mine = () => s.donations.filter((x) => x.pledgeId === p).length, k = mine();
  op(s, fun(s), { type: 'runPledges' }, NOW + 40 * 864e5); assert.equal(mine(), k);
  bad(() => op(s, prg(s), { type: 'runPledges' }), L.PermError);
});

test('monthly pledge on a day that has not come yet creates nothing', () => {
  const s = S(), d = donorOf(s), camp = newCamp(s);
  op(s, fun(s), { type: 'createPledge', donorId: d, campaignId: camp, kind: 'monthly', amount: 100, method: 'bank', day: 28, startsOn: '2026-11-20' });
  const before = s.donations.length; op(s, fun(s), { type: 'runPledges' });
  assert.equal(s.donations.some((x) => x.date === '2026-11-28'), false); void before;
});

test('one-off pledges: pay once, validation', () => {
  const s = S(), d = donorOf(s), camp = newCamp(s);
  const p = op(s, fun(s), { type: 'createPledge', donorId: d, campaignId: camp, kind: 'one_off', amount: 1000, method: 'bank', dueOn: '2026-12-10' }).pledgeId;
  assert.ok(op(s, fun(s), { type: 'fulfilPledge', pledgeId: p }).receipt);
  bad(() => op(s, fun(s), { type: 'fulfilPledge', pledgeId: p }), L.UserError, /not active/);
  bad(() => op(s, fun(s), { type: 'setPledgeStatus', pledgeId: p, status: 'cancelled' }), L.UserError, /finished/);
  bad(() => op(s, fun(s), { type: 'createPledge', donorId: d, campaignId: camp, kind: 'monthly', amount: 100, method: 'bank', day: 31, startsOn: TODAY }), L.UserError);
  bad(() => op(s, fun(s), { type: 'createPledge', donorId: d, campaignId: CLOSED, kind: 'one_off', amount: 100, method: 'bank', dueOn: TODAY }), L.UserError, /closed/);
  bad(() => op(s, fun(s), { type: 'createPledge', donorId: d, campaignId: camp, kind: 'one_off', amount: 100, method: 'bank', dueOn: '2020-01-01' }), L.UserError);
});

test('in-kind gifts get a receipt, then go to a matching case', () => {
  const s = S(), d = donorOf(s);
  const g = op(s, fun(s), { type: 'recordInKind', donorId: d, kind: 'medical', description: 'Nebulizers', qty: 5, unit: 'piece', value: 7500 });
  assert.ok(g.receipt.startsWith('K-2026-'));
  const food = freshCase(s, { category: 'food' }), health = freshCase(s, { category: 'health' });
  bad(() => op(s, prg(s), { type: 'distributeInKind', inKindId: g.inKindId, caseId: food }), L.UserError, /match/);
  op(s, prg(s), { type: 'distributeInKind', inKindId: g.inKindId, caseId: health });
  bad(() => op(s, prg(s), { type: 'distributeInKind', inKindId: g.inKindId, caseId: health }), L.UserError, /already distributed/);
  bad(() => op(s, fun(s), { type: 'distributeInKind', inKindId: g.inKindId, caseId: health }), L.PermError);
  bad(() => op(s, fun(s), { type: 'recordInKind', donorId: d, kind: 'gold', description: 'Bars', qty: 1, unit: 'kg', value: 1 }), L.UserError);
  bad(() => op(s, fun(s), { type: 'recordInKind', donorId: d, kind: 'food', description: 'Rice', qty: 0, unit: 'kg', value: 1 }), L.UserError);
});

test('volunteer shifts: capacity, overlap, signing up twice, cancelled shifts', () => {
  const s = S(); const v = vol(s);
  const mk = (o) => op(s, prg(s), { type: 'createShift', title: 'Test shift', date: '2026-12-20', start: '10:00', end: '12:00', slots: 1, place: 'Cairo', ...o }).shiftId;
  const a = mk({}), b = mk({ start: '11:00', end: '13:00', slots: 5 }), c = mk({ start: '13:00', end: '15:00' });
  op(s, v, { type: 'signUp', shiftId: a });
  bad(() => op(s, v, { type: 'signUp', shiftId: a }), L.UserError, /already/);
  bad(() => op(s, v, { type: 'signUp', shiftId: b }), L.UserError, /same time/);
  op(s, v, { type: 'signUp', shiftId: c });
  s.shifts.find((x) => x.id === c).signups.push('v9'); // someone else takes the last slot
  op(s, v, { type: 'leaveShift', shiftId: c });
  bad(() => op(s, v, { type: 'signUp', shiftId: c }), L.UserError, /full/);
  op(s, prg(s), { type: 'cancelShift', shiftId: a });
  bad(() => op(s, v, { type: 'signUp', shiftId: a }), L.UserError, /cancelled/);
  bad(() => mk({ date: '2026-11-01' }), L.UserError, /past/);
  bad(() => mk({ end: '09:00' }), L.UserError, /after the start/);
  bad(() => op(s, v, { type: 'createShift', title: 'x', date: '2026-12-20', start: '10:00', end: '12:00', slots: 1, place: 'x' }), L.PermError);
});

test('volunteer hours: dates, 12-hour day, half-hour steps, review', () => {
  const s = S(), v = vol(s), log = (o) => op(s, v, { type: 'logHours', date: '2026-11-03', hours: 2, activity: 'Packing boxes', ...o });
  bad(() => log({ date: '2026-11-26' }), L.UserError, /future/);
  bad(() => log({ date: '2026-09-01' }), L.UserError, /30 days/);
  bad(() => log({ hours: 0.25 }), L.UserError); bad(() => log({ hours: 13 }), L.UserError); bad(() => log({ hours: '2' }), L.UserError); bad(() => log({ hours: -1 }), L.UserError);
  let clean = null; for (let i = 1; i < 30 && !clean; i++) { const d = L.addDays(TODAY, -i); if (!s.hours.some((h) => h.volunteerId === 'v1' && h.date === d)) clean = d; }
  assert.ok(clean);
  log({ date: clean, hours: 8 });
  bad(() => log({ date: clean, hours: 4.5 }), L.UserError, /12 hours/);
  assert.ok(log({ date: clean, hours: 4 }).hoursId);
  const id = s.hours.find((h) => h.status === 'pending' && h.volunteerId === 'v1')?.id || log({ date: L.addDays(TODAY, -1), hours: 0.5 }).hoursId;
  const was = L.hoursOf(s, 'v1', 'rejected');
  assert.equal(s.hours.find((h) => h.id === id).status, 'pending');
  bad(() => op(s, v, { type: 'reviewHours', hoursId: id, decision: 'approve' }), L.PermError);
  bad(() => op(s, prg(s), { type: 'reviewHours', hoursId: id, decision: 'reject' }), L.UserError);
  op(s, prg(s), { type: 'reviewHours', hoursId: id, decision: 'reject', reason: 'Not on the roster' });
  bad(() => op(s, prg(s), { type: 'reviewHours', hoursId: id, decision: 'approve' }), L.UserError, /already reviewed/);
  assert.equal(L.hoursOf(s, 'v1', 'rejected'), was + s.hours.find((h) => h.id === id).hours);
});

test('hours tied to a shift need a sign-up and the right date, and count once', () => {
  const s = S(), v = vol(s);
  const sh = op(s, prg(s), { type: 'createShift', title: 'Test shift', date: TODAY, start: '16:00', end: '18:00', slots: 3, place: 'Giza' }).shiftId;
  const o = { type: 'logHours', date: TODAY, hours: 2, activity: 'Shift work', shiftId: sh };
  bad(() => op(s, v, o), L.UserError, /not signed up/);
  op(s, v, { type: 'signUp', shiftId: sh });
  bad(() => op(s, v, { ...o, date: '2026-11-24' }), L.UserError, /does not match/);
  const before = L.hoursOf(s, 'v1', 'pending') + L.hoursOf(s, 'v1');
  op(s, v, o);
  bad(() => op(s, v, o), L.UserError, /already logged/);
  assert.equal(L.hoursOf(s, 'v1', 'pending') + L.hoursOf(s, 'v1'), before + 2);
});

test('public gifts: limits, anonymous by default, tight cap, rate limit', () => {
  const s = S(), n = s.donations.length;
  const r = L.publicDonate(s, { campaignId: WINTER, amount: 100 }, NOW);
  assert.ok(r.receipt); assert.equal(s.donations.length, n + 1);
  const d = s.donations[s.donations.length - 1]; assert.equal(d.anonymous, true); assert.equal(d.source, 'public');
  bad(() => L.publicDonate(s, { campaignId: WINTER, amount: 5001 }, NOW), L.UserError);
  bad(() => L.publicDonate(s, { campaignId: WINTER, amount: 5 }, NOW), L.UserError);
  bad(() => L.publicDonate(s, { campaignId: DRAFT, amount: 100 }, NOW), L.UserError);
  bad(() => L.publicDonate(s, { campaignId: 'nope', amount: 100 }, NOW), L.UserError);
  bad(() => L.publicDonate(s, { campaignId: WINTER, amount: 100, name: 'x'.repeat(61) }, NOW), L.UserError);
  for (let i = 0; i < 59; i++) L.publicDonate(s, { campaignId: WINTER, amount: 10 }, NOW);
  bad(() => L.publicDonate(s, { campaignId: WINTER, amount: 10 }, NOW), L.UserError, /Too many/);
  assert.ok(L.publicDonate(s, { campaignId: WINTER, amount: 10 }, NOW + 3700000).receipt);
});

test('privacy: fundraiser never sees case names or phones; program never sees donors', () => {
  const s = S();
  const f = JSON.stringify(L.view(s, fun(s), NOW)), p = L.view(s, prg(s), NOW), ps = JSON.stringify(p);
  const c0 = s.cases[0];
  assert.ok(!f.includes(c0.name) && !f.includes(c0.phone) && !f.includes(c0.nameAr));
  assert.ok(!ps.includes(s.donors[0].email) && !ps.includes(s.donors[0].phone) && p.donors === undefined && p.donations === undefined);
  assert.ok(!ps.includes('"donorId"'), 'in-kind items hide the donor');
});

test('privacy: volunteers see only their own hours and no money detail', () => {
  const s = S(), v = L.view(s, vol(s), NOW), j = JSON.stringify(v);
  assert.ok(v.hours.every((h) => h.volunteerId === 'v1'));
  assert.equal(v.donors, undefined); assert.equal(v.cases, undefined); assert.equal(v.reports, undefined);
  assert.ok(!j.includes(s.donors[0].email) && !j.includes(s.cases[0].phone) && !j.includes('"available"'));
  assert.ok(v.shifts.every((x) => x.signups === undefined));
});

test('privacy: the public view has no donor contact, no case names, only consenting names on the wall', () => {
  const s = S(), pv = L.publicView(s, NOW), j = JSON.stringify(pv);
  assert.ok(!j.includes('@mail.example') && !j.includes(s.cases[0].name) && !j.includes('"phone"'));
  assert.ok(pv.campaigns.every((c) => c.status === 'active' || c.status === 'closed'));
  const hidden = s.donors.filter((d) => !d.wall).map((d) => d.name);
  for (const c of pv.campaigns) for (const w of c.wall) assert.ok(!hidden.includes(w.name));
  const anon = s.donations.find((d) => d.anonymous && d.donorId);
  assert.ok(anon);
});

test('the audit log and settings belong to the director', () => {
  const s = S();
  assert.ok(L.view(s, own(s), NOW).audit); assert.equal(L.view(s, fun(s), NOW).audit, undefined); assert.equal(L.view(s, prg(s), NOW).audit, undefined);
  bad(() => op(s, fun(s), { type: 'setSettings', adminCapPct: 10, approvalAbove: 15000, reviewAbove: 50000, certificateHours: 40 }), L.PermError);
  bad(() => op(s, own(s), { type: 'setSettings', adminCapPct: 60, approvalAbove: 15000, reviewAbove: 50000, certificateHours: 40 }), L.UserError);
  op(s, own(s), { type: 'setSettings', adminCapPct: 12, approvalAbove: 10000, reviewAbove: 40000, certificateHours: 30 });
  assert.equal(L.view(s, prg(s), NOW).settings.approvalAbove, 10000);
});

test('every role is refused the actions that are not theirs', () => {
  const s = S();
  const attempts = [[vol, { type: 'recordDonation' }], [vol, { type: 'allocate' }], [vol, { type: 'addCase' }], [vol, { type: 'runPledges' }], [prg, { type: 'recordDonation' }], [prg, { type: 'addDonor' }], [prg, { type: 'createCampaign' }], [prg, { type: 'refundDonation' }], [fun, { type: 'allocate' }], [fun, { type: 'addCase' }], [fun, { type: 'reviewHours' }], [fun, { type: 'logHours' }], [prg, { type: 'signUp' }], [fun, { type: 'decideAllocation' }]];
  for (const [r, o] of attempts) bad(() => op(s, r(s), o), L.PermError, undefined);
});

test('unknown and prototype-name actions are refused', () => {
  const s = S();
  for (const t of ['nope', 'constructor', '__proto__', 'toString', 'hasOwnProperty', undefined, 5, null]) bad(() => L.applyOp(s, { type: t }, { user: own(s), now: NOW }), L.UserError, /Unknown action/);
  bad(() => L.applyOp(s, null, { user: own(s), now: NOW }), L.UserError);
});

test('hostile text is stored as plain text and never changes the numbers', () => {
  const s = S(), evil = '<img src=x onerror=alert(1)>"; DROP TABLE donors; --';
  const id = op(s, fun(s), { type: 'addDonor', name: evil, email: 'evil@mail.example', phone: '01077778888', kind: 'individual', city: 'Cairo', wall: true }).donorId;
  assert.equal(s.donors.find((d) => d.id === id).name, evil);
  const before = L.reports(s, NOW).totals.raised; give(s, WINTER, 100);
  assert.equal(L.reports(s, NOW).totals.raised, before + 100);
});

test('CSV cells that start with a formula character are neutralised', () => {
  assert.equal(L.csvCell('=1+1'), "'=1+1"); assert.equal(L.csvCell('@x'), "'@x"); assert.equal(L.csvCell('a,b'), '"a,b"'); assert.equal(L.csvCell('say "hi"'), '"say ""hi"""');
  assert.ok(L.toCsv([['a', '=b']]).startsWith('\ufeff'));
});

test('reports: totals match the ledger', () => {
  const s = S(), r = L.reports(s, NOW);
  const sum = s.donations.filter((d) => d.status === 'received').reduce((x, d) => x + d.amount, 0);
  assert.equal(r.totals.raised, sum);
  assert.equal(r.byMonth.length, 12);
  assert.equal(r.campaigns.reduce((x, c) => x + c.raised, 0), sum);
  assert.equal(r.totals.programSpent + r.totals.adminSpent + r.totals.unallocated + s.allocs.filter((a) => a.status === 'pending').reduce((x, a) => x + a.amount, 0), sum);
  assert.ok(r.totals.adminPct <= 10);
});

test('public view figures agree with the ledger', () => {
  const s = S(), pv = L.publicView(s, NOW);
  for (const c of pv.campaigns) { assert.equal(c.raised, L.raisedOf(s, c.id)); assert.equal(c.allocated.program + c.allocated.admin + c.allocated.notYet, c.raised); }
});

test('certificate threshold counts approved hours only', () => {
  const s = S(); const v = L.view(s, vol(s), NOW);
  assert.equal(v.certificateAt, 40); assert.equal(v.approvedHours, L.hoursOf(s, 'v1')); assert.ok(v.approvedHours >= 40);
});
