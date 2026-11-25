import * as L from './logic.js';
import { T } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('at.' + k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem('at.' + k, JSON.stringify(v)), del: (k) => localStorage.removeItem('at.' + k) };
const rid = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
const S = { lang: new URLSearchParams(location.search).get('lang') || LS.get('lang', 'en'), token: LS.get('token', null), me: LS.get('me', null), data: null, pub: null, busy: false, modal: null, dq: '', dcamp: '', dmeth: '', gq: '', cq: '', ccat: '', cst: '', pst: '', last: null };
if (!T[S.lang]) S.lang = 'en';
const get = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
const t = (k) => get(T[S.lang], k) ?? get(T.en, k) ?? k;
const srvErr = (m) => (S.lang === 'ar' && T.ar.srv[m]) || m;
const ar = () => S.lang === 'ar';
const nf = (n, d = 0) => Number(n).toLocaleString(ar() ? 'ar-EG' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const egp = (n) => `${nf(n)} ${t('cur')}`;
const dF = (k) => (k ? new Date(k + 'T00:00:00Z').toLocaleDateString(ar() ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }) : '');
const dts = (ts) => (ts ? new Date(ts).toLocaleDateString(ar() ? 'ar-EG' : 'en-GB', { timeZone: L.TZ, day: 'numeric', month: 'short' }) : '');
const mLabel = (m) => new Date(m + '-01T00:00:00Z').toLocaleDateString(ar() ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', month: 'short' });
const nm = (o) => (o ? (ar() && o.nameAr ? o.nameAr : o.name) : '');
const ct = (c) => (c ? (ar() && c.titleAr ? c.titleAr : c.title) : '');
const cs = (c) => (ar() && c.summaryAr ? c.summaryAr : c.summary);
const city = (c) => (ar() ? L.CITY_AR[c] || c : c);
const D = () => S.data;
const campOf = (id) => (D()?.campaigns || S.pub?.campaigns || []).find((c) => c.id === id);
const donorOf = (id) => (D().donors || []).find((x) => x.id === id);
const caseOf = (id) => (D().cases || []).find((x) => x.id === id);
const donorName = (g) => (g.donorId ? nm(donorOf(g.donorId)) : g.giverName || t('anon'));
const NAV = {
  owner: ['dashboard', 'campaigns', 'donations', 'donors', 'pledges', 'inkind', 'cases', 'funds', 'volunteers', 'reports', 'settings', 'audit'],
  fundraiser: ['dashboard', 'campaigns', 'donations', 'donors', 'pledges', 'inkind', 'cases', 'reports'],
  program: ['dashboard', 'campaigns', 'cases', 'funds', 'inkind', 'volunteers'],
  volunteer: ['shifts', 'hours', 'give'],
};
const route = () => {
  const r = (location.hash.replace(/^#\//, '') || '').split('?')[0];
  if (!S.token || !S.me) return r === 'give' ? 'give' : 'login';
  const allowed = NAV[S.me.role] || [];
  return allowed.includes(r) ? r : allowed[0];
};
const role = () => S.me?.role;
const canFund = () => ['owner', 'fundraiser'].includes(role());
const canProg = () => ['owner', 'program'].includes(role());

// ---------- api ----------
async function api(method, op, pub) {
  let r;
  try { r = await fetch('/api/data' + (pub === 'get' ? '?public=1' : ''), { method, headers: { 'content-type': 'application/json', ...(S.token && pub !== 'get' && op?.type !== 'publicDonate' ? { authorization: 'Bearer ' + S.token } : {}) }, body: op ? JSON.stringify({ op }) : undefined }); }
  catch { throw new Error(t('offline')); }
  const j = await r.json().catch(() => null);
  if (r.status === 401 && !(op && op.type === 'login') && pub !== 'get') { logout(false); throw new Error(t('again')); }
  if (!r.ok) { const e = new Error(srvErr(j?.error) || t('err.server')); e.status = r.status; throw e; }
  return j;
}
async function refresh() { S.data = await api('GET'); }
async function doOp(op, msg) {
  if (S.busy) return null;
  S.busy = true;
  try { const j = await api('POST', op); S.data = j; if (msg) toast(msg); return j.result || {}; }
  catch (e) { toast(e.message, true); return null; } finally { S.busy = false; }
}
function toast(msg, bad) {
  const el = $('#toast'); el.innerHTML = `<div class="${bad ? 'err' : ''}">${esc(msg)}</div>`;
  clearTimeout(toast._t); toast._t = setTimeout(() => (el.innerHTML = ''), 4500);
}
function logout(reload = true) {
  LS.del('token'); LS.del('me'); S.token = null; S.me = null; S.data = null; S.modal = null;
  if (reload) { location.hash = '#/'; render(); }
}

// ---------- small views ----------
const pill = (txt, cls = '') => `<span class="pill ${cls}">${esc(txt)}</span>`;
const campPill = (st) => pill(t('cs.' + st), st === 'active' ? '' : st === 'closed' ? 'gray' : st === 'paused' ? 'off' : 'ice');
const caseStPill = (st) => pill(t('st.' + st), st === 'open' ? 'off' : st === 'funded' ? '' : 'gray');
const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
const meter = (a, b, cls = '') => `<div class="meter ${cls}" role="progressbar" aria-valuenow="${pct(a, b)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct(a, b)}%"></i></div>`;
const sel = (id, opts, cur, extra = '') => `<select id="${id}" ${extra}>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const field = (id, label, inner) => `<div class="f"><label for="${id}">${esc(label)}</label>${inner}</div>`;
const inp = (id, label, v = '', attrs = '') => field(id, label, `<input id="${id}" value="${esc(v)}" ${attrs}>`);
const ta = (id, label, v = '', rows = 3) => field(id, label, `<textarea id="${id}" rows="${rows}">${esc(v)}</textarea>`);
const chk = (id, label, on) => `<label class="chk"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> ${esc(label)}</label>`;
const val = (id) => $(id)?.value?.trim() ?? '';
const checked = (id) => !!$(id)?.checked;
const modalBg = (inner, wide) => `<div class="modal-bg" data-act="bg"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${inner}</div></div>`;
const mhead = (title) => `<div class="bar"><h2>${esc(title)}</h2><span class="sp"></span><button class="btn sm" data-act="close">${esc(t('b.close'))}</button></div>`;
const kpi = (n, l, s = '', cls = '') => `<div class="card kpi ${cls}"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div>${s ? `<div class="s">${esc(s)}</div>` : ''}</div>`;
const opts = (list, ns) => list.map((x) => [x, t(ns + '.' + x)]);
const campOpts = (list) => list.map((c) => [c.id, ct(c)]);
const tbl = (head, rows, empty) => `<div class="tw"><table><thead><tr>${head.map((h) => `<th${h[1] ? ' class="num"' : ''}>${esc(Array.isArray(h) ? h[0] : h)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="empty">${esc(empty || t('none'))}</td></tr>`}</tbody></table></div>`;

const LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#f2b84b"/><path d="M24 38S9 29 9 19a7 7 0 0 1 15-3 7 7 0 0 1 15 3c0 10-15 19-15 19z" fill="#7a2e2a"/><circle cx="24" cy="21" r="4" fill="#f2b84b"/></svg>';
function shell(inner) {
  const nav = NAV[role()].map((r) => `<a href="#/${r}" class="${route() === r ? 'on' : ''}">${esc(t('nav.' + r))}${r === 'funds' && D().reports?.totals.pendingAllocs && role() === 'owner' ? ` <b class="dot">${D().reports.totals.pendingAllocs}</b>` : ''}</a>`).join('');
  return `<div class="top"><a class="brand" href="#/${NAV[role()][0]}">${LOGO}<span>${esc(t('appName'))}<small>${esc(t('appSub'))}</small></span></a>
    <nav class="nav">${nav}</nav><div class="tools"><span class="pill">${esc(t('role.' + role()))} · ${esc(nm(S.me))}</span>
    <button class="btn ghost sm" data-act="lang">${esc(t('other'))}</button><button class="btn ghost sm" data-act="logout">${esc(t('logout'))}</button></div></div><main>${inner}</main>${modalHtml()}`;
}
function loginPage() {
  return `<div class="login"><div class="logo">${LOGO}<div><h1>${esc(t('appName'))}</h1><p class="sub">${esc(t('appSub'))}</p></div></div>
    <div class="card"><p class="muted">${esc(t('demoNote'))}</p>
    <div class="demo-users">${L.DEMO_USERS.map((u) => `<button class="btn" data-act="pin" data-pin="${u.pin}"><span>${esc(ar() ? u.labelAr : u.label)}</span><b>${u.pin}</b></button>`).join('')}</div>
    <div class="f"><label for="pin">${esc(t('pin'))}</label><input id="pin" class="big" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="••••"></div>
    <button class="btn pri big" data-act="login" style="width:100%">${esc(t('signin'))}</button>
    <p style="margin-top:.8rem"><a class="btn" href="#/give" style="width:100%;text-align:center">${esc(t('openGive'))}</a></p>
    <p class="muted small">${esc(t('limits'))}</p><div class="row" style="margin-top:.4rem"><button class="btn sm" data-act="lang">${esc(t('other'))}</button></div></div></div>`;
}

// ---------- public giving page ----------
function givePage(d) {
  if (!d) return `<p class="boot">…</p>`;
  const imp = d.impact;
  return `<section class="hero"><h1>${esc(t('giveTitle'))}</h1><p>${esc(t('giveSub'))}</p></section>
  <div class="grid kpis">${kpi(egp(imp.raised), t('k.raisedAll'))}${kpi(nf(imp.families), t('k.families'))}${kpi(nf(imp.volunteerHours), t('k.volHours'))}</div>
  <div class="grid two" style="margin-top:1rem">${d.campaigns.map((c) => {
    const al = c.allocated, tot = Math.max(1, c.raised);
    return `<article class="card camp" id="camp-${c.id}"><div class="mc-h"><div><h2>${esc(ct(c))}</h2><div class="muted small">${esc(t('cause.' + c.cause))} · ${esc(dF(c.startsOn))} - ${esc(dF(c.endsOn))}</div></div>${campPill(c.status)}</div>
    <p>${esc(cs(c))}</p><div class="big-n">${esc(egp(c.raised))}</div>${meter(c.raised, c.goal)}
    <div class="row small muted" style="justify-content:space-between"><span>${esc(t('ofGoal'))} ${esc(egp(c.goal))} (${pct(c.raised, c.goal)}%)</span><span>${nf(c.gifts)} ${esc(t('gifts'))}${c.open ? ` · ${esc(t('daysLeft').replace('{n}', nf(c.daysLeft)))}` : ''}</span></div>
    <h3 style="margin-top:.8rem">${esc(t('whereGoes'))}</h3>
    <div class="stack" aria-label="${esc(t('whereGoes'))}"><i class="s1" style="width:${(al.program / tot) * 100}%"></i><i class="s2" style="width:${(al.admin / tot) * 100}%"></i><i class="s3" style="width:${(al.notYet / tot) * 100}%"></i></div>
    <div class="leg"><span><i class="s1"></i>${esc(t('toCases'))} ${esc(egp(al.program))}</span><span><i class="s2"></i>${esc(t('toAdmin'))} ${esc(egp(al.admin))}</span><span><i class="s3"></i>${esc(t('notYet'))} ${esc(egp(al.notYet))}</span></div>
    <p class="small muted">${esc(t('casesHelped').replace('{n}', nf(c.casesHelped)))}</p>
    ${c.wall.length ? `<p class="small"><b>${esc(t('wall'))}:</b> ${esc(c.wall.map((w) => nm(w)).join(', '))}</p>` : ''}
    ${c.open ? `<div class="acts"><button class="btn pri" data-act="donate" data-id="${c.id}">${esc(t('b.donate'))}</button></div>` : `<p class="notice">${esc(t('notOpen'))}</p>`}</article>`;
  }).join('')}</div><p class="muted small foot">${esc(t('demoPay'))}</p>`;
}
function donateModal(c) {
  const mx = (S.pub || D()).limits;
  if (S.modal.done) return modalBg(`${mhead(t('thanks'))}<div class="notice ok"><b>${esc(t('thanksBody'))}</b><div>${esc(t('receiptNo'))}: <b id="done-rcpt">${esc(S.modal.done)}</b></div></div><p class="muted small">${esc(t('demoPay'))}</p><div class="acts"><button class="btn pri" data-act="close">${esc(t('b.close'))}</button></div>`);
  return modalBg(`${mhead(t('b.donate') + ' · ' + ct(c))}
  <div class="chips">${[100, 250, 500, 1000].map((n) => `<button class="chip" data-act="preset" data-n="${n}">${nf(n)}</button>`).join('')}</div>
  ${inp('dn-amt', t('f.amount') + ` (${t('cur')}, ${nf(mx.min)} - ${nf(mx.max)})`, '', 'type="number" min="' + mx.min + '" max="' + mx.max + '" inputmode="numeric"')}
  ${inp('dn-name', t('f.giverName'), '', 'maxlength="60" autocomplete="off"')}${chk('dn-anon', t('f.anonymous'), false)}
  <p class="muted small">${esc(t('demoPay'))}</p><div class="acts"><button class="btn pri" data-act="senddonate" data-id="${c.id}">${esc(t('b.donate'))}</button></div>`);
}

// ---------- dashboard ----------
function barChart(rows, key, label) {
  const mx = Math.max(1, ...rows.map((r) => r[key]));
  return `<div class="charts" role="img" aria-label="${esc(label)}">${rows.map((r) => `<div class="col" title="${esc(mLabel(r.m) + ': ' + egp(r[key]))}"><div class="b" style="height:${Math.round((r[key] / mx) * 100)}%"></div><small>${esc(mLabel(r.m))}</small></div>`).join('')}</div>`;
}
function campRow(c) {
  return `<div class="mrow"><div style="flex:1;min-width:0"><b>${esc(ct(c))}</b> ${campPill(c.status)}<div class="small muted">${esc(egp(c.raised))} / ${esc(egp(c.goal))}</div>${meter(c.raised, c.goal)}</div></div>`;
}
function pgDashboard() {
  const d = D(), r = d.reports, tt = r?.totals;
  const pend = (d.allocs || []).filter((a) => a.status === 'pending');
  if (role() === 'program') {
    const p = d.report.totals, hp = d.hours.filter((h) => h.status === 'pending');
    return `<div class="bar"><h1>${esc(t('nav.dashboard'))}</h1></div>
    <div class="grid kpis">${kpi(nf(p.casesOpen), t('k.casesOpen'))}${kpi(nf(p.casesFunded), t('k.casesFunded'))}${kpi(nf(p.pendingAllocs), t('k.pendingAllocs'), '', p.pendingAllocs ? 'warn' : 'good')}${kpi(nf(p.hoursPending), t('k.hoursPending'), '', p.hoursPending ? 'warn' : 'good')}${kpi(nf(p.inKindStock), t('k.inKindStock'))}${kpi(nf(p.volunteerHours), t('k.volHours'))}</div>
    <div class="grid two" style="margin-top:1rem"><section class="card"><h2>${esc(t('needsAttention'))}</h2>
    ${hp.slice(0, 6).map((h) => `<div class="att-row"><span>${pill(t('hs.pending'), 'off')} ${esc(nm(d.volunteers.find((v) => v.id === h.volunteerId)))} · ${nf(h.hours, 1)} ${esc(t('hrs'))} · ${esc(h.activity)}</span><a class="btn sm" href="#/volunteers">${esc(t('b.review'))}</a></div>`).join('') || `<p class="empty">${esc(t('nothingDue'))}</p>`}</section>
    <section class="card"><h2>${esc(t('nav.campaigns'))}</h2>${d.campaigns.filter((c) => c.status === 'active').map((c) => `<div class="mrow"><div style="flex:1"><b>${esc(ct(c))}</b><div class="small muted">${esc(t('available'))}: ${esc(egp(c.available))}</div></div>${pill(pct(c.raised, c.goal) + '%', 'ice')}</div>`).join('')}</section></div>`;
  }
  const due = d.pledges.filter((p) => p.kind === 'monthly' && p.status === 'active').length;
  const od = d.pledges.filter((p) => p.kind === 'one_off' && p.status === 'active' && p.dueOn < d.today);
  return `<div class="bar"><h1>${esc(t('nav.dashboard'))}</h1><span class="sp"></span>${canFund() ? `<button class="btn pri" data-act="newgift">${esc(t('b.recordGift'))}</button>` : ''}</div>
  <div class="grid kpis">${kpi(egp(tt.raised), t('k.raised'), nf(tt.gifts) + ' ' + t('gifts'))}${kpi(egp(tt.thisMonth), t('k.thisMonth'))}${kpi(nf(tt.donors), t('k.donors'), tt.repeatPct + '% ' + t('k.repeat'))}${kpi(tt.recurringPct + '%', t('k.recurring'), nf(tt.activePledges) + ' ' + t('k.activePledges'))}${kpi(egp(tt.unallocated), t('k.unallocated'))}${kpi(nf(tt.pendingAllocs), t('k.pendingAllocs'), '', tt.pendingAllocs ? 'warn' : 'good')}</div>
  <div class="grid two" style="margin-top:1rem"><section class="card"><h2>${esc(t('rep.monthly'))}</h2>${barChart(r.byMonth, 'raised', t('rep.monthly'))}</section>
  <section class="card"><h2>${esc(t('needsAttention'))}</h2>
  ${role() === 'owner' ? pend.map((a) => `<div class="att-row"><span>${pill(t('as.pending'), 'off')} ${esc(egp(a.amount))} · ${esc(ct(campOf(a.campaignId)))} · ${esc(a.caseCode || t('toAdmin'))}</span><a class="btn sm" href="#/funds">${esc(t('b.open'))}</a></div>`).join('') : ''}
  ${canFund() ? `<div class="att-row"><span>${esc(t('monthlyPledges').replace('{n}', nf(due)))}</span><button class="btn sm" data-act="runpledges">${esc(t('b.runPledges'))}</button></div>${od.map((p) => `<div class="att-row"><span>${pill(t('overdue'), 'bad')} ${esc(nm(donorOf(p.donorId)))} · ${esc(egp(p.amount))}</span><a class="btn sm" href="#/pledges">${esc(t('b.open'))}</a></div>`).join('')}` : ''}
  </section></div>
  <section class="card" style="margin-top:1rem"><h2>${esc(t('nav.campaigns'))}</h2>${d.campaigns.filter((c) => c.status !== 'draft').map(campRow).join('')}</section>`;
}

// ---------- campaigns ----------
function pgCampaigns() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('nav.campaigns'))}</h1><span class="sp"></span>${canFund() ? `<button class="btn pri" data-act="newcamp">${esc(t('b.newCampaign'))}</button>` : ''}</div>
  <div class="grid two">${d.campaigns.map((c) => `<article class="card"><div class="mc-h"><div><h2>${esc(ct(c))}</h2><div class="muted small">${esc(t('cause.' + c.cause))} · ${esc(dF(c.startsOn))} - ${esc(dF(c.endsOn))}</div></div>${campPill(c.status)}</div>
  <p class="small">${esc(cs(c))}</p><div class="big-n">${esc(egp(c.raised))}</div>${meter(c.raised, c.goal)}
  <dl class="dl small" style="margin-top:.6rem"><dt>${esc(t('f.goal'))}</dt><dd>${esc(egp(c.goal))} (${pct(c.raised, c.goal)}%)</dd><dt>${esc(t('available'))}</dt><dd>${esc(egp(c.available))}</dd><dt>${esc(t('adminUsed'))}</dt><dd>${esc(egp(c.adminUsed))} / ${esc(egp(c.adminCap))}</dd><dt>${esc(t('refunded'))}</dt><dd>${esc(egp(c.refunded))}</dd></dl>
  <div class="acts1">${canFund() && c.status !== 'closed' ? `<button class="btn sm" data-act="editcamp" data-id="${c.id}">${esc(t('b.edit'))}</button>` : ''}
  ${canFund() && ['draft', 'paused'].includes(c.status) ? `<button class="btn sm" data-act="cstatus" data-id="${c.id}" data-st="active">${esc(t('b.activate'))}</button>` : ''}
  ${canFund() && c.status === 'active' ? `<button class="btn sm" data-act="cstatus" data-id="${c.id}" data-st="paused">${esc(t('b.pause'))}</button>` : ''}
  ${role() === 'owner' && c.status !== 'closed' ? `<button class="btn sm danger" data-act="cstatus" data-id="${c.id}" data-st="closed">${esc(t('b.closeCampaign'))}</button>` : ''}</div></article>`).join('')}</div>`;
}
function campForm(c) {
  const today = D().today;
  return `${mhead(t(c ? 'b.edit' : 'b.newCampaign'))}${inp('cf-title', t('f.title'), c?.title, 'maxlength="80"')}${inp('cf-titleAr', t('f.titleAr'), c?.titleAr, 'maxlength="80" dir="rtl"')}
  ${ta('cf-sum', t('f.summary'), c?.summary)}${ta('cf-sumAr', t('f.summaryAr'), c?.summaryAr)}
  <div class="grid3">${field('cf-cause', t('f.cause'), sel('cf-cause', opts(L.CAUSES, 'cause'), c?.cause || 'health'))}${inp('cf-goal', t('f.goal'), c?.goal ?? 100000, 'type="number" min="1000"')}</div>
  <div class="grid3">${inp('cf-start', t('f.startsOn'), c?.startsOn || today, 'type="date"')}${inp('cf-end', t('f.endsOn'), c?.endsOn || L.addDays(today, 60), 'type="date"')}</div>
  <div class="acts"><button class="btn pri" data-act="savecamp" data-id="${c?.id || ''}">${esc(t('b.save'))}</button></div>`;
}

// ---------- donations, receipts ----------
const rcptStatus = (g) => (g.status === 'refunded' ? pill(t('refunded'), 'bad') : '');
function pgDonations() {
  const d = D(), q = S.dq.toLowerCase();
  const list = d.donations.filter((g) => (!S.dcamp || g.campaignId === S.dcamp) && (!S.dmeth || g.method === S.dmeth) && (!q || (donorName(g) + ' ' + g.receipt).toLowerCase().includes(q)));
  const shown = list.slice(0, 100);
  return `<div class="bar"><h1>${esc(t('nav.donations'))}</h1><span class="sp"></span><button class="btn sm" data-act="csvgifts">${esc(t('b.csv'))}</button><button class="btn pri" data-act="newgift">${esc(t('b.recordGift'))}</button></div>
  <div class="card filters"><input type="search" id="gq" value="${esc(S.dq)}" placeholder="${esc(t('searchGifts'))}" aria-label="${esc(t('searchGifts'))}">
  ${sel('gc', [['', t('all') + ' · ' + t('f.campaign')], ...campOpts(d.campaigns)], S.dcamp, 'data-act-change="dcamp"')}${sel('gm', [['', t('all') + ' · ' + t('f.method')], ...opts([...L.METHODS, 'online'], 'method')], S.dmeth, 'data-act-change="dmeth"')}<span class="muted">${nf(list.length)}</span></div>
  ${tbl([t('f.receipt'), t('f.date'), t('f.donor'), t('f.campaign'), t('f.method'), [t('f.amount'), 1], ''], shown.map((g) => `<tr class="click ${g.status === 'refunded' ? 'void' : ''}" data-act="rcpt" data-id="${g.id}"><td>${esc(g.receipt)}</td><td>${esc(dF(g.date))}</td><td>${esc(donorName(g))}</td><td>${esc(ct(campOf(g.campaignId)))}</td><td>${esc(t('method.' + g.method))}</td><td class="num">${esc(egp(g.amount))}</td><td>${rcptStatus(g)}</td></tr>`))}
  ${list.length > 100 ? `<p class="muted small">${esc(t('firstN').replace('{n}', '100'))}</p>` : ''}`;
}
function giftForm() {
  const d = D(), open = d.campaigns.filter((c) => c.open);
  return `${mhead(t('b.recordGift'))}${field('gf-camp', t('f.campaign'), sel('gf-camp', campOpts(open), open[0]?.id))}
  ${field('gf-donor', t('f.donor'), sel('gf-donor', [['', t('walkIn')], ...d.donors.map((x) => [x.id, nm(x)])], ''))}${inp('gf-name', t('f.giverName'), '', 'maxlength="60"')}
  <div class="grid3">${inp('gf-amt', t('f.amount') + ' (' + t('cur') + ')', '', 'type="number" min="10" inputmode="numeric"')}${field('gf-meth', t('f.method'), sel('gf-meth', opts(L.METHODS, 'method'), 'cash'))}${inp('gf-date', t('f.date'), d.today, 'type="date"')}</div>
  ${chk('gf-anon', t('f.anonymous'), false)}${role() !== 'owner' ? `<p class="muted small">${esc(t('reviewNote').replace('{n}', nf(d.settings.reviewAbove)))}</p>` : ''}
  <div class="acts"><button class="btn pri" data-act="savegift">${esc(t('b.save'))}</button></div>`;
}
function rcptModal(g) {
  const donor = g.donorId ? donorOf(g.donorId) : null;
  return `${mhead(t('f.receipt'))}<div class="printable receipt ${g.status === 'refunded' ? 'voided' : ''}"><h2>${esc(t('orgName'))}</h2><p class="muted small">${esc(t('rcptNote'))}</p>
  <dl class="dl"><dt>${esc(t('f.receipt'))}</dt><dd><b>${esc(g.receipt)}</b></dd><dt>${esc(t('f.date'))}</dt><dd>${esc(dF(g.date))}</dd><dt>${esc(t('f.donor'))}</dt><dd>${esc(donorName(g))}${donor ? ` <span class="muted small">${esc(donor.email)}</span>` : ''}</dd><dt>${esc(t('f.campaign'))}</dt><dd>${esc(ct(campOf(g.campaignId)))}</dd><dt>${esc(t('f.method'))}</dt><dd>${esc(t('method.' + g.method))}</dd><dt>${esc(t('f.amount'))}</dt><dd><b>${esc(egp(g.amount))}</b></dd></dl>
  ${g.status === 'refunded' ? `<div class="notice bad"><b>${esc(t('voidRcpt'))}</b> ${esc(g.refund.reason)}</div>` : ''}</div>
  <div class="acts noprint"><button class="btn" data-act="print">${esc(t('b.print'))}</button>${role() === 'owner' && g.status === 'received' ? `<button class="btn danger" data-act="refundopen" data-id="${g.id}">${esc(t('b.refund'))}</button>` : ''}</div>`;
}

// ---------- donors ----------
function pgDonors() {
  const d = D(), q = S.cq.toLowerCase();
  const list = d.donors.filter((x) => !q || [x.name, x.nameAr, x.email, x.city].join(' ').toLowerCase().includes(q)).sort((a, b) => b.total - a.total);
  return `<div class="bar"><h1>${esc(t('nav.donors'))}</h1><span class="sp"></span><button class="btn pri" data-act="newdonor">${esc(t('b.addDonor'))}</button></div>
  <div class="card filters"><input type="search" id="cq" value="${esc(S.cq)}" placeholder="${esc(t('searchDonors'))}" aria-label="${esc(t('searchDonors'))}"><span class="muted">${nf(list.length)}</span></div>
  ${tbl([t('f.name'), t('f.kind'), t('f.city'), [t('gifts'), 1], [t('f.total'), 1], t('f.last')], list.slice(0, 80).map((x) => `<tr class="click" data-act="donorview" data-id="${x.id}"><td><b>${esc(nm(x))}</b><div class="small muted">${esc(x.email)}</div></td><td>${esc(t('dkind.' + x.type))}</td><td>${esc(city(x.city))}</td><td class="num">${nf(x.gifts)}</td><td class="num">${esc(egp(x.total))}</td><td>${esc(dF(x.last))}</td></tr>`))}
  ${list.length > 80 ? `<p class="muted small">${esc(t('firstN').replace('{n}', '80'))}</p>` : ''}`;
}
function donorForm(x) {
  return `${mhead(t(x ? 'b.edit' : 'b.addDonor'))}<div class="grid two"><div>${inp('df-name', t('f.name'), x?.name, 'maxlength="60"')}${inp('df-nameAr', t('f.nameAr'), x?.nameAr, 'maxlength="60" dir="rtl"')}${inp('df-email', t('f.email'), x?.email, 'type="email"')}</div>
  <div>${inp('df-phone', t('f.phone'), x?.phone)}${inp('df-city', t('f.city'), x?.city, 'maxlength="40"')}${field('df-kind', t('f.kind'), sel('df-kind', opts(['individual', 'company'], 'dkind'), x?.type || 'individual'))}</div></div>
  ${chk('df-wall', t('f.wall'), x ? x.wall : true)}${ta('df-note', t('f.note'), x?.note, 2)}<div class="acts"><button class="btn pri" data-act="savedonor" data-id="${x?.id || ''}">${esc(t('b.save'))}</button></div>`;
}
function donorModal(x) {
  const d = D(), gifts = d.donations.filter((g) => g.donorId === x.id), pl = d.pledges.filter((p) => p.donorId === x.id), ik = d.inkind.filter((g) => g.donorId === x.id);
  return `<div class="bar"><h2>${esc(nm(x))}</h2><span class="sp"></span><button class="btn sm" data-act="editdonor" data-id="${x.id}">${esc(t('b.edit'))}</button><button class="btn sm" data-act="close">${esc(t('b.close'))}</button></div>
  <p class="muted">${esc(x.email)} · ${esc(x.phone)} · ${esc(city(x.city))} ${x.wall ? pill(t('f.wall'), 'ice') : ''}</p>
  <div class="grid3">${kpi(egp(x.total), t('f.total'))}${kpi(nf(x.gifts), t('gifts'))}${kpi(nf(pl.filter((p) => p.status === 'active').length), t('nav.pledges'))}</div>
  <h3 style="margin-top:1rem">${esc(t('gifts'))}</h3>${tbl([t('f.receipt'), t('f.date'), t('f.campaign'), [t('f.amount'), 1]], gifts.slice(0, 12).map((g) => `<tr class="${g.status === 'refunded' ? 'void' : ''}"><td>${esc(g.receipt)}</td><td>${esc(dF(g.date))}</td><td>${esc(ct(campOf(g.campaignId)))}</td><td class="num">${esc(egp(g.amount))}</td></tr>`))}
  ${ik.length ? `<h3 style="margin-top:1rem">${esc(t('nav.inkind'))}</h3>${ik.map((g) => `<div class="mrow"><span>${esc(g.description)} · ${nf(g.qty)} ${esc(g.unit)}</span><span>${esc(g.receipt)}</span></div>`).join('')}` : ''}`;
}

// ---------- pledges ----------
function pgPledges() {
  const d = D(), list = d.pledges.filter((p) => !S.pst || p.status === S.pst);
  return `<div class="bar"><h1>${esc(t('nav.pledges'))}</h1><span class="sp"></span>${sel('pf', [['', t('all')], ...opts(['active', 'paused', 'cancelled', 'fulfilled'], 'ps')], S.pst, 'data-act-change="pst"')}<button class="btn" data-act="runpledges">${esc(t('b.runPledges'))}</button><button class="btn pri" data-act="newpledge">${esc(t('b.newPledge'))}</button></div>
  <p class="muted small">${esc(t('pledgeNote'))}</p>
  ${tbl([t('f.donor'), t('f.campaign'), t('f.kind'), [t('f.amount'), 1], t('f.when'), t('status'), ''], list.map((p) => `<tr><td>${esc(nm(donorOf(p.donorId)))}</td><td>${esc(ct(campOf(p.campaignId)))}</td><td>${esc(t('pk.' + p.kind))}</td><td class="num">${esc(egp(p.amount))}</td><td>${p.kind === 'monthly' ? esc(t('everyMonth').replace('{n}', nf(p.day))) : esc(dF(p.dueOn)) + (p.status === 'active' && p.dueOn < d.today ? ' ' + pill(t('overdue'), 'bad') : '')}</td><td>${pill(t('ps.' + p.status), p.status === 'active' ? '' : p.status === 'paused' ? 'off' : 'gray')}</td>
  <td><div class="acts1">${p.kind === 'one_off' && p.status === 'active' ? `<button class="btn sm" data-act="fulfil" data-id="${p.id}">${esc(t('b.fulfil'))}</button>` : ''}${p.status === 'active' ? `<button class="btn sm" data-act="pstatus" data-id="${p.id}" data-st="paused">${esc(t('b.pause'))}</button>` : ''}${p.status === 'paused' ? `<button class="btn sm" data-act="pstatus" data-id="${p.id}" data-st="active">${esc(t('b.activate'))}</button>` : ''}${['active', 'paused'].includes(p.status) ? `<button class="btn sm danger" data-act="pstatus" data-id="${p.id}" data-st="cancelled">${esc(t('b.cancelPledge'))}</button>` : ''}</div></td></tr>`))}`;
}
function pledgeForm() {
  const d = D(); const live = d.campaigns.filter((c) => c.status !== 'closed');
  return `${mhead(t('b.newPledge'))}${field('pl-donor', t('f.donor'), sel('pl-donor', d.donors.map((x) => [x.id, nm(x)]), ''))}${field('pl-camp', t('f.campaign'), sel('pl-camp', campOpts(live), live[0]?.id))}
  <div class="grid3">${field('pl-kind', t('f.kind'), sel('pl-kind', opts(['monthly', 'one_off'], 'pk'), 'monthly', 'data-act-change="plkind"'))}${inp('pl-amt', t('f.amount'), '', 'type="number" min="10"')}${field('pl-meth', t('f.method'), sel('pl-meth', opts(L.METHODS, 'method'), 'card'))}</div>
  <div class="grid3" id="pl-monthly">${inp('pl-day', t('f.day'), 1, 'type="number" min="1" max="28"')}${inp('pl-start', t('f.startsOn'), d.today, 'type="date"')}</div>
  <div class="grid3" id="pl-oneoff" hidden>${inp('pl-due', t('f.dueOn'), L.addDays(d.today, 14), 'type="date"')}</div>
  <div class="acts"><button class="btn pri" data-act="savepledge">${esc(t('b.save'))}</button></div>`;
}

// ---------- in-kind ----------
function pgInkind() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('nav.inkind'))}</h1><span class="sp"></span>${canFund() ? `<button class="btn pri" data-act="newinkind">${esc(t('b.recordInKind'))}</button>` : ''}</div>
  <div class="grid kpis">${kpi(nf(d.inkind.filter((g) => g.status === 'in_stock').length), t('k.inKindStock'))}${kpi(egp(d.inkind.reduce((a, g) => a + g.value, 0)), t('k.inKindValue'), t('estimated'))}</div>
  <div style="margin-top:1rem">${tbl([t('f.receipt'), t('f.date'), ...(canFund() ? [t('f.donor')] : []), t('f.desc'), [t('f.qty'), 1], [t('f.value'), 1], t('status'), ''], d.inkind.map((g) => `<tr><td>${esc(g.receipt)}</td><td>${esc(dF(g.date))}</td>${canFund() ? `<td>${esc(nm(donorOf(g.donorId)))}</td>` : ''}<td>${esc(ar() && g.descriptionAr ? g.descriptionAr : g.description)}<div class="small muted">${esc(t('ikind.' + g.kind))}</div></td><td class="num">${nf(g.qty)} ${esc(g.unit)}</td><td class="num">${esc(egp(g.value))}</td><td>${pill(t('iks.' + g.status), g.status === 'in_stock' ? 'off' : '')}${g.caseId && caseOf(g.caseId) ? ` <span class="small muted">${esc(caseOf(g.caseId).code)}</span>` : ''}</td><td>${canProg() && g.status === 'in_stock' ? `<button class="btn sm" data-act="distopen" data-id="${g.id}">${esc(t('b.distribute'))}</button>` : ''}</td></tr>`))}</div>
  <p class="muted small">${esc(t('inkindNote'))}</p>`;
}
function inkindForm() {
  const d = D();
  return `${mhead(t('b.recordInKind'))}${field('ik-donor', t('f.donor'), sel('ik-donor', d.donors.map((x) => [x.id, nm(x)]), ''))}
  <div class="grid3">${field('ik-kind', t('f.category'), sel('ik-kind', opts(L.KINDS, 'ikind'), 'food'))}${inp('ik-qty', t('f.qty'), 1, 'type="number" min="1"')}${inp('ik-unit', t('f.unit'), 'piece', 'maxlength="20"')}</div>
  ${inp('ik-desc', t('f.desc'), '', 'maxlength="120"')}<div class="grid3">${inp('ik-val', t('f.value') + ' (' + t('estimated') + ')', '', 'type="number" min="0"')}${field('ik-camp', t('f.campaign'), sel('ik-camp', [['', t('none')], ...campOpts(d.campaigns)], ''))}</div>
  <div class="acts"><button class="btn pri" data-act="saveinkind">${esc(t('b.save'))}</button></div>`;
}
function distModal(g) {
  const d = D(); const ok = d.cases.filter((c) => c.status === 'open');
  return `${mhead(t('b.distribute'))}<p>${esc(g.description)} · ${nf(g.qty)} ${esc(g.unit)}</p>${field('ds-case', t('f.case'), sel('ds-case', ok.map((c) => [c.id, `${c.code} · ${t('cause.' + c.category)} · ${city(c.city)}`]), ok[0]?.id))}<div class="acts"><button class="btn pri" data-act="savedist" data-id="${g.id}">${esc(t('b.distribute'))}</button></div>`;
}

// ---------- cases ----------
function pgCases() {
  const d = D(), q = S.gq.toLowerCase(), full = canProg();
  const list = d.cases.filter((c) => (!S.ccat || c.category === S.ccat) && (!S.cst || c.status === S.cst) && (!q || [c.code, c.city, full ? c.name + (c.nameAr || '') : '', c.summary].join(' ').toLowerCase().includes(q)));
  return `<div class="bar"><h1>${esc(t('nav.cases'))}</h1><span class="sp"></span>${full ? `<button class="btn pri" data-act="newcase">${esc(t('b.addCase'))}</button>` : ''}</div>
  ${full ? '' : `<div class="notice">${esc(t('caseMask'))}</div>`}
  <div class="card filters"><input type="search" id="gq2" value="${esc(S.gq)}" placeholder="${esc(t(full ? 'searchCases' : 'searchCasesCode'))}" aria-label="${esc(t('searchCases'))}">${sel('cc', [['', t('all') + ' · ' + t('f.category')], ...opts(L.CASE_CATS, 'cause')], S.ccat, 'data-act-change="ccat"')}${sel('cst', [['', t('all') + ' · ' + t('status')], ...opts(['open', 'funded', 'closed'], 'st')], S.cst, 'data-act-change="cst"')}<span class="muted">${nf(list.length)}</span></div>
  ${tbl([t('f.code'), ...(full ? [t('f.name')] : []), t('f.category'), t('f.city'), [t('f.need'), 1], t('funded'), t('status')], list.slice(0, 80).map((c) => `<tr class="click" data-act="caseview" data-id="${c.id}"><td><b>${esc(c.code)}</b></td>${full ? `<td>${esc(nm(c))}</td>` : ''}<td>${esc(t('cause.' + c.category))}</td><td>${esc(city(c.city))}</td><td class="num">${esc(egp(c.need))}</td><td style="min-width:8rem">${meter(c.funded, c.need)}<div class="small muted">${esc(egp(c.funded))}</div></td><td>${caseStPill(c.status)}</td></tr>`))}
  ${list.length > 80 ? `<p class="muted small">${esc(t('firstN').replace('{n}', '80'))}</p>` : ''}`;
}
function caseForm(c) {
  return `${mhead(t(c ? 'b.edit' : 'b.addCase'))}<div class="grid two"><div>${inp('cs-name', t('f.name'), c?.name, 'maxlength="60"')}${inp('cs-nameAr', t('f.nameAr'), c?.nameAr, 'maxlength="60" dir="rtl"')}${inp('cs-phone', t('f.phone'), c?.phone)}${inp('cs-city', t('f.city'), c?.city, 'maxlength="40"')}</div>
  <div>${field('cs-cat', t('f.category'), sel('cs-cat', opts(L.CASE_CATS, 'cause'), c?.category || 'health'))}${inp('cs-hh', t('f.household'), c?.householdSize ?? 4, 'type="number" min="1" max="20"')}${inp('cs-need', t('f.need') + ' (' + t('cur') + ')', c?.need ?? 5000, 'type="number" min="500"')}</div></div>
  ${ta('cs-sum', t('f.summarySafe'), c?.summary)}${ta('cs-sumAr', t('f.summaryAr'), c?.summaryAr, 2)}${chk('cs-share', t('f.share'), c?.share)}<div class="acts"><button class="btn pri" data-act="savecase" data-id="${c?.id || ''}">${esc(t('b.save'))}</button></div>`;
}
function caseModal(c) {
  const d = D(), full = canProg(), al = (d.allocs || []).filter((a) => a.caseId === c.id), ik = d.inkind.filter((g) => g.caseId === c.id);
  return `<div class="bar"><h2>${esc(c.code)}${full ? ' · ' + esc(nm(c)) : ''}</h2><span class="sp"></span>${full && c.status !== 'closed' ? `<button class="btn sm" data-act="editcase" data-id="${c.id}">${esc(t('b.edit'))}</button><button class="btn sm danger" data-act="closecase" data-id="${c.id}">${esc(t('b.closeCase'))}</button>` : ''}<button class="btn sm" data-act="close">${esc(t('b.close'))}</button></div>
  <p class="muted">${esc(t('cause.' + c.category))} · ${esc(city(c.city))} · ${esc(t('f.household'))}: ${nf(c.householdSize)} ${caseStPill(c.status)}</p>
  ${full && c.phone ? `<p class="small">${esc(c.phone)}</p>` : ''}<p>${esc(ar() && c.summaryAr ? c.summaryAr : c.summary) || ''}</p>
  <div class="row"><b>${esc(egp(c.funded))}</b><span class="muted">/ ${esc(egp(c.need))}</span></div>${meter(c.funded, c.need)}
  ${full ? `<h3 style="margin-top:1rem">${esc(t('nav.funds'))}</h3>${al.map((a) => `<div class="mrow"><span>${esc(ct(campOf(a.campaignId)))} · ${esc(egp(a.amount))}</span>${pill(t('as.' + a.status), a.status === 'approved' ? '' : a.status === 'pending' ? 'off' : 'bad')}</div>`).join('') || `<p class="empty">${esc(t('none'))}</p>`}` : ''}
  ${ik.length ? `<h3 style="margin-top:1rem">${esc(t('nav.inkind'))}</h3>${ik.map((g) => `<div class="mrow"><span>${esc(g.description)} · ${nf(g.qty)} ${esc(g.unit)}</span><span class="muted small">${esc(dF(g.distributedOn))}</span></div>`).join('')}` : ''}`;
}

// ---------- funds ----------
function pgFunds() {
  const d = D(), pend = d.allocs.filter((a) => a.status === 'pending');
  const active = d.campaigns.filter((c) => c.status !== 'draft');
  return `<div class="bar"><h1>${esc(t('nav.funds'))}</h1><span class="sp"></span><button class="btn sm" data-act="csvallocs">${esc(t('b.csv'))}</button><button class="btn pri" data-act="newalloc">${esc(t('b.allocate'))}</button></div>
  <p class="muted small">${esc(t('fundsNote').replace('{a}', nf(d.settings.approvalAbove)).replace('{p}', nf(d.settings.adminCapPct)))}</p>
  ${pend.length ? `<section class="card" style="margin-bottom:1rem"><h2>${esc(t('waiting'))}</h2>${pend.map((a) => `<div class="att-row"><span>${pill(t('as.pending'), 'off')} <b>${esc(egp(a.amount))}</b> · ${esc(ct(campOf(a.campaignId)))} · ${esc(a.caseCode || t('toAdmin'))} <span class="muted small">${esc(a.byName)}</span></span>${role() === 'owner' ? `<span class="acts1"><button class="btn pri sm" data-act="decide" data-id="${a.id}" data-d="approve">${esc(t('b.approve'))}</button><button class="btn danger sm" data-act="decide" data-id="${a.id}" data-d="reject">${esc(t('b.reject'))}</button></span>` : ''}</div>`).join('')}</section>` : ''}
  <div class="grid two">${active.map((c) => `<article class="card flat"><h2>${esc(ct(c))} ${campPill(c.status)}</h2><dl class="dl small"><dt>${esc(t('k.raised'))}</dt><dd>${esc(egp(c.raised))}</dd><dt>${esc(t('allocated'))}</dt><dd>${esc(egp(c.reserved))}</dd><dt>${esc(t('available'))}</dt><dd><b>${esc(egp(c.available))}</b></dd><dt>${esc(t('adminUsed'))}</dt><dd>${esc(egp(c.adminUsed))} / ${esc(egp(c.adminCap))}</dd></dl>${meter(c.reserved, c.raised)}</article>`).join('')}</div>
  <h2 style="margin-top:1rem">${esc(t('allocLog'))}</h2>
  ${tbl([t('f.date'), t('f.campaign'), t('f.case'), [t('f.amount'), 1], t('status'), t('by')], d.allocs.slice(0, 60).map((a) => `<tr class="${a.status === 'rejected' ? 'void' : ''}"><td>${esc(dts(a.ts))}</td><td>${esc(ct(campOf(a.campaignId)))}</td><td>${esc(a.caseCode || t('toAdmin'))}</td><td class="num">${esc(egp(a.amount))}</td><td>${pill(t('as.' + a.status), a.status === 'approved' ? '' : a.status === 'pending' ? 'off' : 'bad')}</td><td>${esc(a.byName)}</td></tr>`))}`;
}
function allocForm() {
  const d = D(); const camps = d.campaigns.filter((c) => c.status !== 'draft'); const open = d.cases.filter((c) => c.status === 'open');
  return `${mhead(t('b.allocate'))}${field('al-camp', t('f.campaign'), sel('al-camp', campOpts(camps), camps.find((c) => c.status === 'active')?.id, 'data-act-change="alcamp"'))}
  <div id="al-avail" class="notice ok"></div>
  ${field('al-kind', t('f.to'), sel('al-kind', [['case', t('toCase')], ...(role() === 'owner' ? [['admin', t('toAdmin')]] : [])], 'case'))}
  ${field('al-case', t('f.case'), sel('al-case', open.map((c) => [c.id, `${c.code} · ${t('cause.' + c.category)} · ${t('needsLeft')} ${nf(c.need - c.reserved)}`]), open[0]?.id))}
  ${inp('al-amt', t('f.amount') + ' (' + t('cur') + ')', '', 'type="number" min="100"')}${inp('al-note', t('f.note'), '', 'maxlength="200"')}
  <div class="acts"><button class="btn pri" data-act="savealloc">${esc(t('b.allocate'))}</button></div>`;
}

// ---------- volunteers (staff) ----------
function pgVolunteers() {
  const d = D(), hp = d.hours.filter((h) => h.status === 'pending');
  const vn = (id) => nm(d.volunteers.find((v) => v.id === id));
  return `<div class="bar"><h1>${esc(t('nav.volunteers'))}</h1><span class="sp"></span><button class="btn pri" data-act="newshift">${esc(t('b.newShift'))}</button></div>
  <div class="grid two"><section class="card"><h2>${esc(t('hoursReview'))} <span class="pill off">${nf(hp.length)}</span></h2>${hp.slice(0, 12).map((h) => `<div class="att-row"><span><b>${esc(vn(h.volunteerId))}</b> · ${nf(h.hours, 1)} ${esc(t('hrs'))} · ${esc(dF(h.date))}<div class="small muted">${esc(h.activity)}</div></span><span class="acts1"><button class="btn pri sm" data-act="rvh" data-id="${h.id}" data-d="approve">${esc(t('b.approve'))}</button><button class="btn danger sm" data-act="rvopen" data-id="${h.id}">${esc(t('b.reject'))}</button></span></div>`).join('') || `<p class="empty">${esc(t('nothingDue'))}</p>`}</section>
  <section class="card"><h2>${esc(t('shifts'))}</h2>${d.shifts.filter((s) => s.status === 'open' && s.date >= d.today).sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1)).map((s) => `<div class="att-row"><span><b>${esc(ar() && s.titleAr ? s.titleAr : s.title)}</b><div class="small muted">${esc(dF(s.date))} · ${esc(s.start)}-${esc(s.end)} · ${esc(s.place)} · ${nf(s.signups.length)}/${nf(s.slots)}</div></span><button class="btn sm danger" data-act="cancelshift" data-id="${s.id}">${esc(t('b.cancelShift'))}</button></div>`).join('') || `<p class="empty">${esc(t('none'))}</p>`}</section></div>
  <h2 style="margin-top:1rem">${esc(t('nav.volunteers'))}</h2>
  ${tbl([t('f.name'), t('f.phone'), [t('approvedHrs'), 1], [t('pendingHrs'), 1], t('certificate')], d.volunteers.map((v) => `<tr><td>${esc(nm(v))}</td><td>${esc(v.phone)}</td><td class="num">${nf(v.approved, 1)}</td><td class="num">${nf(v.pending, 1)}</td><td>${v.approved >= d.settings.certificateHours ? pill(t('earned'), '') : meter(v.approved, d.settings.certificateHours)}</td></tr>`))}`;
}
function shiftForm() {
  const d = D();
  return `${mhead(t('b.newShift'))}${inp('sh-title', t('f.title'), '', 'maxlength="80"')}${inp('sh-titleAr', t('f.titleAr'), '', 'maxlength="80" dir="rtl"')}<div class="grid3">${inp('sh-date', t('f.date'), L.addDays(d.today, 3), 'type="date"')}${inp('sh-start', t('f.start'), '10:00', 'type="time"')}${inp('sh-end', t('f.end'), '13:00', 'type="time"')}</div>
  <div class="grid3">${inp('sh-slots', t('f.slots'), 10, 'type="number" min="1" max="100"')}${inp('sh-place', t('f.place'), '', 'maxlength="80"')}${field('sh-camp', t('f.campaign'), sel('sh-camp', [['', t('none')], ...campOpts(d.campaigns.filter((c) => c.status !== 'draft'))], ''))}</div>
  <div class="acts"><button class="btn pri" data-act="saveshift">${esc(t('b.save'))}</button></div>`;
}

// ---------- volunteer pages ----------
function pgShifts() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('nav.shifts'))}</h1></div><div class="grid two">${d.shifts.filter((s) => s.date >= d.today).map((s) => `<article class="card"><div class="mc-h"><div><h2>${esc(ar() && s.titleAr ? s.titleAr : s.title)}</h2><div class="muted small">${esc(dF(s.date))} · ${esc(s.start)}-${esc(s.end)} · ${esc(s.place)}</div></div>${s.mine ? pill(t('signedUp'), '') : s.taken >= s.slots ? pill(t('full'), 'bad') : pill(`${nf(s.slots - s.taken)} ${t('spotsLeft')}`, 'ice')}</div>${meter(s.taken, s.slots)}
  <div class="acts">${s.mine ? `<button class="btn sm danger" data-act="leave" data-id="${s.id}">${esc(t('b.leave'))}</button>` : `<button class="btn pri sm" data-act="signup" data-id="${s.id}" ${s.taken >= s.slots ? 'disabled' : ''}>${esc(t('b.signUp'))}</button>`}</div></article>`).join('') || `<p class="empty">${esc(t('none'))}</p>`}</div>`;
}
function pgHours() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('nav.hours'))}</h1><span class="sp"></span><button class="btn pri" data-act="newhours">${esc(t('b.logHours'))}</button></div>
  <div class="card"><div class="big-n">${nf(d.approvedHours, 1)} <span class="muted small">/ ${nf(d.certificateAt)} ${esc(t('hrs'))}</span></div>${meter(d.approvedHours, d.certificateAt)}<p class="muted small">${d.approvedHours >= d.certificateAt ? esc(t('certEarned')) : esc(t('certLeft').replace('{n}', nf(d.certificateAt - d.approvedHours, 1)))} · ${nf(d.pendingHours, 1)} ${esc(t('hrs'))} ${esc(t('hs.pending'))}</p></div>
  <div style="margin-top:1rem">${tbl([t('f.date'), [t('f.hours'), 1], t('f.activity'), t('status')], d.hours.slice(0, 40).map((h) => `<tr><td>${esc(dF(h.date))}</td><td class="num">${nf(h.hours, 1)}</td><td>${esc(h.activity)}${h.reason ? `<div class="small muted">${esc(h.reason)}</div>` : ''}</td><td>${pill(t('hs.' + h.status), h.status === 'approved' ? '' : h.status === 'pending' ? 'off' : 'bad')}</td></tr>`))}</div>`;
}
function hoursForm() {
  const d = D(); const mine = d.shifts.filter((s) => s.mine && s.date <= d.today);
  return `${mhead(t('b.logHours'))}<div class="grid3">${inp('hh-date', t('f.date'), d.today, 'type="date"')}${inp('hh-hours', t('f.hours'), 3, 'type="number" min="0.5" max="12" step="0.5"')}</div>${inp('hh-act', t('f.activity'), '', 'maxlength="120"')}
  ${mine.length ? field('hh-shift', t('f.shift'), sel('hh-shift', [['', t('none')], ...mine.map((s) => [s.id, `${ar() && s.titleAr ? s.titleAr : s.title} · ${dF(s.date)}`])], '')) : ''}<div class="acts"><button class="btn pri" data-act="savehours">${esc(t('b.save'))}</button></div>`;
}

// ---------- reports, settings, audit ----------
function pgReports() {
  const d = D(), r = d.reports, tt = r.totals;
  const mx = Math.max(1, ...Object.values(r.byMethod));
  return `<div class="bar"><h1>${esc(t('nav.reports'))}</h1><span class="sp"></span><button class="btn sm" data-act="csvgifts">${esc(t('b.csv'))}</button></div>
  <div class="grid kpis">${kpi(egp(tt.raised), t('k.raised'))}${kpi(egp(tt.avgGift), t('k.avgGift'))}${kpi(tt.repeatPct + '%', t('k.repeat'))}${kpi(tt.recurringPct + '%', t('k.recurring'))}${kpi(tt.adminPct + '%', t('k.adminShare'), t('k.ofRaised'))}${kpi(egp(tt.inKindValue), t('k.inKindValue'), t('estimated'))}</div>
  <div class="grid two" style="margin-top:1rem"><section class="card"><h2>${esc(t('rep.monthly'))}</h2>${barChart(r.byMonth, 'raised', t('rep.monthly'))}</section>
  <section class="card"><h2>${esc(t('rep.methods'))}</h2><div class="hbars">${Object.entries(r.byMethod).sort((a, b) => b[1] - a[1]).map(([m, v]) => `<div class="hb"><span>${esc(t('method.' + m))}</span>${meter(v, mx)}<b>${esc(egp(v))}</b></div>`).join('')}</div></section></div>
  <h2 style="margin-top:1rem">${esc(t('rep.transparency'))}</h2>
  ${tbl([t('f.campaign'), [t('k.raised'), 1], [t('refunded'), 1], [t('toCases'), 1], [t('toAdmin'), 1], [t('available'), 1]], d.campaigns.filter((c) => c.status !== 'draft').map((c) => { const rc = r.campaigns.find((x) => x.id === c.id); return `<tr><td>${esc(ct(c))}</td><td class="num">${esc(egp(rc.raised))}</td><td class="num">${esc(egp(rc.refunded))}</td><td class="num">${esc(egp(rc.reserved - rc.adminUsed))}</td><td class="num">${esc(egp(rc.adminUsed))}</td><td class="num">${esc(egp(rc.available))}</td></tr>`; }))}
  <h2 style="margin-top:1rem">${esc(t('rep.top'))}</h2>
  ${tbl([t('f.donor'), [t('f.total'), 1]], r.top.map((x) => `<tr><td>${esc(nm(donorOf(x.id)))}</td><td class="num">${esc(egp(x.total))}</td></tr>`))}`;
}
function pgSettings() {
  const s = D().settings;
  return `<div class="bar"><h1>${esc(t('nav.settings'))}</h1></div><div class="card" style="max-width:640px">
  ${inp('st-admin', t('set.admin'), s.adminCapPct, 'type="number" min="0" max="25"')}${inp('st-appr', t('set.approval'), s.approvalAbove, 'type="number" min="1000"')}${inp('st-rev', t('set.review'), s.reviewAbove, 'type="number" min="1000"')}${inp('st-cert', t('set.cert'), s.certificateHours, 'type="number" min="5"')}
  <div class="acts"><button class="btn pri" data-act="savesettings">${esc(t('b.save'))}</button><button class="btn danger" data-act="reset">${esc(t('b.reset'))}</button></div></div>`;
}
function pgAudit() {
  return `<div class="bar"><h1>${esc(t('nav.audit'))}</h1></div>${tbl([t('f.when'), t('f.by'), t('f.action'), t('f.detail')], D().audit.slice(0, 120).map((a) => `<tr><td>${esc(new Date(a.ts).toLocaleString(ar() ? 'ar-EG' : 'en-GB', { timeZone: L.TZ, dateStyle: 'medium', timeStyle: 'short' }))}</td><td>${esc(a.name)}</td><td>${esc(a.action)}</td><td>${esc(a.detail)}</td></tr>`))}`;
}

// ---------- modal dispatch and render ----------
function modalHtml() {
  const m = S.modal; if (!m) return '';
  const d = D(), pubC = (S.pub || d)?.campaigns;
  if (m.k === 'donate') return donateModal(pubC.find((c) => c.id === m.id));
  if (!d?.donors && !['rv'].includes(m.k) && !d?.volunteer) return '';
  if (m.k === 'camp') return modalBg(campForm(m.id ? d.campaigns.find((c) => c.id === m.id) : null), true);
  if (m.k === 'gift') return modalBg(giftForm());
  if (m.k === 'rcpt') return modalBg(rcptModal(d.donations.find((g) => g.id === m.id)));
  if (m.k === 'refund') return modalBg(`${mhead(t('b.refund'))}${ta('rf-reason', t('f.reason'), '', 2)}<div class="acts"><button class="btn danger" data-act="dorefund" data-id="${m.id}">${esc(t('b.refund'))}</button></div>`);
  if (m.k === 'donor') return modalBg(donorForm(m.id ? donorOf(m.id) : null), true);
  if (m.k === 'donorview') return modalBg(donorModal(donorOf(m.id)), true);
  if (m.k === 'pledge') return modalBg(pledgeForm());
  if (m.k === 'inkind') return modalBg(inkindForm());
  if (m.k === 'dist') return modalBg(distModal(d.inkind.find((g) => g.id === m.id)));
  if (m.k === 'case') return modalBg(caseForm(m.id ? caseOf(m.id) : null), true);
  if (m.k === 'caseview') return modalBg(caseModal(caseOf(m.id)), true);
  if (m.k === 'alloc') return modalBg(allocForm());
  if (m.k === 'shift') return modalBg(shiftForm());
  if (m.k === 'hours') return modalBg(hoursForm());
  if (m.k === 'rv') return modalBg(`${mhead(t('b.reject'))}${inp('rv-reason', t('f.reason'), '', 'maxlength="120"')}<div class="acts"><button class="btn danger" data-act="rvh" data-id="${m.id}" data-d="reject">${esc(t('b.reject'))}</button></div>`);
  return '';
}
const PAGES = { dashboard: pgDashboard, campaigns: pgCampaigns, donations: pgDonations, donors: pgDonors, pledges: pgPledges, inkind: pgInkind, cases: pgCases, funds: pgFunds, volunteers: pgVolunteers, reports: pgReports, settings: pgSettings, audit: pgAudit, shifts: pgShifts, hours: pgHours, give: () => givePage(S.pub || (D()?.campaigns ? { ...D(), impact: S.pub?.impact || { raised: 0, families: 0, volunteerHours: 0 } } : null)) };
function render() {
  document.documentElement.lang = S.lang; document.documentElement.dir = T[S.lang].dir;
  const app = $('#app'), r = route();
  if (r === 'login') { app.innerHTML = loginPage(); const pin = $('#pin'); if (pin) pin.focus(); return; }
  if (r === 'give' && !S.me) {
    app.innerHTML = `<div class="top"><a class="brand" href="#/">${LOGO}<span>${esc(t('appName'))}<small>${esc(t('appSub'))}</small></span></a><span class="sp"></span><div class="tools"><button class="btn ghost sm" data-act="lang">${esc(t('other'))}</button><a class="btn ghost sm" href="#/">${esc(t('signin'))}</a></div></div><main>${givePage(S.pub)}</main>${S.modal?.k === 'donate' ? donateModal(S.pub.campaigns.find((c) => c.id === S.modal.id)) : ''}`;
    return;
  }
  if (!S.data) { app.innerHTML = shell('<p class="boot">…</p>'); return; }
  if (r === 'give') { if (!S.pub) { loadPub().then(render); } app.innerHTML = shell(givePage(S.pub)); return; }
  app.innerHTML = shell(PAGES[r]());
  if (r === 'pledges' && S.modal?.k === 'pledge') plToggle();
  if (S.modal?.k === 'alloc') allocAvail();
}

// ---------- events ----------
async function signin(pin) {
  try {
    const j = await api('POST', { type: 'login', pin });
    S.token = j.token; S.me = j.me; LS.set('token', j.token); LS.set('me', j.me);
    await refresh(); location.hash = '#/' + NAV[S.me.role][0]; render();
  } catch (e) { toast(e.message, true); render(); }
}
const keep = (id) => { const i = $(id); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };
const plToggle = () => { const m = val('#pl-kind') === 'monthly'; $('#pl-monthly').hidden = !m; $('#pl-oneoff').hidden = m; };
const allocAvail = () => { const c = campOf(val('#al-camp')); const el = $('#al-avail'); if (c && el) el.textContent = `${t('available')}: ${egp(c.available)} · ${t('adminUsed')}: ${egp(c.adminUsed)} / ${egp(c.adminCap)}`; };
const download = (name, rows) => { const blob = new Blob([L.toCsv(rows)], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); };
async function loadPub() { try { S.pub = await api('GET', null, 'get'); } catch { /* stays loading */ } }
const num = (id) => (val(id) === '' ? NaN : Number(val(id)));
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  if (act === 'bg') { if (e.target === el) { S.modal = null; render(); } return; }
  if (act === 'lang') { S.lang = ar() ? 'en' : 'ar'; LS.set('lang', S.lang); render(); return; }
  if (act === 'logout') { logout(); return; }
  if (act === 'pin') { signin(el.dataset.pin); return; }
  if (act === 'login') { signin(val('#pin')); return; }
  if (act === 'close') { S.modal = null; render(); return; }
  if (act === 'print') { window.print(); return; }
  if (act === 'donate') { S.modal = { k: 'donate', id }; render(); return; }
  if (act === 'preset') { $('#dn-amt').value = el.dataset.n; return; }
  if (act === 'senddonate') {
    if (S.busy) return; S.busy = true;
    try { const j = await api('POST', { type: 'publicDonate', campaignId: id, amount: num('#dn-amt'), name: val('#dn-name'), anonymous: checked('#dn-anon'), key: rid() }); S.pub = j; S.modal = { k: 'donate', id, done: j.result.receipt }; if (S.data) refresh().catch(() => {}); render(); }
    catch (err) { toast(err.message, true); } finally { S.busy = false; }
    return;
  }
  if (!S.data) return;
  const ok = async (op, msg, after) => { const r = await doOp(op, msg); if (r) { if (after) after(r); render(); } return r; };
  const shut = () => (S.modal = null);
  const open = (k, extra = {}) => { S.modal = { k, id, ...extra }; render(); };
  if (act === 'newcamp') return open('camp'); if (act === 'editcamp') return open('camp');
  if (act === 'savecamp') { const o = { title: val('#cf-title'), titleAr: val('#cf-titleAr'), summary: val('#cf-sum'), summaryAr: val('#cf-sumAr'), cause: val('#cf-cause'), goal: num('#cf-goal'), startsOn: val('#cf-start'), endsOn: val('#cf-end') }; return ok(id ? { type: 'updateCampaign', campaignId: id, ...o } : { type: 'createCampaign', ...o, key: rid() }, t('msg.saved'), shut); }
  if (act === 'cstatus') { if (el.dataset.st === 'closed' && !confirm(t('confirm.closeCamp'))) return; return ok({ type: 'setCampaignStatus', campaignId: id, status: el.dataset.st }, t('msg.saved')); }
  if (act === 'newgift') return open('gift');
  if (act === 'savegift') { const o = { type: 'recordDonation', campaignId: val('#gf-camp'), amount: num('#gf-amt'), method: val('#gf-meth'), date: val('#gf-date'), anonymous: checked('#gf-anon'), key: rid() }; if (val('#gf-donor')) o.donorId = val('#gf-donor'); else o.giverName = val('#gf-name'); return ok(o, t('msg.giftSaved'), shut); }
  if (act === 'rcpt') return open('rcpt');
  if (act === 'refundopen') return open('refund');
  if (act === 'dorefund') return ok({ type: 'refundDonation', donationId: id, reason: val('#rf-reason') }, t('msg.refunded'), shut);
  if (act === 'newdonor') return open('donor'); if (act === 'editdonor') return open('donor'); if (act === 'donorview') return open('donorview');
  if (act === 'savedonor') { const o = { name: val('#df-name'), nameAr: val('#df-nameAr'), email: val('#df-email'), phone: val('#df-phone'), city: val('#df-city'), kind: val('#df-kind'), wall: checked('#df-wall'), note: val('#df-note') }; return ok(id ? { type: 'updateDonor', donorId: id, ...o } : { type: 'addDonor', ...o, key: rid() }, t('msg.saved'), shut); }
  if (act === 'newpledge') return open('pledge');
  if (act === 'savepledge') { const k = val('#pl-kind'); const o = { type: 'createPledge', donorId: val('#pl-donor'), campaignId: val('#pl-camp'), kind: k, amount: num('#pl-amt'), method: val('#pl-meth'), key: rid() }; if (k === 'monthly') { o.day = num('#pl-day'); o.startsOn = val('#pl-start'); } else o.dueOn = val('#pl-due'); return ok(o, t('msg.saved'), shut); }
  if (act === 'pstatus') { if (el.dataset.st === 'cancelled' && !confirm(t('confirm.cancelPledge'))) return; return ok({ type: 'setPledgeStatus', pledgeId: id, status: el.dataset.st }, t('msg.saved')); }
  if (act === 'fulfil') return ok({ type: 'fulfilPledge', pledgeId: id, key: rid() }, t('msg.giftSaved'));
  if (act === 'runpledges') { const r = await doOp({ type: 'runPledges' }); if (r) { toast(t('msg.ran').replace('{n}', nf(r.created)).replace('{m}', nf(r.skipped))); render(); } return; }
  if (act === 'newinkind') return open('inkind');
  if (act === 'saveinkind') return ok({ type: 'recordInKind', donorId: val('#ik-donor'), kind: val('#ik-kind'), qty: num('#ik-qty'), unit: val('#ik-unit'), description: val('#ik-desc'), value: num('#ik-val'), ...(val('#ik-camp') ? { campaignId: val('#ik-camp') } : {}), key: rid() }, t('msg.giftSaved'), shut);
  if (act === 'distopen') return open('dist');
  if (act === 'savedist') return ok({ type: 'distributeInKind', inKindId: id, caseId: val('#ds-case') }, t('msg.saved'), shut);
  if (act === 'newcase') return open('case'); if (act === 'editcase') return open('case'); if (act === 'caseview') return open('caseview');
  if (act === 'savecase') { const o = { name: val('#cs-name'), nameAr: val('#cs-nameAr'), phone: val('#cs-phone'), city: val('#cs-city'), category: val('#cs-cat'), householdSize: num('#cs-hh'), need: num('#cs-need'), summary: val('#cs-sum'), summaryAr: val('#cs-sumAr'), share: checked('#cs-share') }; return ok(id ? { type: 'updateCase', caseId: id, ...o } : { type: 'addCase', ...o, key: rid() }, t('msg.saved'), shut); }
  if (act === 'closecase') { if (!confirm(t('confirm.closeCase'))) return; return ok({ type: 'closeCase', caseId: id }, t('msg.saved'), shut); }
  if (act === 'newalloc') return open('alloc');
  if (act === 'savealloc') { const kind = val('#al-kind'); return ok({ type: 'allocate', campaignId: val('#al-camp'), kind, ...(kind === 'case' ? { caseId: val('#al-case') } : {}), amount: num('#al-amt'), note: val('#al-note'), key: rid() }, t('msg.allocated'), shut); }
  if (act === 'decide') { if (el.dataset.d === 'reject' && !confirm(t('confirm.reject'))) return; return ok({ type: 'decideAllocation', allocId: id, decision: el.dataset.d }, t('msg.saved')); }
  if (act === 'newshift') return open('shift');
  if (act === 'saveshift') return ok({ type: 'createShift', title: val('#sh-title'), titleAr: val('#sh-titleAr'), date: val('#sh-date'), start: val('#sh-start'), end: val('#sh-end'), slots: num('#sh-slots'), place: val('#sh-place'), ...(val('#sh-camp') ? { campaignId: val('#sh-camp') } : {}), key: rid() }, t('msg.saved'), shut);
  if (act === 'cancelshift') { if (!confirm(t('confirm.cancelShift'))) return; return ok({ type: 'cancelShift', shiftId: id }, t('msg.saved')); }
  if (act === 'rvopen') return open('rv');
  if (act === 'rvh') return ok({ type: 'reviewHours', hoursId: id, decision: el.dataset.d, ...(el.dataset.d === 'reject' ? { reason: val('#rv-reason') } : {}) }, t('msg.saved'), shut);
  if (act === 'signup') return ok({ type: 'signUp', shiftId: id }, t('msg.signedUp'));
  if (act === 'leave') return ok({ type: 'leaveShift', shiftId: id }, t('msg.saved'));
  if (act === 'newhours') return open('hours');
  if (act === 'savehours') return ok({ type: 'logHours', date: val('#hh-date'), hours: num('#hh-hours'), activity: val('#hh-act'), ...(val('#hh-shift') ? { shiftId: val('#hh-shift') } : {}), key: rid() }, t('msg.hoursSent'), shut);
  if (act === 'savesettings') return ok({ type: 'setSettings', adminCapPct: num('#st-admin'), approvalAbove: num('#st-appr'), reviewAbove: num('#st-rev'), certificateHours: num('#st-cert') }, t('msg.saved'));
  if (act === 'reset') { if (confirm(t('confirm.reset'))) await ok({ type: 'reset' }, t('msg.reset')); return; }
  if (act === 'csvgifts') { const rows = [[t('f.receipt'), t('f.date'), t('f.donor'), t('f.campaign'), t('f.method'), t('f.amount'), t('status')]]; for (const g of D().donations) rows.push([g.receipt, g.date, donorName(g), ct(campOf(g.campaignId)), g.method, g.amount, g.status]); download('ataa-donations.csv', rows); return; }
  if (act === 'csvallocs') { const rows = [[t('f.date'), t('f.campaign'), t('f.case'), t('f.amount'), t('status')]]; for (const a of D().allocs) rows.push([new Date(a.ts).toISOString().slice(0, 10), ct(campOf(a.campaignId)), a.caseCode || 'admin', a.amount, a.status]); download('ataa-allocations.csv', rows); return; }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-act-change]'); if (!el) return;
  const a = el.dataset.actChange;
  if (a === 'dcamp') S.dcamp = el.value; if (a === 'dmeth') S.dmeth = el.value; if (a === 'ccat') S.ccat = el.value; if (a === 'cst') S.cst = el.value; if (a === 'pst') S.pst = el.value;
  if (a === 'plkind') return plToggle(); if (a === 'alcamp') return allocAvail();
  render();
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'gq') { S.dq = e.target.value; render(); keep('#gq'); }
  if (e.target.id === 'cq') { S.cq = e.target.value; render(); keep('#cq'); }
  if (e.target.id === 'gq2') { S.gq = e.target.value; render(); keep('#gq2'); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'pin') signin(e.target.value);
  if (e.key === 'Escape' && S.modal) { S.modal = null; render(); }
});
window.addEventListener('hashchange', async () => { S.modal = null; if (route() === 'give' && !S.pub) await loadPub(); render(); });

(async () => {
  render();
  if (S.token) { try { await refresh(); } catch { /* logout handled in api */ } }
  if (route() === 'give') await loadPub();
  render();
})();
