import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { T } from '../public/i18n.js';
const get = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const keys = [...new Set([...src.matchAll(/\bt\('([a-zA-Z]+(?:\.[a-zA-Z]+)*)'\)/g)].map((m) => m[1]))];
test('static keys exist in both languages', () => {
  assert.ok(keys.length > 100);
  for (const k of keys) for (const l of ['en', 'ar']) assert.ok(get(T[l], k) !== undefined, `${l}:${k}`);
});
test('en and ar have same key shape', () => {
  const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (k === 'srv' ? [] : typeof v === 'object' ? flat(v, p + k + '.') : [p + k]));
  assert.deepEqual(flat(T.en).sort(), flat(T.ar).sort());
});
test('directions', () => { assert.equal(T.en.dir, 'ltr'); assert.equal(T.ar.dir, 'rtl'); });
test('every server error has an Arabic translation', () => {
  const logic = readFileSync(new URL('../public/logic.js', import.meta.url), 'utf8');
  const msgs = [...logic.matchAll(/Error\('([^'$`]+)'\)/g)].map((m) => m[1]);
  const missing = msgs.filter((m) => !T.ar.srv[m]);
  assert.deepEqual(missing, []);
});
