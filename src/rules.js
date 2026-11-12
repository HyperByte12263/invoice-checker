// Invoice checking rules. Plain code decides pass/fail; the AI only extracts fields.
// Pure function: no clock, network or sheet access. The caller passes in today's date
// and the invoices already approved.
// This file is pasted into the n8n Code node as-is, so it must not depend on Node-only APIs.

const DEFAULT_TAX_RATE = 0.06; // fictional flat rate used by the synthetic test invoices
const REQUIRED = ['vendor', 'invoice_no', 'date', 'lines', 'subtotal', 'tax', 'total'];

// Compare money in whole cents so floating-point noise never matters; allow 1 cent (0.01) difference.
const cents = (x) => Math.round(x * 100);
const closeEnough = (a, b) => Math.abs(cents(a) - cents(b)) <= 1;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const money = (x) => x.toFixed(2);
const percent = (rate) => `${Math.round(rate * 10000) / 100}%`;
const isMissing = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

// Duplicate matching ignores formatting: "INV-1000", "inv 1000" and "INV1000" are the same number,
// and "Demo Office Mart" / "DEMO OFFICE MART." are the same vendor.
const normNumber = (s) => String(s).toUpperCase().replace(/[\s\-_/.]/g, '');
const normVendor = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// True only for a real calendar date written as YYYY-MM-DD (rejects 2026-13-45 and 2026-02-30).
function isRealIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/**
 * @param {object} inv  extracted fields: vendor, invoice_no, date (YYYY-MM-DD),
 *                      lines [{description, qty, unit_price, amount}], subtotal, tax, total
 * @param {object} [opts]
 * @param {{vendor: string, invoice_no: string}[]} [opts.approved]  invoices already in the Approved sheet
 * @param {string} [opts.today]    'YYYY-MM-DD'; defaults to the local date
 * @param {number} [opts.taxRate]  e.g. 0.06 for 6%; change it for a different tax regime
 * @returns {{flagged: boolean, reasons: string[]}}
 */
function checkInvoice(inv, { approved = [], today = localToday(), taxRate = DEFAULT_TAX_RATE } = {}) {
  const reasons = [];
  const f = inv || {};

  // Rule: no required field is missing
  for (const key of REQUIRED) {
    if (isMissing(f[key])) reasons.push(`Missing field: ${key}`);
  }
  for (const key of ['subtotal', 'tax', 'total']) {
    if (!isMissing(f[key]) && !isNum(f[key])) reasons.push(`Not a number: ${key}`);
  }

  // Rules: each line's qty x unit price equals its amount, and the line amounts add up to the subtotal
  if (Array.isArray(f.lines) && f.lines.length > 0) {
    const badLine = f.lines.some((l) => !l || !isNum(l.qty) || !isNum(l.unit_price) || !isNum(l.amount));
    if (badLine) {
      reasons.push('A line item is missing its quantity, unit price or amount');
    } else {
      f.lines.forEach((l, i) => {
        if (!closeEnough(l.qty * l.unit_price, l.amount)) {
          reasons.push(`Line ${i + 1} (${l.description}): ${l.qty} x ${money(l.unit_price)} = ` +
            `${money(l.qty * l.unit_price)}, but amount is ${money(l.amount)}`);
        }
      });
      if (isNum(f.subtotal)) {
        const sum = f.lines.reduce((acc, l) => acc + l.amount, 0);
        if (!closeEnough(sum, f.subtotal)) {
          reasons.push(`Line amounts add up to ${money(sum)}, but subtotal is ${money(f.subtotal)}`);
        }
      }
    }
  }

  // Rule: tax is the expected rate of the subtotal
  if (isNum(f.subtotal) && isNum(f.tax)) {
    const expected = f.subtotal * taxRate;
    if (!closeEnough(expected, f.tax)) {
      reasons.push(`Tax ${money(f.tax)} is not ${percent(taxRate)} of subtotal ${money(f.subtotal)} ` +
        `(expected ${money(expected)})`);
    }
  }

  // Rule: subtotal plus tax equals the total
  if (isNum(f.subtotal) && isNum(f.tax) && isNum(f.total)) {
    if (!closeEnough(f.subtotal + f.tax, f.total)) {
      reasons.push(`Subtotal + tax is ${money(f.subtotal + f.tax)}, but total is ${money(f.total)}`);
    }
  }

  // Rule: invoice number looks like INV- followed by digits
  const invNo = typeof f.invoice_no === 'string' ? f.invoice_no.trim() : f.invoice_no;
  if (!isMissing(invNo) && (typeof invNo !== 'string' || !/^INV-\d+$/.test(invNo))) {
    reasons.push(`Invoice number "${invNo}" does not match INV- followed by digits`);
  }

  // Rule: the same vendor has not already had this invoice number approved
  if (!isMissing(invNo) && !isMissing(f.vendor)) {
    const dup = approved.some((a) => a && normVendor(a.vendor) === normVendor(f.vendor) &&
      normNumber(a.invoice_no) === normNumber(invNo));
    if (dup) reasons.push(`Duplicate: ${f.vendor} invoice ${invNo} is already approved`);
  }

  // Rule: date is a real date and not in the future
  if (!isMissing(f.date)) {
    if (typeof f.date !== 'string' || !isRealIsoDate(f.date)) {
      reasons.push(`Date "${f.date}" is not a real date in YYYY-MM-DD format`);
    } else if (f.date > today) {
      reasons.push(`Date ${f.date} is in the future`);
    }
  }

  return { flagged: reasons.length > 0, reasons };
}

if (typeof module !== 'undefined') module.exports = { checkInvoice };
