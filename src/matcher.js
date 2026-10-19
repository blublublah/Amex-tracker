// Turns "transactions" (from an Amex CSV export or parsed Gmail messages) into credit detections.
//
// Two confidence levels:
//   credit – an Amex statement-credit line (negative amount) naming the benefit. Safe to auto-apply.
//   spend  – a qualifying charge at a credit's merchant. Might earn the credit; user confirms.

import { ACTIVE_CREDITS } from './catalog.js';
import { periodKeyForDate } from './periods.js';

const compiled = ACTIVE_CREDITS.map((c) => ({
  credit: c,
  creditLine: new RegExp(c.matchers.creditLine, 'i'),
  spend: new RegExp(c.matchers.spend, 'i'),
  spendRequires: c.matchers.spendRequires ? new RegExp(c.matchers.spendRequires, 'i') : null,
}));

// Check the more specific credit first so "Uber One" is not mistaken for plain Uber Cash spend.
const ORDER = ['uber_one', 'uber_cash'];
compiled.sort((a, b) => {
  const ia = ORDER.indexOf(a.credit.id), ib = ORDER.indexOf(b.credit.id);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
});

const CREDIT_WORDS = /credit|cash|benefit|statement/i;

/**
 * tx: { date:'YYYY-MM-DD', description:string, amount:number, extId?:string, source:string }
 * Charges are positive, credits negative (Amex CSV convention).
 * Returns a detection or null.
 */
export function matchTransaction(tx, { cards } = {}) {
  const desc = String(tx.description || '');
  if (!desc || !Number.isFinite(tx.amount) || !tx.date) return null;

  const list = cards ? cards.flatMap((cd) => compiled.filter((m) => m.credit.card === cd)) : compiled;
  for (const m of list) {
    const { credit } = m;
    if (tx.amount < 0) {
      if (m.creditLine.test(desc) && CREDIT_WORDS.test(desc)) {
        return build(tx, credit, Math.min(Math.abs(tx.amount), credit.amount * 1.0001 + 0.01), 'credit');
      }
    } else if (tx.amount > 0 && m.spend.test(desc)) {
      const { amountMin, amountMax } = credit.matchers;
      if (tx.amount < amountMin || tx.amount > amountMax) continue;
      if (m.spendRequires && !m.spendRequires.test(desc)) continue;
      return build(tx, credit, tx.amount, 'spend');
    }
  }
  return null;
}

function build(tx, credit, amount, confidence) {
  const key = periodKeyForDate(credit, tx.date);
  return {
    creditId: credit.id,
    periodKey: key,
    date: tx.date,
    amount: Math.round(amount * 100) / 100,
    confidence,
    source: tx.source,
    evidence: `${tx.date} · ${String(tx.description).slice(0, 140)} · ${tx.amount < 0 ? '-' : ''}$${Math.abs(tx.amount).toFixed(2)}`,
    extId: tx.extId || `${tx.source}:${tx.date}:${tx.amount}:${String(tx.description).slice(0, 60)}`,
  };
}

// ---------- Amex CSV export ----------

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

function normDate(s) {
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return null;
}

/** Parse an Amex "Activity" CSV download into transactions. */
export function parseAmexCsv(text) {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const di = header.findIndex((h) => h === 'date');
  const ei = header.findIndex((h) => h === 'description');
  const ai = header.findIndex((h) => h === 'amount');
  const xi = header.findIndex((h) => h.startsWith('extended'));
  if (di < 0 || ei < 0 || ai < 0) throw new Error('Could not find Date, Description and Amount columns. Use the CSV download from Amex Statements & Activity.');
  const out = [];
  for (const r of rows.slice(1)) {
    const date = normDate(r[di] || '');
    const amount = Number(String(r[ai] || '').replace(/[$,\s]/g, ''));
    if (!date || !Number.isFinite(amount)) continue;
    const description = [r[ei], xi >= 0 ? r[xi] : ''].filter(Boolean).join(' ');
    out.push({ date, description, amount, source: 'csv' });
  }
  return out;
}
