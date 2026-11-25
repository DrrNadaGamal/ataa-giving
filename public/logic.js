// Ataa business rules. Pure functions shared by the browser, the API and the tests.
// Money is whole EGP. Cairo calendar days are 'YYYY-MM-DD'. Times are epoch ms.
export const TZ = 'Africa/Cairo';
export const ROLES = { owner: 'owner', fundraiser: 'fundraiser', program: 'program', volunteer: 'volunteer' };
export const DEMO_USERS = [
  { pin: '1111', label: 'Executive director (Laila)', labelAr: 'المديرة التنفيذية (ليلى)' },
  { pin: '2222', label: 'Fundraising officer (Hossam)', labelAr: 'مسؤول جمع التبرعات (حسام)' },
  { pin: '3333', label: 'Program officer (Mariam)', labelAr: 'مسؤولة البرامج (مريم)' },
  { pin: '4444', label: 'Volunteer (Yara)', labelAr: 'متطوعة (يارا)' },
];
export const CAUSES = ['health', 'education', 'food', 'shelter', 'emergency'];
export const CASE_CATS = ['health', 'education', 'food', 'shelter'];
export const METHODS = ['cash', 'card', 'bank', 'fawry', 'wallet'];
export const KINDS = ['food', 'clothes', 'medical', 'school', 'furniture'];
export const DEFAULTS = { adminCapPct: 10, approvalAbove: 15000, reviewAbove: 50000, minGift: 10, certificateHours: 40, publicGiftMax: 5000 };
export const MAX_GIFT = 1000000;
export const MAX_DAY_HOURS = 12;

export class UserError extends Error {}
export class PermError extends Error {}

// ---------- dates ----------
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const tzParts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
export const dayKey = (ts) => fmt.format(ts);
const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const toKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (k, n) => toKey(parse(k) + n * 864e5);
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const monthOf = (k) => k.slice(0, 7);
export const isKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && toKey(parse(k)) === k;
export const dow = (k) => new Date(parse(k)).getUTCDay();
export const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); const t = y * 12 + (mo - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
export const toMin = (t) => { const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(t)); if (!m) throw new UserError('Time must look like 19:30'); return Number(m[1]) * 60 + Number(m[2]); };
export const hmOf = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export function localParts(ts) { const p = Object.fromEntries(tzParts.formatToParts(ts).map((x) => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) }; }
export function localTs(date, mins) {
  let guess = parse(date) + mins * 60000 - 2 * 3600000;
  for (let i = 0; i < 3; i++) { const p = localParts(guess); guess += (parse(date) / 6e4 + mins - (parse(p.date) / 6e4 + p.min)) * 60000; }
  return guess;
}

// ---------- validation ----------
const str = (v, min, max, label) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) throw new UserError(`${label} must be ${min === max ? min : `${min} to ${max}`} characters`);
  return s;
};
const optStr = (v, max, label) => (v === undefined || v === null || v === '' ? '' : str(v, 0, max, label));
const intIn = (v, min, max, label) => { if (!Number.isInteger(v) || v < min || v > max) throw new UserError(`${label} must be a whole number from ${min} to ${max}`); return v; };
const oneOf = (v, list, msg) => { if (typeof v !== 'string' || !list.includes(v)) throw new UserError(msg); return v; };
const dateIn = (v, label = 'Date') => { if (!isKey(v)) throw new UserError(`${label} must be a valid date`); return v; };
const bool = (v) => v === true;
const need = (user, roles) => { if (!roles.includes(user.role)) throw new PermError('You do not have permission to do this'); };
const FUND = ['owner', 'fundraiser'], PROG = ['owner', 'program'];
const settings = (s) => ({ ...DEFAULTS, ...(s.settings || {}) });
const nextId = (s, p) => `${p}${++s.counters[p]}`;
const pad = (n, w) => String(n).padStart(w, '0');
const audit = (s, user, now, action, detail) => { s.audit.unshift({ ts: now, userId: user.id, name: user.name, action, detail: String(detail).slice(0, 200) }); if (s.audit.length > 300) s.audit.length = 300; };
const once = (s, op, fn) => {
  if (op.key !== undefined && (typeof op.key !== 'string' || op.key.length < 4 || op.key.length > 40)) throw new UserError('Bad request');
  if (op.key && s.keys.includes(op.key)) return { duplicate: true };
  const r = fn(); if (op.key) { s.keys.push(op.key); if (s.keys.length > 400) s.keys.shift(); } return r;
};
const find = (arr, id, what) => { const x = typeof id === 'string' ? arr.find((y) => y.id === id) : null; if (!x) throw new UserError(`${what} not found`); return x; };
const getCampaign = (s, id) => find(s.campaigns, id, 'Campaign');
const getDonor = (s, id) => find(s.donors, id, 'Donor');
const getDonation = (s, id) => find(s.donations, id, 'Donation');
const getPledge = (s, id) => find(s.pledges, id, 'Pledge');
const getCase = (s, id) => find(s.cases, id, 'Case');
const getAlloc = (s, id) => find(s.allocs, id, 'Allocation');
const getShift = (s, id) => find(s.shifts, id, 'Shift');
const getInKind = (s, id) => find(s.inkind, id, 'In-kind gift');
const getHours = (s, id) => find(s.hours, id, 'Hours entry');
const getVol = (s, id) => find(s.volunteers, id, 'Volunteer');

export const normPhone = (v) => {
  let d = String(v ?? '').replace(/[\s\-().]/g, '');
  if (d.startsWith('+20')) d = '0' + d.slice(3); else if (d.startsWith('0020')) d = '0' + d.slice(4);
  if (!/^01[0125]\d{8}$/.test(d)) throw new UserError('Phone must be an Egyptian mobile number like 01012345678');
  return d;
};
export const normEmail = (v) => {
  const e = String(v ?? '').trim().toLowerCase();
  if (e.length > 80 || !/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/.test(e)) throw new UserError('Email address is not valid');
  return e;
};

// ---------- money rules ----------
export const raisedOf = (s, cid) => s.donations.filter((d) => d.campaignId === cid && d.status === 'received').reduce((a, d) => a + d.amount, 0);
export const refundedOf = (s, cid) => s.donations.filter((d) => d.campaignId === cid && d.status === 'refunded').reduce((a, d) => a + d.amount, 0);
const live = (a) => a.status === 'approved' || a.status === 'pending';
export const reservedOf = (s, cid) => s.allocs.filter((a) => a.campaignId === cid && live(a)).reduce((x, a) => x + a.amount, 0);
export const availableOf = (s, cid) => raisedOf(s, cid) - reservedOf(s, cid);
export const adminUsedOf = (s, cid) => s.allocs.filter((a) => a.campaignId === cid && a.kind === 'admin' && live(a)).reduce((x, a) => x + a.amount, 0);
export const adminCapOf = (s, cid) => Math.floor((raisedOf(s, cid) * settings(s).adminCapPct) / 100);
export const caseFunded = (s, id) => s.allocs.filter((a) => a.caseId === id && a.status === 'approved').reduce((x, a) => x + a.amount, 0);
export const caseReserved = (s, id) => s.allocs.filter((a) => a.caseId === id && live(a)).reduce((x, a) => x + a.amount, 0);
export const donorTotal = (s, id) => s.donations.filter((d) => d.donorId === id && d.status === 'received').reduce((x, d) => x + d.amount, 0);
export const hoursOf = (s, vid, status = 'approved') => s.hours.filter((h) => h.volunteerId === vid && h.status === status).reduce((x, h) => x + h.hours, 0);
export const campaignOpen = (c, today) => c.status === 'active' && c.startsOn <= today && c.endsOn >= today;
const receiptNo = (s, prefix, date) => `${prefix}-${date.slice(0, 4)}-${pad(++s.counters[prefix === 'R' ? 'r' : 'q'], 6)}`;

// ---------- normalisation (run before each operation) ----------
export function normalize(s, now) {
  const today = dayKey(now);
  for (const c of s.campaigns) if (c.status === 'active' && c.endsOn < today) { c.status = 'closed'; c.closedAt = now; }
}

// ---------- operations ----------
const donorFields = (s, op, selfId) => {
  const f = { name: str(op.name, 2, 60, 'Name'), nameAr: optStr(op.nameAr, 60, 'Arabic name'), email: normEmail(op.email), phone: normPhone(op.phone), type: oneOf(op.kind, ['individual', 'company'], 'Donor kind must be individual or company'), city: str(op.city, 2, 40, 'City'), wall: bool(op.wall), note: optStr(op.note, 300, 'Note') };
  if (s.donors.some((d) => d.id !== selfId && d.email === f.email)) throw new UserError('A donor with this email already exists');
  if (s.donors.some((d) => d.id !== selfId && d.phone === f.phone)) throw new UserError('A donor with this phone already exists');
  return f;
};
const campaignFields = (op) => {
  const f = { title: str(op.title, 3, 80, 'Title'), titleAr: optStr(op.titleAr, 80, 'Arabic title'), summary: str(op.summary, 10, 600, 'Summary'), summaryAr: optStr(op.summaryAr, 600, 'Arabic summary'), cause: oneOf(op.cause, CAUSES, 'Pick a cause'), goal: intIn(op.goal, 1000, 100000000, 'Goal'), startsOn: dateIn(op.startsOn, 'Start date'), endsOn: dateIn(op.endsOn, 'End date') };
  if (f.endsOn < f.startsOn) throw new UserError('The end date must be after the start date');
  return f;
};
const caseFields = (op) => ({ name: str(op.name, 2, 60, 'Name'), nameAr: optStr(op.nameAr, 60, 'Arabic name'), phone: op.phone ? normPhone(op.phone) : '', city: str(op.city, 2, 40, 'City'), category: oneOf(op.category, CASE_CATS, 'Pick a category'), householdSize: intIn(op.householdSize, 1, 20, 'Household size'), need: intIn(op.need, 500, 1000000, 'Amount needed'), summary: str(op.summary, 10, 400, 'Summary'), summaryAr: optStr(op.summaryAr, 400, 'Arabic summary'), share: bool(op.share) });
const donationDate = (op, camp, now) => {
  const today = dayKey(now);
  const date = op.date === undefined ? today : dateIn(op.date);
  if (date > today) throw new UserError('A gift cannot be dated in the future');
  if (date < addDays(today, -60)) throw new UserError('Gifts can be back-dated by at most 60 days');
  if (date < camp.startsOn) throw new UserError('This date is before the campaign started');
  return date;
};
function makeDonation(s, o, now) {
  const d = { id: nextId(s, 'd'), receipt: receiptNo(s, 'R', o.date), donorId: o.donorId || null, giverName: o.giverName || '', campaignId: o.camp.id, amount: o.amount, method: o.method, date: o.date, ts: now, anonymous: !!o.anonymous, status: 'received', source: o.source, pledgeId: o.pledgeId || null, note: o.note || '', by: o.by };
  s.donations.push(d);
  return d;
}
function checkAlloc(s, camp, caseRec, kind, amount) {
  if (camp.status === 'draft') throw new UserError('A draft campaign has no funds to allocate');
  if (amount > availableOf(s, camp.id)) throw new UserError('Not enough unallocated funds in this campaign');
  if (kind === 'admin') {
    if (adminUsedOf(s, camp.id) + amount > adminCapOf(s, camp.id)) throw new UserError('Admin costs are capped at ' + settings(s).adminCapPct + '% of funds raised');
    return;
  }
  if (caseRec.status !== 'open') throw new UserError('This case is not open for funding');
  if (camp.cause !== 'emergency' && camp.cause !== caseRec.category) throw new UserError('Funds raised for ' + camp.cause + ' can only go to ' + camp.cause + ' cases');
  if (amount > caseRec.need - caseReserved(s, caseRec.id)) throw new UserError('This is more than the case still needs');
}
const refreshCase = (s, c, now) => { if (c.status === 'open' && caseFunded(s, c.id) >= c.need) { c.status = 'funded'; c.closedAt = now; } };
const shiftOverlap = (a, b) => a.date === b.date && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);
const KIND_FOR = { food: ['food'], clothes: ['shelter'], medical: ['health'], school: ['education'], furniture: ['shelter'] };

const OPS = {
  // ----- donors -----
  addDonor(s, op, { user, now }) {
    need(user, FUND);
    return once(s, op, () => { const f = donorFields(s, op, null); const d = { id: nextId(s, 'g'), ...f, createdAt: now }; s.donors.push(d); audit(s, user, now, 'addDonor', `${d.id} ${d.name}`); return { donorId: d.id }; });
  },
  updateDonor(s, op, { user, now }) {
    need(user, FUND); const d = getDonor(s, op.donorId); Object.assign(d, donorFields(s, op, d.id)); audit(s, user, now, 'updateDonor', d.id); return {};
  },
  // ----- campaigns -----
  createCampaign(s, op, { user, now }) {
    need(user, FUND);
    return once(s, op, () => { const c = { id: nextId(s, 'k'), ...campaignFields(op), status: 'draft', createdAt: now }; s.campaigns.push(c); audit(s, user, now, 'createCampaign', `${c.id} ${c.title}`); return { campaignId: c.id }; });
  },
  updateCampaign(s, op, { user, now }) {
    need(user, FUND); const c = getCampaign(s, op.campaignId);
    if (c.status === 'closed') throw new UserError('A closed campaign cannot be edited');
    const f = campaignFields(op);
    if (f.cause !== c.cause && (s.donations.some((d) => d.campaignId === c.id) || s.allocs.some((a) => a.campaignId === c.id))) throw new UserError('The cause cannot change once the campaign has gifts');
    if (f.goal < raisedOf(s, c.id)) throw new UserError('The goal cannot be lower than the amount already raised');
    Object.assign(c, f); audit(s, user, now, 'updateCampaign', c.id); return {};
  },
  setCampaignStatus(s, op, { user, now }) {
    need(user, FUND); const c = getCampaign(s, op.campaignId); const to = oneOf(op.status, ['active', 'paused', 'closed'], 'Unknown status');
    const today = dayKey(now);
    if (c.status === 'closed') throw new UserError('A closed campaign cannot be reopened');
    if (to === 'active') { if (c.endsOn < today) throw new UserError('The end date has passed. Edit the dates first'); if (c.status === 'active') throw new UserError('Already active'); }
    if (to === 'paused' && c.status !== 'active') throw new UserError('Only an active campaign can be paused');
    if (to === 'closed') { if (user.role !== 'owner') throw new PermError('You do not have permission to do this'); c.closedAt = now; }
    c.status = to; audit(s, user, now, 'setCampaignStatus', `${c.id} ${to}`); return {};
  },
  // ----- gifts -----
  recordDonation(s, op, { user, now }) {
    need(user, FUND);
    return once(s, op, () => {
      const camp = getCampaign(s, op.campaignId), donor = op.donorId ? getDonor(s, op.donorId) : null;
      if (!campaignOpen(camp, dayKey(now))) throw new UserError('This campaign is not accepting gifts');
      const amount = intIn(op.amount, settings(s).minGift, MAX_GIFT, 'Amount');
      if (amount > settings(s).reviewAbove && user.role !== 'owner') throw new UserError('Gifts above ' + settings(s).reviewAbove + ' EGP must be recorded by the director');
      const method = oneOf(op.method, METHODS, 'Pick a payment method');
      const d = makeDonation(s, { camp, donorId: donor && donor.id, giverName: donor ? '' : optStr(op.giverName, 60, 'Name'), amount, method, date: donationDate(op, camp, now), anonymous: op.anonymous, source: 'staff', note: optStr(op.note, 200, 'Note'), by: user.id }, now);
      audit(s, user, now, 'recordDonation', `${d.receipt} ${amount}`);
      return { donationId: d.id, receipt: d.receipt };
    });
  },
  refundDonation(s, op, { user, now }) {
    need(user, ['owner']); const d = getDonation(s, op.donationId);
    if (d.status !== 'received') throw new UserError('This gift is already refunded');
    const reason = str(op.reason, 3, 200, 'Reason');
    if (raisedOf(s, d.campaignId) - d.amount < reservedOf(s, d.campaignId)) throw new UserError('Funds from this gift are already allocated');
    d.status = 'refunded'; d.refund = { ts: now, reason, by: user.id };
    audit(s, user, now, 'refundDonation', `${d.receipt} ${d.amount}`); return {};
  },
  // ----- pledges -----
  createPledge(s, op, { user, now }) {
    need(user, FUND);
    return once(s, op, () => {
      const donor = getDonor(s, op.donorId), camp = getCampaign(s, op.campaignId);
      if (camp.status === 'closed') throw new UserError('This campaign is closed');
      const kind = oneOf(op.kind, ['monthly', 'one_off'], 'Pick monthly or one-off');
      const amount = intIn(op.amount, settings(s).minGift, MAX_GIFT, 'Amount');
      const method = oneOf(op.method, METHODS, 'Pick a payment method');
      const p = { id: nextId(s, 'p'), donorId: donor.id, campaignId: camp.id, kind, amount, method, status: 'active', paid: [], createdAt: now };
      const today = dayKey(now);
      if (kind === 'monthly') { p.day = intIn(op.day, 1, 28, 'Day of month'); p.startsOn = dateIn(op.startsOn, 'Start date'); if (p.startsOn < addDays(today, -31)) throw new UserError('The start date is too far in the past'); }
      else { p.dueOn = dateIn(op.dueOn, 'Due date'); if (p.dueOn < addDays(today, -31)) throw new UserError('The due date is too far in the past'); }
      s.pledges.push(p); audit(s, user, now, 'createPledge', `${p.id} ${kind} ${amount}`); return { pledgeId: p.id };
    });
  },
  setPledgeStatus(s, op, { user, now }) {
    need(user, FUND); const p = getPledge(s, op.pledgeId); const to = oneOf(op.status, ['active', 'paused', 'cancelled'], 'Unknown status');
    if (p.status === 'cancelled' || p.status === 'fulfilled') throw new UserError('This pledge is finished');
    p.status = to; audit(s, user, now, 'setPledgeStatus', `${p.id} ${to}`); return {};
  },
  fulfilPledge(s, op, { user, now }) {
    need(user, FUND);
    return once(s, op, () => {
      const p = getPledge(s, op.pledgeId); if (p.kind !== 'one_off') throw new UserError('Only one-off pledges are paid by hand');
      if (p.status !== 'active') throw new UserError('This pledge is not active');
      const camp = getCampaign(s, p.campaignId);
      if (!campaignOpen(camp, dayKey(now))) throw new UserError('This campaign is not accepting gifts');
      const d = makeDonation(s, { camp, donorId: p.donorId, amount: p.amount, method: p.method, date: dayKey(now), source: 'pledge', pledgeId: p.id, by: user.id }, now);
      p.status = 'fulfilled'; p.paid.push(d.date); audit(s, user, now, 'fulfilPledge', `${p.id} ${d.receipt}`); return { donationId: d.id, receipt: d.receipt };
    });
  },
  // Creates the monthly gifts that are due. Safe to repeat: each pledge pays each month once.
  runPledges(s, op, { user, now }) {
    need(user, FUND);
    const today = dayKey(now); let created = 0, skipped = 0;
    for (const p of s.pledges) {
      if (p.kind !== 'monthly' || p.status !== 'active') continue;
      const camp = s.campaigns.find((c) => c.id === p.campaignId);
      let m = monthOf(p.startsOn); const first = addMonths(monthOf(today), -2);
      if (m < first) m = first;
      for (; m <= monthOf(today); m = addMonths(m, 1)) {
        const due = `${m}-${pad(p.day, 2)}`;
        if (due > today || due < p.startsOn || p.paid.includes(m)) continue;
        if (!camp || !campaignOpen(camp, today) || due < camp.startsOn || due > camp.endsOn) { skipped++; continue; }
        makeDonation(s, { camp, donorId: p.donorId, amount: p.amount, method: p.method, date: due, source: 'pledge', pledgeId: p.id, by: user.id }, now);
        p.paid.push(m); created++;
      }
    }
    audit(s, user, now, 'runPledges', `${created} created, ${skipped} skipped`); return { created, skipped };
  },
  // ----- in-kind gifts -----
  recordInKind(s, op, { user, now }) {
    need(user, FUND);
    return once(s, op, () => {
      const donor = getDonor(s, op.donorId); const today = dayKey(now);
      const camp = op.campaignId ? getCampaign(s, op.campaignId) : null;
      const date = op.date === undefined ? today : dateIn(op.date); if (date > today) throw new UserError('A gift cannot be dated in the future');
      const g = { id: nextId(s, 'n'), receipt: receiptNo(s, 'K', date), donorId: donor.id, campaignId: camp ? camp.id : null, kind: oneOf(op.kind, KINDS, 'Pick a kind'), description: str(op.description, 3, 120, 'Description'), qty: intIn(op.qty, 1, 100000, 'Quantity'), unit: str(op.unit, 1, 20, 'Unit'), value: intIn(op.value, 0, 500000, 'Estimated value'), date, status: 'in_stock', createdAt: now };
      s.inkind.push(g); audit(s, user, now, 'recordInKind', `${g.receipt}`); return { inKindId: g.id, receipt: g.receipt };
    });
  },
  distributeInKind(s, op, { user, now }) {
    need(user, PROG); const g = getInKind(s, op.inKindId), c = getCase(s, op.caseId);
    if (g.status !== 'in_stock') throw new UserError('This item is already distributed');
    if (c.status === 'closed') throw new UserError('This case is closed');
    if (!KIND_FOR[g.kind].includes(c.category)) throw new UserError('This item does not match the case category');
    g.status = 'distributed'; g.caseId = c.id; g.distributedOn = dayKey(now); audit(s, user, now, 'distributeInKind', `${g.receipt} to ${c.code}`); return {};
  },
  // ----- beneficiary cases -----
  addCase(s, op, { user, now }) {
    need(user, PROG);
    return once(s, op, () => {
      const f = caseFields(op);
      if (f.phone && s.cases.some((c) => c.phone === f.phone && c.status !== 'closed')) throw new UserError('An open case already uses this phone');
      const c = { id: nextId(s, 'c'), code: 'C-' + pad(s.counters.c, 4), ...f, status: 'open', createdAt: now };
      s.cases.push(c); audit(s, user, now, 'addCase', c.code); return { caseId: c.id };
    });
  },
  updateCase(s, op, { user, now }) {
    need(user, PROG); const c = getCase(s, op.caseId); if (c.status === 'closed') throw new UserError('This case is closed');
    const f = caseFields(op);
    if (f.need < caseReserved(s, c.id)) throw new UserError('The amount needed cannot be lower than what is already allocated');
    if (f.category !== c.category && caseReserved(s, c.id) > 0) throw new UserError('The category cannot change once funds are allocated');
    Object.assign(c, f); refreshCase(s, c, now); audit(s, user, now, 'updateCase', c.code); return {};
  },
  closeCase(s, op, { user, now }) {
    need(user, PROG); const c = getCase(s, op.caseId); if (c.status === 'closed') throw new UserError('This case is already closed');
    if (s.allocs.some((a) => a.caseId === c.id && a.status === 'pending')) throw new UserError('Decide the pending allocation first');
    c.status = 'closed'; c.closedAt = now; audit(s, user, now, 'closeCase', c.code); return {};
  },
  // ----- allocation of funds -----
  allocate(s, op, { user, now }) {
    need(user, PROG);
    return once(s, op, () => {
      const camp = getCampaign(s, op.campaignId); const kind = oneOf(op.kind, ['case', 'admin'], 'Pick case or admin');
      const amount = intIn(op.amount, 100, 10000000, 'Amount');
      const c = kind === 'case' ? getCase(s, op.caseId) : null;
      if (kind === 'admin' && user.role !== 'owner') throw new PermError('You do not have permission to do this');
      checkAlloc(s, camp, c, kind, amount);
      const pending = user.role !== 'owner' && amount > settings(s).approvalAbove;
      const a = { id: nextId(s, 'a'), campaignId: camp.id, caseId: c ? c.id : null, kind, amount, status: pending ? 'pending' : 'approved', note: optStr(op.note, 200, 'Note'), by: user.id, byName: user.name, ts: now };
      if (!pending) { a.decidedBy = user.id; a.decidedAt = now; }
      s.allocs.push(a); if (c) refreshCase(s, c, now);
      audit(s, user, now, 'allocate', `${a.id} ${kind} ${amount} ${a.status}`); return { allocId: a.id, status: a.status };
    });
  },
  decideAllocation(s, op, { user, now }) {
    need(user, ['owner']); const a = getAlloc(s, op.allocId);
    if (a.status !== 'pending') throw new UserError('This allocation was already decided');
    const to = oneOf(op.decision, ['approve', 'reject'], 'Approve or reject');
    a.status = to === 'approve' ? 'approved' : 'rejected'; a.decidedBy = user.id; a.decidedAt = now;
    if (a.caseId) refreshCase(s, getCase(s, a.caseId), now);
    audit(s, user, now, 'decideAllocation', `${a.id} ${to}`); return {};
  },
  // ----- volunteers -----
  createShift(s, op, { user, now }) {
    need(user, PROG);
    return once(s, op, () => {
      const date = dateIn(op.date, 'Date'); if (date < dayKey(now)) throw new UserError('A shift cannot be in the past');
      const start = hmOf(toMin(op.start)), end = hmOf(toMin(op.end)); if (toMin(end) <= toMin(start)) throw new UserError('The end must be after the start');
      const camp = op.campaignId ? getCampaign(s, op.campaignId) : null;
      const sh = { id: nextId(s, 's'), title: str(op.title, 3, 80, 'Title'), titleAr: optStr(op.titleAr, 80, 'Arabic title'), date, start, end, slots: intIn(op.slots, 1, 100, 'Slots'), place: str(op.place, 2, 80, 'Place'), campaignId: camp ? camp.id : null, signups: [], status: 'open' };
      s.shifts.push(sh); audit(s, user, now, 'createShift', sh.id); return { shiftId: sh.id };
    });
  },
  cancelShift(s, op, { user, now }) {
    need(user, PROG); const sh = getShift(s, op.shiftId); if (sh.status === 'cancelled') throw new UserError('Already cancelled');
    sh.status = 'cancelled'; sh.signups = []; audit(s, user, now, 'cancelShift', sh.id); return {};
  },
  signUp(s, op, { user, now }) {
    need(user, ['volunteer']); const sh = getShift(s, op.shiftId), v = getVol(s, user.volunteerId);
    if (sh.status !== 'open') throw new UserError('This shift is cancelled');
    if (sh.date < dayKey(now)) throw new UserError('This shift has passed');
    if (sh.signups.includes(v.id)) throw new UserError('You are already signed up');
    if (sh.signups.length >= sh.slots) throw new UserError('This shift is full');
    if (s.shifts.some((o) => o.id !== sh.id && o.status === 'open' && o.signups.includes(v.id) && shiftOverlap(o, sh))) throw new UserError('You have another shift at the same time');
    sh.signups.push(v.id); audit(s, user, now, 'signUp', sh.id); return {};
  },
  leaveShift(s, op, { user, now }) {
    need(user, ['volunteer']); const sh = getShift(s, op.shiftId);
    if (!sh.signups.includes(user.volunteerId)) throw new UserError('You are not signed up');
    if (sh.date < dayKey(now)) throw new UserError('This shift has passed');
    sh.signups = sh.signups.filter((x) => x !== user.volunteerId); audit(s, user, now, 'leaveShift', sh.id); return {};
  },
  logHours(s, op, { user, now }) {
    need(user, ['volunteer']);
    return once(s, op, () => {
      const v = getVol(s, user.volunteerId), today = dayKey(now), date = dateIn(op.date);
      if (date > today) throw new UserError('Hours cannot be logged for a future date');
      if (date < addDays(today, -30)) throw new UserError('Hours can be logged for the last 30 days only');
      const hrs = op.hours; if (typeof hrs !== 'number' || hrs < 0.5 || hrs > MAX_DAY_HOURS || Math.round(hrs * 2) !== hrs * 2) throw new UserError('Hours must be from 0.5 to 12 in steps of 0.5');
      const day = s.hours.filter((h) => h.volunteerId === v.id && h.date === date && h.status !== 'rejected').reduce((x, h) => x + h.hours, 0);
      if (day + hrs > MAX_DAY_HOURS) throw new UserError('No more than 12 hours can be logged per day');
      let shiftId = null;
      if (op.shiftId) {
        const sh = getShift(s, op.shiftId);
        if (!sh.signups.includes(v.id)) throw new UserError('You were not signed up for this shift');
        if (sh.date !== date) throw new UserError('The date does not match the shift');
        if (s.hours.some((h) => h.shiftId === sh.id && h.volunteerId === v.id && h.status !== 'rejected')) throw new UserError('Hours for this shift are already logged');
        shiftId = sh.id;
      }
      const h = { id: nextId(s, 'h'), volunteerId: v.id, date, hours: hrs, activity: str(op.activity, 3, 120, 'Activity'), shiftId, status: 'pending', createdAt: now };
      s.hours.push(h); audit(s, user, now, 'logHours', `${h.id} ${hrs}h`); return { hoursId: h.id };
    });
  },
  reviewHours(s, op, { user, now }) {
    need(user, PROG); const h = getHours(s, op.hoursId);
    if (h.status !== 'pending') throw new UserError('This entry was already reviewed');
    const to = oneOf(op.decision, ['approve', 'reject'], 'Approve or reject');
    if (to === 'reject') h.reason = str(op.reason, 3, 120, 'Reason');
    h.status = to === 'approve' ? 'approved' : 'rejected'; h.reviewedBy = user.id; h.reviewedAt = now;
    audit(s, user, now, 'reviewHours', `${h.id} ${to}`); return {};
  },
  // ----- settings -----
  setSettings(s, op, { user, now }) {
    need(user, ['owner']); const cur = settings(s);
    const next = { ...cur, adminCapPct: intIn(op.adminCapPct, 0, 25, 'Admin cap'), approvalAbove: intIn(op.approvalAbove, 1000, 1000000, 'Approval limit'), reviewAbove: intIn(op.reviewAbove, 1000, MAX_GIFT, 'Review limit'), certificateHours: intIn(op.certificateHours, 5, 500, 'Certificate hours') };
    const over = s.campaigns.find((c) => adminUsedOf(s, c.id) > Math.floor((raisedOf(s, c.id) * next.adminCapPct) / 100));
    if (over) throw new UserError('A campaign has already spent more on admin than this cap allows');
    s.settings = next; audit(s, user, now, 'setSettings', 'updated'); return {};
  },
};
export function applyOp(s, op, ctx) {
  if (!op || typeof op.type !== 'string' || !Object.hasOwn(OPS, op.type)) throw new UserError('Unknown action');
  return OPS[op.type](s, op, ctx);
}
export const OP_NAMES = Object.keys(OPS);

// Public gift from the campaign page. Anyone may send it, so limits are tight. Demo only: no money moves.
export function publicDonate(s, op, now) {
  const camp = getCampaign(s, op.campaignId), today = dayKey(now);
  if (!campaignOpen(camp, today)) throw new UserError('This campaign is not accepting gifts');
  const st = settings(s);
  const amount = intIn(op.amount, st.minGift, st.publicGiftMax, 'Amount');
  const name = optStr(op.name, 60, 'Name');
  s.publicLog = (s.publicLog || []).filter((t) => now - t < 3600000);
  if (s.publicLog.length >= 60) throw new UserError('Too many gifts right now, try again later');
  return once(s, op, () => {
    s.publicLog.push(now);
    const d = makeDonation(s, { camp, giverName: name, amount, method: 'online', date: today, anonymous: bool(op.anonymous) || !name, source: 'public', by: 'public' }, now);
    return { receipt: d.receipt, donationId: d.id };
  });
}

// ---------- reports ----------
export function reports(s, now) {
  const today = dayKey(now), m0 = monthOf(today);
  const rec = s.donations.filter((d) => d.status === 'received');
  const months = []; for (let i = 11; i >= 0; i--) months.push(addMonths(m0, -i));
  const byMonth = months.map((m) => ({ m, raised: rec.filter((d) => monthOf(d.date) === m).reduce((x, d) => x + d.amount, 0), gifts: rec.filter((d) => monthOf(d.date) === m).length }));
  const total = rec.reduce((x, d) => x + d.amount, 0);
  const gifts = {}; for (const d of rec) if (d.donorId) gifts[d.donorId] = (gifts[d.donorId] || 0) + 1;
  const donorCount = Object.keys(gifts).length;
  const repeat = Object.values(gifts).filter((n) => n > 1).length;
  const byMethod = {}; for (const d of rec) byMethod[d.method] = (byMethod[d.method] || 0) + d.amount;
  const recurring = rec.filter((d) => d.source === 'pledge' && s.pledges.find((p) => p.id === d.pledgeId)?.kind === 'monthly').reduce((x, d) => x + d.amount, 0);
  const campaigns = s.campaigns.map((c) => ({ id: c.id, raised: raisedOf(s, c.id), refunded: refundedOf(s, c.id), reserved: reservedOf(s, c.id), available: availableOf(s, c.id), adminUsed: adminUsedOf(s, c.id), adminCap: adminCapOf(s, c.id), gifts: rec.filter((d) => d.campaignId === c.id).length }));
  const approved = s.allocs.filter((a) => a.status === 'approved');
  const programSpent = approved.filter((a) => a.kind === 'case').reduce((x, a) => x + a.amount, 0), adminSpent = approved.filter((a) => a.kind === 'admin').reduce((x, a) => x + a.amount, 0);
  const pendingSum = s.allocs.filter((a) => a.status === 'pending').reduce((x, a) => x + a.amount, 0);
  const top = Object.keys(gifts).map((id) => ({ id, total: donorTotal(s, id) })).sort((a, b) => b.total - a.total).slice(0, 10);
  return {
    totals: { raised: total, gifts: rec.length, donors: donorCount, repeatDonors: repeat, repeatPct: donorCount ? Math.round((repeat / donorCount) * 100) : 0, avgGift: rec.length ? Math.round(total / rec.length) : 0, thisMonth: byMonth[11].raised, refunds: s.donations.filter((d) => d.status === 'refunded').reduce((x, d) => x + d.amount, 0), recurring, recurringPct: total ? Math.round((recurring / total) * 100) : 0, programSpent, adminSpent, adminPct: total ? Math.round((adminSpent / total) * 1000) / 10 : 0, unallocated: total - programSpent - adminSpent - pendingSum, pendingAllocs: s.allocs.filter((a) => a.status === 'pending').length, activePledges: s.pledges.filter((p) => p.status === 'active').length, casesOpen: s.cases.filter((c) => c.status === 'open').length, casesFunded: s.cases.filter((c) => c.status === 'funded').length, inKindValue: s.inkind.reduce((x, g) => x + g.value, 0), inKindStock: s.inkind.filter((g) => g.status === 'in_stock').length, volunteerHours: s.hours.filter((h) => h.status === 'approved').reduce((x, h) => x + h.hours, 0), hoursPending: s.hours.filter((h) => h.status === 'pending').length },
    byMonth, byMethod, campaigns, top,
  };
}
export function csvCell(v) {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
export const toCsv = (rows) => '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

// ---------- views (what each role may see) ----------
const campaignCard = (s, c, today, money) => {
  const raised = raisedOf(s, c.id);
  const o = { id: c.id, title: c.title, titleAr: c.titleAr, summary: c.summary, summaryAr: c.summaryAr, cause: c.cause, goal: c.goal, status: c.status, startsOn: c.startsOn, endsOn: c.endsOn, raised, open: campaignOpen(c, today), gifts: s.donations.filter((d) => d.campaignId === c.id && d.status === 'received').length, daysLeft: Math.max(0, diffDays(today, c.endsOn)) };
  if (money) Object.assign(o, { reserved: reservedOf(s, c.id), available: availableOf(s, c.id), adminUsed: adminUsedOf(s, c.id), adminCap: adminCapOf(s, c.id), refunded: refundedOf(s, c.id) });
  return o;
};
const caseMasked = (s, c) => ({ id: c.id, code: c.code, city: c.city, category: c.category, householdSize: c.householdSize, need: c.need, funded: caseFunded(s, c.id), reserved: caseReserved(s, c.id), status: c.status, summary: c.share ? c.summary : '', summaryAr: c.share ? c.summaryAr : '' });
const caseFull = (s, c) => ({ ...c, funded: caseFunded(s, c.id), reserved: caseReserved(s, c.id) });
const allocOut = (s, a) => ({ ...a, caseCode: a.caseId ? s.cases.find((c) => c.id === a.caseId)?.code : null });
export function publicView(s, now) {
  const today = dayKey(now);
  const camps = s.campaigns.filter((c) => c.status === 'active' || c.status === 'closed');
  const wall = (cid) => {
    const seen = new Set(), out = [];
    for (const d of s.donations.filter((x) => x.campaignId === cid && x.status === 'received' && !x.anonymous).sort((a, b) => b.ts - a.ts)) {
      const donor = d.donorId ? s.donors.find((g) => g.id === d.donorId) : null;
      if (donor && !donor.wall) continue;
      const nm = donor ? donor.name : d.giverName;
      if (!nm || seen.has(nm)) continue; seen.add(nm); out.push({ name: nm, nameAr: donor ? donor.nameAr : '' });
      if (out.length >= 12) break;
    }
    return out;
  };
  return {
    today, now,
    campaigns: camps.map((c) => {
      const al = s.allocs.filter((a) => a.campaignId === c.id && a.status === 'approved');
      const prog = al.filter((a) => a.kind === 'case').reduce((x, a) => x + a.amount, 0), adm = al.filter((a) => a.kind === 'admin').reduce((x, a) => x + a.amount, 0);
      return { ...campaignCard(s, c, today, false), allocated: { program: prog, admin: adm, notYet: Math.max(0, raisedOf(s, c.id) - prog - adm) }, casesHelped: new Set(al.filter((a) => a.caseId).map((a) => a.caseId)).size, wall: wall(c.id) };
    }),
    impact: { families: s.cases.filter((c) => c.status === 'funded' || c.status === 'closed').length, raised: s.donations.filter((d) => d.status === 'received').reduce((x, d) => x + d.amount, 0), volunteerHours: s.hours.filter((h) => h.status === 'approved').reduce((x, h) => x + h.hours, 0) },
    limits: { min: settings(s).minGift, max: settings(s).publicGiftMax },
  };
}
export function view(s, user, now) {
  const today = dayKey(now), st = settings(s);
  const base = { me: { id: user.id, name: user.name, nameAr: user.nameAr, role: user.role }, today, now, limits: { min: st.minGift, max: st.publicGiftMax } };
  if (user.role === 'volunteer') {
    const v = s.volunteers.find((x) => x.id === user.volunteerId);
    return {
      ...base, campaigns: publicView(s, now).campaigns, volunteer: v, approvedHours: hoursOf(s, v.id), pendingHours: hoursOf(s, v.id, 'pending'), certificateAt: st.certificateHours,
      hours: s.hours.filter((h) => h.volunteerId === v.id).sort((a, b) => (a.date < b.date ? 1 : -1)),
      shifts: s.shifts.filter((h) => h.status === 'open' && h.date >= addDays(today, -7)).sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1)).map((h) => ({ id: h.id, title: h.title, titleAr: h.titleAr, date: h.date, start: h.start, end: h.end, slots: h.slots, taken: h.signups.length, place: h.place, mine: h.signups.includes(v.id) })),
    };
  }
  const settingsOut = { adminCapPct: st.adminCapPct, approvalAbove: st.approvalAbove, reviewAbove: st.reviewAbove, certificateHours: st.certificateHours };
  const vols = () => s.volunteers.map((v) => ({ ...v, approved: hoursOf(s, v.id), pending: hoursOf(s, v.id, 'pending') }));
  if (user.role === 'program') {
    const donorless = (g) => ({ id: g.id, receipt: g.receipt, kind: g.kind, description: g.description, descriptionAr: g.descriptionAr || '', qty: g.qty, unit: g.unit, value: g.value, date: g.date, status: g.status, caseId: g.caseId || null, distributedOn: g.distributedOn || null });
    const t = reports(s, now).totals;
    return {
      ...base, settings: settingsOut, campaigns: s.campaigns.filter((c) => c.status !== 'draft').map((c) => campaignCard(s, c, today, true)),
      cases: s.cases.map((c) => caseFull(s, c)), allocs: s.allocs.map((a) => allocOut(s, a)).sort((a, b) => b.ts - a.ts), inkind: s.inkind.map(donorless),
      volunteers: vols(), hours: s.hours, shifts: s.shifts,
      report: { totals: { casesOpen: t.casesOpen, casesFunded: t.casesFunded, pendingAllocs: t.pendingAllocs, programSpent: t.programSpent, adminSpent: t.adminSpent, adminPct: t.adminPct, volunteerHours: t.volunteerHours, hoursPending: t.hoursPending, inKindStock: t.inKindStock } },
    };
  }
  const donors = s.donors.map((d) => { const mine = s.donations.filter((x) => x.donorId === d.id && x.status === 'received'); return { ...d, total: mine.reduce((a, x) => a + x.amount, 0), gifts: mine.length, last: mine.reduce((m, x) => (x.date > m ? x.date : m), '') }; });
  const common = { ...base, settings: settingsOut, campaigns: s.campaigns.map((c) => campaignCard(s, c, today, true)), donors, donations: s.donations.slice(-1500).reverse(), pledges: s.pledges, inkind: s.inkind, reports: reports(s, now) };
  if (user.role === 'fundraiser') return { ...common, cases: s.cases.map((c) => caseMasked(s, c)) };
  return { ...common, cases: s.cases.map((c) => caseFull(s, c)), allocs: s.allocs.map((a) => allocOut(s, a)).sort((a, b) => b.ts - a.ts), volunteers: vols(), hours: s.hours, shifts: s.shifts, audit: s.audit };
}

// ---------- seed ----------
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const FIRST = [['Ahmed', 'أحمد'], ['Mona', 'منى'], ['Omar', 'عمر'], ['Sara', 'سارة'], ['Karim', 'كريم'], ['Dina', 'دينا'], ['Tarek', 'طارق'], ['Heba', 'هبة'], ['Mahmoud', 'محمود'], ['Nada', 'ندى'], ['Rana', 'رنا'], ['Hossam', 'حسام'], ['Aya', 'آية'], ['Khaled', 'خالد'], ['Mariam', 'مريم'], ['Sherif', 'شريف'], ['Laila', 'ليلى'], ['Amr', 'عمرو'], ['Hala', 'هالة'], ['Bassem', 'باسم'], ['Yasmin', 'ياسمين'], ['Mostafa', 'مصطفى'], ['Salma', 'سلمى'], ['Adel', 'عادل'], ['Farida', 'فريدة'], ['Youssef', 'يوسف']];
const LAST = [['Samy', 'سامي'], ['Hany', 'هاني'], ['Nabil', 'نبيل'], ['Hassan', 'حسن'], ['Sayed', 'السيد'], ['Ali', 'علي'], ['Fathy', 'فتحي'], ['Gamal', 'جمال'], ['Ibrahim', 'إبراهيم'], ['Mansour', 'منصور'], ['Reda', 'رضا'], ['Fouad', 'فؤاد'], ['Wagih', 'وجيه'], ['Atef', 'عاطف'], ['Shawky', 'شوقي'], ['Zaki', 'زكي'], ['Salem', 'سالم'], ['Badawy', 'بدوي']];
const COMPANY = [['Nile Fintech', 'نيل فينتك'], ['Delta Logistics', 'دلتا للخدمات اللوجستية'], ['Cairo Cloud Labs', 'معامل القاهرة السحابية'], ['Sphinx Retail', 'سفنكس للتجزئة'], ['Pharos Pharma', 'فاروس للأدوية'], ['Giza Builders', 'مقاولو الجيزة'], ['Alex Shipping', 'الإسكندرية للشحن'], ['Luxor Hotels', 'فنادق الأقصر']];
const CITIES = ['Cairo', 'Giza', 'Alexandria', 'Assiut', 'Sohag', 'Qena', 'Minya', 'Mansoura', 'Tanta', 'Aswan'];
export const CITY_AR = { Cairo: 'القاهرة', Giza: 'الجيزة', Alexandria: 'الإسكندرية', Assiut: 'أسيوط', Sohag: 'سوهاج', Qena: 'قنا', Minya: 'المنيا', Mansoura: 'المنصورة', Tanta: 'طنطا', Aswan: 'أسوان' };
const NEEDS = {
  health: [['Insulin and glucose strips for a diabetic father', 'إنسولين وشرائط قياس السكر لأب مريض بالسكري', 4500], ['Cataract surgery for a grandmother', 'عملية مياه بيضاء لجدة', 9000], ['Dialysis sessions for three months', 'جلسات غسيل كلوي لثلاثة أشهر', 18000], ['Wheelchair and physiotherapy for a child', 'كرسي متحرك وعلاج طبيعي لطفل', 12000]],
  education: [['School fees and uniforms for two children', 'مصاريف مدرسة وزي لطفلين', 6000], ['University fees for a first-year student', 'رسوم جامعية لطالب في السنة الأولى', 14000], ['Books and tablet for a deaf student', 'كتب وجهاز لوحي لطالب أصم', 8000]],
  food: [['Monthly food basket for a widow with four children', 'سلة غذاء شهرية لأرملة تعول أربعة أطفال', 3600], ['Six months of groceries for an elderly couple', 'مواد غذائية لستة أشهر لزوجين مسنين', 7200]],
  shelter: [['Roof repair before winter', 'ترميم سقف قبل الشتاء', 15000], ['Blankets, heater and bedding for a family of five', 'بطانيات ومدفأة وفراش لأسرة من خمسة', 5000], ['Rent arrears for two months', 'متأخرات إيجار شهرين', 6500]],
};
export function seed(now = Date.now()) {
  const rnd = mulberry32(20261125), pick = (a) => a[Math.floor(rnd() * a.length)], today = dayKey(now);
  const s = {
    resetAt: now, counters: { d: 0, g: 0, k: 0, p: 0, n: 0, c: 0, a: 0, h: 0, s: 0, r: 0, q: 0 }, keys: [], settings: { ...DEFAULTS }, audit: [], publicLog: [],
    users: [
      { id: 'u-owner', pin: '1111', name: 'Laila Mostafa', nameAr: 'ليلى مصطفى', role: 'owner' },
      { id: 'u-fund', pin: '2222', name: 'Hossam Adel', nameAr: 'حسام عادل', role: 'fundraiser' },
      { id: 'u-program', pin: '3333', name: 'Mariam Fouad', nameAr: 'مريم فؤاد', role: 'program' },
      { id: 'u-vol', pin: '4444', name: 'Yara Salem', nameAr: 'يارا سالم', role: 'volunteer', volunteerId: 'v1' },
    ],
    campaigns: [], donors: [], donations: [], pledges: [], inkind: [], cases: [], allocs: [], volunteers: [], hours: [], shifts: [],
  };
  const camp = (title, titleAr, cause, goal, startsOn, endsOn, status, summary, summaryAr) => { const c = { id: nextId(s, 'k'), title, titleAr, summary, summaryAr, cause, goal, status, startsOn, endsOn, createdAt: now - 400 * 864e5 }; if (status === 'closed') c.closedAt = parse(endsOn); s.campaigns.push(c); return c; };
  camp('Winter Warmth', 'دفء الشتاء', 'shelter', 250000, addDays(today, -25), addDays(today, 66), 'active', 'Blankets, heaters and roof repairs for families in Upper Egypt before the cold months.', 'بطاطين ومدافئ وترميم أسقف لأسر في صعيد مصر قبل برد الشتاء.');
  camp('School Year Support', 'دعم العام الدراسي', 'education', 400000, addDays(today, -80), addDays(today, 36), 'active', 'School fees, uniforms and books for children whose parents cannot cover them.', 'مصاريف مدرسية وزي وكتب لأطفال لا يستطيع أهلهم تحملها.');
  camp('Healing Hands', 'أيادٍ تشفي', 'health', 600000, addDays(today, -240), addDays(today, 200), 'active', 'Surgeries, dialysis sessions and medicine for patients who wait on public hospital lists.', 'عمليات وجلسات غسيل ودواء لمرضى ينتظرون في قوائم المستشفيات العامة.');
  camp('Ramadan Food Baskets', 'سلال غذاء رمضان', 'food', 500000, addDays(today, 70), addDays(today, 130), 'draft', 'Monthly food baskets for 1,000 families. Opens in the new year.', 'سلال غذاء شهرية لألف أسرة. تُفتح مع العام الجديد.');
  camp('Flood Relief, Upper Egypt', 'إغاثة سيول الصعيد', 'emergency', 300000, addDays(today, -200), addDays(today, -60), 'closed', 'Emergency shelter, food and medicine after the autumn floods. Closed and fully reported.', 'مأوى وغذاء ودواء طارئ بعد سيول الخريف. أُغلقت وتم الإبلاغ عنها بالكامل.');
  camp('Medical Equipment Fund', 'صندوق الأجهزة الطبية', 'health', 150000, addDays(today, -100), addDays(today, 20), 'active', 'Nebulizers, oxygen concentrators and wheelchairs lent to patients for free.', 'أجهزة تنفس ومولدات أكسجين وكراسي متحركة تُعار للمرضى مجانًا.');
  for (let i = 0; i < 88; i++) {
    const f = FIRST[i % FIRST.length], l = LAST[(i * 7 + 3) % LAST.length], co = i >= 80;
    s.donors.push({ id: nextId(s, 'g'), name: co ? COMPANY[i - 80][0] : `${f[0]} ${l[0]}`, nameAr: co ? COMPANY[i - 80][1] : `${f[1]} ${l[1]}`, email: `donor${i + 1}@mail.example`, phone: '0101' + pad(2000000 + i * 137, 7), type: co ? 'company' : 'individual', city: CITIES[i % CITIES.length], wall: rnd() < 0.45, note: '', createdAt: now - Math.floor(rnd() * 300) * 864e5 });
  }
  const AMT = [50, 100, 100, 200, 250, 500, 500, 1000, 1000, 2500, 5000], big = [10000, 25000];
  const gift = (d, c, amount, date) => s.donations.push({ id: nextId(s, 'd'), receipt: '', donorId: d.id, giverName: '', campaignId: c.id, amount, method: pick(METHODS), date, ts: parse(date) + 10 * 3600000, anonymous: rnd() < 0.12, status: 'received', source: 'staff', pledgeId: null, note: '', by: 'u-fund' });
  const bounds = s.campaigns.filter((c) => c.status !== 'draft');
  for (const d of s.donors) {
    const n = d.type === 'company' ? 3 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 7);
    for (let k = 0; k < n; k++) {
      const date = addDays(today, -Math.floor(rnd() * 330)); const open = bounds.filter((c) => c.startsOn <= date && c.endsOn >= date); if (!open.length) continue;
      gift(d, pick(open), d.type === 'company' && rnd() < 0.5 ? pick(big) : pick(AMT), date);
    }
  }
  const med = s.campaigns[5]; let rest = 143500 - raisedOf(s, med.id), g = 0;
  while (rest > 0) { const amount = Math.min(rest, [500, 1000, 2500][g % 3]); gift(s.donors[(g * 5) % 80], med, amount, addDays(today, -Math.floor(rnd() * 90))); rest -= amount; g++; }
  s.donations.sort((a, b) => (a.date === b.date ? a.ts - b.ts : a.date < b.date ? -1 : 1));
  for (const d of s.donations) d.receipt = receiptNo(s, 'R', d.date);
  for (const d of s.donations.filter((x) => x.campaignId === s.campaigns[2].id).slice(5, 7)) { d.status = 'refunded'; d.refund = { ts: now - 5 * 864e5, reason: 'Duplicate card payment', by: 'u-owner' }; }
  const pc = [s.campaigns[0], s.campaigns[2], s.campaigns[1]];
  for (let i = 0; i < 22; i++) {
    const d = s.donors[i * 3], c = pc[i % 3];
    const p = { id: nextId(s, 'p'), donorId: d.id, campaignId: c.id, kind: i < 16 ? 'monthly' : 'one_off', amount: pick([100, 200, 250, 500, 1000]), method: pick(['card', 'bank', 'wallet']), status: i === 3 ? 'paused' : 'active', paid: [], createdAt: now - 60 * 864e5 };
    if (p.kind === 'monthly') { p.day = 1 + Math.floor(rnd() * 28); p.startsOn = addDays(today, -70); } else p.dueOn = addDays(today, i < 19 ? 10 + i : -4);
    s.pledges.push(p);
  }
  OPS.runPledges(s, {}, { user: { id: 'u-fund', name: 'Hossam Adel', role: 'fundraiser' }, now });
  // leave the newest month unpaid on two pledges so "Run due pledges" has work to show
  for (const p of s.pledges.filter((x) => x.kind === 'monthly' && x.paid.length).slice(0, 2)) { const last = s.donations.filter((d) => d.pledgeId === p.id).pop(); if (last) { s.donations.splice(s.donations.indexOf(last), 1); p.paid.pop(); } }
  const cats = Object.keys(NEEDS);
  const mkCase = (i, cat, nd) => { const f = FIRST[(i * 5 + 2) % FIRST.length], l = LAST[(i * 3 + 1) % LAST.length], city = CITIES[(i * 3) % CITIES.length]; s.cases.push({ id: nextId(s, 'c'), code: 'C-' + pad(s.counters.c, 4), name: `${f[0]} ${l[0]} family`, nameAr: `أسرة ${f[1]} ${l[1]}`, phone: '0111' + pad(3000000 + i * 211, 7), city, category: cat, householdSize: 2 + (i % 5), need: nd[2], summary: nd[0] + ' in ' + city + '.', summaryAr: nd[1] + ' في ' + CITY_AR[city] + '.', share: i % 3 !== 0, status: 'open', createdAt: now - Math.floor(rnd() * 200) * 864e5 }); };
  for (let i = 0; i < 72; i++) { const cat = cats[i % 4]; mkCase(i, cat, NEEDS[cat][Math.floor(i / 4) % NEEDS[cat].length]); }
  const owner = { id: 'u-owner', name: 'Laila Mostafa' }, prog = { id: 'u-program', name: 'Mariam Fouad' };
  const al = (c, cs, kind, amount, status, by) => { const a = { id: nextId(s, 'a'), campaignId: c.id, caseId: cs ? cs.id : null, kind, amount, status, note: '', by: by.id, byName: by.name, ts: now - Math.floor(rnd() * 40 + 3) * 864e5 }; if (status !== 'pending') { a.decidedBy = owner.id; a.decidedAt = a.ts; } s.allocs.push(a); };
  for (const c of s.campaigns) {
    if (c.status === 'draft') continue;
    const raised = raisedOf(s, c.id), adm = Math.floor(raised * 0.06);
    let budget = Math.floor(raised * (c.status === 'closed' ? 0.93 : c.id === s.campaigns[5].id ? 0.6 : 0.5)) - adm;
    if (adm >= 100) al(c, null, 'admin', adm, 'approved', owner);
    for (const cs of s.cases.filter((x) => c.cause === 'emergency' || x.category === c.cause)) { if (budget < 500) break; const room = cs.need - caseReserved(s, cs.id); if (room <= 0) continue; const amount = Math.min(room, budget); al(c, cs, 'case', amount, 'approved', cs.need > 12000 ? owner : prog); budget -= amount; }
  }
  for (const cs of s.cases) if (caseFunded(s, cs.id) >= cs.need) { cs.status = 'funded'; cs.closedAt = now - 20 * 864e5; }
  for (const cs of s.cases.filter((x) => x.status === 'funded').slice(0, 2)) cs.status = 'closed';
  const hh = s.campaigns[2];
  for (const k of [1, 2]) { mkCase(60 + k, 'health', NEEDS.health[2]); const cs = s.cases[s.cases.length - 1]; if (availableOf(s, hh.id) >= cs.need) al(hh, cs, 'case', cs.need, 'pending', prog); }
  const IK = [['clothes', 'Winter jackets (new)', 'جاكيتات شتوية جديدة', 60, 'piece', 18000], ['food', 'Rice, 5 kg bags', 'أرز عبوات 5 كجم', 120, 'bag', 12000], ['medical', 'Wheelchairs', 'كراسي متحركة', 6, 'piece', 21000], ['school', 'Backpacks with stationery', 'حقائب مدرسية بأدوات', 80, 'set', 16000], ['furniture', 'Single beds', 'أسرّة فردية', 10, 'piece', 25000], ['medical', 'Blood glucose meters', 'أجهزة قياس سكر', 40, 'piece', 14000], ['clothes', 'Blankets', 'بطاطين', 150, 'piece', 30000], ['food', 'Cooking oil, 1 L', 'زيت طعام 1 لتر', 300, 'bottle', 15000]];
  IK.forEach((k, i) => { const date = addDays(today, -Math.floor(rnd() * 60)); const target = i < 3 ? s.cases.find((c) => c.status === 'open' && KIND_FOR[k[0]].includes(c.category)) : null; s.inkind.push({ id: nextId(s, 'n'), receipt: receiptNo(s, 'K', date), donorId: s.donors[80 + (i % 8)].id, campaignId: i % 3 === 0 ? s.campaigns[0].id : null, kind: k[0], description: k[1], descriptionAr: k[2], qty: k[3], unit: k[4], value: k[5], date, status: target ? 'distributed' : 'in_stock', createdAt: now - i * 864e5, ...(target ? { distributedOn: addDays(today, -5), caseId: target.id } : {}) }); });
  const VN = [['Yara Salem', 'يارا سالم'], ['Mazen Fathy', 'مازن فتحي'], ['Nour Hany', 'نور هاني'], ['Ziad Reda', 'زياد رضا'], ['Salma Gamal', 'سلمى جمال'], ['Hady Samy', 'هادي سامي'], ['Jana Nabil', 'جنى نبيل'], ['Fares Zaki', 'فارس زكي'], ['Malak Ibrahim', 'ملك إبراهيم'], ['Anas Badawy', 'أنس بدوي'], ['Reem Atef', 'ريم عاطف'], ['Seif Wagih', 'سيف وجيه']];
  VN.forEach((n, i) => s.volunteers.push({ id: 'v' + (i + 1), name: n[0], nameAr: n[1], phone: '0122' + pad(4000000 + i * 313, 7), skills: i % 2 ? ['Sorting', 'Driving'] : ['Tutoring', 'First aid'], joinedOn: addDays(today, -300 + i * 20), active: true }));
  const ACT = ['Packing food baskets', 'Homework club', 'Warehouse sorting', 'Hospital visit', 'Delivering blankets'];
  for (const v of s.volunteers) for (let k = 0; k < 6 + (v.id === 'v1' ? 4 : 0); k++) {
    const date = addDays(today, -1 - Math.floor(rnd() * 28)), hrs = pick([2, 2.5, 3, 4, 4, 6]);
    if (s.hours.filter((x) => x.volunteerId === v.id && x.date === date).reduce((a, x) => a + x.hours, 0) + hrs > MAX_DAY_HOURS) continue;
    const approved = rnd() < 0.78; s.hours.push({ id: nextId(s, 'h'), volunteerId: v.id, date, hours: hrs, activity: pick(ACT), shiftId: null, status: approved ? 'approved' : 'pending', createdAt: parse(date) + 15 * 3600000, ...(approved ? { reviewedBy: 'u-program' } : {}) });
  }
  for (const k of [45, 46]) s.hours.push({ id: nextId(s, 'h'), volunteerId: 'v1', date: addDays(today, -k), hours: 12, activity: 'Flood relief packing', shiftId: null, status: 'approved', createdAt: now - k * 864e5, reviewedBy: 'u-program' });
  const SH = [['Pack Winter Warmth boxes', 'تعبئة صناديق دفء الشتاء', 2, '10:00', '14:00', 15, 'Maadi warehouse', 0], ['Homework club', 'نادي الواجبات', 3, '16:00', '19:00', 8, 'Shubra center', 1], ['Food sorting', 'فرز المواد الغذائية', 5, '09:00', '12:00', 12, 'Maadi warehouse', null], ['Hospital visit', 'زيارة مستشفى', 6, '11:00', '13:00', 6, 'Kasr Al Ainy', 2], ['Winter blanket drive', 'حملة البطاطين', 9, '10:00', '15:00', 20, 'Giza', 0]];
  SH.forEach((x, i) => s.shifts.push({ id: nextId(s, 's'), title: x[0], titleAr: x[1], date: addDays(today, x[2]), start: x[3], end: x[4], slots: x[5], place: x[6], campaignId: x[7] === null ? null : s.campaigns[x[7]].id, signups: i === 0 ? ['v2', 'v3'] : i === 3 ? ['v2'] : ['v3', 'v4'], status: 'open' }));
  s.audit = [];
  return s;
}
