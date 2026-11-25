// Screenshots into docs/. Usage: node e2e/shots.mjs http://localhost:3100
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const U = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');
fs.mkdirSync('docs', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
async function page(w = 1280, h = 900) { const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: 2 }); return p; }
async function login(p, pin, lang = 'en') {
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.type('#pin', pin); await p.keyboard.press('Enter');
  await p.waitForSelector('.top .nav', { timeout: 8000 }); await sleep(700);
}
const go = async (p, r) => { await p.evaluate((x) => (location.hash = '#/' + x), r); await sleep(700); };
const shot = async (p, name) => { await p.screenshot({ path: 'docs/' + name + '.png' }); console.log('shot', name); };
let p = await page(); await p.goto(U, { waitUntil: 'networkidle0' }); await sleep(400); await shot(p, '01-login');
await login(p, '1111'); await shot(p, '02-dashboard');
await go(p, 'campaigns'); await shot(p, '03-campaigns');
await go(p, 'donations'); await shot(p, '04-donations');
const row = await p.$('tr.click'); if (row) { await row.click(); await sleep(800); await shot(p, '05-receipt'); await p.keyboard.press('Escape'); await sleep(300); }
await go(p, 'donors'); await shot(p, '06-donors');
await go(p, 'pledges'); await shot(p, '07-pledges');
await go(p, 'cases'); await shot(p, '08-cases');
await go(p, 'funds'); await shot(p, '09-funds');
await go(p, 'volunteers'); await shot(p, '10-volunteers');
await go(p, 'reports'); await sleep(500); await shot(p, '11-reports');
let pub = await page(1280, 1100); await pub.goto(U + '/#/give', { waitUntil: 'networkidle0' }); await sleep(800); await shot(pub, '12-public-give');
await pub.click('[data-act="donate"]'); await sleep(500); await shot(pub, '13-public-donate');
let m = await page(); await login(m, '3333'); await go(m, 'cases'); await shot(m, '14-program-cases');
let a = await page(); await login(a, '1111', 'ar'); await shot(a, '15-arabic-dashboard');
await go(a, 'funds'); await shot(a, '16-arabic-funds');
let ap = await page(1280, 1100); await ap.goto(U + '/?lang=ar#/give', { waitUntil: 'networkidle0' }); await sleep(800); await shot(ap, '17-arabic-public');
let v = await page(); await login(v, '4444'); await go(v, 'shifts'); await shot(v, '18-volunteer-shifts');
let ph = await page(390, 844); await login(ph, '2222'); await shot(ph, '19-phone-dashboard');
let pp = await page(390, 844); await pp.goto(U + '/?lang=ar#/give', { waitUntil: 'networkidle0' }); await sleep(800); await shot(pp, '20-phone-public-ar');
await b.close(); console.log('done');
